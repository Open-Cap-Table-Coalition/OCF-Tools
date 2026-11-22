import type { Subject } from "../types/finding";
import type { Descriptor, CollectionKey } from "./ocfMachine";
import { withNodeField, type Field } from "./node";
import { currentName } from "./constants/constants";
import type { LifecycleState } from "./lifecycle";
import { isSecurityFamily, markDefects, securityById, withPlanMap, withSecurity, written, type NodeMap, type PlanNode, type SecurityNode } from "./nodes";
import { add, exceeds, isNumeric, isQuantity, subtract } from "./numeric";

/** The plan and quantity charged for this grant. */
export type Draw = { readonly plan: string; readonly quantity: string };

export type PoolTransaction = {
  object_type: string;
  id: string;
  security_id?: unknown;
  stock_plan_id?: unknown;
  quantity?: unknown;
  shares_reserved?: unknown;
  date?: string;
  settlement_date?: string;
  security_ids?: unknown;
  resulting_security_id?: unknown;
  balance_security_id?: unknown;
  resulting_security_ids?: unknown;
};

const unknown = <T>(): Field<T> => ({ value: undefined, writer: undefined, defects: [] });

/** Identify the transaction by type and ID. */
const subjectOf = (transaction: PoolTransaction): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

const withRoots = (defects: readonly Subject[], roots: readonly Subject[]): readonly Subject[] => {
  const added = roots.filter(
    (root) => !defects.some((held) => held.object_type === root.object_type && held.id === root.id),
  );
  return added.length === 0 ? defects : [...defects, ...added];
};

/**
 * A failed issuance or a reference to a future grant can create a record before its issuance details
 * are known.
 */
function blankSecurity<C extends CollectionKey>(id: unknown, family: C): SecurityNode<C>;
function blankSecurity(id: unknown, family: CollectionKey): SecurityNode {
  return { kind: "security", id, family, lifecycle: unknown<LifecycleState>(), issuance: unknown<never>() };
}

// Charge a grant to its plan on first issuance. A balance or resulting grant carries shares already
// charged to its source. If its issuance ran first, undo its separate charge when the source names
// it. If the source ran first, remember the relationship and skip the charge at issuance. Removing
// the source grants no credit by itself. A return transaction credits its named plan.

/** Identify the transaction that wrote the field or the failures that prevented the write. */
type Stamp = { readonly ok: true; readonly writer: Subject } | { readonly ok: false; readonly roots: readonly Subject[]; readonly invalidReplacement?: true };

/** Store the new value on success. On failure, keep the previous value and record the cause. */
const stamped = <T>(field: Field<T> | undefined, value: T | undefined, by: Stamp): Field<T> =>
  by.ok ? written(value, by.writer, field) : markDefects(field ?? unknown<T>(), by.roots);

const ZERO = "0";

/** Start a newly referenced plan at zero drawn shares with an unknown reserve. */
const planAt = (nodes: NodeMap, id: unknown): PlanNode =>
  nodes.plan?.get(id) ?? { kind: "plan", id, reserved: unknown(), drawn: { value: ZERO, writer: undefined, defects: [] } };

/** Copy the plan index and reuse the other plan records. */
const withPlan = (nodes: NodeMap, plan: PlanNode): NodeMap => withPlanMap(nodes, new Map(nodes.plan).set(plan.id, plan));

/** A stock issuance draws from a plan when it names that plan. */
export const isStockPlanId = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0;

/** An ID is present if its value is neither null nor undefined. */
const names = (id: unknown): boolean => id !== undefined && id !== null;

/**
 * Load the starting reserves and set drawn shares to zero. A missing or unusable reserve leaves the
 * value unknown. Skip malformed plan entries that cannot identify a plan (#234).
 */
export function withPlans(nodes: NodeMap, stockPlans: unknown): NodeMap {
  if (!Array.isArray(stockPlans) || stockPlans.length === 0) return nodes;
  const plan = new Map(nodes.plan);
  for (const stockPlan of stockPlans) {
    if (typeof stockPlan !== "object" || stockPlan === null || !isStockPlanId(stockPlan.id)) continue;
    const reserved = (stockPlan as { initial_shares_reserved?: unknown }).initial_shares_reserved;
    plan.set(stockPlan.id, {
      ...planAt(nodes, stockPlan.id),
      reserved: { value: isQuantity(reserved) ? reserved : undefined, writer: undefined, defects: [] },
    });
  }
  return withPlanMap(nodes, plan);
}

/**
 * Apply the plan operation declared by the transaction. Use the earlier map to check what the grant
 * had already drawn.
 */
