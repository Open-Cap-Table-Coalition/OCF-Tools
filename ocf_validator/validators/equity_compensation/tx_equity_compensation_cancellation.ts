import { defineValidator, underOlderName } from "../checkKit";
import { issuanceExists, noOtherTransactions, quantityOutstanding } from "./checks";

export const TX_EQUITY_COMPENSATION_CANCELLATION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_CANCELLATION",
  effect: "remove",
  collection: "equityCompensation",
  // A partial cancellation names a balance grant for what's left. Those grants carry
  // shares the source drew from its plan's pool, so they add nothing to it.
  pool: "carries",
  checks: [issuanceExists, quantityOutstanding, noOtherTransactions],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_CANCELLATION = underOlderName(TX_EQUITY_COMPENSATION_CANCELLATION, "TX_PLAN_SECURITY_CANCELLATION");
