import { defineValidator, underOlderName } from "../checkKit";
import { issuanceIdChecks, stakeholderExists } from "../checks";

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  checks: [stakeholderExists, ...issuanceIdChecks],
});

/** Reuse the validator for the older transaction name. */
export const TX_PLAN_SECURITY_ISSUANCE = underOlderName(TX_EQUITY_COMPENSATION_ISSUANCE, "TX_PLAN_SECURITY_ISSUANCE");
