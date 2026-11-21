import { defineValidator, underOlderName } from "../checkKit";
import { countable, noEarlierRemoval, stakeholderExists } from "../checks";

// A plan grant needs a valid quantity for pool arithmetic. Grants without a plan have no pool
// charge.
const quantityCountable = countable("quantity", (data) => data.stock_plan_id !== undefined && data.stock_plan_id !== null);

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  pool: "draws",
  checks: [stakeholderExists, noEarlierRemoval, quantityCountable],
});

/** Reuse the validator for the older transaction name. */
export const TX_PLAN_SECURITY_ISSUANCE = underOlderName(TX_EQUITY_COMPENSATION_ISSUANCE, "TX_PLAN_SECURITY_ISSUANCE");
