import type { Subject } from "../types/finding";
import { withNodeField, type Field, type FieldAddress, type FieldKey, type NodeBase, type NodeMaps, type ReferenceValue } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import { add, isNumeric, subtract } from "./numeric";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// Import only types from the chart and machine here. Both load validators that already import this
// module.

// Store securities and stock plans in separate maps because their IDs can overlap. Keep removed
// securities for later checks and pool returns. Each field records its value, writer and earlier
// failures. Copy the changed map and reuse other records so earlier states stay available.

/** Issuance transaction for any of the four security families. */
export type Issuance = CollectionElement[CollectionKey];

/**
 * Store the issuance and lifecycle by security family. A failed first issuance can leave both
 * unknown. Stock and equity compensation can draw on a plan or carry an earlier charge. A source
 * transaction can name a balance grant or settlement stock before that security is issued.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
} & (C extends "equityCompensation" | "stockIssuances" ? { draw?: Draw } : {})
  & (C extends "equityCompensation" ? { provenance?: Subject } : {})
  & (C extends "stockIssuances" ? { carriedPlans?: readonly string[] } : {});

/** The family determines which issuance and additional fields a security can have. */
type SecuritiesByFamily = {
  [F in CollectionKey]: NodeBase<"security", SecurityState<F>> & { readonly family: F };
};
export type SecurityNode<C extends CollectionKey = CollectionKey> = SecuritiesByFamily[C];

/** The plan and quantity charged for this grant. */
export type Draw = { readonly plan: unknown; readonly quantity: string };

/**
 * Reserved shares start at the plan's initial reserve, when known. Drawn shares start at zero. Store
 * these quantities as OCF decimal strings so pool arithmetic stays exact.
 */
export type PlanState = { reserved: string; drawn: string };
export type PlanNode = NodeBase<"plan", PlanState>;

/** Record types stored by the reducer. */
export type Node = SecurityNode | PlanNode;

/**
 * Find securities by security_id and plans by plan ID. Keep removed securities and include plans
 * first seen in a transaction.
 */
export type NodeMap = NodeMaps<Node>;

/** Initial state before reading any transactions. */
export const emptyNodes = (): NodeMap => ({ security: new Map(), plan: new Map() });

/** Record the value and its writer. Preserve earlier failures on this field. */
const written = <T>(value: T | undefined, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = {
  object_type: string;
  id: string;
  security_id?: unknown;
  stock_plan_id?: unknown;
  quantity?: unknown;
  shares_reserved?: unknown;
  date?: unknown;
  settlement_date?: unknown;
  security_ids?: unknown;
  resulting_security_id?: unknown;
  balance_security_id?: unknown;
  resulting_security_ids?: unknown;
};

/** Identify the transaction by type and ID. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/**
 * Apply writes when the checks allow them. Otherwise keep each affected value and attach the failing
 * transaction or the earlier failures that blocked it.
 */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly roots: readonly Subject[] };

const APPLY: Verdict = { ok: true };

/** Add failures identified by transaction type and ID. */
const withRoots = (defects: readonly Subject[], roots: readonly Subject[]): readonly Subject[] => {
  const added = roots.filter(
    (root) => !defects.some((held) => held.object_type === root.object_type && held.id === root.id),
  );
  return added.length === 0 ? defects : [...defects, ...added];
};

/** Keep the value and writer and record why this field is unreliable. */
const markDefects = <F extends Field<unknown>>(field: F, roots: readonly Subject[]): F => ({ ...field, defects: withRoots(field.defects, roots) });

/** A failed issuance makes both its details and lifecycle uncertain. */
const markIssuanceDefects = <N extends SecurityNode>(node: N, roots: readonly Subject[]): N => ({
  ...node,
  lifecycle: markDefects(node.lifecycle, roots),
  issuance: markDefects(node.issuance, roots),
});

/** Start with an unknown value and no recorded failure. */
const unknown = <T>(): Field<T> => ({ value: undefined, writer: undefined, defects: [] });

/**
 * Copy the index and reuse other records. Move a reissued ID to the end so snapshots reflect
 * issuance order.
 */
const withSecurity = (nodes: NodeMap, node: SecurityNode, { last = false } = {}): NodeMap => {
  const security = new Map(nodes.security);
  if (last) security.delete(node.id);
  security.set(node.id, node);
  return { ...nodes, security };
};

/** Find the families this transaction can act on. */
const familiesOf = (descriptor: Descriptor): readonly CollectionKey[] =>
  "collection" in descriptor ? [descriptor.collection] : descriptor.families;

