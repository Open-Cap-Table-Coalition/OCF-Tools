import { describe, it, expect } from "vitest";
import { TX_DESCRIPTORS } from "../ocf_validator/ocfMachine";
import validators from "../ocf_validator/validators";
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
  "TX_EQUITY_COMPENSATION_ISSUANCE",
  "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  "TX_EQUITY_COMPENSATION_RETRACTION",
  "TX_EQUITY_COMPENSATION_CANCELLATION",
  "TX_EQUITY_COMPENSATION_TRANSFER",
  "TX_EQUITY_COMPENSATION_EXERCISE",
  "TX_EQUITY_COMPENSATION_RELEASE",
] as const;
type MigratedKey = (typeof MIGRATED_KEYS)[number];

// A single equity compensation issuance, in the shape both the live collection
// and the package transaction history hold it. `date` lets a scenario place the
// issuance before or after the transaction under validation to exercise the
// existence check's layered diagnostics.
const issuanceRecord = (security_id: string, date = "2020-01-01") => ({
  id: `eci-${security_id}`,
  object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
  security_id,
  date,
});

// ---------------------------------------------------------------------------
// Issuance: stakeholder-exists
// ---------------------------------------------------------------------------

describe("equity compensation issuance validity", () => {
  const withStakeholder = (id: string) =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id }],
      } as OcfMachineContext["ocfPackageContent"],
    });

  const issuance = (overrides: Record<string, unknown> = {}) => ({
    id: "eci1",
    object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
    security_id: "sec1",
    stakeholder_id: "sh1",
    date: "2021-01-01",
    ...overrides,
  });

  it("returns no findings when the referenced stakeholder exists", () => {
    const findings = runValidator("TX_EQUITY_COMPENSATION_ISSUANCE", withStakeholder("sh1"), issuance());
    expect(findings).toEqual([]);
  });

  it("flags a missing stakeholder with an error naming the stakeholder_id", () => {
    const findings = runValidator("TX_EQUITY_COMPENSATION_ISSUANCE", withStakeholder("someone-else"), issuance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "stakeholder-exists", {
      object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
      id: "eci1",
    });
    expect(findings[0].message).toContain("sh1");
  });

  it("appends a valid issuance to equityCompensation and stays in capTable", () => {
    const actor = startSeeded(withStakeholder("sh1"));
    actor.send(ev("TX_EQUITY_COMPENSATION_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation).toHaveLength(1);
    expect(snapshot.context.equityCompensation[0]).toMatchObject({ id: "eci1", security_id: "sec1" });
    expect(snapshot.context.findings).toEqual([]);
  });

  it("halts an invalid issuance in validationError with the error finding recorded", () => {
    const actor = startSeeded(withStakeholder("someone-else"));
    actor.send(ev("TX_EQUITY_COMPENSATION_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.findings).toHaveLength(1);
    expect(snapshot.context.findings[0].check).toBe("stakeholder-exists");
    expect(snapshot.context.equityCompensation).toEqual([]);
    expect(snapshot.context.result).toContain("stakeholder-exists");
  });
});

// ---------------------------------------------------------------------------
// Acceptance: issuance-exists, no-retraction
// ---------------------------------------------------------------------------

describe("equity compensation acceptance validity", () => {
  const acceptance = (overrides: Record<string, unknown> = {}) => ({
    id: "acc1",
    object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", id: "acc1" };

  it("returns no findings when the issuance is outstanding and no retraction references it", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_ACCEPTANCE", context, acceptance())).toEqual([]);
  });

  it("leaves the machine in capTable without mutating collections on the valid branch", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    const before = structuredClone(seeded.equityCompensation);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_ACCEPTANCE", acceptance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation).toEqual(before);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a not-outstanding issuance with an error naming the security_id", () => {
    // In the package history but not the live collection.
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_EQUITY_COMPENSATION_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("emits one no-retraction finding per past offending retraction, each naming that retraction", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-a", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "ret-b", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_EQUITY_COMPENSATION_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-retraction", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-b");
  });
});

// ---------------------------------------------------------------------------
// Retraction: issuance-exists, no-acceptance
// ---------------------------------------------------------------------------

describe("equity compensation retraction validity", () => {
  const retraction = (overrides: Record<string, unknown> = {}) => ({
    id: "ret1",
    object_type: "TX_EQUITY_COMPENSATION_RETRACTION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_EQUITY_COMPENSATION_RETRACTION", id: "ret1" };

  it("returns no findings when the issuance is outstanding and no acceptance references it", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_RETRACTION", context, retraction())).toEqual([]);
  });

  it("removes the referenced security from equityCompensation on the valid branch", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_RETRACTION", retraction()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec1")).toBe(false);
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec2")).toBe(true);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a not-outstanding issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_EQUITY_COMPENSATION_RETRACTION", context, retraction());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("emits one no-acceptance finding per past offending acceptance, each naming that acceptance", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "acc-a", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2020-06-01" },
        { id: "acc-b", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_EQUITY_COMPENSATION_RETRACTION", context, retraction());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-acceptance", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-b");
  });
});

// ---------------------------------------------------------------------------
// Cancellation: issuance-exists, no-other-transactions
// ---------------------------------------------------------------------------

describe("equity compensation cancellation validity", () => {
  const cancellation = (overrides: Record<string, unknown> = {}) => ({
    id: "can1",
    object_type: "TX_EQUITY_COMPENSATION_CANCELLATION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const cancellationRecord = { id: "can1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "sec1", date: "2021-01-01" };
  const acceptanceRecord = { id: "acc-x", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
  const subject = { object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", id: "can1" };

  it("returns no findings when only an issuance, an acceptance, and the cancellation itself reference the security", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1"), acceptanceRecord, cancellationRecord],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("treats any live equity compensation record matched by security_id as the issuance, regardless of object_type", () => {
    // The existence check matches on security_id alone; a non-issuance object_type
    // in the live collection still satisfies it.
    const context = contextWith({
      equityCompensation: [{ id: "x", object_type: "SOMETHING_ELSE", security_id: "sec1", date: "2020-01-01" }] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("removes the referenced security from equityCompensation on the valid branch", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_CANCELLATION", cancellation()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec1")).toBe(false);
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec2")).toBe(true);
  });

  it("emits one no-other-transactions finding per past offender, exempting acceptances and itself", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        acceptanceRecord,
        cancellationRecord,
        { id: "xfer-a", object_type: "TX_EQUITY_COMPENSATION_TRANSFER", security_id: "sec1", date: "2020-06-01" },
        { id: "xfer-b", object_type: "TX_EQUITY_COMPENSATION_TRANSFER", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_EQUITY_COMPENSATION_CANCELLATION", context, cancellation());
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
// Transfer: issuance-exists (no-other-transactions is a declared gap)
// ---------------------------------------------------------------------------

describe("equity compensation transfer validity", () => {
  const transfer = (overrides: Record<string, unknown> = {}) => ({
    id: "xfer1",
    object_type: "TX_EQUITY_COMPENSATION_TRANSFER",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_EQUITY_COMPENSATION_TRANSFER", id: "xfer1" };

  it("returns no findings when the issuance is outstanding", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_TRANSFER", context, transfer())).toEqual([]);
  });

  it("removes the referenced security from equityCompensation on the valid branch", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_TRANSFER", transfer()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec1")).toBe(false);
    expect(snapshot.context.equityCompensation.some((e: any) => e.security_id === "sec2")).toBe(true);
  });

  it("flags a not-outstanding issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_EQUITY_COMPENSATION_TRANSFER", context, transfer());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("never emits no-other-transactions, even when a past transaction references the security", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-x", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "can-x", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_EQUITY_COMPENSATION_TRANSFER", context, transfer());
    // The declared gap is never checked, so the transaction stays valid here.
    expect(findings).toEqual([]);
    expect(findings.some((f) => f.check === "no-other-transactions")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Release: issuance-exists (wired from passthrough into the active none section)
// ---------------------------------------------------------------------------

describe("equity compensation release validity", () => {
  const release = (overrides: Record<string, unknown> = {}) => ({
    id: "rel1",
    object_type: "TX_EQUITY_COMPENSATION_RELEASE",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_EQUITY_COMPENSATION_RELEASE", id: "rel1" };

  it("returns no findings when the issuance is outstanding", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_RELEASE", context, release())).toEqual([]);
  });

  it("leaves the machine in capTable without mutating collections on the valid branch", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    const before = structuredClone(seeded.equityCompensation);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_RELEASE", release()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.equityCompensation).toEqual(before);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a not-outstanding issuance with an error naming the security_id", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_EQUITY_COMPENSATION_RELEASE", context, release());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });
});

// ---------------------------------------------------------------------------
// Exercise: issuance-exists live, resulting-security checks are declared gaps
// ---------------------------------------------------------------------------

// The exercise diverges from warrant exercise: its effect is `none`, so it
// removes nothing, and every resulting-security check is a declared gap rather
// than an implemented check.
const EXERCISE_GAP_IDS = [
  "resulting-stock-exists",
  "no-other-transactions",
  "resulting-stock-dated",
  "resulting-stock-stakeholder",
  "resulting-quantity-sum",
];

describe("equity compensation exercise validity", () => {
  const exercise = (overrides: Record<string, unknown> = {}) => ({
    id: "ex1",
    object_type: "TX_EQUITY_COMPENSATION_EXERCISE",
    security_id: "sec1",
    resulting_security_ids: ["res1"],
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_EQUITY_COMPENSATION_EXERCISE", id: "ex1" };

  it("returns no findings when the issuance is outstanding", () => {
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_EQUITY_COMPENSATION_EXERCISE", context, exercise())).toEqual([]);
  });

  it("keeps the exercised issuance in equityCompensation on the valid branch, mutating no collection", () => {
    const seeded = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    const before = structuredClone(seeded.equityCompensation);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_EQUITY_COMPENSATION_EXERCISE", exercise()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    // Unlike warrant exercise, which removes the exercised security, equity
    // compensation exercise removes nothing — the issuance survives.
    expect(snapshot.context.equityCompensation).toEqual(before);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("flags a not-outstanding issuance, its only implemented failing path", () => {
    const context = contextWith({ transactions: [issuanceRecord("sec1")] });
    const findings = runValidator("TX_EQUITY_COMPENSATION_EXERCISE", context, exercise());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toContain("sec1");
  });

  it("declares its five resulting-security checks as gaps and emits none, even when their conditions are unmet", () => {
    // resulting_security_ids names a security with no backing stock issuance and
    // another transaction references the exercised security — conditions the gap
    // checks would flag if written. None is, so the transaction stays valid.
    const context = contextWith({
      equityCompensation: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-x", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-06-01" },
      ],
    });
    const findings = runValidator(
      "TX_EQUITY_COMPENSATION_EXERCISE",
      context,
      exercise({ resulting_security_ids: ["absent"] }),
    );
    expect(findings).toEqual([]);

    const declared = (TX_DESCRIPTORS.TX_EQUITY_COMPENSATION_EXERCISE as { checks: readonly { id: string; implemented?: false }[] }).checks;
    const gapIds = declared.filter((c) => c.implemented === false).map((c) => c.id);
    expect(gapIds.sort()).toEqual([...EXERCISE_GAP_IDS].sort());
    // Every gap declares error severity and none is implemented.
    for (const id of EXERCISE_GAP_IDS) {
      const gap = declared.find((c) => c.id === id) as { severity: string; implemented?: false };
      expect(gap.severity).toBe("error");
      expect(gap.implemented).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Existence check: layered failure diagnostics
// ---------------------------------------------------------------------------

describe("issuance-exists reports why the referenced issuance is unavailable", () => {
  const acceptance = { id: "acc1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2021-01-01" };
  const subject = { object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", id: "acc1" };

  // Every scenario keeps the live collection empty so the existence check fails and
  // takes the history-scanning path; the message names one of the three causes.
  const expectSoleCause = (context: OcfMachineContext, message: string) => {
    const findings = runValidator("TX_EQUITY_COMPENSATION_ACCEPTANCE", context, acceptance);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toBe(message);
    // No separate date-order check exists in this family.
    expect(findings.some((f) => f.check === "date-order")).toBe(false);
  };

  it("names a security that was never issued in the package", () => {
    expectSoleCause(
      contextWith({ transactions: [] }),
      "No equity compensation issuance with security_id sec1 appears in the package.",
    );
  });

  it("names an issuance dated after the transaction", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2022-01-01")] }),
      "The equity compensation issuance referenced by security_id sec1 is dated 2022-01-01, after this transaction (2021-01-01).",
    );
  });

  it("reports an issuance issued on or before the transaction but no longer outstanding", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2020-01-01")] }),
      "The equity compensation issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
  });

  it("displays the on-or-before issuance's date when the history holds both an earlier and a later match", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2020-01-01"), issuanceRecord("sec1", "2022-01-01")] }),
      "The equity compensation issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
  });
});

// ---------------------------------------------------------------------------
// Offender scans: past-only
// ---------------------------------------------------------------------------

describe("offender scans consider only offenders dated on or before the transaction", () => {
  // Each implemented scan judged at the date boundary: the transaction under
  // validation is dated 2021-06-01, with the referenced issuance already live so
  // the existence check passes and only the scan under test can emit.
  const TX_DATE = "2021-06-01";
  const scans = [
    { scan: "no-retraction", txType: "TX_EQUITY_COMPENSATION_ACCEPTANCE", txId: "acc1", offenderType: "TX_EQUITY_COMPENSATION_RETRACTION", offenderId: "ret1" },
    { scan: "no-acceptance", txType: "TX_EQUITY_COMPENSATION_RETRACTION", txId: "ret1", offenderType: "TX_EQUITY_COMPENSATION_ACCEPTANCE", offenderId: "acc1" },
    { scan: "no-other-transactions", txType: "TX_EQUITY_COMPENSATION_CANCELLATION", txId: "can1", offenderType: "TX_EQUITY_COMPENSATION_TRANSFER", offenderId: "xfer1" },
  ] as const;

  it.each(scans)("$scan flags a same-day or earlier offender but ignores a later one", ({ scan, txType, txId, offenderType, offenderId }) => {
    const tx = { id: txId, object_type: txType, security_id: "sec1", date: TX_DATE };
    const emitsAt = (offenderDate: string) => {
      const context = contextWith({
        equityCompensation: [issuanceRecord("sec1")] as any,
        transactions: [
          issuanceRecord("sec1"),
          { id: offenderId, object_type: offenderType, security_id: "sec1", date: offenderDate },
        ],
      });
      return runValidator(txType, context, tx).some((f) => f.check === scan);
    };

    expect(emitsAt("2021-12-01")).toBe(false);
    expect(emitsAt(TX_DATE)).toBe(true);
    expect(emitsAt("2021-01-01")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Conflicting transactions: the later one carries the error
// ---------------------------------------------------------------------------

describe("a conflicting transaction pair flags the later transaction, not the earlier", () => {
  const issuance = { id: "eci1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "sec1", date: "2020-01-01" };

  it("clears an acceptance and flags a later retraction by its backward scan", () => {
    const acceptance = { id: "acc1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
    const retraction = { id: "ret1", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        equityCompensation: [issuance] as any,
        transactions: [issuance, acceptance, retraction],
      }),
    );

    actor.send(ev("TX_EQUITY_COMPENSATION_ACCEPTANCE", acceptance));
    expect(actor.getSnapshot().value).toBe("capTable");
    expect(actor.getSnapshot().context.findings).toEqual([]);

    actor.send(ev("TX_EQUITY_COMPENSATION_RETRACTION", retraction));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].check).toBe("no-acceptance");
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_EQUITY_COMPENSATION_RETRACTION", id: "ret1" });
    }
    expect(context.findings.some((f) => f.subject.id === "acc1")).toBe(false);
  });

  it("clears a retraction that removes the issuance and then flags the later acceptance by both checks", () => {
    const retraction = { id: "ret1", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "sec1", date: "2020-02-01" };
    const acceptance = { id: "acc1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        equityCompensation: [issuance] as any,
        transactions: [issuance, retraction, acceptance],
      }),
    );

    actor.send(ev("TX_EQUITY_COMPENSATION_RETRACTION", retraction));
    const afterRetraction = actor.getSnapshot();
    expect(afterRetraction.value).toBe("capTable");
    expect(afterRetraction.context.findings).toEqual([]);
    // The retraction removed the issuance from the live collection.
    expect(afterRetraction.context.equityCompensation.some((e: any) => e.security_id === "sec1")).toBe(false);

    actor.send(ev("TX_EQUITY_COMPENSATION_ACCEPTANCE", acceptance));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors.map((f) => f.check).sort()).toEqual(["issuance-exists", "no-retraction"]);
    const existence = errors.find((f) => f.check === "issuance-exists");
    expect(existence?.message).toBe(
      "The equity compensation issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", id: "acc1" });
    }
    expect(context.findings.some((f) => f.subject.id === "ret1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Declared-vs-emitted consistency across the family
// ---------------------------------------------------------------------------

// A transaction record on `security_id` of the given kind; the offender/exempt
// building block for the failing scenarios below.
const txRecord = (object_type: string, id: string, security_id = "sec1", date = "2020-06-01") => ({
  id,
  object_type,
  security_id,
  date,
});

// For each migrated type, scenarios that each fail one implemented check. The
// implemented ids a module declares should be exactly the ids these scenarios
// emit; a module's declared gaps (transfer's and exercise's resulting-security
// checks) have no failing scenario because no code path emits them.
const failingScenarios: Record<MigratedKey, { context: OcfMachineContext; data: Record<string, unknown> }[]> = {
  TX_EQUITY_COMPENSATION_ISSUANCE: [
    {
      context: baseContext(),
      data: { id: "i1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "sec1", stakeholder_id: "nobody", date: "2021-01-01" },
    },
  ],
  TX_EQUITY_COMPENSATION_ACCEPTANCE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_EQUITY_COMPENSATION_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
    { context: contextWith({ equityCompensation: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_EQUITY_COMPENSATION_RETRACTION", "r1")] }), data: txRecord("TX_EQUITY_COMPENSATION_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
  ],
  TX_EQUITY_COMPENSATION_RETRACTION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_EQUITY_COMPENSATION_RETRACTION", "r1", "sec1", "2021-01-01") },
    { context: contextWith({ equityCompensation: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_EQUITY_COMPENSATION_ACCEPTANCE", "a1")] }), data: txRecord("TX_EQUITY_COMPENSATION_RETRACTION", "r1", "sec1", "2021-01-01") },
  ],
  TX_EQUITY_COMPENSATION_CANCELLATION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_EQUITY_COMPENSATION_CANCELLATION", "c1", "sec1", "2021-01-01") },
    { context: contextWith({ equityCompensation: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_EQUITY_COMPENSATION_TRANSFER", "x1")] }), data: txRecord("TX_EQUITY_COMPENSATION_CANCELLATION", "c1", "sec1", "2021-01-01") },
  ],
  TX_EQUITY_COMPENSATION_TRANSFER: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_EQUITY_COMPENSATION_TRANSFER", "x1", "sec1", "2021-01-01") },
  ],
  TX_EQUITY_COMPENSATION_EXERCISE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: { id: "ex1", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "sec1", resulting_security_ids: [], date: "2021-01-01" } },
  ],
  TX_EQUITY_COMPENSATION_RELEASE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_EQUITY_COMPENSATION_RELEASE", "rel1", "sec1", "2021-01-01") },
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
    expect(emittedCheckIds("TX_EQUITY_COMPENSATION_TRANSFER").has("no-other-transactions")).toBe(false);
    // The gap is declared on the descriptor with implemented: false.
    const declared = (TX_DESCRIPTORS.TX_EQUITY_COMPENSATION_TRANSFER as { checks: readonly { id: string; implemented?: false }[] }).checks;
    expect(declared.some((c) => c.id === "no-other-transactions" && c.implemented === false)).toBe(true);
  });

  it("never emits any of exercise's declared-gap checks", () => {
    const emitted = emittedCheckIds("TX_EQUITY_COMPENSATION_EXERCISE");
    for (const id of EXERCISE_GAP_IDS) expect(emitted.has(id)).toBe(false);
  });

  it("carries release on the graded convention with no legacy validator", () => {
    expect("validate" in TX_DESCRIPTORS.TX_EQUITY_COMPENSATION_RELEASE).toBe(true);
    expect("legacyValidate" in TX_DESCRIPTORS.TX_EQUITY_COMPENSATION_RELEASE).toBe(false);
    // A stray default export would still register a legacy key here, so assert its
    // absence directly rather than trusting the descriptor swap alone.
    expect("valid_tx_equity_compensation_release" in validators).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channel migration: findings, not report, for the equity compensation family
// ---------------------------------------------------------------------------

describe("equity compensation family findings migrate to the findings channel", () => {
  it("routes an invalid equity compensation transaction to findings, leaves report clear, and serializes the errors in the failure result", () => {
    const actor = startSeeded(baseContext());
    // No stakeholder matches, so the issuance is invalid.
    actor.send(ev("TX_EQUITY_COMPENSATION_ISSUANCE", {
      id: "eci1",
      object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
      security_id: "sec1",
      stakeholder_id: "nobody",
      date: "2021-01-01",
    }));

    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");
    // The errors landed on findings…
    expect(context.findings.length).toBeGreaterThan(0);
    expect(context.findings.every((f) => f.severity === "error")).toBe(true);
    // …no report entry was written for a migrated equity compensation type…
    const migrated = MIGRATED_KEYS as readonly string[];
    expect(context.report.some((entry: any) => migrated.includes(entry?.transaction_type))).toBe(false);
    // …and the failure result serialized the error findings.
    expect(context.result).toContain(JSON.stringify(context.findings, null, 2));
  });
});
