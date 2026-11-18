import type { OcfMachineContext } from "../types/validator";
import type { Snapshot } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securitiesIn, type NodeMap } from "./nodes";
import type { CollectionElement, CollectionKey } from "./ocfMachine";

/**
 * The issuances of a family's securities that are on the cap table, in the
 * order issued. A removed security is still in the node map and isn't shown.
 *
 * Which securities to show is the lifecycle chart's answer: the snapshot asks
 * for the chart's on-the-cap-table tag and names no state itself (#233).
 */
const shown = <C extends CollectionKey>(nodes: NodeMap, family: C): CollectionElement[C][] => {
  const issuances: CollectionElement[C][] = [];
  for (const { lifecycle, issuance } of securitiesIn(nodes, family)) {
    if (lifecycle.value !== undefined && isOnCapTable(family, lifecycle.value) && issuance.value !== undefined) {
      issuances.push(issuance.value);
    }
  }
  return issuances;
};

/** The cap table at the end of a day, read off the node map. */
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
