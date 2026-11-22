import type { OcfMachineContext } from "../types/validator";
import type { Snapshot } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securityRecords } from "./nodes";
import type { CollectionKey } from "./ocfMachine";

const families = ["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"] as const satisfies readonly CollectionKey[];

/** Build all four snapshot lists in issuance order. */
const RUN_EOD = (context: OcfMachineContext, event: { date: string }): Snapshot => {
  const snapshot: Snapshot = { date: event.date, stockIssuances: [], convertibles: [], warrants: [], equityCompensation: [] };
  // Today's charts show only outstanding securities. Honor any chart that also tags another state.
  const includeRemoved = families.some((family) => isOnCapTable(family, "removed") || isOnCapTable(family, "notIssued"));
  for (const node of securityRecords(context.nodes, includeRemoved ? "history" : "outstanding")) {
    const state = node.lifecycle.value;
    if (state === undefined || !isOnCapTable(node.family, state) || node.issuance.value === undefined) continue;
    const { date, custom_id, stakeholder_id: stakeholder } = node.issuance.value;
    const common = { date, custom_id, stakeholder };
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
