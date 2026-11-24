import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { ocfMachine, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import { TX_DESCRIPTORS, type TxKey, type CollectionKey } from "../ocf_validator/validators";
import * as nodes from "../ocf_validator/nodes";
import type { OcfMachineContext } from "../types/validator";
import { baseContext, contextAfterCancellation, startSeeded, ev, collection } from "./helpers";

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
// Results built from a malformed issuer name
// ---------------------------------------------------------------------------

describe("results render an issuer name that isn't a string", () => {
  // JSON.parse gives `{ "toString": null }` an own toString that isn't a
  // function, so interpolating it into a plain template literal throws.
  const withIssuer = () =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        manifest: { issuer: { legal_name: JSON.parse('{ "toString": null }') } },
      } as OcfMachineContext["ocfPackageContent"],
    });

  it("in the completion result", () => {
    const actor = startSeeded(withIssuer());
    actor.send({ type: "RUN_END", date: "2021-01-01" });
    expect(actor.getSnapshot().context.result).toBe(
      'The validation of the OCF package for {"toString":null} is complete and the package appears valid.',
    );
  });

  it("in the unknown-type result", () => {
    const actor = startSeeded(withIssuer());
    actor.send(ev("TX_NOT_A_REAL_TYPE"));
    expect(actor.getSnapshot().context.result).toBe(
      'The validation of the OCF package for {"toString":null} failed on TX_NOT_A_REAL_TYPE because it is not a valid TX type.',
    );
  });
});

// ---------------------------------------------------------------------------
// Passthrough transaction types
// ---------------------------------------------------------------------------