/**
 * Apply security and plan changes together. On failure, keep prior values and mark affected fields
 * with the cause. Create an unknown security record for a failed first issuance so later checks can
 * identify the original failure.
 */
export function applyTransaction(
  nodes: NodeMap,
  descriptor: Descriptor,
  transaction: Applied,
  verdict: Verdict = APPLY,
): NodeMap {
  const by: Stamp = verdict.ok ? { ok: true, writer: subjectOf(transaction) } : { ok: false, roots: verdict.roots };
  const next = by.ok ? applied(nodes, descriptor, transaction, by.writer) : withheld(nodes, descriptor, transaction, by.roots);
  return poolWrites(nodes, next, descriptor, transaction, by);
}

/** Update security records for a successful transaction. */
function applied(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, writer: Subject): NodeMap {
  if (descriptor.effect === "append") {
    const held = nodes.security.get(transaction.security_id);
    // The descriptor selects the family for the parsed issuance. TypeScript needs that relationship
    // stated here.
    const node = {
      // A balance or resulting grant can be named before issuance. Keep any pool information already
      // recorded for it.
      ...(held?.family === descriptor.collection ? held : {}),
      kind: "security",
      id: transaction.security_id,
      family: descriptor.collection,
      lifecycle: written<LifecycleState>("outstanding", writer, held?.lifecycle),
      issuance: written(transaction as unknown as Issuance, writer, held?.issuance),
    } as SecurityNode;
    return withSecurity(nodes, node, { last: true });
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    return withSecurity(nodes, withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer, node.lifecycle)));
  }

  return nodes;
}

/**
 * A failed issuance or a reference to a future grant can create a record before its issuance details
 * are known.
 */
function blankSecurity<C extends CollectionKey>(id: unknown, family: C): SecurityNode<C>;
function blankSecurity(id: unknown, family: CollectionKey): SecurityNode {
  return { kind: "security", id, family, lifecycle: unknown<LifecycleState>(), issuance: unknown<never>() };
}

/** Mark the security fields that the failed transaction would affect. */
function withheld(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, roots: readonly Subject[]): NodeMap {
  if (!("security_id" in transaction)) return nodes;
  const held = nodes.security.get(transaction.security_id);

  if (descriptor.effect === "append") {
    // An issuance would replace the existing record under this ID.
    const node = held ?? blankSecurity(transaction.security_id, descriptor.collection);
    return withSecurity(nodes, markIssuanceDefects(node, roots));
  }

  // A return reads the removed security and updates the destination plan. A failed return leaves the
  // source security alone.
  if (descriptor.lifecycle === "after removal") return nodes;

  if (held === undefined || !familiesOf(descriptor).includes(held.family)) return nodes;
  return withSecurity(nodes, { ...held, lifecycle: markDefects(held.lifecycle, roots) });
}

// Charge a grant to its plan on first issuance. A balance or resulting grant carries shares already
// charged to its source. If its issuance ran first, undo its separate charge when the source names
// it. If the source ran first, remember the relationship and skip the charge at issuance. Removing
// the source grants no credit by itself. A return transaction credits its named plan.

/** Identify the transaction that wrote the field or the failures that prevented the write. */
type Stamp = { readonly ok: true; readonly writer: Subject } | { readonly ok: false; readonly roots: readonly Subject[] };

/** Store the new value on success. On failure, keep the previous value and record the cause. */
const stamped = <T>(field: Field<T> | undefined, value: T | undefined, by: Stamp): Field<T> =>
  by.ok ? written(value, by.writer, field) : markDefects(field ?? unknown<T>(), by.roots);

const ZERO = "0";

/** Start a newly referenced plan at zero drawn shares with an unknown reserve. */
const planAt = (nodes: NodeMap, id: unknown): PlanNode =>
  nodes.plan.get(id) ?? { kind: "plan", id, reserved: unknown(), drawn: { value: ZERO, writer: undefined, defects: [] } };

/** Copy the plan index and reuse the other plan records. */
const withPlan = (nodes: NodeMap, plan: PlanNode): NodeMap => ({ ...nodes, plan: new Map(nodes.plan).set(plan.id, plan) });

/** A stock issuance draws from a plan when it names that plan. */
export const isStockPlanId = (id: unknown): id is string => typeof id === "string" && id.length > 0;

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
    if (typeof stockPlan !== "object" || stockPlan === null || !("id" in stockPlan)) continue;
    const reserved = (stockPlan as { initial_shares_reserved?: unknown }).initial_shares_reserved;
    plan.set(stockPlan.id, {
      ...planAt(nodes, stockPlan.id),
      reserved: { value: isNumeric(reserved) ? reserved : undefined, writer: undefined, defects: [] },
    });
  }
  return { ...nodes, plan };
}

