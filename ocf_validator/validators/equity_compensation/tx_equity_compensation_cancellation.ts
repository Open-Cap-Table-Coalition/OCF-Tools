import { defineValidator, underOlderName } from "../checkKit";
import { issuanceExists, noOtherTransactions, quantityOutstanding } from "./checks";

export const TX_EQUITY_COMPENSATION_CANCELLATION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_CANCELLATION",
  effect: "remove",
  collection: "equityCompensation",
  checks: [issuanceExists, quantityOutstanding, noOtherTransactions],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_CANCELLATION = underOlderName(TX_EQUITY_COMPENSATION_CANCELLATION, "TX_PLAN_SECURITY_CANCELLATION");
