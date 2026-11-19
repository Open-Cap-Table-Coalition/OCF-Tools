import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { validatePackage } from "./helpers";
import { disagreements, explain, expectShadowExplained, shadowRows, EXPLANATIONS, type ShadowRow } from "./lifecycleShadow";

// Compare each family chart with no-earlier-removal and no-other-transactions. Check known
// differences explicitly so a new disagreement fails the test.

/** Compare a package's transactions in the order the validator processed them. */
const shadow = (transactions: Record<string, unknown>[], stakeholders = [{ id: "sh-1" }]): ShadowRow[] =>
  shadowRows(validatePackage(transactions, stakeholders).ocfPackageContent.transactions as any);

/** Find the results for all securities named by this transaction. */
const rowsOf = (rows: ShadowRow[], id: string) => rows.filter((row) => row.id === id);

const fixture = (...segments: string[]) => path.resolve(__dirname, "..", ...segments);

// Package fixtures

describe("the packages on disk", () => {
  // testPackage covers a grant and vesting. Acme covers 39 transactions including stock removals.
  // Its class split has no individual security to compare.
  it.each([
    { name: "testing_scripts/testPackage", dir: fixture("testing_scripts", "testPackage"), transactions: 2, rows: 2 },
    { name: "sample_ocf_folders/acme_holdings_limited", dir: fixture("sample_ocf_folders", "acme_holdings_limited"), transactions: 39, rows: 38 },
  ])("$name: the chart and the checks agree on every transaction", ({ dir, transactions, rows: expected }) => {
    const context = ocfValidator(dir);
    const rows = shadowRows(context.ocfPackageContent.transactions as any);

    expect(context.ocfPackageContent.transactions).toHaveLength(transactions);
    expect(rows).toHaveLength(expected);
    // Both checks pass and the chart accepts each transaction.
    expect(context.result).toMatch(/appears valid\.$/);
    expect(rows.every((row) => row.allowed && row.reported.length === 0)).toBe(true);
    expect(disagreements(rows)).toEqual([]);
  });
});

// Cases where the checks and chart agree

