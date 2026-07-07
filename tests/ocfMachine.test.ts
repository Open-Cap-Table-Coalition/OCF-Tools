import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import {
  ocfMachine,
  collectionUpdate,
  TX_DESCRIPTORS,
  type OcfMachineContext,
  type OcfMachineEvent,
  type TxKey,
  type CollectionKey,
} from "../ocf_validator/ocfMachine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A full, mostly-empty machine context; `overrides` replace top-level fields. */
const baseContext = (overrides: Partial<OcfMachineContext> = {}): OcfMachineContext => ({
  stockIssuances: [],
  convertibleIssuances: [],
  warrantIssuances: [],
  equityCompensation: [],
  ocfPackageContent: {
    manifest: { issuer: { legal_name: "Test Co" } },
    stakeholders: [],
    stockClasses: [],
    transactions: [],
    stockLegends: [],
    stockPlans: [],
    vestingTerms: [],
    valuations: [],
  } as OcfMachineContext["ocfPackageContent"],
  report: [],
  findings: [],
  snapshots: [],
  result: "Incomplete",
  ...overrides,
});

/** Start an actor seeded into `capTable` with the given context. */
const startSeeded = (context: OcfMachineContext) =>
  createActor(ocfMachine, {
    snapshot: ocfMachine.resolveState({ value: "capTable", context }),
  }).start();

/** Cast a hand-built event to the typed event union (test-only boundary). */
const ev = (type: string, data: Record<string, unknown> = {}): OcfMachineEvent =>
  ({ type, data } as unknown as OcfMachineEvent);

// ---------------------------------------------------------------------------
// Unknown transaction types
// ---------------------------------------------------------------------------

describe("unknown transaction types", () => {
  it("drives the machine to validationError with the offending type in result", () => {
    const actor = startSeeded(baseContext());
    actor.send(ev("TX_NOT_A_REAL_TYPE"));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.result).toContain("TX_NOT_A_REAL_TYPE");
    expect(snapshot.context.result).toContain("not a valid TX type");
  });

  it("builds its message without assuming event.data exists", () => {
    const actor = startSeeded(baseContext());
    // No `data` on the event at all — the wildcard must not throw.
    actor.send({ type: "WHO_KNOWS" } as unknown as OcfMachineEvent);
    expect(actor.getSnapshot().value).toBe("validationError");
    expect(actor.getSnapshot().context.result).toContain("WHO_KNOWS");
  });
});

// ---------------------------------------------------------------------------
// Recognized-but-unhandled transaction types
// ---------------------------------------------------------------------------

describe("recognized-but-unhandled transaction types are no-ops", () => {
  it("leaves capTable and every channel deep-equal after TX_VESTING_START + TX_STOCK_CLASS_SPLIT", () => {
    const seeded = baseContext({
      stockIssuances: [{ id: "si", security_id: "s" }] as any,
      convertibleIssuances: [{ id: "ci", security_id: "c" }] as any,
      warrantIssuances: [{ id: "wi", security_id: "w" }] as any,
      equityCompensation: [{ id: "ec", security_id: "e" }] as any,
      report: [{ marker: "pre-existing report" }],
      findings: [
        { severity: "error", check: "demo", message: "m", subject: { object_type: "TX_STOCK_ISSUANCE", id: "x" } },
      ],
      snapshots: [{ date: "2020-01-01", stockIssuances: [], convertibles: [], warrants: [], equityCompensation: [] }],
      result: "PRESERVED",
    });

    // A passthrough must change *nothing* — one deep snapshot, one deep compare
    // (also covers ocfPackageContent, a superset of the required channels).
    const before = structuredClone(seeded);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_VESTING_START", { id: "vs", security_id: "s" }));
    actor.send(ev("TX_STOCK_CLASS_SPLIT", { id: "scs" }));

    const after = actor.getSnapshot();
    expect(after.value).toBe("capTable");
    expect(after.context).toEqual(before);
  });

  it("produces NO report entry for TX_VESTING_START (the fixture case)", () => {
    const actor = startSeeded(baseContext());
    actor.send(ev("TX_VESTING_START", { id: "vs", security_id: "s" }));
    expect(actor.getSnapshot().context.report).toHaveLength(0);
    expect(actor.getSnapshot().value).toBe("capTable");
  });
});

