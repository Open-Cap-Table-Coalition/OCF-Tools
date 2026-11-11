import { describe, it, expect } from "vitest";
import { TX_DESCRIPTORS } from "../ocf_validator/ocfMachine";
import type { OcfMachineContext } from "../types/validator";
import {
  baseContext,
  startSeeded,
  ev,
  contextWith,
  validatePackage,
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
  "TX_CONVERTIBLE_CONVERSION",
] as const;
type MigratedKey = (typeof MIGRATED_KEYS)[number];

// A single convertible issuance, in the shape both the live collection and the
// package transaction history hold it. `date` lets a scenario place the issuance
// before or after the transaction under validation to exercise the existence
// check's layered diagnostics.
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
// Acceptance: issuance-exists, no-retraction
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

  it("returns no findings when the issuance is outstanding and no retraction references it", () => {
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

  it("emits one no-retraction finding per past offending retraction, each naming that retraction", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-a", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "ret-b", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2020-07-01" },
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
// Retraction: issuance-exists, no-acceptance
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

  it("returns no findings when the issuance is outstanding and no acceptance references it", () => {
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

  it("emits one no-acceptance finding per past offending acceptance, each naming that acceptance", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "acc-a", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2020-06-01" },
        { id: "acc-b", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2020-07-01" },
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
// Cancellation: issuance-exists, no-other-transactions
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
  const acceptanceRecord = { id: "acc-x", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
  const subject = { object_type: "TX_CONVERTIBLE_CANCELLATION", id: "can1" };

  it("returns no findings when only an issuance, a convertible acceptance, and the cancellation itself reference the security", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [issuanceRecord("sec1"), acceptanceRecord, cancellationRecord],
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

  it("emits one no-other-transactions finding per past offender, exempting acceptances and itself", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        acceptanceRecord,
        cancellationRecord,
        { id: "xfer-a", object_type: "TX_CONVERTIBLE_TRANSFER", security_id: "sec1", date: "2020-06-01" },
        { id: "xfer-b", object_type: "TX_CONVERTIBLE_TRANSFER", security_id: "sec1", date: "2020-07-01" },
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

  // The warrant family exempts vesting transactions; this family doesn't,
  // because a convertible issuance has no vesting terms.
  it.each(["TX_VESTING_START", "TX_VESTING_EVENT", "TX_VESTING_ACCELERATION"])(
    "still flags a past %s on the security, since a convertible can't vest",
    (vestingType) => {
      const context = contextWith({
        convertibleIssuances: [issuanceRecord("sec1")] as any,
        transactions: [
          issuanceRecord("sec1"),
          { id: "vest-x", object_type: vestingType, security_id: "sec1", date: "2020-06-01" },
          cancellationRecord,
        ],
      });
      const findings = runValidator("TX_CONVERTIBLE_CANCELLATION", context, cancellation());
      expect(findings).toHaveLength(1);
      expectFindingShape(findings[0], "no-other-transactions", subject);
      expect(findings[0].message).toContain("vest-x");
    },
  );
});

// ---------------------------------------------------------------------------
// Transfer: issuance-exists (no-other-transactions is a declared gap)
// ---------------------------------------------------------------------------

describe("convertible transfer validity", () => {
  const transfer = (overrides: Record<string, unknown> = {}) => ({
    id: "xfer1",
    object_type: "TX_CONVERTIBLE_TRANSFER",
    security_id: "sec1",
    date: "2021-01-01",
    ...overrides,
  });

  it("returns no findings when the issuance is outstanding", () => {
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

  it("never emits no-other-transactions, even when a past transaction references the security", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("sec1")] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "ret-x", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2020-06-01" },
        { id: "can-x", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "sec1", date: "2020-07-01" },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_TRANSFER", context, transfer());
    // The declared gap is never checked, so the transaction stays valid here.
    expect(findings).toEqual([]);
    expect(findings.some((f) => f.check === "no-other-transactions")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conversion: issuance-exists, no-other-transactions, resulting-security checks
// ---------------------------------------------------------------------------

describe("convertible conversion validity", () => {
  const CONVERSION_DATE = "2021-06-01";
  const conversion = (overrides: Record<string, unknown> = {}) => ({
    id: "conv-main",
    object_type: "TX_CONVERTIBLE_CONVERSION",
    security_id: "conv-sec",
    resulting_security_ids: ["result-stock"],
    date: CONVERSION_DATE,
    ...overrides,
  });
  const subject = { object_type: "TX_CONVERTIBLE_CONVERSION", id: "conv-main" };
  // The whole finding the conversion records for a failed check.
  const errorFinding = (check: string, message: string) => ({ severity: "error", check, message, subject });

  // A live convertible issuance carrying an explicit stakeholder_id — the reference
  // the stakeholder check reads. The shared issuanceRecord helper omits it.
  const liveConvertible = (security_id: string, stakeholder_id: string) => ({
    id: `ci-${security_id}`,
    object_type: "TX_CONVERTIBLE_ISSUANCE",
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

  it("flags only the missing resulting id when a missing id precedes a present one", () => {
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-a"),
        stockIssuance("present-stock", "holder-a", CONVERSION_DATE),
      ],
    });
    const findings = runValidator(
      "TX_CONVERTIBLE_CONVERSION",
      context,
      conversion({ resulting_security_ids: ["absent-stock", "present-stock"] }),
    );
    // The present id, second in the list, does not mask the missing id, first.
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-exists", subject);
    expect(findings[0].message).toContain("absent-stock");
    expect(findings[0].message).not.toContain("present-stock");
  });

  it("emits one finding per failing resulting id for each resulting check", () => {
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-a"),
        stockIssuance("early-1", "holder-a", "2021-05-01"),
        stockIssuance("early-2", "holder-a", "2021-05-02"),
        stockIssuance("other-1", "holder-b", CONVERSION_DATE),
        stockIssuance("other-2", "holder-c", CONVERSION_DATE),
      ],
    });
    const findings = runValidator(
      "TX_CONVERTIBLE_CONVERSION",
      context,
      conversion({ resulting_security_ids: ["absent-1", "absent-2", "early-1", "early-2", "other-1", "other-2"] }),
    );
    expect(findings).toEqual([
      errorFinding("resulting-stock-exists", "No stock issuance with security_id absent-1 appears in the package."),
      errorFinding("resulting-stock-exists", "No stock issuance with security_id absent-2 appears in the package."),
      errorFinding("resulting-stock-dated", "The resulting stock issuance early-1 is dated 2021-05-01, which differs from the conversion date 2021-06-01."),
      errorFinding("resulting-stock-dated", "The resulting stock issuance early-2 is dated 2021-05-02, which differs from the conversion date 2021-06-01."),
      errorFinding("resulting-stock-stakeholder", "The resulting stock issuance other-1 names stakeholder holder-b, which differs from the convertible issuance's stakeholder holder-a."),
      errorFinding("resulting-stock-stakeholder", "The resulting stock issuance other-2 names stakeholder holder-c, which differs from the convertible issuance's stakeholder holder-a."),
    ]);
  });

  it("doesn't accept a convertible issuance as a resulting security", () => {
    // Dated the same day and held by the same stakeholder, so only its type
    // keeps it from counting as the resulting stock.
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-a"),
        { ...liveConvertible("other-safe", "holder-a"), date: CONVERSION_DATE },
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion({ resulting_security_ids: ["other-safe"] }));
    expect(findings).toEqual([
      errorFinding("resulting-stock-exists", "No stock issuance with security_id other-safe appears in the package."),
    ]);
  });

  it("flags a resulting stock issuance dated before or after the conversion, but not one dated the same day", () => {
    const datedFindings = (stockDate: string) => {
      const context = contextWith({
        convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
        transactions: [
          liveConvertible("conv-sec", "holder-a"),
          stockIssuance("result-stock", "holder-a", stockDate),
        ],
      });
      return runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion()).filter(
        (f) => f.check === "resulting-stock-dated",
      );
    };

    const earlier = datedFindings("2021-05-01");
    expect(earlier).toHaveLength(1);
    expectFindingShape(earlier[0], "resulting-stock-dated", subject);
    expect(earlier[0].message).toContain("differs");
    expect(earlier[0].message).toContain("result-stock");
    expect(earlier[0].message).toContain("2021-05-01");
    expect(earlier[0].message).toContain(CONVERSION_DATE);

    const later = datedFindings("2021-07-01");
    expect(later).toHaveLength(1);
    expect(later[0].message).toContain("differs");
    expect(later[0].message).toContain("2021-07-01");

    expect(datedFindings(CONVERSION_DATE)).toEqual([]);
  });

  it("flags a resulting stock issuance held by a different stakeholder than the converted issuance", () => {
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-alpha")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-alpha"),
        stockIssuance("result-stock", "holder-beta", CONVERSION_DATE),
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion()).filter(
      (f) => f.check === "resulting-stock-stakeholder",
    );
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-stakeholder", subject);
    expect(findings[0].message).toContain("result-stock");
    expect(findings[0].message).toContain("holder-alpha");
    expect(findings[0].message).toContain("holder-beta");
  });

  it("says nothing about resulting stakeholders when the converted issuance is absent from the live collection", () => {
    // No live convertible record for conv-sec, so there is no reference stakeholder
    // to compare against — yet a resulting stock issuance carrying a stakeholder_id
    // is present, so the silence is the missing reference, not a missing value.
    // Another live convertible, held by someone else, mustn't stand in for it,
    // and nor must conv-sec's own issuance in the history, which isn't live.
    const context = contextWith({
      convertibleIssuances: [liveConvertible("other-sec", "holder-alpha")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-alpha"),
        liveConvertible("other-sec", "holder-alpha"),
        stockIssuance("result-stock", "holder-beta", CONVERSION_DATE),
      ],
    });
    const findings = runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion());
    expect(findings.some((f) => f.check === "resulting-stock-stakeholder")).toBe(false);
  });

  it("compares resulting stakeholders with the converted convertible, not another live one", () => {
    const live = [liveConvertible("other-sec", "holder-b"), liveConvertible("conv-sec", "holder-a"), liveConvertible("later-sec", "holder-c")];
    const context = contextWith({
      convertibleIssuances: live as any,
      transactions: [...live, stockIssuance("result-stock", "holder-a", CONVERSION_DATE)],
    });
    expect(runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion())).toEqual([]);
  });

  // A conversion's own record appears in its history scan; each fixture includes it
  // so the self-exemption by id is exercised, alongside the offender under test.
  const noOtherFindings = (...offenders: Record<string, unknown>[]) => {
    const conversionRecord = conversion({ resulting_security_ids: [] });
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("conv-sec")] as any,
      transactions: [issuanceRecord("conv-sec"), conversionRecord, ...offenders],
    });
    return runValidator("TX_CONVERTIBLE_CONVERSION", context, conversionRecord).filter(
      (f) => f.check === "no-other-transactions",
    );
  };

  it("flags a second conversion sharing the security_id, pinning the self-exemption to the transaction id", () => {
    // Same type and date as the conversion under validation, so only the id
    // tells the two apart.
    const secondConversion = { id: "conv-other", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "conv-sec", resulting_security_ids: [], date: CONVERSION_DATE };
    const findings = noOtherFindings(secondConversion);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "no-other-transactions", subject);
    expect(findings[0].message).toContain("conv-other");
  });

  it("flags another type's transaction that reuses the conversion's id, pinning the self-exemption to the transaction type", () => {
    // Ids aren't unique across types, so a vesting start sharing the conversion's
    // id is still another transaction on the security. It's dated the same day,
    // so only its type tells the two apart.
    const vestingStart = { id: "conv-main", object_type: "TX_VESTING_START", security_id: "conv-sec", date: CONVERSION_DATE };
    const findings = noOtherFindings(vestingStart);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "no-other-transactions", subject);
  });

  it("warns once when the resulting array is empty and stays silent on the per-element resulting checks", () => {
    const context = contextWith({
      convertibleIssuances: [issuanceRecord("conv-sec")] as any,
      transactions: [issuanceRecord("conv-sec")],
    });
    const findings = runValidator(
      "TX_CONVERTIBLE_CONVERSION",
      context,
      conversion({ resulting_security_ids: [] }),
    );
    expect(findings).toEqual([
      { severity: "warning", check: "resulting-security-named", message: "The conversion names no resulting security.", subject },
    ]);
  });

  it("raises no resulting-security-named finding when the resulting array names a security", () => {
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-a"),
        stockIssuance("result-stock", "holder-a", CONVERSION_DATE),
      ],
    });
    expect(runValidator("TX_CONVERTIBLE_CONVERSION", context, conversion())).toEqual([]);
  });

  it.each([
    { shape: "a string", value: "result-stock" },
    { shape: "an empty string", value: "" },
    { shape: "an object", value: { id: "result-stock" } },
    { shape: "a number", value: 1 },
    { shape: "null", value: null },
    { shape: "undefined", value: undefined },
  ])("reports a resulting_security_ids that is $shape as one resulting-stock-exists error instead of throwing", ({ value }) => {
    const context = contextWith({
      convertibleIssuances: [liveConvertible("conv-sec", "holder-a")] as any,
      transactions: [
        liveConvertible("conv-sec", "holder-a"),
        stockIssuance("result-stock", "holder-a", CONVERSION_DATE),
      ],
    });
    const findings = runValidator(
      "TX_CONVERTIBLE_CONVERSION",
      context,
      conversion({ resulting_security_ids: value }),
    );
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "resulting-stock-exists", subject);
    expect(findings[0].message).toContain("not a list");
  });

  it("declares quantity-reconciles and balance-security-exists as unimplemented gaps", () => {
    const declared = (TX_DESCRIPTORS.TX_CONVERTIBLE_CONVERSION as { checks: readonly { id: string; implemented?: false }[] }).checks;
    for (const id of ["quantity-reconciles", "balance-security-exists"]) {
      expect(declared.some((c) => c.id === id && c.implemented === false)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Conversion drives the machine end to end
// ---------------------------------------------------------------------------

describe("convertible conversion drives the machine to completion", () => {
  // The resulting stock stays history-only — never sent as an event — so the
  // legacy stock validator is not dragged into these runs; the conversion checks
  // find it in history regardless.
  const seedPackage = (transactions: any[]) =>
    baseContext({
      ocfPackageContent: {
        ...baseContext().ocfPackageContent,
        stakeholders: [{ id: "holder-a" }],
        transactions,
      } as OcfMachineContext["ocfPackageContent"],
    });

  it("clears a fully valid conversion, removing the converted convertible and recording no findings", () => {
    const issuance = { id: "ci-x", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "conv-sec", stakeholder_id: "holder-a", date: "2020-01-01" };
    const conversion = { id: "cv-x", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "conv-sec", resulting_security_ids: ["stock-sec"], date: "2020-01-02" };
    const resultingStock = { id: "si-x", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-sec", stakeholder_id: "holder-a", date: "2020-01-02" };

    const actor = startSeeded(seedPackage([issuance, conversion, resultingStock]));
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issuance));
    actor.send(ev("TX_CONVERTIBLE_CONVERSION", conversion));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.findings).toEqual([]);
    expect(snapshot.context.convertibleIssuances).toEqual([]);
  });

  it("completes an empty-resulting conversion on its warning alone and still removes the converted convertible", () => {
    const issuance = { id: "ci-y", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "conv-sec", stakeholder_id: "holder-a", date: "2020-01-01" };
    const conversion = { id: "cv-y", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "conv-sec", resulting_security_ids: [], date: "2020-01-02" };

    const actor = startSeeded(seedPackage([issuance, conversion]));
    actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issuance));
    actor.send(ev("TX_CONVERTIBLE_CONVERSION", conversion));

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    // The lone finding is the warning, which does not block the machine.
    expect(snapshot.context.findings).toHaveLength(1);
    expect(snapshot.context.findings[0].check).toBe("resulting-security-named");
    expect(snapshot.context.findings[0].severity).toBe("warning");
    expect(snapshot.context.convertibleIssuances).toEqual([]);
  });

  // A run used to stop at every conversion, so it never reached the legacy equity
  // compensation validators after one. Now that conversions pass, the run goes on
  // to them, and they must validate rather than crash the machine.
  it.each(["TX_EQUITY_COMPENSATION_ACCEPTANCE", "TX_EQUITY_COMPENSATION_RETRACTION"])(
    "goes on past a valid conversion to validate a later %s",
    (txType) => {
      const issuance = { id: "ci-z", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "conv-sec", stakeholder_id: "holder-a", date: "2020-01-01" };
      const conversion = { id: "cv-z", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "conv-sec", resulting_security_ids: ["stock-sec"], date: "2020-01-02" };
      const resultingStock = { id: "si-z", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-sec", stakeholder_id: "holder-a", date: "2020-01-02" };
      // Seeded straight into its collection, so the legacy equity issuance
      // validator stays out of the run just as the stock one does.
      const option = { id: "ec-z", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "opt-sec", stakeholder_id: "holder-a", date: "2020-01-03" };
      const optionTx = { id: "ec-tx", object_type: txType, security_id: "opt-sec", date: "2020-01-04" };

      const actor = startSeeded({
        ...seedPackage([issuance, conversion, resultingStock, option, optionTx]),
        equityCompensation: [option] as any,
      });
      actor.send(ev("TX_CONVERTIBLE_ISSUANCE", issuance));
      actor.send(ev("TX_CONVERTIBLE_CONVERSION", conversion));
      actor.send(ev(txType, optionTx));

      const snapshot = actor.getSnapshot();
      expect(snapshot.status).toBe("active");
      expect(snapshot.value).toBe("capTable");
      expect(snapshot.context.findings).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Conversion through the whole validator
// ---------------------------------------------------------------------------

describe("convertible conversion through ocfValidator", () => {
  // Unlike the runs above, this one goes through the driver: the date sort,
  // START, the end-of-day snapshots, and RUN_END. The package lists its
  // transactions newest first, so the run depends on the sort, including its
  // same-day order by type (the option's issuance before its acceptance). The
  // resulting stock issuance is a real event here, and the run goes on to the
  // legacy stock and equity compensation validators; the equity compensation
  // acceptance once crashed a run that got past a conversion (#203).
  it("converts into same-day stock and validates the transactions after it", () => {
    const context = validatePackage(
      [
        { id: "eca-1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "option-1", date: "2021-07-01" },
        { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "option-1", stakeholder_id: "holder-a", custom_id: "EC-1", quantity: "50", date: "2021-07-01" },
        { id: "sa-1", object_type: "TX_STOCK_ACCEPTANCE", security_id: "stock-1", date: "2021-07-01" },
        { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "holder-a", stock_class_id: "common", custom_id: "CS-1", quantity: "100", stock_legend_ids: [], date: "2021-06-01" },
        { id: "cv-1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "safe-1", resulting_security_ids: ["stock-1"], date: "2021-06-01" },
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "holder-a", custom_id: "SAFE-1", date: "2021-01-01" },
      ],
      [{ id: "holder-a" }],
      [{ id: "common" }],
    );

    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and the package appears valid.");
    expect(context.findings).toEqual([]);
    const safe = { date: "2021-01-01", custom_id: "SAFE-1", stakeholder: "holder-a" };
    const stock = { date: "2021-06-01", custom_id: "CS-1", stakeholder: "holder-a", stock_class: "common", quantity: "100" };
    const option = { date: "2021-07-01", custom_id: "EC-1", stakeholder: "holder-a", quantity: "50" };
    expect(context.snapshots).toEqual([
      { date: "2021-01-01", stockIssuances: [], convertibles: [safe], warrants: [], equityCompensation: [] },
      { date: "2021-06-01", stockIssuances: [stock], convertibles: [], warrants: [], equityCompensation: [] },
      { date: "2021-07-01", stockIssuances: [stock], convertibles: [], warrants: [], equityCompensation: [option] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// issuance-exists matches the live collection on security_id alone
// ---------------------------------------------------------------------------

describe("convertible issuance-exists matching", () => {
  // Acceptance, retraction, cancellation, transfer, and conversion find the
  // issuance by security_id alone and ignore its object_type (decision 3 on
  // #198), so any record in the collection with a matching security_id counts.
  // That's only safe because the collection holds nothing but issuances, which
  // tests/ocfMachine.test.ts checks.
  it.each([
    "TX_CONVERTIBLE_ACCEPTANCE",
    "TX_CONVERTIBLE_RETRACTION",
    "TX_CONVERTIBLE_CANCELLATION",
    "TX_CONVERTIBLE_TRANSFER",
    "TX_CONVERTIBLE_CONVERSION",
  ] as const)("%s treats any live convertible record matched by security_id as the issuance, regardless of object_type", (key) => {
    // Only the conversion reads resulting_security_ids. It names a stock
    // issuance held by the live record's stakeholder, so that it passes too.
    const context = contextWith({
      convertibleIssuances: [{ id: "x", object_type: "SOMETHING_ELSE", security_id: "sec1", stakeholder_id: "holder-a", date: "2020-01-01" }] as any,
      transactions: [
        issuanceRecord("sec1"),
        { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "holder-a", date: "2021-01-01" },
      ],
    });
    const data = { id: "tx1", object_type: key, security_id: "sec1", resulting_security_ids: ["stock-1"], date: "2021-01-01" };
    expect(runValidator(key, context, data)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Existence check: layered failure diagnostics
// ---------------------------------------------------------------------------

describe.each([
  { id: "acc1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2021-01-01" },
  { id: "cv1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "sec1", resulting_security_ids: ["stock-1"], date: "2021-01-01" },
])("issuance-exists on $object_type reports why the referenced issuance is unavailable", (transaction) => {
  const subject = { object_type: transaction.object_type, id: transaction.id };
  const resultingStock = { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", date: "2021-01-01" };

  // Every scenario keeps the live collection empty so the existence check fails and
  // takes the history-scanning path; the message names one of the three causes.
  // The history also holds the conversion's same-day resulting stock, so the
  // existence check is the only one that fails.
  const expectSoleCause = (transactions: Record<string, unknown>[], message: string) => {
    const findings = runValidator(transaction.object_type, contextWith({ transactions: [...transactions, resultingStock] }), transaction);
    expect(findings).toHaveLength(1);
    expectFindingShape(findings[0], "issuance-exists", subject);
    expect(findings[0].message).toBe(message);
  };

  it("names a security that was never issued in the package", () => {
    expectSoleCause(
      [],
      "No convertible issuance with security_id sec1 appears in the package.",
    );
  });

  it("names an issuance dated after the transaction", () => {
    expectSoleCause(
      [issuanceRecord("sec1", "2022-01-01")],
      "The convertible issuance referenced by security_id sec1 is dated 2022-01-01, after this transaction (2021-01-01).",
    );
  });

  it("reports an issuance issued on or before the transaction but no longer outstanding", () => {
    expectSoleCause(
      [issuanceRecord("sec1", "2020-01-01")],
      "The convertible issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
  });

  it("counts an issuance dated the same day as issued on or before the transaction", () => {
    expectSoleCause(
      [issuanceRecord("sec1", "2021-01-01")],
      "The convertible issuance referenced by security_id sec1 (dated 2021-01-01) is not outstanding as of this transaction's date.",
    );
  });

  it("displays the on-or-before issuance's date when the history holds both an earlier and a later match", () => {
    expectSoleCause(
      [issuanceRecord("sec1", "2020-01-01"), issuanceRecord("sec1", "2022-01-01")],
      "The convertible issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
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
    { scan: "no-retraction", txType: "TX_CONVERTIBLE_ACCEPTANCE", txId: "acc1", offenderType: "TX_CONVERTIBLE_RETRACTION", offenderId: "ret1" },
    { scan: "no-acceptance", txType: "TX_CONVERTIBLE_RETRACTION", txId: "ret1", offenderType: "TX_CONVERTIBLE_ACCEPTANCE", offenderId: "acc1" },
    { scan: "no-other-transactions", txType: "TX_CONVERTIBLE_CANCELLATION", txId: "can1", offenderType: "TX_CONVERTIBLE_TRANSFER", offenderId: "xfer1" },
  ] as const;

  it.each(scans)("$scan flags a same-day or earlier offender but ignores a later one", ({ scan, txType, txId, offenderType, offenderId }) => {
    const tx = { id: txId, object_type: txType, security_id: "sec1", date: TX_DATE };
    const emitsAt = (offenderDate: string) => {
      const context = contextWith({
        convertibleIssuances: [issuanceRecord("sec1")] as any,
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
  const issuance = { id: "ci1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "sec1", date: "2020-01-01" };

  it("clears an acceptance and flags a later retraction by its backward scan", () => {
    const acceptance = { id: "acc1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2020-02-01" };
    const retraction = { id: "ret1", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        convertibleIssuances: [issuance] as any,
        transactions: [issuance, acceptance, retraction],
      }),
    );

    actor.send(ev("TX_CONVERTIBLE_ACCEPTANCE", acceptance));
    expect(actor.getSnapshot().value).toBe("capTable");
    expect(actor.getSnapshot().context.findings).toEqual([]);

    actor.send(ev("TX_CONVERTIBLE_RETRACTION", retraction));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].check).toBe("no-acceptance");
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_CONVERTIBLE_RETRACTION", id: "ret1" });
    }
    expect(context.findings.some((f) => f.subject.id === "acc1")).toBe(false);
  });

  it("clears a retraction that removes the issuance and then flags the later acceptance by both checks", () => {
    const retraction = { id: "ret1", object_type: "TX_CONVERTIBLE_RETRACTION", security_id: "sec1", date: "2020-02-01" };
    const acceptance = { id: "acc1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "sec1", date: "2020-03-01" };

    const actor = startSeeded(
      contextWith({
        convertibleIssuances: [issuance] as any,
        transactions: [issuance, retraction, acceptance],
      }),
    );

    actor.send(ev("TX_CONVERTIBLE_RETRACTION", retraction));
    const afterRetraction = actor.getSnapshot();
    expect(afterRetraction.value).toBe("capTable");
    expect(afterRetraction.context.findings).toEqual([]);
    // The retraction removed the issuance from the live collection.
    expect(afterRetraction.context.convertibleIssuances.some((c: any) => c.security_id === "sec1")).toBe(false);

    actor.send(ev("TX_CONVERTIBLE_ACCEPTANCE", acceptance));
    const { context, value } = actor.getSnapshot();
    expect(value).toBe("validationError");

    const errors = context.findings.filter((f) => f.severity === "error");
    expect(errors.map((f) => f.check).sort()).toEqual(["issuance-exists", "no-retraction"]);
    const existence = errors.find((f) => f.check === "issuance-exists");
    expect(existence?.message).toBe(
      "The convertible issuance referenced by security_id sec1 (dated 2020-01-01) is not outstanding as of this transaction's date.",
    );
    for (const finding of context.findings) {
      expect(finding.subject).toEqual({ object_type: "TX_CONVERTIBLE_ACCEPTANCE", id: "acc1" });
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
  TX_CONVERTIBLE_ISSUANCE: [
    {
      context: baseContext(),
      data: { id: "i1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "sec1", stakeholder_id: "nobody", date: "2021-01-01" },
    },
  ],
  TX_CONVERTIBLE_ACCEPTANCE: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2020-06-01")] }), data: txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_RETRACTION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_ACCEPTANCE", "a1", "sec1", "2020-06-01")] }), data: txRecord("TX_CONVERTIBLE_RETRACTION", "r1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_CANCELLATION: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_CANCELLATION", "c1", "sec1", "2021-01-01") },
    { context: contextWith({ convertibleIssuances: [issuanceRecord("sec1")] as any, transactions: [issuanceRecord("sec1"), txRecord("TX_CONVERTIBLE_TRANSFER", "x1", "sec1", "2020-06-01")] }), data: txRecord("TX_CONVERTIBLE_CANCELLATION", "c1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_TRANSFER: [
    { context: contextWith({ transactions: [issuanceRecord("sec1")] }), data: txRecord("TX_CONVERTIBLE_TRANSFER", "x1", "sec1", "2021-01-01") },
  ],
  TX_CONVERTIBLE_CONVERSION: [
    // Missing issuance and an empty resulting array: issuance-exists and the
    // resulting-security-named warning.
    {
      context: contextWith({ transactions: [] }),
      data: { id: "cv1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "sec1", resulting_security_ids: [], date: "2021-01-01" },
    },
    // A live issuance clears issuance-exists, leaving the remaining four checks
    // to fire: an offender for no-other-transactions, and three resulting ids
    // that are respectively absent, wrongly dated, and wrongly held.
    {
      context: contextWith({
        convertibleIssuances: [{ id: "ci-sec1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "sec1", stakeholder_id: "holder-ref", date: "2020-01-01" }] as any,
        transactions: [
          { id: "ci-sec1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "sec1", stakeholder_id: "holder-ref", date: "2020-01-01" },
          txRecord("TX_CONVERTIBLE_RETRACTION", "ret-off", "sec1", "2020-06-01"),
          { id: "si-early", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-early", stakeholder_id: "holder-ref", date: "2020-05-01" },
          { id: "si-other", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-other-holder", stakeholder_id: "holder-other", date: "2021-01-01" },
        ],
      }),
      data: { id: "cv1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "sec1", resulting_security_ids: ["stock-absent", "stock-early", "stock-other-holder"], date: "2021-01-01" },
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
    expect(emittedCheckIds("TX_CONVERTIBLE_TRANSFER").has("no-other-transactions")).toBe(false);
    // The gap is declared on the descriptor with implemented: false.
    const declared = (TX_DESCRIPTORS.TX_CONVERTIBLE_TRANSFER as { checks: readonly { id: string; implemented?: false }[] }).checks;
    expect(declared.some((c) => c.id === "no-other-transactions" && c.implemented === false)).toBe(true);
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