/**
 * Apply the plan operation declared by the transaction. Use the earlier map to check what the grant
 * had already drawn.
 */
function poolWrites(before: NodeMap, nodes: NodeMap, descriptor: Descriptor, transaction: Applied, by: Stamp): NodeMap {
  switch (descriptor.pool) {
    case "draws":
      return drawn(before, nodes, transaction, by);
    case "carries":
      return "collection" in descriptor && descriptor.collection === "equityCompensation" ? carried(nodes, transaction, by) : nodes;
    case "carriesStock":
      return carriedStock(nodes, transaction, by);
    case "returns":
      return adjusted(nodes, transaction.stock_plan_id, transaction.quantity, subtract, by);
    case "reserves":
      return reserved(nodes, transaction, by);
    default:
      return nodes;
  }
}

/** Add to or subtract from the plan's drawn shares. */
function adjusted(nodes: NodeMap, planId: unknown, quantity: unknown, move: typeof add, by: Stamp): NodeMap {
  if (!names(planId)) return nodes;
  const plan = planAt(nodes, planId);
  if (!by.ok) return withPlan(nodes, withNodeField(plan, "drawn", markDefects(plan.drawn, by.roots)));

  // The quantity check should have rejected a value the arithmetic cannot use.
  if (!isNumeric(quantity)) throw new Error(`${by.writer.object_type} ${by.writer.id} reached the pool with a quantity that isn't a Numeric.`);
  return withPlan(nodes, withNodeField(plan, "drawn", written(move(plan.drawn.value ?? ZERO, quantity), by.writer, plan.drawn)));
}

/** A source can name a balance grant or settlement stock before that security is issued. */
function carriedCharge(node: SecurityNode | undefined, planId: unknown): Field<unknown> | undefined {
  if (node?.family === "equityCompensation") return node.provenance;
  if (node?.family === "stockIssuances" && isStockPlanId(planId)) {
    const source = node.carriedPlans;
    if (source?.defects.length || source?.value?.includes(planId)) return source;
  }
  return undefined;
}