// ---------------------------------------------------------------------------
// Stock retraction
// ---------------------------------------------------------------------------

describe("stock retraction reports retraction-specific content", () => {
  it("reports the retraction validator's output on the valid branch, not the issuance validator's", () => {
    // Seed a prior matching stock issuance (in the live collection AND the package
    // transaction history) so valid_tx_stock_retraction(..., true) passes.
    const seeded = baseContext({
      stockIssuances: [
        { id: "si1", security_id: "sec1", object_type: "TX_STOCK_ISSUANCE", date: "2020-01-01" },
      ] as any,
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        transactions: [
          { id: "si1", security_id: "sec1", object_type: "TX_STOCK_ISSUANCE", date: "2020-01-01" },
        ],
      } as any,
    });

    const actor = startSeeded(seeded);
    actor.send(ev("TX_STOCK_RETRACTION", { id: "sr1", security_id: "sec1", date: "2021-01-01" }));

    const snapshot = actor.getSnapshot();
    // Valid branch keeps the machine in capTable.
    expect(snapshot.value).toBe("capTable");
    const entry = snapshot.context.report.at(-1);
    expect(entry.transaction_type).toBe("TX_STOCK_RETRACTION");
    // A retraction-only field the issuance validator never emits.
    expect(entry).toHaveProperty("incoming_stockIssuance_validity");
    expect(entry).not.toHaveProperty("stockClass_validity");
    // And the security was removed from the live collection (remove op).
    expect(snapshot.context.stockIssuances.some((s: any) => s.security_id === "sec1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Warrant issuance
// ---------------------------------------------------------------------------

describe("warrant issuance lands in its own family collection", () => {
  it("appends only the warrant and never spreads convertibleIssuances", () => {
    const sentinel = { id: "ci1", security_id: "conv1", object_type: "TX_CONVERTIBLE_ISSUANCE" };
    const seeded = baseContext({
      convertibleIssuances: [sentinel] as any,
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "sh1" }],
      } as any,
    });

    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_ISSUANCE", { id: "wi1", security_id: "war1", stakeholder_id: "sh1" }));

    const ctx = actor.getSnapshot().context;
    // The warrant landed in warrantIssuances…
    expect(ctx.warrantIssuances.some((w: any) => w.id === "wi1")).toBe(true);
    // …the convertible collection did not leak into warrantIssuances…
    expect(ctx.warrantIssuances.some((w: any) => w.id === "ci1")).toBe(false);
    expect(ctx.warrantIssuances).toHaveLength(1);
    // …and convertibleIssuances is untouched.
    expect(ctx.convertibleIssuances).toEqual([sentinel]);
  });
});

// ---------------------------------------------------------------------------
// Per-type collection placement
// ---------------------------------------------------------------------------

// Every key the machine acts on (everything but passthrough), derived from the
// descriptors so an added active descriptor is exercised here automatically.
const ACTIVE_KEYS = (Object.keys(TX_DESCRIPTORS) as TxKey[]).filter(
  (key) => TX_DESCRIPTORS[key].effect !== "passthrough",
);

// The active keys that name a collection (append/remove), derived the same way.
const COLLECTION_KEYS = (Object.keys(TX_DESCRIPTORS) as TxKey[]).filter(
  (key) => "collection" in TX_DESCRIPTORS[key],
);

// Independent oracle: the collection each append/remove key must declare, written
// out by hand — no prefix logic, no mapping helper imported from the interpreter.
// The `remove` path trusts `descriptor.collection` verbatim, so this oracle is the
// independent check that each declaration is right.
const EXPECTED_COLLECTION: Record<string, CollectionKey> = {
  // append
  TX_STOCK_ISSUANCE: "stockIssuances",
  TX_CONVERTIBLE_ISSUANCE: "convertibleIssuances",
  TX_WARRANT_ISSUANCE: "warrantIssuances",
  TX_EQUITY_COMPENSATION_ISSUANCE: "equityCompensation",
  // remove
  TX_STOCK_RETRACTION: "stockIssuances",
  TX_STOCK_CANCELLATION: "stockIssuances",
  TX_STOCK_CONVERSION: "stockIssuances",
  TX_STOCK_REISSUANCE: "stockIssuances",
  TX_STOCK_REPURCHASE: "stockIssuances",
  TX_STOCK_TRANSFER: "stockIssuances",
  TX_CONVERTIBLE_RETRACTION: "convertibleIssuances",
  TX_CONVERTIBLE_CANCELLATION: "convertibleIssuances",
  TX_CONVERTIBLE_TRANSFER: "convertibleIssuances",
  TX_CONVERTIBLE_CONVERSION: "convertibleIssuances",
  TX_WARRANT_RETRACTION: "warrantIssuances",
  TX_WARRANT_CANCELLATION: "warrantIssuances",
  TX_WARRANT_TRANSFER: "warrantIssuances",
  TX_WARRANT_EXERCISE: "warrantIssuances",
  TX_EQUITY_COMPENSATION_RETRACTION: "equityCompensation",
  TX_EQUITY_COMPENSATION_CANCELLATION: "equityCompensation",
  TX_EQUITY_COMPENSATION_TRANSFER: "equityCompensation",
};

describe("per-type collection placement", () => {
  it("handles every active descriptor: each is an append/remove or a none", () => {
    // The parametrized cases below are the active set itself; assert every member
    // is one of the two shapes that case body handles, so a new effect that is
    // neither fails here loudly.
    for (const key of ACTIVE_KEYS) {
      const descriptor = TX_DESCRIPTORS[key];
      expect("collection" in descriptor || descriptor.effect === "none").toBe(true);
    }
  });

  it.each(ACTIVE_KEYS)("%s mutates only the collection its descriptor declares", (key) => {
    const descriptor = TX_DESCRIPTORS[key];
    const data = { id: "incoming", security_id: "SEC", object_type: key };

    if (!("collection" in descriptor)) {
      // none: validate + report, but mutate nothing.
      expect(descriptor.effect).toBe("none");
      const result = collectionUpdate(baseContext(), ev(key, data));
      expect(Object.keys(result)).toHaveLength(0);
      return;
    }

    const fam = descriptor.collection;
    const matching = { id: "match", security_id: "SEC", object_type: "seed" };
    const other = { id: "other", security_id: "OTHER", object_type: "seed" };
    const ctx = baseContext({ [fam]: [matching, other] } as Partial<OcfMachineContext>);

    const result = collectionUpdate(ctx, ev(key, data)) as Record<string, any[]>;

    // The mutation lands in exactly the collection the descriptor names.
    expect(Object.keys(result)).toEqual([fam]);

    if (descriptor.effect === "append") {
      expect(result[fam]).toHaveLength(3);
      expect(result[fam].at(-1)).toEqual(data);
    } else {
      // remove: the matching security_id is filtered out, the rest retained.
      expect(result[fam].some((x) => x.security_id === "SEC")).toBe(false);
      expect(result[fam].some((x) => x.security_id === "OTHER")).toBe(true);
    }
  });

  it("declares a collection for exactly the append/remove descriptors", () => {
    expect(new Set(COLLECTION_KEYS)).toEqual(new Set(Object.keys(EXPECTED_COLLECTION)));
  });

  it.each(COLLECTION_KEYS)("%s declares the collection the oracle expects", (key) => {
    const descriptor = TX_DESCRIPTORS[key];
    const collection = "collection" in descriptor ? descriptor.collection : undefined;
    expect(collection).toBe(EXPECTED_COLLECTION[key]);
  });

  it("a passthrough type mutates no collection", () => {
    const result = collectionUpdate(baseContext(), ev("TX_VESTING_START", { security_id: "s" }));
    expect(Object.keys(result)).toHaveLength(0);
  });
});
