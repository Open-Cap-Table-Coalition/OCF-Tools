import { defineValidator, asGap } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_WARRANT_TRANSFER = defineValidator({
  transaction: "TX_WARRANT_TRANSFER",
  effect: "remove",
  collection: "warrantIssuances",
  // Declared but not implemented here: the cancellation validator's check, as a gap.
  checks: [issuanceExists, dateOrder, asGap(noOtherTransactions)],
});
