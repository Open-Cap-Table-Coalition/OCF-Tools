import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

// The transfer module declares this check but does not implement it: the same
// metadata with no run, so it reports as a gap and contributes no findings.
const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction dated on or before this transaction references its security_id, other than an equity compensation acceptance.",
} satisfies CheckObject;

export const TX_EQUITY_COMPENSATION_TRANSFER = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_TRANSFER",
  effect: "remove",
  collection: "equityCompensation",
  checks: [issuanceExists, noOtherTransactions],
});
