import { describe, it, expect } from "vitest";
import { TX_DESCRIPTORS } from "../ocf_validator/ocfMachine";
import type { OcfMachineContext } from "../types/validator";
import {
  baseContext,
  startSeeded,
  ev,
  contextWith,
  runValidator,
  implementedCheckIds,
  expectFindingShape,
} from "./helpers";

const MIGRATED_KEYS = [
  "TX_CONVERTIBLE_ISSUANCE",
  "TX_CONVERTIBLE_ACCEPTANCE",
  "TX_CONVERTIBLE_RETRACTION",
  "TX_CONVERTIBLE_CANCELLATION",
  "TX_CONVERTIBLE_TRANSFER",
] as const;
type MigratedKey = (typeof MIGRATED_KEYS)[number];

// A single convertible issuance, in the shape both the live collection and the
// package transaction history hold it. `date` lets a scenario push the issuance
// after the transaction under validation to trip the date-order check.
const issuanceRecord = (security_id: string, date = "2020-01-01") => ({
  id: `ci-${security_id}`,
  object_type: "TX_CONVERTIBLE_ISSUANCE",
  security_id,
  date,
});

// ---------------------------------------------------------------------------
// Issuance: stakeholder-exists
// ---------------------------------------------------------------------------

describe("convertible issuance validity", () => {
  const withStakeholder = (id: string) =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id }],
      } as OcfMachineContext["ocfPackageContent"],
    });

  const issuance = (overrides: Record<string, unknown> = {}) => ({
    id: "conv1",
    object_type: "TX_CONVERTIBLE_ISSUANCE",
    security_id: "sec1",
    stakeholder_id: "sh1",
    date: "2021-01-01",
    ...overrides,
  });

  it("returns no findings when the referenced stakeholder exists", () => {
    const findings = runValidator("TX_CONVERTIBLE_ISSUANCE", withStakeholder("sh1"), issuance());
    expect(findings).toEqual([]);
  });

  it("flags a missing stakeholder with an error naming the stakeholder_id", () => {
    const findings = runValidator("TX_CONVERTIBLE_ISSUANCE", withStakeholder("someone-else"), issuance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "stakeholder-exists", {
      object_type: "TX_CONVERTIBLE_ISSUANCE",
      id: "conv1",
    });
    expect(findings[0].message).toContain("sh1");
  });

  it("appends a valid issuance to convertibleIssuances and stays in capTable", () => {
    const actor = startSeeded(withStakeholder("sh1"));
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.convertibleIssuances).toHaveLength(1);
    expect(snapshot.context.convertibleIssuances[0]).toMatchObject({ id: "conv1", security_id: "sec1" });
    expect(snapshot.context.findings).toEqual([]);
  });

  it("halts an invalid issuance in validationError with the error finding recorded", () => {
    const actor = startSeeded(withStakeholder("someone-else"));
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.findings).toHaveLength(1);
    expect(snapshot.context.findings[0].check).toBe("stakeholder-exists");
    expect(snapshot.context.convertibleIssuances).toEqual([]);
    expect(snapshot.context.result).toContain("stakeholder-exists");
  });
});

// ---------------------------------------------------------------------------
// Acceptance: issuance-exists, date-order, no-retraction
// ---------------------------------------------------------------------------