export function poolWrites(before: NodeMap, nodes: NodeMap, descriptor: Descriptor, transaction: PoolTransaction, by: Stamp): NodeMap {
  nodes = trackSourceQuantity(before, nodes, descriptor, transaction, by);
  if (!by.ok && by.invalidReplacement) return nodes;
  switch (descriptor.pool) {
    case "draws":
      return "collection" in descriptor ? drawn(before, nodes, transaction, by, descriptor.collection) : nodes;
    case "carries":
      return carried(nodes, transaction, by);
    case "carriesStock":
      return carriedStock(nodes, transaction, by);
    case "returns":
      return creditReturn(nodes, transaction, by);
    case "reserves":
      return reserved(nodes, transaction, by);
    default:
      return nodes;
  }
}

/** Debit the source allowance even when a different plan receives the credit. */
function creditReturn(nodes: NodeMap, tx: PoolTransaction, by: Stamp): NodeMap {
  if (!isStockPlanId(tx.stock_plan_id)) return nodes;
  if (by.ok) {
    const source = securityById(nodes, tx.security_id);
    if (source?.family !== "equityCompensation" && source?.family !== "stockIssuances") return nodes;
    const left = source.returnable?.value;
    if (source.lifecycle.value !== "removed" || left === undefined || !isQuantity(tx.quantity) || exceeds(tx.quantity, left)) return nodes;
    nodes = withSecurity(nodes, { ...source, returnable: written(subtract(left, tx.quantity), by.writer) });
  }
  return adjusted(nodes, tx.stock_plan_id, tx.quantity, subtract, by);
}

/** A transfer or conversion moves shares into another security. Only a retirement frees them for return. */
function trackSourceQuantity(before: NodeMap, nodes: NodeMap, descriptor: Descriptor, tx: PoolTransaction, by: Stamp): NodeMap {
  if (!by.ok || (descriptor.effect !== "remove" && descriptor.pool !== "carriesStock")) return nodes;
  const source = securityById(before, tx.security_id);
  if (source?.lifecycle.value !== "outstanding" || (source.family !== "equityCompensation" && source.family !== "stockIssuances")) return nodes;
  const issuance = source.issuance.value;
  if (!issuance || (source.family === "stockIssuances" && !isStockPlanId(issuance.stock_plan_id))) return nodes;
  const remaining = source.family === "equityCompensation" && source.remaining ? source.remaining.value : issuance.quantity;
  const quantity = tx.quantity;
  const countable = isQuantity(remaining);
  const fits = countable && isQuantity(quantity) && !exceeds(quantity, remaining);
  const type = currentName(tx.object_type);
  if (source.family === "equityCompensation" && (type === "TX_EQUITY_COMPENSATION_EXERCISE" || type === "TX_EQUITY_COMPENSATION_RELEASE")) {
    const value = fits ? subtract(remaining, quantity) : undefined;
    return withSecurity(nodes, { ...source, remaining: written(value, by.writer) });
  }
  const removed = securityById(nodes, tx.security_id);
  if (descriptor.effect !== "remove" || removed?.lifecycle.value !== "removed" ||
      (removed.family !== "equityCompensation" && removed.family !== "stockIssuances")) return nodes;
  let value = ZERO;
  if (type === "TX_STOCK_RETRACTION" || type === "TX_EQUITY_COMPENSATION_RETRACTION") value = countable ? remaining : ZERO;
  if (type === "TX_STOCK_CANCELLATION" || type === "TX_STOCK_REPURCHASE" || type === "TX_EQUITY_COMPENSATION_CANCELLATION") {
    value = fits ? quantity : ZERO;
  }
  if (removed.family === "stockIssuances" && removed.consolidatedInto?.value) value = ZERO;
  return withSecurity(nodes, { ...removed, returnable: written(value, by.writer) });
}

/** Add to or subtract from the plan's drawn shares. */
function adjusted(nodes: NodeMap, planId: unknown, quantity: unknown, move: typeof add, by: Stamp): NodeMap {
  if (!isStockPlanId(planId)) return nodes;
  const plan = planAt(nodes, planId);
  if (!by.ok) return withPlan(nodes, withNodeField(plan, "drawn", markDefects(plan.drawn, by.roots)));

  // The quantity check should have rejected a value the arithmetic cannot use.
  if (!isNumeric(quantity)) throw new Error(`${by.writer.object_type} ${by.writer.id} reached the pool with a quantity that isn't a Numeric.`);
  return withPlan(nodes, withNodeField(plan, "drawn", written(move(plan.drawn.value ?? ZERO, quantity), by.writer, plan.drawn)));
}

