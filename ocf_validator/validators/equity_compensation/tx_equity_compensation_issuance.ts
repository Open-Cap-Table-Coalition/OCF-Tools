import { defineValidator, underOlderName } from "../checkKit";
import { countable, noEarlierRemoval, stakeholderExists } from "../checks";

// A grant from a stock plan draws its quantity from the plan's pool, so the
// quantity has to be one that can be counted. A grant from no plan touches no
// pool, and its quantity is left alone.
const quantityCountable = countable("quantity", (data) => data.stock_plan_id !== undefined && data.stock_plan_id !== null);

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  pool: "draws",
  checks: [stakeholderExists, noEarlierRemoval, quantityCountable],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_ISSUANCE = underOlderName(TX_EQUITY_COMPENSATION_ISSUANCE, "TX_PLAN_SECURITY_ISSUANCE");