const issuance = { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-01-01" };
const cancellation = { id: "cc-1", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "safe-1", date: "2021-06-01" };

describe("where the chart and the checks agree", () => {
  it("both allow a security issued, accepted, and cancelled", () => {
    const rows = shadow([issuance, { id: "ca-1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "safe-1", date: "2021-02-01" }, cancellation]);

    expect(rows.map((row) => [row.id, row.state, row.allowed, row.reported])).toEqual([
      ["ci-1", "notIssued", true, []],
      ["ca-1", "outstanding", true, []],
      ["cc-1", "outstanding", true, []],
    ]);
  });

  // These cases also run through the public validator in ocfValidator.test.ts. The chart and the
  // removal check both reject the transaction on the removed security.
  it.each([
    { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "safe-1", vesting_condition_id: "vc-1", date: "2021-07-01" },
    { id: "ci-2", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-07-01" },
    { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-07-01" },
    { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-07-01" },
  ])("both refuse a later $object_type on a cancelled convertible", (transaction) => {
    const [row] = rowsOf(shadow([issuance, cancellation, transaction]), transaction.id);

    expect(row).toMatchObject({ state: "removed", allowed: false, reported: ["no-earlier-removal"] });
  });

  it("both refuse a cancellation after a transfer", () => {
    // The transfer removes the security on the chart and makes the later transaction fail the
    // history check.
    const transfer = { id: "ct-1", object_type: "TX_CONVERTIBLE_TRANSFER", security_id: "safe-1", resulting_security_ids: [], date: "2021-03-01" };
    const [row] = rowsOf(shadow([issuance, transfer, cancellation]), "cc-1");

    expect(row).toMatchObject({ state: "removed", allowed: false, reported: ["no-other-transactions"] });
    expect(row.removedBy).toMatchObject({ id: "ct-1" });
  });

  it("both allow a return to pool on a retracted grant, which neither check runs on", () => {
    const rows = shadow([
      { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "option-1", stakeholder_id: "sh-1", stock_plan_id: "plan-1", quantity: "100", date: "2021-01-01" },
      { id: "ecr-1", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "option-1", date: "2021-06-01" },
      { id: "rtp-1", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "option-1", stock_plan_id: "plan-1", quantity: "100", date: "2021-07-01" },
    ]);

    expect(rowsOf(rows, "rtp-1")).toMatchObject([{ state: "removed", allowed: true, runs: [], reported: [] }]);
    expect(disagreements(rows)).toEqual([]);
  });
});

// Known differences

describe("where the chart and the checks disagree", () => {
  const grant = { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "opt-1", stakeholder_id: "sh-1", quantity: "100", date: "2020-01-01" };
  const grantCancellation = { id: "can-1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "opt-1", quantity: "100", date: "2021-01-01" };

  // The equity compensation tests also check repricing and exercise after cancellation.
  it.each([
    { id: "rep-1", object_type: "TX_EQUITY_COMPENSATION_REPRICING", security_id: "opt-1", date: "2021-06-01" },
    { id: "ex-1", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "opt-1", quantity: "10", resulting_security_ids: [], date: "2021-06-01" },
  ])("the chart refuses a $object_type on a cancelled grant, which neither check runs on", (transaction) => {
    const context = validatePackage([grant, grantCancellation, transaction], [{ id: "sh-1" }]);
    const rows = shadowRows(context.ocfPackageContent.transactions as any);

    expect(disagreements(rows)).toMatchObject([{ id: transaction.id, state: "removed", allowed: false, runs: [], reported: [] }]);
    expect(disagreements(rows).map(explain)).toEqual(["removed, and neither check runs on it"]);
    // Verify which production check catches this case.
    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([[transaction.id, "issuance-exists"]]);
  });

  it("the chart refuses a vesting event on the day its warrant is cancelled, which no-earlier-removal allows", () => {
    // The validator currently accepts vesting on the day a warrant is cancelled (#214).
    const context = validatePackage(
      [
        { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        { id: "wc-1", object_type: "TX_WARRANT_CANCELLATION", security_id: "war-1", date: "2021-06-01" },
        { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "war-1", vesting_condition_id: "vc-1", date: "2021-06-01" },
      ],
      [{ id: "sh-1" }],
    );
    const rows = shadowRows(context.ocfPackageContent.transactions as any);

    expect(context.findings).toEqual([]);
    expect(disagreements(rows)).toMatchObject([
      { id: "ve-1", state: "removed", allowed: false, runs: ["no-earlier-removal"], reported: [], removedBy: { id: "wc-1", date: "2021-06-01" } },
    ]);
    expect(disagreements(rows).map(explain)).toEqual(["removed earlier the same day"]);
  });

  // These examples cover removals missing from the index.
  it("the chart refuses a vesting event on consolidated stock, which no-earlier-removal doesn't know was removed", () => {
    // Test the comparison directly. Stock classes and legends are required only by the full stock
    // validator.
    const rows = shadowRows([
      { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", date: "2021-01-01" },
      { id: "si-2", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-2", date: "2021-01-01" },
      { id: "si-3", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-3", date: "2021-06-01" },
      { id: "sc-1", object_type: "TX_STOCK_CONSOLIDATION", security_ids: ["stock-1", "stock-2"], resulting_security_id: "stock-3", date: "2021-06-01" },
      { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "stock-2", date: "2021-07-01" },
    ]);

    // Both securities are removed by the same consolidation.
    expect(rowsOf(rows, "sc-1").map((row) => [row.security, row.state, row.allowed])).toEqual([
      ["stock-1", "outstanding", true],
      ["stock-2", "outstanding", true],
    ]);
    expect(disagreements(rows)).toMatchObject([{ id: "ve-1", state: "removed", allowed: false, reported: [], removedBy: { id: "sc-1" } }]);
    expect(disagreements(rows).map(explain)).toEqual(["removed by a transaction the removals index doesn't hold"]);
  });

  it("the chart refuses a vesting event on a grant cancelled under the plan security name, which no-earlier-removal doesn't know was removed", () => {
    const rows = shadow([
      { id: "psi-1", object_type: "TX_PLAN_SECURITY_ISSUANCE", security_id: "opt-1", stakeholder_id: "sh-1", date: "2021-01-01" },
      { id: "psc-1", object_type: "TX_PLAN_SECURITY_CANCELLATION", security_id: "opt-1", date: "2021-06-01" },
      { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "opt-1", vesting_condition_id: "vc-1", date: "2021-07-01" },
    ]);

    expect(disagreements(rows)).toMatchObject([{ id: "ve-1", state: "removed", allowed: false, reported: [], removedBy: { id: "psc-1" } }]);
    expect(disagreements(rows).map(explain)).toEqual(["removed by a transaction the removals index doesn't hold"]);
  });

  it("has an explanation written for every kind it names", () => {
    for (const reason of Object.values(EXPLANATIONS)) expect(reason).not.toBe("");
  });
});

// Unexpected differences

describe("a disagreement nothing explains", () => {
  // Issuing the same outstanding ID twice is rejected by the chart and accepted by the current
  // validator. The comparison should flag that difference.
  const twice = [
    { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-01-01" },
    { id: "wi-2", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-02-01" },
  ];

  it("is left unexplained", () => {
    const [row] = disagreements(shadowRows(twice));

    expect(row).toMatchObject({ id: "wi-2", state: "outstanding", allowed: false, reported: [] });
    expect(explain(row)).toBeUndefined();
  });

  it("fails the test that validated the package", () => {
    expect(() => expectShadowExplained(twice)).toThrow(
      'TX_WARRANT_ISSUANCE "wi-2" on security "war-1" (outstanding): the chart refuses it, and the checks run on it (no-earlier-removal) reported nothing',
    );
    expect(() => validatePackage(twice, [{ id: "sh-1" }])).toThrow(/has no explanation for it/);
  });

  it("passes over a package whose run never starts", () => {
    expect(() => expectShadowExplained([{ ...twice[0], date: 20210101 }, twice[1]])).not.toThrow();
  });
});
