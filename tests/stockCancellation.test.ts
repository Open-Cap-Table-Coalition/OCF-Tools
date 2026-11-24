import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import { describe, expect, it } from "vitest";
import { contextWith, ev, startSeeded, validatePackage } from "./helpers";
import { securityById, withSecurity } from "../ocf_validator/nodes";
import { toValidate } from "../ocf_validator/validators/checkKit";
import { balanceExists } from "../ocf_validator/validators/stock/checks";

describe("returning cancelled stock to a plan", () => {
  const issuance = {
    id: "issue", object_type: "TX_STOCK_ISSUANCE", security_id: "rsa", date: "2021-01-01",
    issuance_type: "RSA", custom_id: "CS-1", stakeholder_id: "holder", stock_class_id: "common",
    stock_plan_id: "original", quantity: "100", share_price: { amount: "1", currency: "USD" },
    stock_legend_ids: [], security_law_exemptions: [], vestings: [{ date: "2022-01-01", amount: "100" }],
  } satisfies OCFStockIssuance;
  const cancellation = {
    id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: "rsa", date: "2021-06-01",
    quantity: "100", reason_text: "Unvested shares forfeited",
  };
  const poolReturn = {
    id: "return", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "rsa", date: cancellation.date,
    stock_plan_id: "original", quantity: "100", reason_text: "Unvested shares forfeited",
  };
  const plans = ["original", "successor"].map((id) => ({
    id, object_type: "STOCK_PLAN", plan_name: id, stock_class_ids: ["common"], initial_shares_reserved: "1000",
  }));

  it.each([
    { date: cancellation.date, stock_plan_id: "original", totals: ["0", "125"] },
    { date: "2021-07-01", stock_plan_id: "successor", totals: ["100", "25"] },
  ])("returns the shares to $stock_plan_id on $date", ({ date, stock_plan_id, totals }) => {
    const otherGrant = {
      id: "other", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "option", stakeholder_id: "holder",
      stock_plan_id: "successor", quantity: "125", date: issuance.date,
    };
    const context = validatePackage(
      [otherGrant, issuance, cancellation, { ...poolReturn, date, stock_plan_id }],
      [{ id: "holder" }], [{ id: "common" }], plans,
    );

    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and the package appears valid.");
    expect(context.snapshots[0].stockPlans.map((p) => p.drawn)).toEqual(["100", "125"]);
    expect(context.snapshots.at(-1)).toMatchObject({ date, stockIssuances: [] });
    expect(context.snapshots.at(-1)?.stockPlans.map((p) => p.drawn)).toEqual(totals);
  });

  it.each(["TX_STOCK_CANCELLATION", "TX_STOCK_REPURCHASE"])("returns fractional shares retired by %s exactly once", (type) => {
    const balance = { ...issuance, id: "issue-balance", security_id: "balance", quantity: "0.2", date: cancellation.date };
    const context = validatePackage([
      { ...issuance, quantity: "0.3" }, balance, { ...cancellation, object_type: type, quantity: "0.1", balance_security_id: "balance" },
      { ...poolReturn, quantity: "0.1", stock_plan_id: "successor" },
      { ...poolReturn, id: "repeat", quantity: "0.0000000001", date: "2021-07-01" },
    ], [{ id: "holder" }], [{ id: "common" }], plans);
    const transactionFindings = context.findings.filter((finding) => finding.subject.object_type !== "STOCK_PLAN");
    expect(transactionFindings).toMatchObject([{ check: "quantity-returnable", subject: { id: "repeat" } }]);
    expect(context.snapshots.at(-1)?.stockPlans.map((p) => p.drawn)).toEqual(["0.3", "-0.1"]);
  });

  it("counts the balance shares once on a partial RSA cancellation", () => {
    const balance = { ...issuance, id: "issue-balance", security_id: "balance", quantity: "60", date: cancellation.date };
    const context = validatePackage([
      issuance, balance, { ...cancellation, quantity: "40", balance_security_id: "balance" },
      { ...poolReturn, quantity: "40", date: "2021-07-01" },
    ], [{ id: "holder" }], [{ id: "common" }], plans);

    expect(context.findings).toEqual([]);
    expect(context.snapshots.map((s) => s.stockPlans[0].drawn)).toEqual(["100", "100", "60"]);
    expect(context.snapshots.at(-1)?.stockIssuances).toMatchObject([{ quantity: "60" }]);
  });

  it.each([
    { reason: "the return predates cancellation", stock: issuance, other: { ...poolReturn, date: "2021-05-31" } },
    { reason: "the issuance has no plan", stock: { ...issuance, stock_plan_id: undefined }, other: poolReturn },
    { reason: "another cancellation uses the shares", stock: issuance, other: { ...cancellation, id: "cancel-again" } },
  ])("reports a conflicting transaction when $reason", ({ stock, other }) => {
    const context = contextWith({ stockIssuances: [stock], transactions: [stock, cancellation, other] });
    const actor = startSeeded(context);
    actor.send(ev(cancellation.object_type, cancellation));
    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("capTable");
    expect(snapshot.context.findings).toContainEqual(expect.objectContaining({ check: "no-other-transactions", subject: { id: cancellation.id, object_type: cancellation.object_type } }));
  });
});

