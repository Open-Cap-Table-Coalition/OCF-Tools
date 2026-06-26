import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import {
  ocfMachine,
  collectionUpdate,
  collectionKeyFor,
  type OcfMachineContext,
  type OcfMachineEvent,
  type TxKey,
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
// Per-type collection operation
// ---------------------------------------------------------------------------

const OP_CASES: Array<[TxKey, "append" | "none" | "remove"]> = [
  // append
  ["TX_STOCK_ISSUANCE", "append"],
  ["TX_CONVERTIBLE_ISSUANCE", "append"],
  ["TX_WARRANT_ISSUANCE", "append"],
  ["TX_EQUITY_COMPENSATION_ISSUANCE", "append"],
  // none
  ["TX_STOCK_ACCEPTANCE", "none"],
  ["TX_CONVERTIBLE_ACCEPTANCE", "none"],
  ["TX_WARRANT_ACCEPTANCE", "none"],
  ["TX_EQUITY_COMPENSATION_ACCEPTANCE", "none"],
  ["TX_EQUITY_COMPENSATION_EXERCISE", "none"],
  // remove
  ["TX_STOCK_RETRACTION", "remove"],
  ["TX_STOCK_CANCELLATION", "remove"],
  ["TX_STOCK_CONVERSION", "remove"],
  ["TX_STOCK_REISSUANCE", "remove"],
  ["TX_STOCK_REPURCHASE", "remove"],
  ["TX_STOCK_TRANSFER", "remove"],
  ["TX_CONVERTIBLE_RETRACTION", "remove"],
  ["TX_CONVERTIBLE_CANCELLATION", "remove"],
  ["TX_CONVERTIBLE_TRANSFER", "remove"],
  ["TX_CONVERTIBLE_CONVERSION", "remove"],
  ["TX_WARRANT_RETRACTION", "remove"],
  ["TX_WARRANT_CANCELLATION", "remove"],
  ["TX_WARRANT_TRANSFER", "remove"],
  ["TX_WARRANT_EXERCISE", "remove"],
  ["TX_EQUITY_COMPENSATION_RETRACTION", "remove"],
  ["TX_EQUITY_COMPENSATION_CANCELLATION", "remove"],
  ["TX_EQUITY_COMPENSATION_TRANSFER", "remove"],
];

describe("per-type collection operation", () => {
  it("covers all 26 active handlers", () => {
    expect(OP_CASES).toHaveLength(26);
  });

  it.each(OP_CASES)("%s performs op '%s' on its family collection", (type, op) => {
    const fam = collectionKeyFor(type);
    const matching = { id: "match", security_id: "SEC", object_type: "seed" };
    const other = { id: "other", security_id: "OTHER", object_type: "seed" };
    const ctx = baseContext({ [fam]: [matching, other] } as Partial<OcfMachineContext>);
    const data = { id: "incoming", security_id: "SEC", object_type: type };

    const result = collectionUpdate(ctx, ev(type, data)) as Record<string, any[]>;

    if (op === "append") {
      expect(Object.keys(result)).toEqual([fam]);
      expect(result[fam]).toHaveLength(3);
      expect(result[fam].at(-1)).toEqual(data);
    } else if (op === "none") {
      expect(Object.keys(result)).toHaveLength(0);
    } else {
      // remove: the matching security_id is filtered out, others retained.
      expect(Object.keys(result)).toEqual([fam]);
      expect(result[fam].some((x) => x.security_id === "SEC")).toBe(false);
      expect(result[fam].some((x) => x.security_id === "OTHER")).toBe(true);
    }
  });

  it("a passthrough type mutates no collection", () => {
    const result = collectionUpdate(baseContext(), ev("TX_VESTING_START", { security_id: "s" }));
    expect(Object.keys(result)).toHaveLength(0);
  });
});
