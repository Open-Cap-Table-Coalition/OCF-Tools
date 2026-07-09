import { defineValidator } from "../checkKit";
import { issuanceExists, noOtherTransactions } from "./checks";

export const TX_EQUITY_COMPENSATION_CANCELLATION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_CANCELLATION",
  effect: "remove",
  collection: "equityCompensation",
  checks: [issuanceExists, noOtherTransactions],
});
