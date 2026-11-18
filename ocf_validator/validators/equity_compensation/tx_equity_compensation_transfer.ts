import { defineValidator, asGap, underOlderName } from "../checkKit";
import { issuanceExists, noOtherTransactions, quantityOutstanding } from "./checks";

export const TX_EQUITY_COMPENSATION_TRANSFER = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_TRANSFER",
  effect: "remove",
  collection: "equityCompensation",
  // A transfer names the grants it results in, and a balance grant for what's left. Those grants carry
  // shares the source drew from its plan's pool, so they add nothing to it.
  pool: "carries",
  // Transfers don't perform no-other-transactions yet, so it's listed as a gap.
  // It reuses cancellation's definition so the two stay in sync.
  checks: [issuanceExists, quantityOutstanding, asGap(noOtherTransactions)],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_TRANSFER = underOlderName(TX_EQUITY_COMPENSATION_TRANSFER, "TX_PLAN_SECURITY_TRANSFER");
