import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import { describe, expect, it } from "vitest";
import { contextWith, ev, startSeeded, validatePackage } from "./helpers";

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
    expect(context.findings).toMatchObject([{ check: "quantity-returnable", subject: { id: "repeat" } }]);
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
    expect(snapshot.value).toBe("validationError");
    expect(snapshot.context.report.at(-1)).toMatchObject({ transaction_id: cancellation.id, only_transaction_validity: false });
  });
});

// Same-day stock removals run before transfers and repurchases, and in file order among themselves.
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
    validatePackage(transactions, [{ id: "holder" }], [{ id: "common" }], plans);
  const VALID = "The validation of the OCF package for Test Co is complete and the package appears valid.";

  it.each([
    { name: "a transfer's resulting stock", outputs: [stock("result", "10")], removed: ["result", "10"],
      tx: { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "10", resulting_security_ids: ["result"] } },
    { name: "a transfer's balance stock", outputs: [stock("result", "6"), stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "6", resulting_security_ids: ["result"], balance_security_id: "balance" } },
    { name: "a cancellation's balance stock", outputs: [stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "6", reason_text: "Cancelled", balance_security_id: "balance" } },
    { name: "a repurchase's balance stock", outputs: [stock("balance", "4")], removed: ["balance", "4"],
      tx: { ...source, object_type: "TX_STOCK_REPURCHASE", quantity: "6", price: { amount: "1", currency: "USD" }, balance_security_id: "balance" } },
  ])("accepts $name cancelled earlier that day", ({ outputs, removed, tx }) => {
    const context = run([stock("held", "10", "2021-01-01"), ...outputs, cancelled(removed[0], removed[1]), tx]);

    expect(context.result).toBe(VALID);
    expect(context.snapshots.at(-1)?.stockIssuances.map((row) => row.quantity)).toEqual(outputs.slice(0, -1).map((issue) => issue.quantity));
  });

  it("still rejects balance stock issued on another day", () => {
    const context = run([
      stock("held", "10", "2021-01-01"), stock("balance", "4", "2021-05-01"),
      { ...source, object_type: "TX_STOCK_CANCELLATION", quantity: "6", reason_text: "Cancelled", balance_security_id: "balance" },
    ]);

    expect(context.report.at(-1)).toMatchObject({ transaction_id: "source", balance_stockIssuance_validity: true, balance_security_outgoing_date_validity: false });
    expect(context.result).toMatch(/failed on source/);
  });

  it.each([
    { name: "issued the next day", other: stock("later", "15", "2021-06-02"), removal: [] as Record<string, unknown>[] },
    { name: "issued and cancelled on an earlier day", other: stock("later", "15", "2021-05-01"),
      removal: [{ ...cancelled("later", "15"), date: "2021-05-02" }] },
    { name: "issued on an earlier day and cancelled that day", other: stock("later", "15", "2021-05-01"),
      removal: [cancelled("later", "15")] },
  ])("still rejects a transfer whose resulting stock was $name", ({ other, removal }) => {
    const context = run([
      stock("held", "40", "2021-01-01"), other, ...removal, stock("result", "25"),
      { ...source, object_type: "TX_STOCK_TRANSFER", quantity: "40", resulting_security_ids: ["later", "result"] },
    ]);

    expect(context.report.at(-1)).toMatchObject({ transaction_id: "source", outgoing_resulting_sum_validity: false });
    expect(context.result).toMatch(/failed on source/);
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
    expect(early.report.at(-1)).toMatchObject({ transaction_id: "source", resulting_dates_validity: false });
    expect(early.result).toMatch(/failed on source/);
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
