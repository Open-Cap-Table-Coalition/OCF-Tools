import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, dateOrder } from "./checks";

// The transfer module declares this check but does not implement it: the same
// metadata with no run, so it reports as a gap and contributes no findings.
const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction references the transaction's security_id, other than a convertible acceptance.",
} satisfies CheckObject;

export const TX_CONVERTIBLE_TRANSFER = defineValidator({
  transaction: "TX_CONVERTIBLE_TRANSFER",
  effect: "remove",
  collection: "convertibleIssuances",
  checks: [issuanceExists, dateOrder, noOtherTransactions],
});
