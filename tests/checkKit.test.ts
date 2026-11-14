import { describe, it, expect } from "vitest";
import { defineValidator, text, type CheckObject } from "../ocf_validator/validators/checkKit";
import { stakeholderExists } from "../ocf_validator/validators/checks";
import { issuanceExists } from "../ocf_validator/validators/equity_compensation/checks";
import { baseContext, contextWith, runValidator } from "./helpers";

// JSON.parse gives `{ "toString": null }` an own toString that isn't a function,
// so interpolating it into a plain template literal throws.
const unprintable = JSON.parse('{ "toString": null }');

describe("text", () => {
  it("renders a primitive as it is, an error as its name and message, and any other object as its JSON", () => {
    expect(text`${"sec-1"} ${3} ${NaN} ${null} ${undefined} ${new TypeError("boom")} ${unprintable} ${{}} ${[1]}`).toBe(
      'sec-1 3 NaN null undefined TypeError: boom {"toString":null} {} [1]',
    );
  });

  it("renders an object it can't serialize as a placeholder instead of throwing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(text`${circular} ${{ big: 1n }}`).toBe("[Unserializable value] [Unserializable value]");
  });
});

describe("a check that throws", () => {
  it("fails with one error finding saying so, even as a warning check, and the other checks still run", () => {
    const throws = {
      id: "throws",
      severity: "warning",
      description: "Throws on every transaction.",
      run: () => {
        throw new TypeError("Cannot convert object to primitive value");
      },
    } satisfies CheckObject;
    const { validate } = defineValidator({
      transaction: "TX_CONVERTIBLE_ISSUANCE",
      effect: "append",
      collection: "convertibleIssuances",
      checks: [throws, stakeholderExists],
    });
    const subject = { object_type: "TX_CONVERTIBLE_ISSUANCE", id: "ci-1" } as const;
    const data = { ...subject, security_id: "safe-1", stakeholder_id: "nobody", date: "2021-01-01" } as any;

    expect(validate(baseContext(), data)).toEqual([
      { severity: "error", check: "throws", message: "The check threw TypeError: Cannot convert object to primitive value", subject },
      { severity: "error", check: "stakeholder-exists", message: "The stakeholder nobody referenced by the transaction was not found in the stakeholder file.", subject },
    ]);
  });
});

describe("every check message renders a malformed package value", () => {
  // Each case puts the unprintable value where its check interpolates a
  // package value, and expects that check's one finding to show it rather
  // than "The check threw ...".
  const live = (object_type: string) => ({ id: "issuance-1", object_type, security_id: "sec1", stakeholder_id: "sh-1", date: "2020-01-01" });
  const convertible = live("TX_CONVERTIBLE_ISSUANCE");
  const warrant = live("TX_WARRANT_ISSUANCE");
  const equityCompensation = live("TX_EQUITY_COMPENSATION_ISSUANCE");
  const tx =(object_type: string, fields: Record<string, unknown> = {}) => ({ id: "tx-1", object_type, security_id: "sec1", date: "2021-06-01", ...fields });
  const offender = (object_type: string) => ({ id: unprintable, object_type, security_id: "sec1", date: "2021-01-01" });
  const conversion = tx("TX_CONVERTIBLE_CONVERSION", { resulting_security_ids: ["stock-1"] });
  const stock = (fields: Record<string, unknown>) => ({ id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "sh-1", date: "2021-06-01", ...fields });
  const withConvertible = (...transactions: Record<string, unknown>[]) =>
    contextWith({ convertibleIssuances: [convertible] as any, transactions: [convertible, ...transactions] });
  const withWarrant = (...transactions: Record<string, unknown>[]) =>
    contextWith({ warrantIssuances: [warrant] as any, transactions: [warrant, ...transactions] });
  const withEquityCompensation = (...transactions: Record<string, unknown>[]) =>
    contextWith({ equityCompensation: [equityCompensation] as any, transactions: [equityCompensation, ...transactions] });

  it("renders a malformed security id in the undated and deprecated issuance messages", () => {
    expect(issuanceExists.run(contextWith(), { security_id: unprintable } as any)).toEqual([
      `The transaction has no date, so it can't be checked against the equity compensation issuance with security_id {"toString":null}.`,
    ]);
    const context = contextWith({
      transactions: [{ object_type: "TX_PLAN_SECURITY_ISSUANCE", security_id: unprintable }],
    });
    expect(issuanceExists.run(context, { security_id: unprintable, date: "2021-01-01" })).toEqual([
      `The equity compensation issuance referenced by security_id {"toString":null} uses the deprecated type TX_PLAN_SECURITY_ISSUANCE, which the validator doesn't process.`,
    ]);
  });

  it.each([
    { check: "stakeholder-exists", data: tx("TX_CONVERTIBLE_ISSUANCE", { stakeholder_id: unprintable }), context: contextWith() },
    { check: "issuance-exists", data: tx("TX_CONVERTIBLE_ACCEPTANCE", { security_id: unprintable }), context: contextWith() },
    { check: "no-other-transactions", data: tx("TX_CONVERTIBLE_CANCELLATION"), context: withConvertible(offender("TX_CONVERTIBLE_TRANSFER")) },
    { check: "no-retraction", data: tx("TX_CONVERTIBLE_ACCEPTANCE"), context: withConvertible(offender("TX_CONVERTIBLE_RETRACTION")) },
    { check: "no-acceptance", data: tx("TX_CONVERTIBLE_RETRACTION"), context: withConvertible(offender("TX_CONVERTIBLE_ACCEPTANCE")) },
    { check: "no-retraction", data: tx("TX_WARRANT_ACCEPTANCE"), context: withWarrant(offender("TX_WARRANT_RETRACTION")) },
    { check: "no-acceptance", data: tx("TX_WARRANT_RETRACTION"), context: withWarrant(offender("TX_WARRANT_ACCEPTANCE")) },
    { check: "no-retraction", data: tx("TX_EQUITY_COMPENSATION_ACCEPTANCE"), context: withEquityCompensation(offender("TX_EQUITY_COMPENSATION_RETRACTION")) },
    { check: "no-acceptance", data: tx("TX_EQUITY_COMPENSATION_RETRACTION"), context: withEquityCompensation(offender("TX_EQUITY_COMPENSATION_ACCEPTANCE")) },
    { check: "resulting-stock-exists", data: { ...conversion, resulting_security_ids: [unprintable] }, context: withConvertible() },
    { check: "resulting-stock-dated", data: conversion, context: withConvertible(stock({ date: unprintable })) },
    { check: "resulting-stock-stakeholder", data: conversion, context: withConvertible(stock({ stakeholder_id: unprintable })) },
  ])("$check on $data.object_type", ({ check, data, context }) => {
    expect(runValidator(data.object_type, context, data)).toEqual([
      expect.objectContaining({ check, message: expect.stringContaining('{"toString":null}') }),
    ]);
  });
});
