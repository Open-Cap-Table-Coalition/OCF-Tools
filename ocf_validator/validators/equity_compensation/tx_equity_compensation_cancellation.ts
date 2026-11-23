import { planReplacement, planSourceQuantity } from "./planChecks";
import { defineValidator, underOlderName } from "../checkKit";
import { issuanceExists, noOtherTransactions, quantityOutstanding } from "./checks";

export const TX_EQUITY_COMPENSATION_CANCELLATION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_CANCELLATION",
  effect: "remove",
  collection: "equityCompensation",
  // The balance grant carries the source grant's remaining shares. Counting a new draw would charge
  // the plan twice.
  pool: "carries",
  checks: [issuanceExists, quantityOutstanding, planSourceQuantity, planReplacement, noOtherTransactions],
});

/** Reuse the validator for the older transaction name. */
export const TX_PLAN_SECURITY_CANCELLATION = underOlderName(TX_EQUITY_COMPENSATION_CANCELLATION, "TX_PLAN_SECURITY_CANCELLATION");
