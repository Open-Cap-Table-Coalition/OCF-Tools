import type { OcfMachineContext } from "../types/validator";
import type { DefectMark, Snapshot, SnapshotStockPlan } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securityRecords, type PlanNode, type SecurityNode } from "./nodes";
import type { CollectionKey } from "./validators";

const snapshotList = {
  stockIssuances: "stockIssuances",
  convertibleIssuances: "convertibles",
  warrantIssuances: "warrants",
  equityCompensation: "equityCompensation",
} as const satisfies Record<CollectionKey, keyof Snapshot>;
const families = Object.keys(snapshotList) as CollectionKey[];

const defectMark = ({ lifecycle, issuance }: SecurityNode): DefectMark | undefined => {
  if (!lifecycle.defects.length && !issuance.defects.length) return;
  return {
    defects: {
      ...(lifecycle.defects.length > 0 && { lifecycle: [...lifecycle.defects] }),
      ...(issuance.defects.length > 0 && { issuance: [...issuance.defects] }),
    },
  };
};

/** Show the plan totals and identify any failure that makes a total unreliable. */
const planRow = ({ id, reserved, drawn }: PlanNode): SnapshotStockPlan => {
  const hasDefects = reserved.defects.length > 0 || drawn.defects.length > 0;
  return {
    id: id as string,
    ...(reserved.value === undefined ? {} : { reserved: reserved.value }),
    drawn: drawn.value ?? "0",
    ...(hasDefects
      ? {
          defects: {
            ...(reserved.defects.length > 0 ? { reserved: [...reserved.defects] } : {}),
            ...(drawn.defects.length > 0 ? { drawn: [...drawn.defects] } : {}),
          },
        }
      : {}),
  };
};

/** Build all four snapshot lists in issuance order. */
const RUN_EOD = (context: OcfMachineContext, event: { date: string }): Snapshot => {
  const snapshot: Snapshot = { date: event.date, stockIssuances: [], convertibles: [], warrants: [], equityCompensation: [], stockPlans: Array.from(context.nodes.plan?.values() ?? [], planRow) };
  // Today's charts show only outstanding securities. Honor any chart that also tags another state.
  const includeRemoved = families.some((family) => isOnCapTable(family, "removed") || isOnCapTable(family, "notIssued"));
  for (const node of securityRecords(context.nodes, includeRemoved ? "history" : "current")) {
    const state = node.lifecycle.value;
    if (state !== undefined && !isOnCapTable(node.family, state)) continue;
    const mark = defectMark(node);
    if (node.issuance.value === undefined) {
      if (mark) snapshot[snapshotList[node.family]].push(mark);
      continue;
    }
    const { date, custom_id, stakeholder_id: stakeholder } = node.issuance.value;
    const common = { date, custom_id, stakeholder, ...mark };
    switch (node.family) {
      case "stockIssuances": {
        const stock = node.issuance.value;
        snapshot.stockIssuances.push({ ...common, stock_class: stock.stock_class_id, quantity: stock.quantity });
        break;
      }
      case "convertibleIssuances": {
        const convertible = node.issuance.value as { purchase_price?: unknown };
        snapshot.convertibles.push({ ...common, purchase_price: convertible.purchase_price });
        break;
      }
      case "warrantIssuances":
        snapshot.warrants.push({ ...common, purchase_price: node.issuance.value.purchase_price });
        break;
      case "equityCompensation":
        snapshot.equityCompensation.push({ ...common, quantity: node.issuance.value.quantity });
        break;
    }
  }
  return snapshot;
};

export default RUN_EOD;
