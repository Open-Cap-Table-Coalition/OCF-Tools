import { defineValidator, asGap } from "../checkKit";
import { issuanceExists, noOtherTransactions } from "./checks";

export const TX_EQUITY_COMPENSATION_TRANSFER = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_TRANSFER",
  effect: "remove",
  collection: "equityCompensation",
  // Transfers don't perform no-other-transactions yet, so it's listed as a gap.
  // It reuses cancellation's definition so the two stay in sync.
  checks: [issuanceExists, asGap(noOtherTransactions)],
});
