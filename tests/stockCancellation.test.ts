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
