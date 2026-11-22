import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import { add, exceeds, isQuantity, subtract } from "../../numeric";
import { isStockPlanId } from "../../stockPlan";

/** Cancellation and repurchase use the same quantity and balance rules. */
export function retirementQuantities(source: OCFStockIssuance | undefined, retired: string, kept: string | undefined) {
  const issued = source?.quantity;
  if (isStockPlanId(source?.stock_plan_id)) {
    return {
      quantity: isQuantity(issued) && isQuantity(retired) && exceeds(retired, "0") && !exceeds(retired, issued),
      reconciles: isQuantity(issued) && isQuantity(retired) && isQuantity(kept) && subtract(issued, add(retired, kept)) === "0",
    };
  }
  const quantity = parseFloat(retired);
  const original = parseFloat(issued ?? "");
  return { quantity: quantity > 0 && quantity <= original, reconciles: original === quantity + parseFloat(kept ?? "") };
}
