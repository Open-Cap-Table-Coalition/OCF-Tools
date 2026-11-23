import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import { isStockPlanId } from "../../stockPlan";
import { defineValidator, text, type CheckObject } from "../checkKit";
import { countable, issuanceIdChecks, stakeholderExists } from "../checks";

const stockClass = {
  id: "stock-class-exists",
  severity: "error",
  description: "The stock class named by the issuance exists.",
  run: (context, data) =>
    context.ocfPackageContent.stockClasses.some((item: { id: string }) => item.id === data.stock_class_id)
      ? []
      : [text`Stock class ${data.stock_class_id} was not found.`],
} satisfies CheckObject<OCFStockIssuance>;

const legends = {
  id: "stock-legends-exist",
  severity: "error",
  description: "Every named stock legend exists.",
  run: (context, data) => {
    if (!Array.isArray(data.stock_legend_ids)) return ["Expected stock_legend_ids to be a list."];
    return data.stock_legend_ids.flatMap((id) =>
      context.ocfPackageContent.stockLegends.some((item: { id: string }) => item.id === id)
        ? []
        : [text`Stock legend ${id} was not found.`],
    );
  },
} satisfies CheckObject<OCFStockIssuance>;

const plan = {
  id: "stock-plan-id",
  severity: "error",
  description: "A stock issuance that names a plan supplies a nonempty plan ID.",
  run: (_context, data) =>
    data.stock_plan_id == null || isStockPlanId(data.stock_plan_id)
      ? []
      : ["The stock_plan_id must be a nonempty string."],
} satisfies CheckObject<OCFStockIssuance>;

const gaps = [
  {
    id: "issuance-date",
    severity: "error",
    description: "Issuance follows incorporation and stock class creation.",
  },
  {
    id: "authorized-shares",
    severity: "error",
    description: "Outstanding stock stays within the authorized share count.",
  },
] as const;

export const TX_STOCK_ISSUANCE = defineValidator({
  transaction: "TX_STOCK_ISSUANCE",
  effect: "append",
  collection: "stockIssuances",
  pool: "draws",
  checks: [
    ...issuanceIdChecks,
    stakeholderExists,
    stockClass,
    legends,
    plan,
    countable("quantity", (data) => isStockPlanId(data.stock_plan_id)),
    ...gaps,
  ],
});