/** A source can name a balance grant or settlement stock before that security is issued. */
function carriedCharge(node: SecurityNode | undefined, planId: unknown, date?: string): Field<unknown> | undefined {
  if (node?.family === "equityCompensation") return node.provenance;
  if (node?.family === "stockIssuances" && isStockPlanId(planId)) {
    const source = node.carry;
    if (source?.defects.length || (source?.value?.date === date && source?.value?.plan === planId)) return source;
  }
  return undefined;
}

/** Charge the plan for a grant's first independent issuance. */
function drawn(before: NodeMap, nodes: NodeMap, transaction: PoolTransaction, by: Stamp, family: CollectionKey): NodeMap {
  if (!isStockPlanId(transaction.stock_plan_id)) return nodes;
  let node = securityById(nodes, transaction.security_id);
  const held = securityById(before, transaction.security_id);

  // An earlier issuance already accounted for this ID.
  if (held !== undefined && held.lifecycle.value !== undefined) return nodes;

  if (by.ok && node?.family === "equityCompensation" && isNumeric(transaction.quantity)) {
    node = { ...node, remaining: written(transaction.quantity, by.writer) };
    nodes = withSecurity(nodes, node);
  }

  // The source already accounted for these shares when it named this grant.
  const provenance = held?.family === family ? carriedCharge(held, transaction.stock_plan_id, transaction.date) : undefined;
  const inDoubt = provenance !== undefined && provenance.defects.length > 0;
  if (provenance?.value !== undefined && !inDoubt) return nodes;

  // If the source failed, the grant's share of the pool is uncertain. Mark its draw with the source
  // failure.
  const how: Stamp = inDoubt ? { ok: false, roots: by.ok ? provenance.defects : withRoots(by.roots, provenance.defects) } : by;

  const marked =
    node?.family !== family || (node.family !== "equityCompensation" && node.family !== "stockIssuances")
      ? nodes
      : withSecurity(nodes, {
          ...node,
          draw: stamped(node.draw, { plan: transaction.stock_plan_id, quantity: transaction.quantity as string }, how),
        });
  return adjusted(marked, transaction.stock_plan_id, transaction.quantity, add, how);
}

/**
 * Record which transaction named each balance or resulting grant and reverse any separate charge for
 * that grant.
 */
function carried(nodes: NodeMap, transaction: PoolTransaction, by: Stamp): NodeMap {
  const resulting = currentName(transaction.object_type) === "TX_EQUITY_COMPENSATION_TRANSFER" && Array.isArray(transaction.resulting_security_ids) ? transaction.resulting_security_ids : [];
  const named = [...new Set([transaction.balance_security_id, ...resulting].filter(names))];
  const source = subjectOf(transaction);

  const original = securityById(nodes, transaction.security_id);
  const grant = original?.family === "equityCompensation" ? original.issuance.value : undefined;
  if (by.ok && !isStockPlanId(grant?.stock_plan_id)) return nodes;
  return named.reduce<NodeMap>((map, id) => {
    if (id === transaction.security_id) return map;
    const held = securityById(map, id);
    // Only an equity compensation grant can carry this pool charge.
    if (held !== undefined && !isSecurityFamily(held, "equityCompensation")) return map;
    const node = held ?? blankSecurity(id, "equityCompensation");

    const target = node.issuance.value;
    if (node.provenance?.value || (target && (node.lifecycle.value !== "outstanding" ||
      target.date !== transaction.date || (grant && grant.stock_plan_id !== target.stock_plan_id)))) return map;
    const drew = node.draw?.value;
    const gaveBack = drew !== undefined && drew.quantity !== ZERO;
    const next = withSecurity(map, {
      ...node,
      provenance: stamped(node.provenance, source, by),
      ...(gaveBack ? { draw: stamped(node.draw, { plan: drew.plan, quantity: ZERO }, by) } : {}),
    });
    return gaveBack ? adjusted(next, drew.plan, drew.quantity, subtract, by) : next;
  }, nodes);
}

/** Only the output fields defined for this transaction identify replacement stock. */
function replacementStockIds(transaction: PoolTransaction): unknown[] {
  const results = Array.isArray(transaction.resulting_security_ids) ? transaction.resulting_security_ids : [];
  switch (transaction.object_type) {
    case "TX_STOCK_CANCELLATION":
    case "TX_STOCK_REPURCHASE":
      return [transaction.balance_security_id];
    case "TX_STOCK_TRANSFER":
    case "TX_STOCK_CONVERSION":
      return [transaction.balance_security_id, ...results];
    default:
      return results;
  }
}

