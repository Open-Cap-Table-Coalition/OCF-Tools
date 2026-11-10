import { defineValidator, asGap } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_CONVERTIBLE_TRANSFER = defineValidator({
  transaction: "TX_CONVERTIBLE_TRANSFER",
  effect: "remove",
  collection: "convertibleIssuances",
  // Declared but not implemented here: the cancellation validator's check, as a gap.
  checks: [issuanceExists, dateOrder, asGap(noOtherTransactions)],
});