describe("convertible acceptance validity", () => {
  const acceptance = (overrides: Record<string, unknown> = {}) => ({
    id: "acc1",
    object_type: "TX_CONVERTIBLE_ACCEPTANCE",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_CONVERTIBLE_ACCEPTANCE", id: "acc1" };

  it("returns no findings when the issuance exists, dates order, and no retraction references it", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_CONVERTIBLE_ACCEPTANCE", context, acceptance())).toEqual([]);
  });

  it("leaves the machine in capTable without mutating collections on the valid branch", () => {
    const seeded = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    const before = structuredClone(seeded.convertibleIssuances);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_CONVERTIBLE_ACCEPTANCE", acceptance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.convertibleIssuances).toEqual(before);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a missing issuance with an error naming the security_id", () => {
    // In the package history (date-order passes) but not the live collection.
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_CONVERTIBLE_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("flags an out-of-order date with an error naming the security_id", () => {
    // Issuance is live (issuance-exists passes) but dated after the acceptance.
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any,
      transactions: [issuanceRecord("sec1", "2022-01-01")],
    });
    const findings = runValidator("TX_CONVERTIBLE_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "date-order", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("emits one no-retraction finding per offending retraction, each naming that retraction", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-a", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2021-06-01" },
        { id: "ret-b", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2021-07-01" },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-retraction", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-b");
  });
});

// ---------------------------------------------------------------------------
// Retraction: issuance-exists, date-order, no-acceptance
// ---------------------------------------------------------------------------

describe("convertible retraction validity", () => {
  const retraction = (overrides: Record<string, unknown> = {}) => ({
    id: "ret1",
    object_type: "TX_CONVERTIBLE_RETRACTION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_CONVERTIBLE_RETRACTION", id: "ret1" };

  it("returns no findings when the issuance exists, dates order, and no acceptance references it", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_CONVERTIBLE_RETRACTION", context, retraction())).toEqual([]);
  });

  it("removes the referenced security from convertibleIssuances on the valid branch", () => {
    const seeded = contextWith({
      convertibleIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_CONVERTIBLE_RETRACTION", retraction()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec1")).toBe(false);
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec2")).toBe(true);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a missing issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_CONVERTIBLE_RETRACTION", context, retraction());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("flags an out-of-order date with an error naming the security_id", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any,
      transactions: [issuanceRecord("sec1", "2022-01-01")],
    });
    const findings = runValidator("TX_CONVERTIBLE_RETRACTION", context, retraction());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "date-order", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("emits one no-acceptance finding per offending acceptance, each naming that acceptance", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "acc-a", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2021-06-01" },
        { id: "acc-b", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2021-07-01" },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_RETRACTION", context, retraction());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-acceptance", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-b");
  });
});

// ---------------------------------------------------------------------------
// Cancellation: issuance-exists, date-order, no-other-transactions
// ---------------------------------------------------------------------------

describe("convertible cancellation validity", () => {
  const cancellation = (overrides: Record<string, unknown> = {}) => ({
    id: "can1",
    object_type: "TX_CONVERTIBLE_CANCELLATION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const cancellationRecord = { id: "can1", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "sec1", date: "2021-01-01" };
  const acceptanceRecord = { id: "acc-x", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2021-02-01" };
  const subject = { object_type: "TX_CONVERTIBLE_CANCELLATION", id: "can1" };

  it("returns no findings when only an issuance, a convertible acceptance, and the cancellation itself reference the security", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1"), acceptanceRecord, cancellationRecord],
    });
    expect(runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("treats any live convertible record matched by security_id as the issuance, regardless of object_type", () => {
    // The existence check matches on security_id alone; a non-issuance object_type
    // in the live collection still satisfies it.
    const context = contextWith({
      convertibleIssuances: [{ id: "x", object_type: "SOMETHING_ELSE", security_id: "sec1", date: "2020-01-01" }] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("removes the referenced security from convertibleIssuances on the valid branch", () => {
    const seeded = contextWith({
      convertibleIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_CONVERTIBLE_CANCELLATION", cancellation()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec1")).toBe(false);
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec2")).toBe(true);
  });

  it("flags a missing issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("flags an out-of-order date with an error naming the security_id", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any,
      transactions: [issuanceRecord("sec1", "2022-01-01")],
    });
    const findings = runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "date-order", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("emits one no-other-transactions finding per offender, exempting acceptances and itself", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        acceptanceRecord,
        cancellationRecord,
        { id: "xfer-a", object_type: "TX_CONVERTIBLE_TRANSFER", security_id: "sec1", date: "2021-06-01" },
        { id: "xfer-b", object_type: "TX_CONVERTIBLE_TRANSFER", security_id: "sec1", date: "2021-07-01" },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-other-transactions", subject);
    const messages = findings.map((f) => f.message).join("\n");
    expect(messages).toContain("xfer-a");
    expect(messages).toContain("xfer-b");
    // The exempt acceptance is never named as an offender.
    expect(messages).not.toContain("acc-x");
  });
});

// ---------------------------------------------------------------------------
// Transfer: issuance-exists, date-order (no-other-transactions is a declared gap)
// ---------------------------------------------------------------------------

describe("convertible transfer validity", () => {
  const transfer = (overrides: Record<string, unknown> = {}) => ({
    id: "xfer1",
    object_type: "TX_CONVERTIBLE_TRANSFER",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_CONVERTIBLE_TRANSFER", id: "xfer1" };

  it("returns no findings when the issuance exists and dates order", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_CONVERTIBLE_TRANSFER", context, transfer())).toEqual([]);
  });

  it("removes the referenced security from convertibleIssuances on the valid branch", () => {
    const seeded = contextWith({
      convertibleIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_CONVERTIBLE_TRANSFER", transfer()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec1")).toBe(false);
    expect(snapshot.context.convertibleIssuances.some((c: any) => c.security_id === "sec2")).toBe(true);
  });

  it("flags a missing issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_CONVERTIBLE_TRANSFER", context, transfer());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("flags an out-of-order date with an error naming the security_id", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any,
      transactions: [issuanceRecord("sec1", "2022-01-01")],
    });
    const findings = runValidator("TX_CONVERTIBLE_TRANSFER", context, transfer());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "date-order", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("never emits no-other-transactions, even when other transactions reference the security", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-x", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2021-06-01" },
        { id: "can-x", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "sec1", date: "2021-07-01" },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_TRANSFER", context, transfer());
    // The declared gap is never checked, so the transaction stays valid here.
    expect(findings).toEqual([]);
    expect(findings.some((f) => f.check === "no-other-transactions")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Declared-vs-emitted consistency across the family
// ---------------------------------------------------------------------------

// A transaction record on `security_id` of the given kind; the offender/exempt
// building block for the failing scenarios below.
const txRecord = (object_type: string, id: string, security_id = "sec1", date = "2021-06-01") => ({
  id,
  object_type,
  security_id,
  date,
});

// For each migrated type, scenarios that each fail one implemented check. The
// implemented ids a module declares should be exactly the ids these scenarios
// emit; a module's declared gap (transfer's no-other-transactions) has no
// failing scenario because no code path emits it.
const failingScenarios: Record<MigratedKey, { context: OcfMachineContext; data: Record<string, unknown> }[]> = {
  TX_CONVERTIBLE_ISSUANCE: [
    {
      context: baseContext(),
      data: { id: "i1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "sec1", stakeholder_id: "nobody", date: "2021-01-01" },
    },
  ],
  TX_CONVERTIBLE_ACCEPTANCE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any, transactions: [issuanceRecord("sec1", "2022-01-01")] }), data: txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_RETRACTION", "r1")] }), data: txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_RETRACTION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any, transactions: [issuanceRecord("sec1", "2022-01-01")] }), data: txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1")] }), data: txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_CANCELLATION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_CANCELLATION", "c1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any, transactions: [issuanceRecord("sec1", "2022-01-01")] }), data: txRecord("TX_CONVERTIBLE_CANCELLATION", "c1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_TRANSFER", "x1")] }), data: txRecord("TX_CONVERTIBLE_CANCELLATION", "c1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_TRANSFER: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_TRANSFER", "x1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1", "2022-01-01")] as any, transactions: [issuanceRecord("sec1", "2022-01-01")] }), data: txRecord("TX_CONVERTIBLE_TRANSFER", "x1", "sec1", "2021-01-01") },
  ],
};