// A transaction that names stock as its balance or result runs after that stock's issuance and before
// anything else removes the stock that day. A retraction is the exception: it voids the issuance, so
// it runs first.
describe("stock removed the same day another transaction names it", () => {
  const stock = (security_id: string, quantity: string, date = "2021-06-01", fields: Record<string, unknown> = {}) => ({
    id: `issue-${security_id}`, object_type: "TX_STOCK_ISSUANCE", security_id, date, stakeholder_id: "holder",
    stock_class_id: "common", quantity, stock_legend_ids: [], ...fields,
  });
  const cancelled = (security_id: string, quantity: string) => ({
    id: `cancel-${security_id}`, object_type: "TX_STOCK_CANCELLATION", security_id, date: "2021-06-01", quantity, reason_text: "Cancelled",
  });
  const source = { id: "source", security_id: "held", date: "2021-06-01" };
  const run = (transactions: Record<string, unknown>[], plans: Record<string, unknown>[] = []) =>
    validatePackage(transactions, [{ id: "holder" }], [{ id: "common" }, { id: "preferred" }], plans);
  const VALID = "The validation of the OCF package for Test Co is complete and the package appears valid.";

  const failedCheck = (check: string) => expect.objectContaining({
    subject: expect.objectContaining({ id: source.id }), check, severity: "error", outcome: "failed",
  });

  it.each([
    { name: "a transfer's resulting stock", outputs: [stock("result", "10")], removed: ["result", "10"],
      tx: { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "10", resulting_security_ids: ["result"] } },
    { name: "a transfer's balance stock", outputs: [stock("result", "6"), stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "6", resulting_security_ids: ["result"], balance_security_id: "balance" } },
    { name: "a cancellation's balance stock", outputs: [stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "6", reason_text: "Cancelled", balance_security_id: "balance" } },
    { name: "a repurchase's balance stock", outputs: [stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_REPURCHASE", quantity: "6", price: { amount: "1", currency: "USD" }, balance_security_id: "balance" } },
    { name: "a conversion's balance stock", outputs: [stock("result", "6", "2021-06-01", { stock_class_id: "preferred" }), stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_CONVERSION", quantity_converted: "6", resulting_security_ids: ["result"], balance_security_id: "balance" } },
    { name: "a reissuance's resulting stock", outputs: [stock("result", "10")], removed: ["result", "10"],
      tx: { ...source, object_type: "TX_STOCK_REISSUANCE", resulting_security_ids: ["result"] } },
  ])("accepts $name cancelled that day", ({ outputs, removed, tx }) => {
    const context = run([stock("held", "10", "2021-01-01"), ...outputs, cancelled(removed[0], removed[1]), tx]);

    expect(context.result).toBe(VALID);
    expect(context.snapshots.at(-1)?.stockIssuances.map((row) => row.quantity)).toEqual(outputs.slice(0, -1).map((issue) => issue.quantity));
  });

  it.each([
    { name: "a transfer's resulting stock", output: stock("result", "10"), failed: "resulting-stock-exists",
      tx: { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "10", resulting_security_ids: ["result"] } },
    { name: "a cancellation's balance stock", output: stock("balance", "4"), failed: "balance-stock-exists",
      tx: { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "6", reason_text: "Cancelled", balance_security_id: "balance" } },
  ])("rejects $name retracted that day", ({ output, failed, tx }) => {
    const retraction = { id: "retract", object_type: "TX_STOCK_RETRACTION", security_id: output.security_id, date: "2021-06-01", reason_text: "Issued in error" };
    const context = run([stock("held", "10", "2021-01-01"), output, retraction, tx]);

    expect(context.findings).toContainEqual(failedCheck(failed));
    expect(context.result).toContain("is complete");
  });

  it("counts stock removed that day on a record saved without its removal", () => {
    const context = run([stock("balance", "4"), cancelled("balance", "4")]);
    const { removal: _removal, ...saved } = securityById(context.nodes, "balance")!;
    const older = { ...context, nodes: withSecurity(context.nodes, saved as typeof saved & { removal?: never }) };

    const check = (date: string) => toValidate([balanceExists])(older, {
      ...source, date, object_type: "TX_STOCK_CANCELLATION", balance_security_id: "balance",
    });
    expect(check("2021-06-01")).toEqual([]);
    expect(check("2021-06-02")).toContainEqual(failedCheck("balance-stock-exists"));
  });

  it.each([{ split_transaction_id: null }, {}])("checks the resulting quantities of a reissuance with %o", (fields) => {
    const reissue = (last: string) => run([
      stock("held", "40", "2021-01-01"), stock("first", "15"), stock("last", last),
      { ...source, object_type: "TX_STOCK_REISSUANCE", resulting_security_ids: ["first", "last"], ...fields },
    ]);

    expect(reissue("25").result).toBe(VALID);
    const short = reissue("1");
    expect(short.findings).toContainEqual(failedCheck("replacement-quantity"));
  });

  it.each([
    { type: "TX_STOCK_TRANSFER", fields: { quantity: "0.3", resulting_security_ids: ["first", "last"] }, stock_class_id: "common", failed: "resulting-quantity" },
    { type: "TX_STOCK_REISSUANCE", fields: { resulting_security_ids: ["first", "last"] }, stock_class_id: "common", failed: "replacement-quantity" },
    { type: "TX_STOCK_CONVERSION", fields: { quantity_converted: "0.1", resulting_security_ids: ["first"], balance_security_id: "last" }, stock_class_id: "preferred", failed: "balance-quantity-reconciles" },
    { type: "TX_STOCK_CANCELLATION", fields: { quantity: "0.1", reason_text: "Cancelled", balance_security_id: "last" }, failed: "balance-quantity-reconciles" },
    { type: "TX_STOCK_REPURCHASE", fields: { quantity: "0.1", price: { amount: "1", currency: "USD" }, balance_security_id: "last" }, failed: "balance-quantity-reconciles" },
  ])("adds the fractional quantities of a $type exactly", ({ type, fields, stock_class_id, failed }) => {
    const first = stock_class_id ? [stock("first", "0.1", "2021-06-01", { stock_class_id })] : [];
    const check = (last: string) =>
      run([stock("held", "0.3", "2021-01-01"), ...first, stock("last", last), { ...source, object_type: type, ...fields }]);

    expect(check("0.2").result).toBe(VALID);
    const over = check("0.2000000001");
    expect(over.findings).toContainEqual(failedCheck(failed));
  });

  it("still rejects balance stock issued on another day", () => {
    const context = run([
      stock("held", "10", "2021-01-01"), stock("balance", "4", "2021-05-01"),
      { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "6", reason_text: "Cancelled", balance_security_id: "balance" },
    ]);

    expect(context.findings).toContainEqual(failedCheck("balance-stock-dated"));
    expect(context.findings).not.toContainEqual(failedCheck("balance-stock-exists"));
  });

  it.each([
    { name: "issued the next day", other: stock("later", "15", "2021-06-02"), removal: [] as Record<string, unknown>[], failed: "resulting-stock-exists" },
    { name: "issued and cancelled on an earlier day", other: stock("later", "15", "2021-05-01"),
      removal: [{ ...cancelled("later", "15"), date: "2021-05-02" }], failed: "resulting-stock-exists" },
    // The transfer runs before the cancellation, so the stock is still outstanding. Its issuance
    // date is what rules it out.
    { name: "issued on an earlier day and cancelled that day", other: stock("later", "15", "2021-05-01"),
      removal: [cancelled("later", "15")], failed: "resulting-stock-dated" },
  ])("still rejects a transfer whose resulting stock was $name", ({ other, removal, failed }) => {
    const context = run([
      stock("held", "40", "2021-01-01"), other, ...removal, stock("result", "25"),
      { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "40", resulting_security_ids: ["later", "result"] },
    ]);

    expect(context.findings).toContainEqual(failedCheck(failed));
  });

  it.each([
    { type: "TX_STOCK_TRANSFER", fields: { quantity: "40" }, stock_class_id: "common" },
    { type: "TX_STOCK_CONVERSION", fields: { quantity_converted: "40" }, stock_class_id: "preferred" },
    { type: "TX_STOCK_REISSUANCE", fields: {}, stock_class_id: "common" },
  ])("checks the date of every resulting security of a $type, not only the last", ({ type, fields, stock_class_id }) => {
    const results = (firstDate: string) => [
      stock("first", "15", firstDate, { stock_class_id }), stock("last", "25", "2021-06-01", { stock_class_id }),
    ];
    const tx = { ...source, object_type: type, resulting_security_ids: ["first", "last"], ...fields };
    const check = (firstDate: string) =>
      validatePackage([stock("held", "40", "2021-01-01"), ...results(firstDate), tx], [{ id: "holder" }], [{ id: "common" }, { id: "preferred" }]);

    expect(check("2021-06-01").result).toBe(VALID);
    const early = check("2021-05-01");
    expect(early.findings).toContainEqual(failedCheck("resulting-stock-dated"));
  });

  it("counts plan shares once when the balance of a partial cancellation is cancelled that day", () => {
    const plan = { id: "plan", object_type: "STOCK_PLAN", plan_name: "plan", stock_class_ids: ["common"], initial_shares_reserved: "1000" };
    const context = run([
      stock("held", "100", "2021-01-01", { stock_plan_id: "plan" }), stock("balance", "60", "2021-06-01", { stock_plan_id: "plan" }),
      cancelled("balance", "60"),
      { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "40", reason_text: "Cancelled", balance_security_id: "balance" },
    ], [plan]);

    expect(context.result).toBe(VALID);
    expect(context.snapshots.map((snapshot) => snapshot.stockPlans[0].drawn)).toEqual(["100", "100"]);
  });
});
