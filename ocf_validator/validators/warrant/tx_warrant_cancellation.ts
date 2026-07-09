import { defineValidator } from "../checkKit";
import { issuanceExists, noOtherTransactions } from "./checks";

export const TX_WARRANT_CANCELLATION = defineValidator({
  transaction: "TX_WARRANT_CANCELLATION",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [issuanceExists, noOtherTransactions],
});