/** Charge the plan for a grant's first independent issuance. */
function drawn(before: NodeMap, nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  if (!names(transaction.stock_plan_id)) return nodes;
  const node = nodes.security.get(transaction.security_id);
  if (node?.family === "stockIssuances" && !isStockPlanId(transaction.stock_plan_id)) return nodes;
  const held = before.security.get(transaction.security_id);

  // An earlier issuance already accounted for this ID.
  if (held !== undefined && held.lifecycle.value !== undefined) return nodes;

  // The source already accounted for these shares when it named this grant.
  const provenance = carriedCharge(held, transaction.stock_plan_id);
  const inDoubt = provenance !== undefined && provenance.defects.length > 0;
  if (provenance?.value !== undefined && !inDoubt) return nodes;

  // If the source failed, the grant's share of the pool is uncertain. Mark its draw with the source
  // failure.
  const how: Stamp = inDoubt ? { ok: false, roots: by.ok ? provenance.defects : withRoots(by.roots, provenance.defects) } : by;

  const marked =
    node?.family !== "equityCompensation" && node?.family !== "stockIssuances"
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
function carried(nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  const resulting = Array.isArray(transaction.resulting_security_ids) ? transaction.resulting_security_ids : [];
  const named = [...new Set([transaction.balance_security_id, ...resulting].filter(names))];
  const source = subjectOf(transaction);

  return named.reduce<NodeMap>((map, id) => {
    const held = map.security.get(id);
    // Only an equity compensation grant can carry this pool charge.
    if (held !== undefined && !isSecurityFamily(held, "equityCompensation")) return map;
    const node = held ?? blankSecurity(id, "equityCompensation");

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

/**
 * A balance or resulting stock issuance carries the charge of its source. Undo a separate draw
 * when the stock was issued first on the same date. Remember the source plans for stock issued
 * later, such as a release that settles on a later day.
 */
function carriedStock(nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  const sources = Array.isArray(transaction.security_ids) ? transaction.security_ids : [transaction.security_id];
  const plans = new Set<string>();
  for (const id of sources) {
    const issuance = nodes.security.get(id)?.issuance.value;
    if (issuance && "stock_plan_id" in issuance && isStockPlanId(issuance.stock_plan_id)) plans.add(issuance.stock_plan_id);
  }
  if (plans.size === 0 && by.ok) return nodes;

  const results = Array.isArray(transaction.resulting_security_ids) ? transaction.resulting_security_ids : [];
  const ids = new Set([transaction.balance_security_id, transaction.resulting_security_id, ...results].filter(names));
  for (const id of ids) {
    if (sources.includes(id)) continue;
    const held = nodes.security.get(id);
    if (held && held.family !== "stockIssuances") continue;
    const stock = held ?? blankSecurity(id, "stockIssuances");
    const issued = stock.issuance.value;
    if (!issued) {
      nodes = withSecurity(nodes, { ...stock, carriedPlans: stamped(stock.carriedPlans, [...plans], by) });
      continue;
    }
    if (issued.date !== transaction.date && issued.date !== transaction.settlement_date) continue;
    const draw = stock.draw?.value;
    if (!draw || draw.quantity === ZERO || !isStockPlanId(draw.plan)) continue;
    if (plans.size > 0 && !plans.has(draw.plan)) continue;
    nodes = withSecurity(nodes, { ...stock, draw: stamped(stock.draw, { ...draw, quantity: ZERO }, by) });
    nodes = adjusted(nodes, draw.plan, draw.quantity, subtract, by);
  }
  return nodes;
}

/** Set the plan's reserve from the adjustment. */
function reserved(nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  if (!names(transaction.stock_plan_id)) return nodes;
  const plan = planAt(nodes, transaction.stock_plan_id);
  return withPlan(nodes, withNodeField(plan, "reserved", stamped(plan.reserved, transaction.shares_reserved as string, by)));
}

// Reading tracked fields

/**
 * Identify the security family, ID and field a check needs. The field definition determines the
 * returned value's type.
 */
export type FieldRef = FieldAddress<Node>;
export type FieldRefValue<R extends FieldRef> = ReferenceValue<Node, R>;

/** Identify one field of a security within its family. */
export function securityField<C extends CollectionKey, P extends FieldKey<SecurityNode<C>>>(
  family: C, id: unknown, field: P,
): Extract<FieldRef, { kind: "security"; family: C; field: P }> {
  return { kind: "security", family, id, field } as Extract<FieldRef, { kind: "security"; family: C; field: P }>;
}

/** Identify one field of a plan by its ID. */
export function planField<P extends FieldKey<PlanNode>>(id: unknown, field: P): Extract<FieldRef, { kind: "plan"; field: P }> {
  return { kind: "plan", id, field } as Extract<FieldRef, { kind: "plan"; field: P }>;
}

/** Look up the requested field. A missing record or optional field yields undefined. */
export const fieldAt = <R extends FieldRef>(nodes: NodeMap, ref: R): Field<FieldRefValue<R>> | undefined => {
  const node = nodes[ref.kind].get(ref.id);
  if (node === undefined || ("family" in ref && (!("family" in node) || node.family !== ref.family))) return undefined;
  // The lookup checks the kind and family. TypeScript still needs the field's value type stated
  // here.
  const fields: Partial<Record<FieldRef["field"], Field<unknown>>> = node;
  return fields[ref.field] as Field<FieldRefValue<R>> | undefined;
};

/** Name the security and field in a finding. */
export const describeField = (ref: FieldRef): string => `the ${ref.field} of ${ref.kind === "plan" ? "stock plan" : "security"} ${show(ref.id)}`;

const show = (value: unknown): string => {
  try {
    return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    return "[Unserializable value]";
  }
};

/** Check whether the security is currently outstanding. */
const isOutstanding = (node: SecurityNode): boolean => node.lifecycle.value === "outstanding";

/** Match the family so callers can use its issuance type. */
export const isSecurityFamily = <C extends CollectionKey>(node: SecurityNode, family: C): node is SecurityNode<C> =>
  node.family === family;

/** Find the security in its family even if removed or awaiting issuance. */
export const securityAt = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = nodes.security.get(securityId);
  return node !== undefined && isSecurityFamily(node, family) ? node : undefined;
};

/** Find an outstanding security in this family by ID. */
export const outstandingSecurity = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = securityAt(nodes, family, securityId);
  return node !== undefined && isOutstanding(node) ? node : undefined;
};

/** Include all securities in this family in issuance order, including removed ones. */
export const securitiesIn = <C extends CollectionKey>(nodes: NodeMap, family: C): SecurityNode<C>[] =>
  [...nodes.security.values()].filter((node): node is SecurityNode<C> => isSecurityFamily(node, family));

/** List a family's outstanding issuances in the order used by the original collection. */
export const outstanding = <C extends CollectionKey>(nodes: NodeMap, family: C): CollectionElement[C][] => {
  const issuances: CollectionElement[C][] = [];
  for (const node of securitiesIn(nodes, family)) {
    if (isOutstanding(node) && node.issuance.value !== undefined) {
      issuances.push(node.issuance.value);
    }
  }
  return issuances;
};
