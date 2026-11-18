import type { OcfMachineContext } from "../types/validator";
import type { Snapshot, SnapshotEntry, SnapshotStockPlan, DefectMark } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securitiesIn, type NodeMap, type PlanNode, type SecurityNode } from "./nodes";
import type { CollectionElement, CollectionKey } from "./ocfMachine";

/**
 * Whether a security has an entry in the snapshot.
 *
 * Which securities are on the cap table is the lifecycle chart's answer: the
 * snapshot asks for the chart's on-the-cap-table tag and names no state
 * itself (#233). A removed security is still in the node map and isn't shown.
 *
 * A security whose issuance failed has no lifecycle value to ask the chart
 * about. It's shown, marked, since the validator can't say it isn't there.
 */
const isShown = ({ family, lifecycle }: SecurityNode): boolean =>
  lifecycle.value === undefined ? lifecycle.defects.length > 0 : isOnCapTable(family, lifecycle.value);

/** The defect marker for a security's entry, or nothing if both its fields can be trusted. */
const markOf = ({ lifecycle, issuance }: SecurityNode): DefectMark | undefined => {
  if (lifecycle.defects.length === 0 && issuance.defects.length === 0) return undefined;
  return {
    defects: {
      ...(lifecycle.defects.length > 0 ? { lifecycle: [...lifecycle.defects] } : {}),
      ...(issuance.defects.length > 0 ? { issuance: [...issuance.defects] } : {}),
    },
  };
};

/**
 * A family's entries: one for each of its securities that is shown, in the
 * order issued. `row` projects an issuance to the entry's fields. An entry
 * for a security that can be trusted is exactly that row. A marked one
 * carries the mark too, and has no other fields if its issuance isn't known.
 */
const entries = <C extends CollectionKey, Row>(
  nodes: NodeMap,
  family: C,
  row: (issuance: CollectionElement[C]) => Row,
): SnapshotEntry<Row>[] =>
  securitiesIn(nodes, family)
    .filter(isShown)
    .map((node) => {
      const mark = markOf(node);
      const fields: Partial<Row> = node.issuance.value === undefined ? {} : row(node.issuance.value);
      return mark === undefined ? (fields as Row) : { ...fields, ...mark };
    });

/** A stock plan's pool as the snapshot shows it, with a mark on a number that can't be trusted. */
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

/** The cap table at the end of a day, read off the node map. */
const RUN_EOD = (context: OcfMachineContext, event: { date: string }): Snapshot => {
  const { nodes } = context;

  return {
    date: event.date,
    stockIssuances: entries(nodes, "stockIssuances", (issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      stock_class: issuance.stock_class_id,
      quantity: issuance.quantity,
    })),
    convertibles: entries(nodes, "convertibleIssuances", (issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: (issuance as { purchase_price?: unknown }).purchase_price,
    })),
    warrants: entries(nodes, "warrantIssuances", (issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      purchase_price: issuance.purchase_price,
    })),
    equityCompensation: entries(nodes, "equityCompensation", (issuance) => ({
      date: issuance.date,
      custom_id: issuance.custom_id,
      stakeholder: issuance.stakeholder_id,
      quantity: issuance.quantity,
    })),
    stockPlans: [...nodes.plan.values()].map(planRow),
  };
};

export default RUN_EOD;
