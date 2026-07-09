import { defineValidator } from "../checkKit";
import { issuanceExists, noOtherTransactions } from "./checks";

export const TX_CONVERTIBLE_CANCELLATION = defineValidator({
  transaction: "TX_CONVERTIBLE_CANCELLATION",
  effect: "remove",
  collection: "convertibleIssuances",
  checks: [issuanceExists, noOtherTransactions],
});
