import { defineValidator } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_CONVERTIBLE_CANCELLATION = defineValidator({
  transaction: "TX_CONVERTIBLE_CANCELLATION",
  effect: "remove",
  collection: "convertibleIssuances",
  checks: [issuanceExists, dateOrder, noOtherTransactions],
});
