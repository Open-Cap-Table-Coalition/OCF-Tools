import type { OcfMachineContext } from "../types/validator";
import type { Snapshot, SnapshotEntry, SnapshotStockPlan, DefectMark } from "../types/snapshot";
import { isOnCapTable } from "./lifecycle";
import { securitiesIn, type NodeMap, type PlanNode, type SecurityNode } from "./nodes";
import type { CollectionElement, CollectionKey } from "./ocfMachine";

/**
 * Include securities the chart marks as outstanding. Also show a failed issuance with unknown status
 * so its uncertainty is visible in the snapshot.
 */
const isShown = ({ family, lifecycle }: SecurityNode): boolean =>
  lifecycle.value === undefined ? lifecycle.defects.length > 0 : isOnCapTable(family, lifecycle.value);

/** List the failures that affect the lifecycle or issuance fields in this snapshot row. */
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
 * Show securities in issuance order. A failed issuance can produce a row with only the failures
 * because its details are unknown.
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

/** Build the snapshot from the security records at the end of the day. */
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
