import { securityField } from "../../nodes";
import { isStockPlanId } from "../../stockPlan";
import { defineValidator, text, type CheckObject } from "../checkKit";
import { exceeds, isNumeric } from "../../numeric";
import { countable, destinationPlan } from "../checks";

// A return credits the named plan, which can differ from the source plan. Require a reliably removed
// equity compensation security or plan-issued stock.

const securityRemoved = {
  id: "security-removed",
  severity: "error",
  description:
    "The shares come from a removed equity compensation security or removed stock issued from a plan.",
  reads: ({ security_id }) => [
    securityField("equityCompensation", security_id, "lifecycle"),
    securityField("stockIssuances", security_id, "lifecycle"),
    securityField("stockIssuances", security_id, "issuance"),
  ],
  run: (_context, { security_id }, read) => {
    if (read(securityField("equityCompensation", security_id, "lifecycle")) === "removed") return [];
    if (read(securityField("stockIssuances", security_id, "lifecycle")) === "removed") {
      const stock = read(securityField("stockIssuances", security_id, "issuance"));
      if (isStockPlanId(stock?.stock_plan_id)) return [];
    }
    return [text`The security ${security_id} must be a removed equity compensation security or removed plan-issued stock to return shares to a pool.`];
  },
} satisfies CheckObject<{ security_id: string }>;

const quantityReturnable = {
  id: "quantity-returnable",
  severity: "error",
  description: "No more is returned than the security's removals took out of it, less what was returned before.",
  reads: ({ security_id }) => [
    securityField("equityCompensation", security_id, "returnable"),
    securityField("stockIssuances", security_id, "returnable"),
    securityField("equityCompensation", security_id, "removal"),
    securityField("stockIssuances", security_id, "removal"),
    securityField("stockIssuances", security_id, "issuance"),
  ],
  run: (_context, { security_id, quantity }, read) => {
    const left = read(securityField("equityCompensation", security_id, "returnable")) ??
      read(securityField("stockIssuances", security_id, "returnable"));
    if (left === undefined) {
      const stock = read(securityField("stockIssuances", security_id, "issuance"));
      const removal = read(securityField("equityCompensation", security_id, "removal")) ??
        (isStockPlanId(stock?.stock_plan_id) && read(securityField("stockIssuances", security_id, "removal")));
      return removal ? [text`The removed quantity eligible for return from ${security_id} is unknown.`] : [];
    }
    if (!isNumeric(quantity) || !exceeds(quantity, left)) return [];
    return [text`Only ${left} shares of security ${security_id} remain eligible for return, but the transaction returns ${quantity}.`];
  },
} satisfies CheckObject<{ security_id: string; quantity: string }>;

export const TX_STOCK_PLAN_RETURN_TO_POOL = defineValidator({
  transaction: "TX_STOCK_PLAN_RETURN_TO_POOL",
  effect: "none",
  lifecycle: "after removal",
  families: ["stockIssuances", "equityCompensation"],
  pool: "returns",
  checks: [destinationPlan, countable("quantity"), securityRemoved, quantityReturnable],
});
