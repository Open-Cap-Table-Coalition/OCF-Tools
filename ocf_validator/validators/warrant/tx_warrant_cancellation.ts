import { defineValidator } from "../checkKit";
import { issuanceExists, dateOrder, noOtherTransactions } from "./checks";

export const TX_WARRANT_CANCELLATION = defineValidator({
  transaction: "TX_WARRANT_CANCELLATION",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [issuanceExists, dateOrder, noOtherTransactions],
});