describe("passthrough transaction types are no-ops unless their security was removed earlier", () => {
  // For a passthrough transaction, record any earlier-removal finding and keep processing.
  it("leaves capTable and every channel deep-equal after TX_VESTING_START + TX_STOCK_CLASS_SPLIT", () => {
    const seeded = baseContext({
      stockIssuances: [{ id: "si", security_id: "s" }] as any,
      convertibleIssuances: [{ id: "ci", security_id: "c" }] as any,
      warrantIssuances: [{ id: "wi", security_id: "w" }] as any,
      equityCompensation: [{ id: "ec", security_id: "e" }] as any,
      findings: [
        { severity: "error", outcome: "failed", check: "demo", message: "m", subject: { object_type: "TX_STOCK_ISSUANCE", id: "x" } },
      ],
      snapshots: [{ date: "2020-01-01", stockIssuances: [], convertibles: [], warrants: [], equityCompensation: [], stockPlans: [] }],
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

  it("produces no finding for TX_VESTING_START (the fixture case)", () => {
    const actor = startSeeded(baseContext());
    actor.send(ev("TX_VESTING_START", { id: "vs", security_id: "s" }));
    expect(actor.getSnapshot().context.findings).toHaveLength(0);
    expect(actor.getSnapshot().value).toBe("capTable");
  });

  it("records a finding for one on a security an earlier transaction removed, as a real run does", () => {
    const actor = startSeeded(contextAfterCancellation("CONVERTIBLE", "s"));
    actor.send(ev("TX_VESTING_START", { id: "vs", object_type: "TX_VESTING_START", security_id: "s", date: "2021-07-01" }));

    expect(actor.getSnapshot().value).toBe("capTable");
    expect(actor.getSnapshot().context.findings.map((f) => f.check)).toEqual(["no-earlier-removal"]);
  });
});

// ---------------------------------------------------------------------------
// Stock retraction
// ---------------------------------------------------------------------------

describe("stock retraction", () => {
  it("removes the stock when its checks pass", () => {
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
    expect(snapshot.context.findings).toEqual([]);
    // And the security was removed from the live collection (remove op).
    expect(collection(snapshot.context, "stockIssuances").some((s: any) => s.security_id === "sec1")).toBe(false);
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
    expect(collection(ctx, "warrantIssuances").some((w: any) => w.id === "wi1")).toBe(true);
    // …the convertible collection did not leak into warrantIssuances…
    expect(collection(ctx, "warrantIssuances").some((w: any) => w.id === "ci1")).toBe(false);
    expect(collection(ctx, "warrantIssuances")).toHaveLength(1);
    // …and convertibleIssuances is untouched.
    expect(collection(ctx, "convertibleIssuances")).toEqual([sentinel]);
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

// The four security families use their collection names.
const FAMILIES: CollectionKey[] = ["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"];

// The active keys that name a collection (append/remove), derived the same way.
const COLLECTION_KEYS = (Object.keys(TX_DESCRIPTORS) as TxKey[]).filter(
  (key) => "collection" in TX_DESCRIPTORS[key],
);

// List the expected family for each issuance and removal independently of the table. A descriptor
// assigned to the wrong family would otherwise make the same mistake in both the update and its
// test.
const EXPECTED_COLLECTION: Record<string, CollectionKey> = {
  // append
  TX_STOCK_ISSUANCE: "stockIssuances",
  TX_CONVERTIBLE_ISSUANCE: "convertibleIssuances",
  TX_WARRANT_ISSUANCE: "warrantIssuances",
  TX_EQUITY_COMPENSATION_ISSUANCE: "equityCompensation",
  TX_PLAN_SECURITY_ISSUANCE: "equityCompensation",
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
  TX_PLAN_SECURITY_RETRACTION: "equityCompensation",
  TX_PLAN_SECURITY_CANCELLATION: "equityCompensation",
  TX_PLAN_SECURITY_TRANSFER: "equityCompensation",
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

  it.each(ACTIVE_KEYS)("%s changes only the family its descriptor declares", (key) => {
    const descriptor = TX_DESCRIPTORS[key];

    if (!("collection" in descriptor)) {
      // An effect of "none" records validation without changing a collection.
      expect(descriptor.effect).toBe("none");
      const before = baseContext().nodes;
      expect(nodes.applyTransaction(before, descriptor, { id: "incoming", security_id: "SEC", object_type: key })).toBe(before);
      return;
    }

    const fam = descriptor.collection;
    const matching = { id: "match", security_id: "SEC", object_type: "seed" };
    const other = { id: "other", security_id: "OTHER", object_type: "seed" };
    const ctx = baseContext({ [fam]: [matching, other] });

    // Issue a new security or remove the one supplied by the test.
    const data = { id: "incoming", security_id: descriptor.effect === "append" ? "NEW" : "SEC", object_type: key };
    const updated = nodes.applyTransaction(ctx.nodes, descriptor, data);

    // Only the descriptor's family should gain a security.
    const after = { ...ctx, nodes: updated };
    for (const family of FAMILIES) {
      if (family !== fam) expect(collection(after, family)).toEqual([]);
    }

    if (descriptor.effect === "append") {
      expect(collection(after, fam)).toEqual([matching, other, data]);
    } else {
      // Remove the named security and keep the others outstanding.
      expect(collection(after, fam)).toEqual([other]);
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

  it("a passthrough type changes no security", () => {
    const before = baseContext({ equityCompensation: [{ id: "ec", security_id: "s" }] }).nodes;
    expect(nodes.applyTransaction(before, TX_DESCRIPTORS.TX_VESTING_START, {
      object_type: "TX_VESTING_START", id: "vest", security_id: "s",
    })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Family collections hold only issuances
// ---------------------------------------------------------------------------

// Only issuances enter these collections. This lets issuance-exists look up a security by ID within
// its family.
const ISSUANCE_KEYS = [
  "TX_STOCK_ISSUANCE",
  "TX_CONVERTIBLE_ISSUANCE",
  "TX_WARRANT_ISSUANCE",
  "TX_EQUITY_COMPENSATION_ISSUANCE",
  "TX_PLAN_SECURITY_ISSUANCE",
];

describe("family collections hold only issuances", () => {
  it("appends for exactly the family issuance keys", () => {
    const appendKeys = (Object.keys(TX_DESCRIPTORS) as TxKey[]).filter(
      (key) => TX_DESCRIPTORS[key].effect === "append",
    );
    expect(new Set(appendKeys)).toEqual(new Set(ISSUANCE_KEYS));
  });

  it("starts every family collection empty", () => {
    const { context } = createActor(ocfMachine).start().getSnapshot();
    expect(collection(context, "stockIssuances")).toEqual([]);
    expect(collection(context, "convertibleIssuances")).toEqual([]);
    expect(collection(context, "warrantIssuances")).toEqual([]);
    expect(collection(context, "equityCompensation")).toEqual([]);
  });
});

// The existence check matches on security_id alone because a family collection
// only ever holds issuance records. These runs drive a full valid history —
// issue and accept security A (A survives), issue and retract security B (B is
// appended then removed) — so at least one append and one removal demonstrably
// run without the machine halting, and each collection ends as exactly the
// surviving issuance. Distinct securities keep every transaction valid under the
// past-only offender scans, so the machine processes the whole package rather
// than halting at the first error.

describe("family collections end holding only the surviving issuance", () => {
  it("keeps the convertible collection as exactly the security-A issuance after an append and a removal", () => {
    const issueA = { id: "ciA", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "secA", stakeholder_id: "sh1", date: "2020-01-01" };
    const acceptA = { id: "accA", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "secA", date: "2020-02-01" };
    const issueB = { id: "ciB", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "secB", stakeholder_id: "sh1", date: "2020-03-01" };
    const retractB = { id: "retB", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "secB", date: "2020-04-01" };

    const seeded = baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "sh1" }],
        transactions: [issueA, acceptA, issueB, retractB],
      } as OcfMachineContext["ocfPackageContent"],
    });

    const actor = startSeeded(seeded);
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issueA));
    actor.send(ev("TX_CONVERTIBLE_ACCEPTANCE", acceptA));
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issueB));
    actor.send(ev("TX_CONVERTIBLE_RETRACTION", retractB));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.findings).toEqual([]);
    expect(collection(snapshot.context, "convertibleIssuances")).toEqual([issueA]);
  });

  it("keeps the warrant collection as exactly the security-A issuance after an append and a removal", () => {
    const issueA = { id: "wiA", object_type: "TX_WARRANT_ISSUANCE", security_id: "secA", stakeholder_id: "sh1", date: "2020-01-01" };
    const acceptA = { id: "accA", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "secA", date: "2020-02-01" };
    const issueB = { id: "wiB", object_type: "TX_WARRANT_ISSUANCE", security_id: "secB", stakeholder_id: "sh1", date: "2020-03-01" };
    const retractB = { id: "retB", object_type: "TX_WARRANT_RETRACTION", security_id: "secB", date: "2020-04-01" };

    const seeded = baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "sh1" }],
        transactions: [issueA, acceptA, issueB, retractB],
      } as OcfMachineContext["ocfPackageContent"],
    });

    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_ISSUANCE", issueA));
    actor.send(ev("TX_WARRANT_ACCEPTANCE", acceptA));
    actor.send(ev("TX_WARRANT_ISSUANCE", issueB));
    actor.send(ev("TX_WARRANT_RETRACTION", retractB));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.findings).toEqual([]);
    expect(collection(snapshot.context, "warrantIssuances")).toEqual([issueA]);
  });
});
