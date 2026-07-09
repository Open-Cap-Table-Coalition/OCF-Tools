import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, dateOrder } from "./checks";

// The transfer module declares this check but does not implement it: the same
// metadata with no run, so it reports as a gap and contributes no findings.
const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction references the transaction's security_id, other than a warrant acceptance.",
} satisfies CheckObject;

export const TX_WARRANT_TRANSFER = defineValidator({
  transaction: "TX_WARRANT_TRANSFER",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [issuanceExists, dateOrder, noOtherTransactions],
});
