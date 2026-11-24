import * as path from "path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { TX_DESCRIPTORS } from "../ocf_validator/validators";
import { noEarlierRemoval, uniqueSecurityId } from "../ocf_validator/validators/checks";
import { defineValidator } from "../ocf_validator/validators/checkKit";
import { collection, validatePackage, validateWithShadow } from "./helpers";
import { disagreements, explain, expectShadowExplained, shadowRows, EXPLANATIONS, type ShadowRow } from "./lifecycleShadow";

// Compare each family chart with the issuance and removal checks. Check known
// differences explicitly so a new disagreement fails the test.

/** Compare a package's transactions in the order the validator processed them. */
const shadow = (transactions: Record<string, unknown>[], stakeholders = [{ id: "sh-1" }]): ShadowRow[] =>
  validatePackage(transactions, stakeholders).shadow;

/** Find the results for all securities named by this transaction. */
const rowsOf = (rows: ShadowRow[], id: string) => rows.filter((row) => row.id === id);

/**
 * A warrant issuance on a security of its own. After stopOnIt, its validator throws, which stops the
 * run there and leaves the comparison to replay the transactions that follow.
 */
const stopper = { id: "bad", object_type: "TX_WARRANT_ISSUANCE", security_id: "other", stakeholder_id: "sh-1" };
const stopOnIt = () =>
  vi.spyOn(TX_DESCRIPTORS.TX_WARRANT_ISSUANCE, "validate").mockImplementation(() => {
    throw new Error("validator bug");
  });

const fixture = (...segments: string[]) => path.resolve(__dirname, "..", ...segments);

// Package fixtures

