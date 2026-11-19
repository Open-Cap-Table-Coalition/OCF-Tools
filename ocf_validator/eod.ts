import type { OcfMachineContext } from "../types/validator";
import type { Snapshot } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securitiesIn, type NodeMap } from "./nodes";
import type { CollectionElement, CollectionKey } from "./ocfMachine";

/** List issuances in order. Use the chart's cap-table tag to decide which ones to show. */
const shown = <C extends CollectionKey>(nodes: NodeMap, family: C): CollectionElement[C][] => {
  const issuances: CollectionElement[C][] = [];
  for (const { lifecycle, issuance } of securitiesIn(nodes, family)) {
    if (lifecycle.value !== undefined && isOnCapTable(family, lifecycle.value) && issuance.value !== undefined) {
      issuances.push(issuance.value);
    }
  }
  return issuances;
};

/** Build the snapshot from the security records at the end of the day. */
const RUN_EOD = (context: OcfMachineContext, event: { date: string }): Snapshot => {
  const { nodes } = context;

  return {
    date: event.date,
    stockIssuances: shown(nodes, "stockIssuances").map((issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      stock_class: issuance.stock_class_id,
      quantity: issuance.quantity,
    })),
    convertibles: shown(nodes, "convertibleIssuances").map((issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: (issuance as { purchase_price?: unknown }).purchase_price,
    })),
    warrants: shown(nodes, "warrantIssuances").map((issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: issuance.purchase_price,
    })),
    equityCompensation: shown(nodes, "equityCompensation").map((issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      quantity: issuance.quantity,
    })),
  };
};

export default RUN_EOD;