/** Remember settlement stock or reverse the separate draw of an already issued replacement. */
function carryStock(nodes: NodeMap, id: string, plan: string | undefined, date: string | undefined, by: Stamp): NodeMap {
  const held = securityById(nodes, id);
  if (held && held.family !== "stockIssuances") return nodes;
  const stock = held ?? blankSecurity(id, "stockIssuances");
  if (stock.carry?.value || stock.lifecycle.value === "removed") return nodes;
  const carry = stamped(stock.carry, { plan, date }, by);
  const issuance = stock.issuance.value;
  if (!issuance) return withSecurity(nodes, { ...stock, carry });
  const draw = stock.draw?.value;
  if (issuance.date !== date || !draw || draw.quantity === ZERO || (plan && plan !== draw.plan)) return nodes;
  const marked = withSecurity(nodes, { ...stock, carry, draw: stamped(stock.draw, { ...draw, quantity: ZERO }, by) });
  return adjusted(marked, draw.plan, draw.quantity, subtract, by);
}

/** Only an exact, same-plan consolidation identifies the whole draw carried to the output. */
function consolidatedStock(nodes: NodeMap, tx: PoolTransaction, by: Stamp): NodeMap {
  const ids = tx.security_ids;
  const result = tx.resulting_security_id;
  if (!by.ok || typeof result !== "string" || !Array.isArray(ids) || !ids.length ||
      ids.includes(result) || new Set(ids).size !== ids.length) return nodes;

  const output = securityById(nodes, result);
  if (output?.family !== "stockIssuances") return nodes;
  const issuance = output.issuance.value;
  if (!isStockPlanId(issuance?.stock_plan_id) || !isQuantity(issuance.quantity) ||
      output.lifecycle.defects.length || output.issuance.defects.length) return nodes;
  const inputs: SecurityNode<"stockIssuances">[] = [];
  let total = ZERO;
  for (const id of ids) {
    const stock = securityById(nodes, id);
    if (stock?.family !== "stockIssuances" || stock.lifecycle.value !== "outstanding" || stock.consolidatedInto?.value ||
        stock.lifecycle.defects.length || stock.issuance.defects.length) return nodes;
    const source = stock.issuance.value;
    if (!source || source.stock_plan_id !== issuance.stock_plan_id || source.stock_class_id !== issuance.stock_class_id ||
        source.stakeholder_id !== issuance.stakeholder_id || !isQuantity(source.quantity)) return nodes;
    total = add(total, source.quantity);
    inputs.push(stock);
  }
  if (subtract(total, issuance.quantity) !== ZERO) return nodes;
  let next = carryStock(nodes, result, issuance.stock_plan_id, tx.date, by);
  if (next === nodes) return nodes;
  for (const input of inputs) next = withSecurity(next, { ...input, consolidatedInto: written(result, by.writer) });
  return next;
}

function carriedStock(nodes: NodeMap, transaction: PoolTransaction, by: Stamp): NodeMap {
  const type = currentName(transaction.object_type);
  if (type === "TX_STOCK_CONSOLIDATION") return consolidatedStock(nodes, transaction, by);
  const source = securityById(nodes, transaction.security_id);
  if (source?.family === "stockIssuances" && source.consolidatedInto?.value) return nodes;
  const settlement = type === "TX_EQUITY_COMPENSATION_EXERCISE" || type === "TX_EQUITY_COMPENSATION_RELEASE";
  const plan = source?.family === (settlement ? "equityCompensation" : "stockIssuances") ? source.issuance.value?.stock_plan_id : undefined;
  if (!isStockPlanId(plan) && by.ok) return nodes;
  const date = type === "TX_EQUITY_COMPENSATION_RELEASE" ? transaction.settlement_date ?? transaction.date : transaction.date;
  for (const id of new Set(replacementStockIds(transaction))) {
    if (typeof id === "string" && id && id !== transaction.security_id) nodes = carryStock(nodes, id, plan, date, by);
  }
  return nodes;
}

/** Set the plan's reserve from the adjustment. */
function reserved(nodes: NodeMap, transaction: PoolTransaction, by: Stamp): NodeMap {
  if (!isStockPlanId(transaction.stock_plan_id)) return nodes;
  const plan = planAt(nodes, transaction.stock_plan_id);
  return withPlan(nodes, withNodeField(plan, "reserved", by.ok ? written(transaction.shares_reserved as string, by.writer) : markDefects(plan.reserved, by.roots)));
}
