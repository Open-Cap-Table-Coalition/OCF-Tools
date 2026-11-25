import type { TransactionFor } from "../../../types/ocf-input";
import { securityField } from "../../nodes";
import { consolidationInputs, isStockPlanId } from "../../stockPlan";
import { defineValidator, type CheckObject } from "../checkKit";
import { transactionsOn } from "../checks";

const poolInputs = {
  id: "consolidation-pool-inputs",
  severity: "error",
  description: "The stocks used to count a consolidation against a plan have reliable issuance and lifecycle records.",
  reads: (data, context) => {
    const inputs = consolidationInputs(data);
    const result = data.resulting_security_id;
    if (!inputs.length || !transactionsOn(context, result).some((tx) => tx.object_type === "TX_STOCK_ISSUANCE" &&
        tx.date === data.date && isStockPlanId(tx.stock_plan_id))) return [];
    const stocks = [...inputs, result].flatMap((id) => [
      securityField("stockIssuances", id, "issuance"),
      securityField("stockIssuances", id, "lifecycle"),
      securityField("stockIssuances", id, "draw"),
      securityField("stockIssuances", id, "carry"),
    ]);
    return [...stocks, ...inputs.map((id) => securityField("stockIssuances", id, "consolidatedInto"))];
  },
  // Reliable stocks can be compared by the pool reducer. A blocked read withholds the carry.
  run: () => [],
} satisfies CheckObject<TransactionFor<"TX_STOCK_CONSOLIDATION">>;

export const TX_STOCK_CONSOLIDATION = defineValidator({
  transaction: "TX_STOCK_CONSOLIDATION",
  pool: "carriesStock",
  effect: "passthrough",
  lifecycle: "removes",
  families: ["stockIssuances"],
  checks: [poolInputs],
});
