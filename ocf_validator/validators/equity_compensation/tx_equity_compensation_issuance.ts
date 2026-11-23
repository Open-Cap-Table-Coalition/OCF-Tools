import { defineValidator, underOlderName } from "../checkKit";
import { countable, issuanceIdChecks, stakeholderExists } from "../checks";

import type { CheckObject } from "../checkKit";
import { isStockPlanId } from "../../stockPlan";

const optionalPlan = {
  severity: "error",
  id: "grant-plan-id",
  description: "A grant that names a stock plan supplies a nonempty plan ID.",
  run: (_context, data) => data.stock_plan_id == null || isStockPlanId(data.stock_plan_id) ? [] : ["The stock_plan_id must be a nonempty string."],
} satisfies CheckObject<{ stock_plan_id?: string }>;

// A plan grant needs a valid quantity for pool arithmetic. Grants without a plan have no pool
// charge.
const quantityCountable = countable("quantity", (data) => isStockPlanId(data.stock_plan_id));

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  pool: "draws",
  checks: [stakeholderExists, ...issuanceIdChecks, optionalPlan, quantityCountable],
});

/** Reuse the validator for the older transaction name. */
export const TX_PLAN_SECURITY_ISSUANCE = underOlderName(TX_EQUITY_COMPENSATION_ISSUANCE, "TX_PLAN_SECURITY_ISSUANCE");
