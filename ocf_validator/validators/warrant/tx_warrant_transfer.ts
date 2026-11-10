import { defineValidator, asGap } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_WARRANT_TRANSFER = defineValidator({
  transaction: "TX_WARRANT_TRANSFER",
  effect: "remove",
  collection: "warrantIssuances",
  // Transfers don't perform no-other-transactions yet, so it's listed as a gap.
  // It reuses cancellation's definition so the two stay in sync.
  checks: [issuanceExists, dateOrder, asGap(noOtherTransactions)],
});
