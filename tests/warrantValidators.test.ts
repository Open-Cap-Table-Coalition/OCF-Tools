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
  "TX_WARRANT_ISSUANCE",
  "TX_WARRANT_ACCEPTANCE",
  "TX_WARRANT_RETRACTION",
  "TX_WARRANT_CANCELLATION",
  "TX_WARRANT_TRANSFER",
  "TX_WARRANT_EXERCISE",
] as const;
type MigratedKey = (typeof MIGRATED_KEYS)[number];

// A single warrant issuance, in the shape both the live collection and the
// package transaction history hold it. `date` lets a scenario place the issuance
// before or after the transaction under validation to exercise the existence
// check's layered diagnostics.
const issuanceRecord = (security_id: string, date = "2020-01-01") => ({
  id: `wi-${security_id}`,
  object_type: "TX_WARRANT_ISSUANCE",
  security_id,
  date,
});

// ---------------------------------------------------------------------------
// Issuance: stakeholder-exists
// ---------------------------------------------------------------------------

describe("warrant issuance validity", () => {
  const withStakeholder = (id: string) =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id }],
      } as OcfMachineContext["ocfPackageContent"],
    });

  const issuance = (overrides: Record<string, unknown> = {}) => ({
    id: "war1",
    object_type: "TX_WARRANT_ISSUANCE",
    security_id: "sec1",
    stakeholder_id: "sh1",
    date: "2021-01-01",
    ...overrides,
  });

  it("returns no findings when the referenced stakeholder exists", () => {
    const findings = runValidator("TX_WARRANT_ISSUANCE", withStakeholder("sh1"), issuance());
    expect(findings).toEqual([]);
  });

  it("flags a missing stakeholder with an error naming the stakeholder_id", () => {
    const findings = runValidator("TX_WARRANT_ISSUANCE", withStakeholder("someone-else"), issuance());
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "stakeholder-exists", {
      object_type: "TX_WARRANT_ISSUANCE",
      id: "war1",
    });
    expect(findings[0].message).toContain("sh1");
  });

  it("appends a valid issuance to warrantIssuances and stays in capTable", () => {
    const actor = startSeeded(withStakeholder("sh1"));
    actor.send(ev("TX_WARRANT_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.warrantIssuances).toHaveLength(1);
    expect(snapshot.context.warrantIssuances[0]).toMatchObject({ id: "war1", security_id: "sec1" });
    expect(snapshot.context.findings).toEqual([]);
  });

  it("halts an invalid issuance in validationError with the error finding recorded", () => {
    const actor = startSeeded(withStakeholder("someone-else"));
    actor.send(ev("TX_WARRANT_ISSUANCE", issuance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.findings).toHaveLength(1);
    expect(snapshot.context.findings[0].check).toBe("stakeholder-exists");
    expect(snapshot.context.warrantIssuances).toEqual([]);
    expect(snapshot.context.result).toContain("stakeholder-exists");
  });
});

// ---------------------------------------------------------------------------
// Acceptance: issuance-exists, no-retraction
// ---------------------------------------------------------------------------

describe("warrant acceptance validity", () => {
  const acceptance = (overrides: Record<string, unknown> = {}) => ({
    id: "acc1",
    object_type: "TX_WARRANT_ACCEPTANCE",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_WARRANT_ACCEPTANCE", id: "acc1" };

  it("returns no findings when the issuance is outstanding and no retraction references it", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_WARRANT_ACCEPTANCE", context, acceptance())).toEqual([]);
  });

  it("leaves the machine in capTable without mutating collections on the valid branch", () => {
    const seeded = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    const before = structuredClone(seeded.warrantIssuances);

    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_ACCEPTANCE", acceptance()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.warrantIssuances).toEqual(before);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("emits one no-retraction finding per past offending retraction, each naming that retraction", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-a", object_type: "TX_WARRANT_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "ret-b", object_type: "TX_WARRANT_RETRACTION", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_WARRANT_ACCEPTANCE", context, acceptance());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-retraction", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("ret-b");
  });
});

// ---------------------------------------------------------------------------
// Retraction: issuance-exists, no-acceptance
// ---------------------------------------------------------------------------

describe("warrant retraction validity", () => {
  const retraction = (overrides: Record<string, unknown> = {}) => ({
    id: "ret1",
    object_type: "TX_WARRANT_RETRACTION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const subject = { object_type: "TX_WARRANT_RETRACTION", id: "ret1" };

  it("returns no findings when the issuance is outstanding and no acceptance references it", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_WARRANT_RETRACTION", context, retraction())).toEqual([]);
  });

  it("removes the referenced security from warrantIssuances on the valid branch", () => {
    const seeded = contextWith({
      warrantIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_RETRACTION", retraction()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec1")).toBe(false);
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec2")).toBe(true);
    expect(snapshot.context.findings).toEqual([]);
  });

  it("emits one no-acceptance finding per past offending acceptance, each naming that acceptance", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "acc-a", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2020-06-01" },
        { id: "acc-b", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_WARRANT_RETRACTION", context, retraction());
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "no-acceptance", subject);
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-a");
    expect(findings.map((f) => f.message).join("\n")).toContain("acc-b");
  });
});

// ---------------------------------------------------------------------------
// Cancellation: issuance-exists, no-other-transactions
// ---------------------------------------------------------------------------

describe("warrant cancellation validity", () => {
  const cancellation = (overrides: Record<string, unknown> = {}) => ({
    id: "can1",
    object_type: "TX_WARRANT_CANCELLATION",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });
  const cancellationRecord = { id: "can1", object_type: "TX_WARRANT_CANCELLATION", security_id: "sec1", date: "2021-01-01" };
  const acceptanceRecord = { id: "acc-x", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
  const subject = { object_type: "TX_WARRANT_CANCELLATION", id: "can1" };

  it("returns no findings when only an issuance, a warrant acceptance, and the cancellation itself reference the security", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1"), acceptanceRecord, cancellationRecord],
    });
    expect(runValidator("TX_WARRANT_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("treats any live warrant record matched by security_id as the issuance, regardless of object_type", () => {
    // The existence check matches on security_id alone; a non-issuance object_type
    // in the live collection still satisfies it.
    const context = contextWith({
      warrantIssuances: [{ id: "x", object_type: "SOMETHING_ELSE", security_id: "sec1", date: "2020-01-01" }] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_WARRANT_CANCELLATION", context, cancellation())).toEqual([]);
  });

  it("removes the referenced security from warrantIssuances on the valid branch", () => {
    const seeded = contextWith({
      warrantIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_CANCELLATION", cancellation()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec1")).toBe(false);
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec2")).toBe(true);
  });

  it("emits one no-other-transactions finding per past offender, exempting acceptances and itself", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        acceptanceRecord,
        cancellationRecord,
        { id: "xfer-a", object_type: "TX_WARRANT_TRANSFER", security_id: "sec1", date: "2020-06-01" },
        { id: "xfer-b", object_type: "TX_WARRANT_TRANSFER", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_WARRANT_CANCELLATION", context, cancellation());
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

describe("warrant transfer validity", () => {
  const transfer = (overrides: Record<string, unknown> = {}) => ({
    id: "xfer1",
    object_type: "TX_WARRANT_TRANSFER",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });

  it("returns no findings when the issuance is outstanding", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1")],
    });
    expect(runValidator("TX_WARRANT_TRANSFER", context, transfer())).toEqual([]);
  });

  it("removes the referenced security from warrantIssuances on the valid branch", () => {
    const seeded = contextWith({
      warrantIssuances: [issuanceRecord("sec1"), issuanceRecord("sec2")] as any,
      transactions: [issuanceRecord("sec1"), issuanceRecord("sec2")],
    });
    const actor = startSeeded(seeded);
    actor.send(ev("TX_WARRANT_TRANSFER", transfer()));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec1")).toBe(false);
    expect(snapshot.context.warrantIssuances.some((w: any) => w.security_id === "sec2")).toBe(true);
  });

  it("never emits no-other-transactions, even when a past transaction references the security", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-x", object_type: "TX_WARRANT_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "can-x", object_type: "TX_WARRANT_CANCELLATION", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_WARRANT_TRANSFER", context, transfer());
    // The declared gap is never checked, so the transaction stays valid here.
    expect(findings).toEqual([]);
    expect(findings.some((f) => f.check === "no-other-transactions")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exercise: issuance-exists, no-other-transactions, resulting-security checks
// ---------------------------------------------------------------------------

describe("warrant exercise validity", () => {
  const EXERCISE_DATE = "2021-06-01";
  const exercise = (overrides: Record<string, unknown> = {}) => ({
    id: "ex-main",
    object_type: "TX_WARRANT_EXERCISE",
    security_id: "war-sec",
    resulting_security_ids: ["result-stock"],
    date: EXERCISE_DATE,
    ...overrides,
  });
  const subject = { object_type: "TX_WARRANT_EXERCISE", id: "ex-main" };
  const resultingChecks = ["resulting-stock-exists", "resulting-stock-dated", "resulting-stock-stakeholder"];

  // A live warrant issuance carrying an explicit stakeholder_id — the reference
  // the stakeholder check reads. The shared issuanceRecord helper omits it.
  const liveWarrant = (security_id: string, stakeholder_id: string) => ({
    id: `wi-${security_id}`,
    object_type: "TX_WARRANT_ISSUANCE",
    security_id,
    stakeholder_id,
    date: "2020-01-01",
  });
  // A resulting stock issuance as it sits in the package history.
  const stockIssuance = (security_id: string, stakeholder_id: string, date: string) => ({
    id: `si-${security_id}`,
    object_type: "TX_STOCK_ISSUANCE",
    security_id,
    stakeholder_id,
    date,
  });

  it("emits one resulting-stock-exists finding per missing resulting id", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-a")] as any,
      transactions: [liveWarrant("war-sec", "holder-a")],
    });
    const findings = runValidator(
      "TX_WARRANT_EXERCISE",
      context,
      exercise({ resulting_security_ids: ["absent-one", "absent-two"] }),
    ).filter((f) => f.check === "resulting-stock-exists");
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectFindingShape(finding, "resulting-stock-exists", subject);
    const messages = findings.map((f) => f.message).join("\n");
    expect(messages).toContain("absent-one");
    expect(messages).toContain("absent-two");
  });

  it("flags only the missing resulting id when a missing id precedes a present one", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-a")] as any,
      transactions: [
        liveWarrant("war-sec", "holder-a"),
        stockIssuance("present-stock", "holder-a", EXERCISE_DATE),
      ],
    });
    const findings = runValidator(
      "TX_WARRANT_EXERCISE",
      context,
      exercise({ resulting_security_ids: ["absent-stock", "present-stock"] }),
    );
    // The present id, second in the list, does not mask the missing id, first.
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-exists", subject);
    expect(findings[0].message).toContain("absent-stock");
    expect(findings[0].message).not.toContain("present-stock");
  });

  it("flags a resulting stock issuance dated before or after the exercise, but not one dated the same day", () => {
    const datedFindings = (stockDate: string) => {
      const context = contextWith({
        warrantIssuances: [liveWarrant("war-sec", "holder-a")] as any,
        transactions: [
          liveWarrant("war-sec", "holder-a"),
          stockIssuance("result-stock", "holder-a", stockDate),
        ],
      });
      return runValidator("TX_WARRANT_EXERCISE", context, exercise()).filter(
        (f) => f.check === "resulting-stock-dated",
      );
    };

    const earlier = datedFindings("2021-05-01");
    expect(earlier).toHaveLength(1);
    expectFindingShape(earlier[0], "resulting-stock-dated", subject);
    expect(earlier[0].message).toContain("differs");
    expect(earlier[0].message).toContain("result-stock");
    expect(earlier[0].message).toContain("2021-05-01");
    expect(earlier[0].message).toContain(EXERCISE_DATE);

    const later = datedFindings("2021-07-01");
    expect(later).toHaveLength(1);
    expect(later[0].message).toContain("differs");
    expect(later[0].message).toContain("2021-07-01");

    expect(datedFindings(EXERCISE_DATE)).toEqual([]);
  });

  it("flags a wrongly-dated resulting id before a correctly-dated one and ignores a resulting id with no backing issuance", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-a")] as any,
      transactions: [
        liveWarrant("war-sec", "holder-a"),
        stockIssuance("wrong-date", "holder-a", "2021-05-01"),
        stockIssuance("right-date", "holder-a", EXERCISE_DATE),
      ],
    });
    const findings = runValidator(
      "TX_WARRANT_EXERCISE",
      context,
      exercise({ resulting_security_ids: ["wrong-date", "right-date", "absent-stock"] }),
    ).filter((f) => f.check === "resulting-stock-dated");
    // The correctly-dated id, second, does not mask the wrong-dated id, first; the
    // absent id is judged only by resulting-stock-exists.
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-dated", subject);
    expect(findings[0].message).toContain("wrong-date");
    expect(findings[0].message).not.toContain("right-date");
    expect(findings[0].message).not.toContain("absent-stock");
  });

  it("flags a resulting stock issuance held by a different stakeholder than the exercised warrant issuance", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-alpha")] as any,
      transactions: [
        liveWarrant("war-sec", "holder-alpha"),
        stockIssuance("result-stock", "holder-beta", EXERCISE_DATE),
      ],
    });
    const findings = runValidator("TX_WARRANT_EXERCISE", context, exercise()).filter(
      (f) => f.check === "resulting-stock-stakeholder",
    );
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-stakeholder", subject);
    expect(findings[0].message).toContain("result-stock");
    expect(findings[0].message).toContain("holder-alpha");
    expect(findings[0].message).toContain("holder-beta");
  });

  it("flags a mismatching resulting id before a matching one and ignores a resulting id with no backing issuance", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-match")] as any,
      transactions: [
        liveWarrant("war-sec", "holder-match"),
        stockIssuance("wrong-holder", "holder-other", EXERCISE_DATE),
        stockIssuance("right-holder", "holder-match", EXERCISE_DATE),
      ],
    });
    const findings = runValidator(
      "TX_WARRANT_EXERCISE",
      context,
      exercise({ resulting_security_ids: ["wrong-holder", "right-holder", "absent-stock"] }),
    ).filter((f) => f.check === "resulting-stock-stakeholder");
    // The matching id, second, does not mask the mismatching id, first; the absent
    // id is judged only by resulting-stock-exists.
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-stakeholder", subject);
    expect(findings[0].message).toContain("wrong-holder");
    expect(findings[0].message).not.toContain("right-holder");
    expect(findings[0].message).not.toContain("absent-stock");
  });

  it("says nothing about resulting stakeholders when the exercised warrant issuance is absent from the live collection", () => {
    // No live warrant record for war-sec, so there is no reference stakeholder to
    // compare against — yet a resulting stock issuance carrying a stakeholder_id is
    // present, so the silence is the missing reference, not a missing value.
    const context = contextWith({
      warrantIssuances: [] as any,
      transactions: [stockIssuance("result-stock", "holder-beta", EXERCISE_DATE)],
    });
    const findings = runValidator("TX_WARRANT_EXERCISE", context, exercise());
    expect(findings.some((f) => f.check === "resulting-stock-stakeholder")).toBe(false);
    expect(findings.some((f) => f.check === "issuance-exists")).toBe(true);
  });

  // An exercise's own record appears in its history scan; each fixture includes it
  // so the self-exemption by id is exercised, alongside the offender under test.
  const noOtherFindings = (...offenders: Record<string, unknown>[]) => {
    const exerciseRecord = exercise({ resulting_security_ids: [] });
    const context = contextWith({
      warrantIssuances: [issuanceRecord("war-sec")] as any,
      transactions: [issuanceRecord("war-sec"), exerciseRecord, ...offenders],
    });
    return runValidator("TX_WARRANT_EXERCISE", context, exerciseRecord).filter(
      (f) => f.check === "no-other-transactions",
    );
  };

  it("ignores an offender dated after the exercise but flags one dated on or before", () => {
    const retraction = (date: string) => ({ id: "ret-off", object_type: "TX_WARRANT_RETRACTION", security_id: "war-sec", date });
    expect(noOtherFindings(retraction("2021-12-01"))).toEqual([]);

    const sameDay = noOtherFindings(retraction(EXERCISE_DATE));
    expect(sameDay).toHaveLength(1);
    expectFindingShape(sameDay[0], "no-other-transactions", subject);
    expect(sameDay[0].message).toContain("ret-off");

    expect(noOtherFindings(retraction("2021-01-01"))).toHaveLength(1);
  });

  it("exempts a warrant acceptance dated on or before and never flags the exercise itself", () => {
    const acceptance = { id: "acc-x", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "war-sec", date: "2021-01-01" };
    expect(noOtherFindings(acceptance)).toEqual([]);
    // With no other transaction present, the exercise's own history record is never flagged.
    expect(noOtherFindings()).toEqual([]);
  });

  it("flags a second exercise sharing the security_id, pinning the self-exemption to the transaction id", () => {
    const secondExercise = { id: "ex-other", object_type: "TX_WARRANT_EXERCISE", security_id: "war-sec", resulting_security_ids: [], date: "2021-01-01" };
    const findings = noOtherFindings(secondExercise);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "no-other-transactions", subject);
    expect(findings[0].message).toContain("ex-other");
  });

  it("warns once when the resulting array is empty and stays silent on the per-element resulting checks", () => {
    const context = contextWith({
      warrantIssuances: [issuanceRecord("war-sec")] as any,
      transactions: [issuanceRecord("war-sec")],
    });
    const findings = runValidator(
      "TX_WARRANT_EXERCISE",
      context,
      exercise({ resulting_security_ids: [] }),
    );
    const named = findings.filter((f) => f.check === "resulting-security-named");
    expect(named).toHaveLength(1);
    expect(named[0].severity).toBe("warning");
    expect(named[0].subject).toEqual(subject);
    for (const check of resultingChecks) {
      expect(findings.some((f) => f.check === check)).toBe(false);
    }
  });

  it("raises no resulting-security-named finding when the resulting array names a security", () => {
    const context = contextWith({
      warrantIssuances: [liveWarrant("war-sec", "holder-a")] as any,
      transactions: [
        liveWarrant("war-sec", "holder-a"),
        stockIssuance("result-stock", "holder-a", EXERCISE_DATE),
      ],
    });
    const findings = runValidator("TX_WARRANT_EXERCISE", context, exercise());
    expect(findings.some((f) => f.check === "resulting-security-named")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exercise drives the machine end to end
// ---------------------------------------------------------------------------

describe("warrant exercise drives the machine to completion", () => {
  // The resulting stock stays history-only — never sent as an event — so the
  // legacy stock validator is not dragged into these runs; the exercise checks
  // find it in history regardless.
  const seedPackage = (transactions: Record<string, unknown>[]) =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "holder-a" }],
        transactions,
      } as OcfMachineContext["ocfPackageContent"],
    });

  it("clears a fully valid exercise, removing the exercised warrant and recording no findings", () => {
    const issuance = { id: "wi-x", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-sec", stakeholder_id: "holder-a", date: "2020-01-01" };
    const exercise = { id: "ex-x", object_type: "TX_WARRANT_EXERCISE", security_id: "war-sec", resulting_security_ids: ["stock-sec"], date: "2020-01-02" };
    const resultingStock = { id: "si-x", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-sec", stakeholder_id: "holder-a", date: "2020-01-02" };

    const actor = startSeeded(seedPackage([issuance, exercise, resultingStock]));
    actor.send(ev("TX_WARRANT_ISSUANCE", issuance));
    actor.send(ev("TX_WARRANT_EXERCISE", exercise));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.findings).toEqual([]);
    expect(snapshot.context.warrantIssuances).toEqual([]);
  });

  it("completes an empty-resulting exercise on its warning alone and still removes the exercised warrant", () => {
    const issuance = { id: "wi-y", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-sec", stakeholder_id: "holder-a", date: "2020-01-01" };
    const exercise = { id: "ex-y", object_type: "TX_WARRANT_EXERCISE", security_id: "war-sec", resulting_security_ids: [], date: "2020-01-02" };

    const actor = startSeeded(seedPackage([issuance, exercise]));
    actor.send(ev("TX_WARRANT_ISSUANCE", issuance));
    actor.send(ev("TX_WARRANT_EXERCISE", exercise));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    // The lone finding is the warning, which does not block the machine.
    expect(snapshot.context.findings).toHaveLength(1);
    expect(snapshot.context.findings[0].check).toBe("resulting-security-named");
    expect(snapshot.context.findings[0].severity).toBe("warning");
    expect(snapshot.context.warrantIssuances).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Existence check: layered failure diagnostics
// ---------------------------------------------------------------------------

describe("issuance-exists reports why the referenced issuance is unavailable", () => {
  const acceptance = { id: "acc1", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2021-01-01" };
  const subject = { object_type: "TX_WARRANT_ACCEPTANCE", id: "acc1" };

  // Every scenario keeps the live collection empty so the existence check fails and
  // takes the history-scanning path; the message names one of the three causes.
  const expectSoleCause = (context: OcfMachineContext, message: string) => {
    const findings = runValidator("TX_WARRANT_ACCEPTANCE", context, acceptance);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toBe(message);
    expect(findings.some((f) => f.check === "date-order")).toBe(false);
  };

  it("names a security that was never issued in the package", () => {
    expectSoleCause(
      contextWith({ transactions: [] }),
      "No warrant issuance with security_id sec1 appears in the package.",
    );
  });

  it("names an issuance dated after the transaction", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2022-01-01")] }),
      "The warrant issuance referenced by security_id sec1 is dated 2022-01-01, after this transaction (2021-01-01).",
    );
  });

  it("reports an issuance issued on or before the transaction but no longer outstanding", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2020-01-01")] }),
      "The warrant issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
  });

  it("displays the on-or-before issuance's date when the history holds both an earlier and a later match", () => {
    expectSoleCause(
      contextWith({ transactions: [issuanceRecord("sec1", "2020-01-01"), issuanceRecord("sec1", "2022-01-01")] }),
      "The warrant issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
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
    { scan: "no-retraction", txType: "TX_WARRANT_ACCEPTANCE", txId: "acc1", offenderType: "TX_WARRANT_RETRACTION", offenderId: "ret1" },
    { scan: "no-acceptance", txType: "TX_WARRANT_RETRACTION", txId: "ret1", offenderType: "TX_WARRANT_ACCEPTANCE", offenderId: "acc1" },
    { scan: "no-other-transactions", txType: "TX_WARRANT_CANCELLATION", txId: "can1", offenderType: "TX_WARRANT_TRANSFER", offenderId: "xfer1" },
  ] as const;

  it.each(scans)("$scan flags a same-day or earlier offender but ignores a later one", ({ scan, txType, txId, offenderType, offenderId }) => {
    const tx = { id: txId, object_type: txType, security_id: "sec1", date: TX_DATE };
    const emitsAt = (offenderDate: string) => {
      const context = contextWith({
        warrantIssuances: [issuanceRecord("sec1")] as any,
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
  const issuance = { id: "wi1", object_type: "TX_WARRANT_ISSUANCE", security_id: "sec1", date: "2020-01-01" };

  it("clears an acceptance and flags a later retraction by its backward scan", () => {
    const acceptance = { id: "acc1", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
    const retraction = { id: "ret1", object_type: "TX_WARRANT_RETRACTION", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        warrantIssuances: [issuance] as any,
        transactions: [issuance, acceptance, retraction],
      }),
    );

    actor.send(ev("TX_WARRANT_ACCEPTANCE", acceptance));
    expect(actor.getSnapshot().value).toBe("capTable");
    expect(actor.getSnapshot().context.findings).toEqual([]);

    actor.send(ev("TX_WARRANT_RETRACTION", retraction));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].check).toBe("no-acceptance");
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_WARRANT_RETRACTION", id: "ret1" });
    }
    expect(context.findings.some((f) => f.subject.id === "acc1")).toBe(false);
  });

  it("clears a retraction that removes the issuance and then flags the later acceptance by both checks", () => {
    const retraction = { id: "ret1", object_type: "TX_WARRANT_RETRACTION", security_id: "sec1", date: "2020-02-01" };
    const acceptance = { id: "acc1", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        warrantIssuances: [issuance] as any,
        transactions: [issuance, retraction, acceptance],
      }),
    );

    actor.send(ev("TX_WARRANT_RETRACTION", retraction));
    const afterRetraction = actor.getSnapshot();
    expect(afterRetraction.value).toBe("capTable");
    expect(afterRetraction.context.findings).toEqual([]);
    // The retraction removed the issuance from the live collection.
    expect(afterRetraction.context.warrantIssuances.some((w: any) => w.security_id === "sec1")).toBe(false);

    actor.send(ev("TX_WARRANT_ACCEPTANCE", acceptance));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors.map((f) => f.check).sort()).toEqual(["issuance-exists", "no-retraction"]);
    const existence = errors.find((f) => f.check === "issuance-exists");
    expect(existence?.message).toBe(
      "The warrant issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_WARRANT_ACCEPTANCE", id: "acc1" });
    }
    expect(context.findings.some((f) => f.subject.id === "ret1")).toBe(false);
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
  TX_WARRANT_ISSUANCE: [
    {
      context: baseContext(),
      data: { id: "i1", object_type: "TX_WARRANT_ISSUANCE", security_id: "sec1", stakeholder_id: "nobody", date: "2021-01-01" },
    },
  ],
  TX_WARRANT_ACCEPTANCE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_WARRANT_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
    { context: contextWith({ warrantIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_WARRANT_RETRACTION", "r1", "sec1", "2020-06-01")] }), data: txRecord("TX_WARRANT_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
  ],
  TX_WARRANT_RETRACTION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_WARRANT_RETRACTION", "r1", "sec1", "2021-01-01") },
    { context: contextWith({ warrantIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_WARRANT_ACCEPTANCE", "a1", "sec1", "2020-06-01")] }), data: txRecord("TX_WARRANT_RETRACTION", "r1", "sec1", "2021-01-01") },
  ],
  TX_WARRANT_CANCELLATION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_WARRANT_CANCELLATION", "c1", "sec1", "2021-01-01") },
    { context: contextWith({ warrantIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_WARRANT_TRANSFER", "x1", "sec1", "2020-06-01")] }), data: txRecord("TX_WARRANT_CANCELLATION", "c1", "sec1", "2021-01-01") },
  ],
  TX_WARRANT_TRANSFER: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_WARRANT_TRANSFER", "x1", "sec1", "2021-01-01") },
  ],
  TX_WARRANT_EXERCISE: [
    // Missing issuance and an empty resulting array: issuance-exists and the
    // resulting-security-named warning.
    {
      context: contextWith({ transactions: [] }),
      data: { id: "ex1", object_type: "TX_WARRANT_EXERCISE", security_id: "sec1", resulting_security_ids: [], date: "2021-01-01" },
    },
    // A live issuance clears issuance-exists, leaving the remaining four checks
    // to fire: an offender for no-other-transactions, and three resulting ids
    // that are respectively absent, wrongly dated, and wrongly held.
    {
      context: contextWith({
        warrantIssuances: [{ id: "wi-sec1", object_type: "TX_WARRANT_ISSUANCE", security_id: "sec1", stakeholder_id: "holder-ref", date: "2020-01-01" }] as any,
        transactions: [
          { id: "wi-sec1", object_type: "TX_WARRANT_ISSUANCE", security_id: "sec1", stakeholder_id: "holder-ref", date: "2020-01-01" },
          txRecord("TX_WARRANT_RETRACTION", "ret-off", "sec1", "2020-06-01"),
          { id: "si-early", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-early", stakeholder_id: "holder-ref", date: "2020-05-01" },
          { id: "si-other", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-other-holder", stakeholder_id: "holder-other", date: "2021-01-01" },
        ],
      }),
      data: { id: "ex1", object_type: "TX_WARRANT_EXERCISE", security_id: "sec1", resulting_security_ids: ["stock-absent", "stock-early", "stock-other-holder"], date: "2021-01-01" },
    },
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
    expect(emittedCheckIds("TX_WARRANT_TRANSFER").has("no-other-transactions")).toBe(false);
    // The gap is declared on the descriptor with implemented: false.
    const declared = (TX_DESCRIPTORS.TX_WARRANT_TRANSFER as { checks: readonly { id: string; implemented?: false }[] }).checks;
    expect(declared.some((c) => c.id === "no-other-transactions" && c.implemented === false)).toBe(true);
  });

  it("carries warrant exercise on the graded convention with no legacy validator", () => {
    expect("validate" in TX_DESCRIPTORS.TX_WARRANT_EXERCISE).toBe(true);
    expect("legacyValidate" in TX_DESCRIPTORS.TX_WARRANT_EXERCISE).toBe(false);
    // A stray default export would still register a legacy key here, so assert its
    // absence directly rather than trusting the descriptor swap alone.
    expect("valid_tx_warrant_exercise" in validators).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Channel migration: findings, not report, for the warrant family
// ---------------------------------------------------------------------------

describe("warrant family findings migrate to the findings channel", () => {
  it("routes an invalid warrant transaction to findings, leaves report clear, and serializes the errors in the failure result", () => {
    const actor = startSeeded(baseContext());
    // No stakeholder matches, so the issuance is invalid.
    actor.send(ev("TX_WARRANT_ISSUANCE", {
      id: "war1",
      object_type: "TX_WARRANT_ISSUANCE",
      security_id: "sec1",
      stakeholder_id: "nobody",
      date: "2021-01-01",
    }));

    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");
    // The errors landed on findings…
    expect(context.findings.length).toBeGreaterThan(0);
    expect(context.findings.every((f) => f.severity === "error")).toBe(true);
    // …no report entry was written for a migrated warrant type…
    const migrated = MIGRATED_KEYS as readonly string[];
    expect(context.report.some((entry: any) => migrated.includes(entry?.transaction_type))).toBe(false);
    // …and the failure result serialized the error findings.
    expect(context.result).toContain(JSON.stringify(context.findings, null, 2));
  });
});
