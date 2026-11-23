import { describe, expect, it, vi } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { TX_DESCRIPTORS } from "../ocf_validator/validators";
import { validatePackageWith } from "./helpers";

const first = "2021-01-01";
const day = "2021-02-01";
const issue = (security_id: string, quantity: string, date = day, overrides = {}) => ({
  id: "issue-" + security_id, object_type: "TX_STOCK_ISSUANCE", security_id,
  stakeholder_id: "holder", stock_class_id: "common", stock_legend_ids: [], quantity, date, ...overrides,
});
const move = (type: string, fields = {}) => ({
  id: "move", object_type: "TX_STOCK_" + type, security_id: "source", date: day, ...fields,
});
const run = (transactions: Record<string, unknown>[]) =>
  validatePackageWith(ocfValidator)(transactions, [{ id: "holder" }, { id: "other" }], [{ id: "common" }, { id: "preferred" }]);
const proposedFindings = (transactions: Record<string, unknown>[]) =>
  run(transactions).findings.filter((finding) => finding.subject.id === "move");

describe("stock issuance", () => {
  it("reports each missing legend and still checks the class and holder", () => {
    const context = run([issue("s", "1", first, { stock_legend_ids: ["missing-1", "missing-2"], stakeholder_id: "unknown", stock_class_id: "unknown" })]);
    expect(context.findings.map((f) => f.check)).toEqual(["stakeholder-exists", "stock-class-exists", "stock-legends-exist", "stock-legends-exist"]);
    expect(context.findings.slice(-2).map((f) => f.message)).toEqual(["Stock legend missing-1 was not found.", "Stock legend missing-2 was not found."]);
    expect(context.nodes.security.get("s")?.issuance.value).toBeUndefined();
  });

  it("dispatches the parsed payload once and records a failed stock issuance without stopping", () => {
    const spy = vi.spyOn(TX_DESCRIPTORS.TX_STOCK_ISSUANCE, "validate");
    try {
      const stock = issue("s", "1", first, { stakeholder_id: "missing" });
      const context = run([stock, { object_type: "TX_STOCK_ACCEPTANCE", security_id: "s", id: "a", date: day }]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1]).toEqual(stock);
      expect(context.findings).toMatchObject([
        { outcome: "failed", subject: { id: "issue-s" }, check: "stakeholder-exists" },
        { outcome: "blocked", subject: { id: "a" }, check: "issuance-exists", roots: [{ object_type: stock.object_type, id: stock.id }] },
      ]);
      expect(context.snapshots.at(-1)?.date).toBe(day);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("stock transfer and conversion", () => {
  const source = issue("source", "0.3", first);
  it("conserves a fractional transfer across two results and a balance", () => {
    const tx = move("TRANSFER", { quantity: "0.2", balance_security_id: "b", resulting_security_ids: ["r1", "r2"] });
    const context = run([source, issue("r1", "0.1"), issue("r2", "0.1"), issue("b", "0.1"), tx]);
    expect(context.findings).toEqual([]);
    expect(context.nodes.security.get("source")?.lifecycle.value).toBe("removed");
  });

  it("blocks a sum after a failed removal but still checks the result's issuance date", () => {
    const date = "2021-01-15";
    const findings = proposedFindings([source, issue("r", "0.3", date),
      { id: "bad-cancel", object_type: "TX_STOCK_CANCELLATION", security_id: "r", quantity: "1", date },
      move("TRANSFER", { quantity: "0.3", resulting_security_ids: ["r"] })]);
    const root = { object_type: "TX_STOCK_CANCELLATION", id: "bad-cancel" };
    expect(findings).toMatchObject([
      { check: "resulting-stock-exists", outcome: "blocked", roots: [root] },
      { check: "resulting-stock-dated", outcome: "failed" },
      { check: "resulting-quantity", outcome: "blocked", roots: [root] },
      { check: "replacement-quantity", outcome: "blocked", roots: [root] },
    ]);
  });

  it("checks the balance date and both transfer sums independently", () => {
    const findings = proposedFindings([source, issue("r", "0.1"), issue("b", "0.1", first),
      move("TRANSFER", { quantity: "0.3", balance_security_id: "b", resulting_security_ids: ["r"] })]);
    expect(findings.map((f) => f.check)).toEqual(["balance-stock-dated", "resulting-quantity", "replacement-quantity"]);
  });

  it("accepts a partial conversion into another class with a same-class balance", () => {
    const context = run([source, issue("r", "42", day, { stock_class_id: "preferred" }), issue("b", "0.1"),
      move("CONVERSION", { quantity_converted: "0.2", resulting_security_ids: ["r"], balance_security_id: "b" })]);
    expect(context.findings).toEqual([]);
    expect(context.nodes.security.get("source")?.lifecycle.value).toBe("removed");
  });

  it("names every result with the wrong class, date, or stakeholder", () => {
    const findings = proposedFindings([source, issue("early", "1", first, { stakeholder_id: "other" }),
      issue("wrong", "1", day, { stakeholder_id: "other" }), issue("ok", "1", day, { stock_class_id: "preferred" }),
      move("CONVERSION", { quantity_converted: "0.3", resulting_security_ids: ["early", "wrong", "ok"] })]);
    expect(findings.map((f) => f.check)).toEqual([
      "resulting-stock-dated", "resulting-stock-class", "resulting-stock-class",
      "resulting-stock-stakeholder", "resulting-stock-stakeholder",
    ]);
    expect(findings.map((f) => f.message.split(" ")[1])).toEqual(["early", "early", "wrong", "early", "wrong"]);
  });

  it.each([[], null, "r"])("reports an unusable result list (%j) without stopping", (ids) => {
    const context = run([source, move("TRANSFER", { quantity: "0.3", resulting_security_ids: ids })]);
    expect(context.findings.some((f) => f.check === "resulting-stock-exists")).toBe(true);
    expect(context.result).toContain("is complete");
  });

  it("blocks reads of a failed resulting issuance and runs the independent balance check", () => {
    const result = issue("r", "0.1", day, { stakeholder_id: "unknown" });
    const tx = move("TRANSFER", { quantity: "0.1", resulting_security_ids: ["r"], balance_security_id: "missing" });
    const findings = proposedFindings([source, result, tx]);
    expect(findings.find((f) => f.check === "resulting-stock-exists")).toMatchObject({
      outcome: "blocked", roots: [{ object_type: result.object_type, id: result.id }],
    });
    expect(findings.find((f) => f.check === "balance-stock-exists")?.outcome).toBe("failed");
  });
});

describe("stock reissuance", () => {
  const source = issue("source", "9007199254740993.3", first);
  const results = [issue("a", "9007199254740993.1"), issue("b", "0.2")];
  it.each([{}, { split_transaction_id: null }])("conserves decimals without a split (%j)", (split) => {
    const tx = move("REISSUANCE", { resulting_security_ids: ["a", "b"], ...split });
    expect(proposedFindings([source, ...results, tx])).toEqual([]);
    expect(proposedFindings([source, results[0], issue("b", "0.2000000001"), tx]).map((f) => f.check)).toEqual(["replacement-quantity"]);
  });

  const split = { object_type: "TX_STOCK_CLASS_SPLIT", id: "split", date: day, stock_class_id: "common" };
  const tx = move("REISSUANCE", { resulting_security_ids: ["r"], split_transaction_id: "split" });
  it("uses the named split and checks its date and class", () => {
    const packageData = [source, issue("r", "50"), tx];
    expect(proposedFindings([...packageData, split])).toEqual([]);
    expect(proposedFindings(packageData).map((f) => f.check)).toEqual(["split-exists"]);
    expect(proposedFindings([...packageData, { ...split, date: first, stock_class_id: "preferred" }]).map((f) => f.check)).toEqual(["split-date", "split-class"]);
  });
});

describe.each(["CANCELLATION", "REPURCHASE"])("stock %s", (type) => {
  const source = issue("source", "10", first);
  it("checks balance class, date, positive quantity and conservation", () => {
    const balance = issue("b", "0", first, { stock_class_id: "preferred" });
    const findings = proposedFindings([source, balance, move(type, { quantity: "11", balance_security_id: "b" })]);
    expect(findings.map((f) => f.check)).toEqual([
      "balance-stock-dated", "balance-stock-class", "balance-quantity-positive", "quantity-within-source", "balance-quantity-reconciles",
    ]);
    expect(findings.every((finding) => finding.severity === "error" && finding.outcome === "failed")).toBe(true);
  });

  it("keeps an inapplicable balance check independent of a tainted source", () => {
    const findings = proposedFindings([issue("source", "10", first, { stakeholder_id: "missing" }), move(type, { quantity: "10" })]);
    expect(findings.find((f) => f.check === "issuance-exists")).toMatchObject({ outcome: "blocked", roots: [{ id: "issue-source" }] });
    expect(findings.some((f) => f.check === "balance-stock-class")).toBe(false);
  });
});

it("retains a known coverage gap on transfers and conversions", () => {
  const transfer = TX_DESCRIPTORS.TX_STOCK_TRANSFER;
  const conversion = TX_DESCRIPTORS.TX_STOCK_CONVERSION;
  expect(transfer.checks.filter((check) => check.implemented === false).map((check) => check.id)).toEqual(["no-other-transactions"]);
  expect(conversion.checks.filter((check) => check.implemented === false).map((check) => check.id)).toEqual(["converted-quantity"]);
});

it("reports missing and wrongly dated results alongside a blocked resulting issuance", () => {
  const findings = proposedFindings([
    issue("source", "10", first), issue("old", "2", first),
    issue("bad", "2", day, { stakeholder_id: "unknown" }),
    move("TRANSFER", { quantity: "10", resulting_security_ids: ["bad", "missing", "old"] }),
  ]);
  expect(findings.filter((f) => f.check === "resulting-stock-exists")).toMatchObject([
    { outcome: "blocked", roots: [{ id: "issue-bad" }] },
    { outcome: "failed", message: expect.stringContaining("missing") },
  ]);
  expect(findings.filter((f) => f.check === "resulting-stock-dated")).toMatchObject([
    { outcome: "blocked", roots: [{ id: "issue-bad" }] },
    { outcome: "failed", message: expect.stringContaining("old") },
  ]);
  expect(findings.find((f) => f.check === "resulting-quantity")).toMatchObject({
    outcome: "blocked", roots: [{ id: "issue-bad" }],
  });
});