/** Every check id emitted across a module's failing scenarios. */
const emittedCheckIds = (key: MigratedKey): Set<string> => {
  const emitted = new Set<string>();
  for (const { context, data } of failingScenarios[key]) {
    for (const finding of runValidator(key, context, data)) emitted.add(finding.check);
  }
  return emitted;
};

describe("declared and emitted checks stay consistent across the family", () => {
  // Exact set equality in both directions: no finding is emitted for a check the
  // descriptor does not declare implemented, and every declared implemented check
  // is emitted by at least one failing scenario.
  it.each(MIGRATED_KEYS)("%s emits exactly the check ids its descriptor declares implemented", (key) => {
    expect([...emittedCheckIds(key)].sort()).toEqual([...implementedCheckIds(key)].sort());
  });

  it("never emits transfer's declared-gap check", () => {
    expect(emittedCheckIds("TX_CONVERTIBLE_TRANSFER").has("no-other-transactions")).toBe(false);
    // The gap is declared on the descriptor with implemented: false.
    const declared = (TX_DESCRIPTORS.TX_CONVERTIBLE_TRANSFER as { checks: readonly { id: string; implemented?: false }[] }).checks;
    expect(declared.some((c) => c.id === "no-other-transactions" && c.implemented === false)).toBe(true);
  });

  it("leaves conversion on the legacy convention", () => {
    expect("legacyValidate" in TX_DESCRIPTORS.TX_CONVERTIBLE_CONVERSION).toBe(true);
    expect("validate" in TX_DESCRIPTORS.TX_CONVERTIBLE_CONVERSION).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channel migration: findings, not report, for the convertible family
// ---------------------------------------------------------------------------

describe("convertible family findings migrate to the findings channel", () => {
  it("routes an invalid convertible transaction to findings, leaves report clear, and serializes the errors in the failure result", () => {
    const actor = startSeeded(baseContext());
    // No stakeholder matches, so the issuance is invalid.
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", {
      id: "conv1",
      object_type: "TX_CONVERTIBLE_ISSUANCE",
      security_id: "sec1",
      stakeholder_id: "nobody",
      date: "2021-01-01",
    }));

    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");
    // The errors landed on findings…
    expect(context.findings.length).toBeGreaterThan(0);
    expect(context.findings.every((f) => f.severity === "error")).toBe(true);
    // …no report entry was written for a migrated convertible type…
    const migrated = MIGRATED_KEYS as readonly string[];
    expect(context.report.some((entry: any) => migrated.includes(entry?.transaction_type))).toBe(false);
    // …and the failure result serialized the error findings.
    expect(context.result).toContain(JSON.stringify(context.findings, null, 2));
  });
});
