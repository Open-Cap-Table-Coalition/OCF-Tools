import { describe, it, expect } from "vitest";
import {
  collectionUpdate,
  isValidOutcome,
  outcomeUpdate,
  failureResult,
  TX_DESCRIPTORS,
  type OcfMachineEvent,
  type TxKey,
  type CollectionKey,
} from "../ocf_validator/ocfMachine";
import type { Finding } from "../types/finding";
import type { GradedValidator, OcfMachineContext } from "../types/validator";
import { baseContext, startSeeded, ev } from "./helpers";

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

// ---------------------------------------------------------------------------
// Graded validators through the dispatch helpers
// ---------------------------------------------------------------------------

// These drive the exported dispatch helpers directly with synthetic descriptors,
// isolating the graded dispatch shape from any single family's validator. The
// convertible family now carries graded `validate` in the real table, with its
// own machine-actor coverage; the legacy describe below still pins the report
// convention the unmigrated families use.

/** A synthetic `none` descriptor carrying a graded validator and (empty) checks. */
const gradedDescriptor = (validate: GradedValidator<any>) =>
  ({ effect: "none", validate, checks: [] }) as const;

/** A minimal finding; `check` doubles as the distinguishing label. */
const finding = (severity: Finding["severity"], check: string): Finding => ({
  severity,
  check,
  message: `${check} message`,
  subject: { object_type: "TX_STOCK_ISSUANCE", id: "si1" },
});

describe("graded validators through the dispatch helpers", () => {
  it("passes the transaction payload, not the event wrapper, to the validator", () => {
    const received: unknown[] = [];
    const descriptor = gradedDescriptor((_context, data) => {
      received.push(data);
      return [];
    });
    const data = { id: "si1", security_id: "sec1" };

    isValidOutcome(descriptor, baseContext(), ev("TX_STOCK_ISSUANCE", data));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(data);
  });

  it("warnings alone leave the transaction valid and land on findings, never report", () => {
    const warning = finding("warning", "advisory");
    const descriptor = gradedDescriptor(() => [warning]);
    const earlierFinding = finding("warning", "from-an-earlier-transaction");
    const context = baseContext({
      report: [{ marker: "pre-existing report" }],
      findings: [earlierFinding],
    });
    const event = ev("TX_STOCK_ISSUANCE", { id: "si1", security_id: "sec1" });

    expect(isValidOutcome(descriptor, context, event)).toBe(true);

    const update = outcomeUpdate(descriptor, context, event);
    // The update touches the findings channel and the error stash — no report write…
    expect(Object.keys(update)).toEqual(["findings", "lastErrorFindings"]);
    // …appending the new findings after the accumulated ones…
    expect(update.findings).toEqual([earlierFinding, warning]);
    // …and stashing no error findings for a warnings-only outcome.
    expect(update.lastErrorFindings).toEqual([]);
    // The helper is pure: neither input channel was mutated.
    expect(context.report).toEqual([{ marker: "pre-existing report" }]);
    expect(context.findings).toEqual([earlierFinding]);
  });

  it("an error finding makes the transaction invalid while recording every finding, warnings included", () => {
    const descriptor = gradedDescriptor(() => [finding("warning", "advisory"), finding("error", "hard-failure")]);
    const context = baseContext({ report: [{ marker: "pre-existing report" }] });
    const event = ev("TX_STOCK_ISSUANCE", { id: "si1", security_id: "sec1" });

    expect(isValidOutcome(descriptor, context, event)).toBe(false);

    const update = outcomeUpdate(descriptor, context, event);
    // Errors and warnings are both recorded, on findings only — the invalid
    // branch writes no report entry either.
    expect(Object.keys(update)).toEqual(["findings", "lastErrorFindings"]);
    expect(update.findings).toEqual([finding("warning", "advisory"), finding("error", "hard-failure")]);
    // Only the error slice is stashed for the failure branch.
    expect(update.lastErrorFindings).toEqual([finding("error", "hard-failure")]);
    expect(context.report).toEqual([{ marker: "pre-existing report" }]);
  });

  it("serializes only this transaction's error findings, in return order, in the failure result", () => {
    const firstError = finding("error", "first-error");
    const warning = finding("warning", "advisory");
    const secondError = finding("error", "second-error");
    let invocations = 0;
    const descriptor = gradedDescriptor(() => {
      invocations += 1;
      return [firstError, warning, secondError];
    });
    // Decoys on both channels: an exact-match assertion proves the detail comes
    // from the record stash, not from the report tail or the findings
    // accumulator.
    const context = baseContext({
      report: [{ marker: "pre-existing report" }],
      findings: [finding("error", "from-an-earlier-transaction")],
    });
    const event = ev("TX_STOCK_ISSUANCE", { id: "si1", security_id: "sec1" });

    // Mirror the machine's invalid branch: record first, then build the result.
    const recorded = { ...context, ...outcomeUpdate(descriptor, context, event) };

    expect(failureResult(descriptor, recorded, event)).toBe(
      `The validation of the OCF package for Test Co failed on si1: ${JSON.stringify([firstError, secondError], null, 2)}`,
    );
    // The failure detail comes from the stash; the validator ran only at record time.
    expect(invocations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Legacy validators through the machine
// ---------------------------------------------------------------------------

// These pin the old convention while table entries still carry it; they are
// deleted with `legacyValidate` when the last family migrates.

describe("legacy validators through the machine", () => {
  const seededWithStakeholder = () =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "sh1" }],
        stockClasses: [{ id: "sc1" }],
      } as OcfMachineContext["ocfPackageContent"],
    });

  // A stock issuance the legacy validator accepts: a known stakeholder, a known
  // stock class, and no stock legends to resolve.
  const stockIssuance = (overrides: Record<string, unknown> = {}) => ({
    id: "si1",
    security_id: "s-sec1",
    stakeholder_id: "sh1",
    stock_class_id: "sc1",
    stock_legend_ids: [],
    ...overrides,
  });

  it("records a validated transaction's report entry and leaves findings empty", () => {
    const actor = startSeeded(seededWithStakeholder());
    actor.send(ev("TX_STOCK_ISSUANCE", stockIssuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.report).toHaveLength(1);
    expect(snapshot.context.report[0]).toMatchObject({
      transaction_type: "TX_STOCK_ISSUANCE",
      transaction_id: "si1",
      stakeholder_validity: true,
    });
    expect(snapshot.context.findings).toEqual([]);
  });

  it("fails an invalid transaction with the report entry serialized in the result and findings still empty", () => {
    const actor = startSeeded(seededWithStakeholder());
    // No such stakeholder — the stock issuance validator rejects it.
    actor.send(ev("TX_STOCK_ISSUANCE", stockIssuance({ stakeholder_id: "nobody" })));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.report).toHaveLength(1);
    expect(snapshot.context.result).toBe(
      `The validation of the OCF package for Test Co failed on si1: ${JSON.stringify(snapshot.context.report[0], null, 2)}`,
    );
    expect(snapshot.context.findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Family collections hold only issuances
// ---------------------------------------------------------------------------
//
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
    expect(snapshot.context.convertibleIssuances).toEqual([issueA]);
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
    expect(snapshot.context.warrantIssuances).toEqual([issueA]);
  });
});
