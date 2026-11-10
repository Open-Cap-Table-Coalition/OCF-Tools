import { defineValidator, asGap } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_CONVERTIBLE_TRANSFER = defineValidator({
  transaction: "TX_CONVERTIBLE_TRANSFER",
  effect: "remove",
  collection: "convertibleIssuances",
  // Transfers don't perform no-other-transactions yet, so it's listed as a gap.
  // It reuses cancellation's definition so the two stay in sync.
  checks: [issuanceExists, dateOrder, asGap(noOtherTransactions)],
});