describe("the packages on disk", () => {
  // testPackage and Acme cover valid security histories. Acme's class split has no security to
  // compare. markedSecurities and stockPlanPool contain stakeholder, resulting-stock or pool errors
  // that the lifecycle charts alone cannot detect.
  it.each([
    { name: "testing_scripts/testPackage", dir: fixture("testing_scripts", "testPackage"), transactions: 2, rows: 2 },
    { name: "sample_ocf_folders/acme_holdings_limited", dir: fixture("sample_ocf_folders", "acme_holdings_limited"), transactions: 39, rows: 38 },
    { name: "testing_scripts/markedSecurities", dir: fixture("testing_scripts", "markedSecurities"), transactions: 6, rows: 6 },
    { name: "testing_scripts/stockPlanPool", dir: fixture("testing_scripts", "stockPlanPool"), transactions: 8, rows: 8 },
  ])("$name: the chart and the checks agree on every transaction", ({ dir, transactions, rows: expected }) => {
    const context = validateWithShadow(dir);
    const rows = context.shadow;

    expect(context.ocfPackageContent.transactions).toHaveLength(transactions);
    expect(rows).toHaveLength(expected);
    // The chart and both checks accept these transactions.
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

  it("both refuse a vesting event on a grant cancelled under the plan security name", () => {
    // Plan security cancellations now appear in the removal index.
    const rows = shadow([
      { id: "psi-1", object_type: "TX_PLAN_SECURITY_ISSUANCE", security_id: "opt-1", stakeholder_id: "sh-1", date: "2021-01-01" },
      { id: "psc-1", object_type: "TX_PLAN_SECURITY_CANCELLATION", security_id: "opt-1", date: "2021-06-01" },
      { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "opt-1", vesting_condition_id: "vc-1", date: "2021-07-01" },
    ]);

    expect(rowsOf(rows, "ve-1")).toMatchObject([{ state: "removed", allowed: false, reported: ["no-earlier-removal"], removedBy: { id: "psc-1" } }]);
    expect(disagreements(rows)).toEqual([]);
    // A missing entry for this cancellation would be a regression.
    const [vesting] = rowsOf(rows, "ve-1");
    expect(explain({ ...vesting, indexedRemoval: undefined, reported: [] })).toBeUndefined();
  });

  it("both allow a return to pool on a retracted grant", () => {
    const rows = shadow([
      { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "option-1", stakeholder_id: "sh-1", stock_plan_id: "plan-1", quantity: "100", date: "2021-01-01" },
      { id: "ecr-1", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "option-1", date: "2021-06-01" },
      { id: "rtp-1", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "option-1", stock_plan_id: "plan-1", quantity: "100", date: "2021-07-01" },
    ]);

    expect(rowsOf(rows, "rtp-1")).toMatchObject([{ state: "removed", allowed: true, runs: ["security-removed"], reported: [] }]);
    expect(disagreements(rows)).toEqual([]);
  });
});

// Known differences

describe("where the chart and the checks disagree", () => {
  afterEach(() => vi.restoreAllMocks());

  const grant = { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "opt-1", stakeholder_id: "sh-1", quantity: "100", date: "2020-01-01" };
  const grantCancellation = { id: "can-1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "opt-1", quantity: "100", date: "2021-01-01" };

  const reprice = { id: "rep-1", object_type: "TX_EQUITY_COMPENSATION_REPRICING", security_id: "opt-1", date: "2021-06-01" };
  const exercise = { id: "ex-1", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "opt-1", quantity: "10", resulting_security_ids: [], date: "2021-06-01" };

  it("reports both uses of the cancelled grant", () => {
    const context = validatePackage([grant, grantCancellation, reprice, exercise], [{ id: "sh-1" }]);

    // The two are dated the same day and run in order of their IDs.
    expect(context.findings.map((f) => [f.subject.id, f.check, f.outcome])).toEqual([
      [exercise.id, "issuance-exists", "failed"], [reprice.id, "issuance-exists", "failed"],
    ]);
    expect(disagreements(context.shadow).map(explain)).toEqual([
      "removed, and neither check runs on it", "removed, and neither check runs on it",
    ]);
  });

  const accept = { ...grant, id: "accept", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", date: "2020-02-01" };
  const retract = { ...grantCancellation, object_type: "TX_EQUITY_COMPENSATION_RETRACTION" };

  it.each([false, true])("keeps the grant when retraction fails (earlier error: %s)", (earlierError) => {
    const history: Record<string, unknown>[] = [grant, accept, retract, reprice];
    if (earlierError) {
      stopOnIt();
      history.unshift({ ...stopper, date: "2019-01-01" });
    }
    const context = validatePackage(history, [{ id: "sh-1" }]);
    expect(rowsOf(context.shadow, reprice.id)[0]).toMatchObject({ state: "removed", issuanceCheck: "blocked" });
    if (!earlierError) expect(collection(context, "equityCompensation")).toEqual([grant]);
  });

  it("removes a retained grant when a later cancellation passes during replay", () => {
    stopOnIt();
    const context = validatePackage([grant, { ...stopper, date: "2020-02-01" }, grantCancellation, reprice], [{ id: "sh-1" }]);
    expect(context.result).toContain("failed on bad: Error: validator bug");
    expect(collection(context, "equityCompensation").map((item) => item.id)).toEqual([grant.id]);
    expect(rowsOf(context.shadow, reprice.id)[0].issuanceCheck).toBe("replayed");
  });

  it.each([reprice, exercise])("the chart refuses a $object_type on a cancelled grant, which neither check runs on", (transaction) => {
    const context = validatePackage([grant, grantCancellation, transaction], [{ id: "sh-1" }]);
    const rows = context.shadow;

    expect(disagreements(rows)).toMatchObject([{ id: transaction.id, state: "removed", allowed: false, runs: [], reported: [] }]);
    expect(disagreements(rows).map(explain)).toEqual(["removed, and neither check runs on it"]);
    expect(disagreements(shadowRows([grant, grantCancellation, transaction])).map(explain)).toEqual([undefined]);
    // Verify which production check catches this case.
    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([[transaction.id, "issuance-exists"]]);
  });

  it("the chart allows a vesting event on the day its warrant is cancelled, because the vesting event runs first", () => {
    // Vesting leaves the warrant outstanding, so it runs before the cancellation dated the same day.
    const context = validatePackage(
      [
        { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        { id: "wc-1", object_type: "TX_WARRANT_CANCELLATION", security_id: "war-1", date: "2021-06-01" },
        { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "war-1", vesting_condition_id: "vc-1", date: "2021-06-01" },
      ],
      [{ id: "sh-1" }],
    );
    const rows = context.shadow;

    expect(context.findings).toEqual([]);
    expect(rows.map((row) => [row.id, row.state, row.allowed])).toEqual([
      ["wi-1", "notIssued", true],
      ["ve-1", "outstanding", true],
      ["wc-1", "outstanding", true],
    ]);
    expect(disagreements(rows)).toEqual([]);
  });

  it("the chart refuses a consolidation of stock cancelled the same day, which no-earlier-removal allows", () => {
    // Both transactions remove stock-1, so they run in order of their IDs and the cancellation is
    // first. The date check passes any transaction on the day of a removal (#214).
    const context = validatePackage(
      [
        { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "sh-1", stock_class_id: "common", stock_legend_ids: [], quantity: "100", date: "2021-01-01" },
        { id: "si-2", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-2", stakeholder_id: "sh-1", stock_class_id: "common", stock_legend_ids: [], quantity: "100", date: "2021-06-01" },
        { id: "cancel-1", object_type: "TX_STOCK_CANCELLATION", security_id: "stock-1", quantity: "100", reason_text: "Cancelled", date: "2021-06-01" },
        { id: "consolidate-1", object_type: "TX_STOCK_CONSOLIDATION", security_ids: ["stock-1"], resulting_security_id: "stock-2", date: "2021-06-01" },
      ],
      [{ id: "sh-1" }],
      [{ id: "common" }],
    );
    const rows = context.shadow;

    expect(context.findings).toEqual([]);
    expect(disagreements(rows)).toMatchObject([
      { id: "consolidate-1", state: "removed", allowed: false, runs: ["no-earlier-removal"], reported: [], removedBy: { id: "cancel-1", date: "2021-06-01" } },
    ]);
    expect(disagreements(rows).map(explain)).toEqual(["removed earlier the same day"]);
  });

  it("the chart refuses a cancellation of a grant that was never issued, which neither check is about", () => {
    // The stock plan tests also cover cancellation of a missing grant.
    const context = validatePackage(
      [{ id: "can-1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "opt-missing", quantity: "40", date: "2021-01-01" }],
      [{ id: "sh-1" }],
    );
    const rows = context.shadow;

    expect(disagreements(rows)).toMatchObject([{ id: "can-1", state: "notIssued", allowed: false, runs: ["no-other-transactions"], reported: [] }]);
    expect(disagreements(rows).map(explain)).toEqual(["never issued"]);
    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([["can-1", "issuance-exists"]]);
  });

  // The index still misses consolidations.
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

  it("the chart allows a cancellation after an unrecognized transaction, which no-other-transactions counts", () => {
    const context = validatePackage(
      [
        { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        { id: "amend-1", object_type: "TX_WARRANT_AMENDMENT", security_id: "war-1", date: "2021-03-01" },
        { id: "wc-1", object_type: "TX_WARRANT_CANCELLATION", security_id: "war-1", date: "2021-06-01" },
      ],
      [{ id: "sh-1" }],
    );
    const rows = context.shadow;

    // The chart has no row for the amendment. The warrant is still outstanding when it is cancelled.
    expect(rows.map((row) => row.id)).toEqual(["wi-1", "wc-1"]);
    expect(disagreements(rows)).toMatchObject([{ id: "wc-1", state: "outstanding", allowed: true, reported: ["no-other-transactions"], afterUnrecognized: true }]);
    expect(disagreements(rows).map(explain)).toEqual(["named by an unrecognized transaction"]);
  });

  it("has an explanation written for every kind it names", () => {
    for (const reason of Object.values(EXPLANATIONS)) expect(reason).not.toBe("");
  });
});

// Unexpected differences

describe("a disagreement nothing explains", () => {
  afterEach(() => vi.restoreAllMocks());

  it("replays the checks when the validator throws on a second cancellation", () => {
    const descriptor = TX_DESCRIPTORS.TX_CONVERTIBLE_CANCELLATION;
    const validate = descriptor.validate;
    vi.spyOn(descriptor, "validate").mockImplementation((context, data) => {
      if (data.id === "second") throw new Error("unfinished cancellation");
      return validate(context, data);
    });

    const context = validatePackage([issuance, cancellation, { ...cancellation, id: "second", date: "2021-07-01" }], [{ id: "sh-1" }]);
    expect(context.result).toContain("unfinished cancellation");
    expect(rowsOf(context.shadow, "second")[0].reported).toEqual(["no-other-transactions"]);
  });

  it.each([
    ["2021-06-01", "2021-07-01", "2021-08-01"],
    ["2021-08-01", "2020-01-01", "2021-08-01"],
  ])("checks the indexed removal date even when the chart removed the grant on %s", (planDate, indexedDate, vestDate) => {
    vi.spyOn(noEarlierRemoval, "run").mockReturnValue([]);
    const history = [
      { ...issuance, object_type: "TX_EQUITY_COMPENSATION_ISSUANCE" },
      { ...cancellation, object_type: "TX_PLAN_SECURITY_CANCELLATION", date: planDate },
      { ...cancellation, object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", date: indexedDate },
      { ...cancellation, id: "vest", object_type: "TX_VESTING_EVENT", date: vestDate },
    ].sort((a, b) => a.date.localeCompare(b.date));

    const [vest] = rowsOf(shadowRows(history), "vest");
    expect(vest.removedBy?.date).toBe(planDate);
    expect(explain(vest)).toBeUndefined();
  });

  it("catches a change in what the validator reports under the same check ID", () => {
    vi.spyOn(TX_DESCRIPTORS.TX_CONVERTIBLE_CANCELLATION, "validate").mockReturnValue([{
      subject: { object_type: "TX_CONVERTIBLE_CANCELLATION", id: cancellation.id },
      check: "no-other-transactions", severity: "error", outcome: "failed", message: "The rule changed.",
    }]);

    expect(() => validatePackage([issuance, cancellation], [{ id: "sh-1" }])).toThrow(/the chart allows it, and no-other-transactions reported it/);
  });

  it("replays a changed rule after the validator stops on another security", () => {
    const original = TX_DESCRIPTORS.TX_CONVERTIBLE_CANCELLATION;
    const [exists, history] = original.rules;
    TX_DESCRIPTORS.TX_CONVERTIBLE_CANCELLATION = defineValidator({
      ...original, checks: [exists, { ...history, run: () => ["The rule changed."] }],
    });
    try {
      stopOnIt();
      expect(() => validatePackage([{ ...stopper, date: "2020-01-01" }, issuance, cancellation], [{ id: "sh-1" }])).toThrow(/the chart allows it, and no-other-transactions reported it/);
    } finally {
      TX_DESCRIPTORS.TX_CONVERTIBLE_CANCELLATION = original;
    }
  });

  const twice = [
    { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-01-01" },
    { id: "wi-2", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "sh-1", date: "2021-02-01" },
  ];

  it("skips unknown types even when their name is inherited", () => {
    expect(shadowRows([{ ...issuance, object_type: "constructor" }])).toEqual([]);
  });

  it.each([
    ["TX_CONVERTIBLE_ISSUANCE", "TX_CONVERTIBLE_TRANSFER", "TX_VESTING_EVENT", cancellation.date],
  ])("flags the vesting event in %s → %s with a same-day %s", (issue, remove, last, date) => {
    // A vesting event runs before the transfer dated the same day. The chart still refuses it,
    // because a convertible does not vest, and no check reports that.
    expect(() => validatePackage([
      { ...issuance, object_type: issue },
      { ...cancellation, object_type: remove },
      { ...cancellation, object_type: last, id: "last", date },
    ], [{ id: "sh-1" }])).toThrow(`${last} "last" on security "safe-1" (outstanding)`);
  });

  it("agrees that a removed warrant cannot return shares to a stock plan", () => {
    const rows = shadow([
      { ...issuance, object_type: "TX_WARRANT_ISSUANCE" },
      { ...cancellation, object_type: "TX_WARRANT_CANCELLATION" },
      { ...cancellation, object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", stock_plan_id: "plan", quantity: "1", id: "last", date: "2021-07-01" },
    ]);
    expect(rowsOf(rows, "last")).toMatchObject([{ allowed: false, reported: ["security-removed"] }]);
  });

  it("recognizes repricing after a plan-security cancellation as an issuance failure", () => {
    const context = validatePackage([
      { ...issuance, object_type: "TX_EQUITY_COMPENSATION_ISSUANCE" },
      { ...cancellation, object_type: "TX_PLAN_SECURITY_CANCELLATION" },
      { ...cancellation, object_type: "TX_EQUITY_COMPENSATION_REPRICING", id: "last", date: "2021-07-01" },
    ], [{ id: "sh-1" }]);

    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([["last", "issuance-exists"]]);
    expect(collection(context, "equityCompensation")).toEqual([]);
  });

  it("agrees with the validator on a duplicate issuance", () => {
    const rows = validatePackage(twice, [{ id: "sh-1" }]).shadow;
    expect(rowsOf(rows, "wi-2")).toMatchObject([{ state: "outstanding", allowed: false, reported: ["unique-security-id"] }]);
    expect(disagreements(shadowRows(twice))).toEqual([]);
  });

  it("flags a duplicate issuance if the ID check misses it", () => {
    vi.spyOn(uniqueSecurityId, "run").mockReturnValue([]);
    expect(() => expectShadowExplained(twice)).toThrow(/the chart refuses it/);
    expect(() => validatePackage(twice, [{ id: "sh-1" }])).toThrow(/has no explanation for it/);
  });

  it("passes over a package whose run never starts", () => {
    expect(() => expectShadowExplained([{ ...twice[0], date: 20210101 }, twice[1]])).not.toThrow();
  });
});
