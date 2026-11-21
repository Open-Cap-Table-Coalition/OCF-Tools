import { defineValidator, underOlderName } from "../checkKit";
import { issuanceExists, quantityOutstanding } from "./checks";

export const TX_EQUITY_COMPENSATION_RELEASE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_RELEASE",
  effect: "none",
  families: ["equityCompensation"],
  checks: [issuanceExists, quantityOutstanding],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_RELEASE = underOlderName(TX_EQUITY_COMPENSATION_RELEASE, "TX_PLAN_SECURITY_RELEASE");
