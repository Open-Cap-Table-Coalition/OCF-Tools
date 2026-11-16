import { defineValidator, underOlderName } from "../checkKit";
import { noEarlierRemoval, stakeholderExists } from "../checks";

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  checks: [stakeholderExists, noEarlierRemoval],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_ISSUANCE = underOlderName(TX_EQUITY_COMPENSATION_ISSUANCE, "TX_PLAN_SECURITY_ISSUANCE");
