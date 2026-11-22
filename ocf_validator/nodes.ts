import { OrderedMap } from "immutable";
import type { OcfMachineContext } from "../types/validator";
import type { Subject } from "../types/finding";
import { type FieldKey, type FieldValue, withNodeField, type Field, type NodeBase, type NodeMaps } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

import { poolWrites, type PoolTransaction, type Draw } from "./stockPlan";
export { withPlans, type Draw } from "./stockPlan";

// Import only types from the chart and machine here. Both load validators that already import this
// module.

// Look up securities by ID and keep removed records so later checks can explain what happened. Each
// field records its own value and writer. Index updates share unchanged records with earlier states.

/** Issuance transaction for any of the four security families. */
export type Issuance = CollectionElement[CollectionKey];

/**
 * Store each security's family, original issuance and lifecycle. A failed first issuance leaves both
 * values unknown and records the failure on both fields.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
  /** Set once, when a removal succeeds. */
  removal?: { id: string; date: string };
} & (C extends "equityCompensation" | "stockIssuances" ? {
  draw?: Draw;
  /** Removed shares still eligible for a return. */
  returnable?: string;
} : {}) & (C extends "equityCompensation" ? { provenance?: Subject; remaining?: string } : {})
  & (C extends "stockIssuances" ? { carry?: { plan?: string; date?: string }; consolidatedInto?: string } : {});

/** An issuance withheld in another family has no known values or writers. */
type WithheldIssuance = { readonly lifecycle: Field<never>; readonly issuance: Field<never> };
type WithheldByFamily = Readonly<Partial<Record<CollectionKey, WithheldIssuance>>>;

/** The family determines the type of the stored issuance. */
type SecuritiesByFamily = {
  [F in CollectionKey]: NodeBase<"security", SecurityState<F>> & {
    readonly family: F;
    /** Other families that attempted issuance while this ID was uncertain. Snapshots list the ID once. */
    readonly withheldByFamily?: WithheldByFamily;
  };
};
export type SecurityNode<C extends CollectionKey = CollectionKey> = SecuritiesByFamily[C];

/** Reserved and drawn shares use OCF decimal strings. */
export type PlanNode = NodeBase<"plan", { reserved: string; drawn: string }>;
export type NodeMap = NodeMaps<SecurityNode | PlanNode>;

type SecurityMap = OrderedMap<unknown, SecurityNode>;
type SecurityIndex = { history: SecurityMap; current: SecurityMap };
const indexes = new WeakMap<NodeMap, SecurityIndex>();

/** Keep the public native map available for callers and structuredClone. */
function fromIndex(index: SecurityIndex, plan: NodeMap["plan"] = new Map()): NodeMap {
  let history: ReadonlyMap<unknown, SecurityNode> | undefined;
  const nodes = {
    plan,
    get security() {
      return history ??= new Map(index.history);
    },
  };
  indexes.set(nodes, index);
  return nodes;
}

/** A caller can also supply a plain NodeMap or resume from a structured clone. */
function indexOf(nodes: NodeMap): SecurityIndex {
  const indexed = indexes.get(nodes);
  if (indexed) return indexed;
  const history = OrderedMap(nodes.security);
  const index = { history, current: history.filter(isCurrent) };
  indexes.set(nodes, index);
  return index;
}

export const emptyNodes = (): NodeMap => {
  const history = OrderedMap<unknown, SecurityNode>();
  return fromIndex({ history, current: history });
};

/** Look up any security, including one that has been removed. */
export const securityById = (nodes: NodeMap, id: unknown): SecurityNode | undefined => {
  const index = indexes.get(nodes);
  return index ? index.history.get(id) : nodes.security.get(id);
};

/** Iterate in issuance order. Use the smaller index when only outstanding records are needed. */
export const securityRecords = (nodes: NodeMap, scope: keyof SecurityIndex | "outstanding"): Iterable<SecurityNode> => {
  const index = indexOf(nodes);
  return scope === "outstanding" ? index.current.valueSeq().filter(isOutstanding) : index[scope].values();
};

/** Record the value and its writer. Preserve earlier failures on this field. */
export const written = <T>(value: T | undefined, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = PoolTransaction;

/** Identify the transaction by type and ID. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/**
 * Apply writes when the checks allow them. Otherwise keep each affected value and attach the failing
 * transaction or the earlier failures that blocked it.
 */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly roots: readonly Subject[]; readonly invalidReplacement?: true };

const APPLY: Verdict = { ok: true };

/** Keep each failed transaction once, in the order it was encountered. */
export function addRoot(roots: Subject[], root: Subject): void {
  if (!roots.some((held) => held.object_type === root.object_type && held.id === root.id)) roots.push(root);
}

export function markDefects<F extends Field<unknown>>(field: F, roots: readonly Subject[]): F {
  const defects = [...field.defects];
  for (const root of roots) addRoot(defects, root);
  return defects.length === field.defects.length ? field : { ...field, defects };
}

/** A failed issuance makes both its details and lifecycle uncertain. */
const markIssuanceDefects = <N extends Pick<SecurityNode, "lifecycle" | "issuance">>(node: N, roots: readonly Subject[]): N => ({
  ...node,
  lifecycle: markDefects(node.lifecycle, roots),
  issuance: markDefects(node.issuance, roots),
});

const unknown = (defects: readonly Subject[] = []): Field<never> => ({ value: undefined, writer: undefined, defects });

const withheldFields = (node?: SecurityNode): WithheldIssuance => ({
  lifecycle: unknown(node?.lifecycle.defects),
  issuance: unknown(node?.issuance.defects),
});

/** Each write shares the unchanged branches of both ordered indexes. */
export const withPlanMap = (nodes: NodeMap, plan: NodeMap["plan"]) => fromIndex(indexOf(nodes), plan);

export function withSecurity(nodes: NodeMap, node: SecurityNode): NodeMap {
  const index = indexOf(nodes);
  return fromIndex({
    history: index.history.set(node.id, node),
    current: isCurrent(node) ? index.current.set(node.id, node) : index.current.remove(node.id),
  }, nodes.plan);
}

/** Find the families this transaction can act on. */
const familiesOf = (descriptor: Descriptor): readonly CollectionKey[] =>
  "collection" in descriptor ? [descriptor.collection] : descriptor.families;

/**
 * Apply issuance and removal by family. On failure keep the last known values and mark the affected
 * fields. A failed first issuance creates an unknown record so later checks can point back to it. A
 * failed transaction on an existing security can leave its lifecycle uncertain.
 */
export function applyTransaction(
  nodes: NodeMap,
  descriptor: Descriptor,
  transaction: Applied,
  verdict: Verdict = APPLY,
): NodeMap {
  const writer = subjectOf(transaction);
  const next = verdict.ok ? applied(nodes, descriptor, transaction, writer) : withheld(nodes, descriptor, transaction, verdict.roots);
  return poolWrites(nodes, next, descriptor, transaction, verdict.ok ? { ok: true, writer } : verdict);
}

function applied(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, writer: Subject): NodeMap {

  if (descriptor.effect === "append") {
    const index = indexOf(nodes);
    const held = index.history.get(transaction.security_id);
    if (held?.issuance.value !== undefined) return nodes;
    const family = descriptor.collection;
    const previous = held?.family === family ? held : held?.withheldByFamily?.[family];
    let withheldByFamily = held?.withheldByFamily;
    if (held && held.family !== family) {
      // The applied family now owns the record. Keep the former family's unknown fields for its readers.
      const { [family]: _applied, ...others } = withheldByFamily ?? {};
      withheldByFamily = { ...others, [held.family]: withheldFields(held) };
    }
    // The descriptor selects the family for the parsed issuance. TypeScript needs that relationship
    // stated here.
    const node = {
      ...(held?.family === family && held),
      kind: "security",
      id: transaction.security_id,
      family,
      lifecycle: written<LifecycleState>("outstanding", writer, previous?.lifecycle),
      issuance: written(transaction as unknown as Issuance, writer, previous?.issuance),
      ...(withheldByFamily && { withheldByFamily }),
    } as SecurityNode;
    return withSecurity(nodes, node);
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    const removed = withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer, node.lifecycle));
    return withSecurity(nodes, transaction.date === undefined ? removed : {
      ...removed, removal: written({ id: transaction.id, date: transaction.date }, writer),
    });
  }

  return nodes;
}

/** Mark the fields affected by a transaction that could not be applied. */
function withheld(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, roots: readonly Subject[]): NodeMap {
  if (!("security_id" in transaction)) return nodes;
  const held = securityById(nodes, transaction.security_id);

  if (descriptor.effect === "append") {
    // A duplicate cannot change an already issued security.
    if (held?.issuance.value !== undefined) return nodes;
    const family = descriptor.collection;
    if (held && held.family !== family) {
      const fields = held.withheldByFamily?.[family] ?? withheldFields();
      return withSecurity(nodes, {
        ...held,
        withheldByFamily: { ...held.withheldByFamily, [family]: markIssuanceDefects(fields, roots) },
      });
    }
    const node: SecurityNode = held ?? {
      kind: "security",
      id: transaction.security_id,
      family,
      ...withheldFields(),
    };
    return withSecurity(nodes, markIssuanceDefects(node, roots));
  }

  // Subsequent transactions cannot undo an applied removal.
  if (descriptor.lifecycle === "after removal" || !held || held.lifecycle.value === "removed") return nodes;
  let updated = held;
  for (const family of familiesOf(descriptor)) {
    if (family === held.family) {
      const lifecycle = markDefects(held.lifecycle, roots);
      if (lifecycle !== held.lifecycle) updated = { ...updated, lifecycle };
    } else {
      const fields = held.withheldByFamily?.[family];
      if (!fields) continue;
      const lifecycle = markDefects(fields.lifecycle, roots);
      if (lifecycle !== fields.lifecycle) {
        updated = { ...updated, withheldByFamily: { ...updated.withheldByFamily, [family]: { ...fields, lifecycle } } };
      }
    }
  }
  return updated === held ? nodes : withSecurity(nodes, updated);
}

// Reading tracked fields

/**
 * Identify the security family, ID and field a check needs. The field definition determines the
 * returned value's type.
 */
type Address<N, F> = { readonly kind: "security"; readonly family: F; readonly id: unknown; readonly field: FieldKey<N> };
type SecurityRef = { [C in CollectionKey]: Address<SecurityNode<C>, C> }[CollectionKey]
  | Address<SecurityNode, undefined>;
type PlanRef = { readonly kind: "plan"; readonly id: unknown; readonly field: FieldKey<PlanNode> };
export type FieldRef = SecurityRef | PlanRef;
type Referent<R extends FieldRef> = R extends PlanRef ? PlanNode :
  R extends { family: infer C extends CollectionKey } ? SecurityNode<C> : SecurityNode;
export type FieldRefValue<R extends FieldRef> = FieldValue<Referent<R>, Extract<R["field"], FieldKey<Referent<R>>>>;

export function securityField<C extends CollectionKey | undefined, P extends FieldKey<SecurityNode<C extends CollectionKey ? C : CollectionKey>>>(
  family: C, id: unknown, field: P,
) {
  return { kind: "security", family, id, field } as const;
}

export function planField<P extends FieldKey<PlanNode>>(id: unknown, field: P) {
  return { kind: "plan", id, field } as const;
}

export function fieldAt<R extends FieldRef>(nodes: NodeMap, ref: R, removals?: OcfMachineContext["removals"]): Field<FieldRefValue<R>> | undefined {
  if (ref.kind === "plan") return nodes.plan?.get(ref.id)?.[ref.field] as Field<FieldRefValue<R>> | undefined;
  const node = securityById(nodes, ref.id);
  if (!node) return;
  const shared = ref.field === "lifecycle" || ref.field === "issuance" ? ref.field : undefined;
  if (ref.family !== undefined && node.family !== ref.family) {
    return shared ? node.withheldByFamily?.[ref.family]?.[shared] : undefined;
  }
  const fields: Partial<Record<SecurityRef["field"], Field<unknown>>> = node;
  let field = fields[ref.field];
  if (ref.family === undefined && shared && field && node.withheldByFamily) {
    for (const other of Object.values(node.withheldByFamily)) field = markDefects(field, other[shared].defects);
  }
  // Older saved records identify the applied removal by its lifecycle writer.
  if (ref.field === "removal" && !field && node.lifecycle.value === "removed") {
    const tx = removals?.get(ref.id);
    const writer = node.lifecycle.writer;
    if (tx && writer && tx.id === writer.id && tx.object_type === writer.object_type) field = written({ id: tx.id, date: tx.date }, writer);
  }
  return field as Field<FieldRefValue<R>> | undefined;
}

/** Check whether the security is currently outstanding. */
const isOutstanding = (node: SecurityNode): boolean => node.lifecycle.value === "outstanding";

// Include failed first issuances in snapshots, in their original position.
const isCurrent = (node: SecurityNode): boolean => isOutstanding(node) || (node.lifecycle.value === undefined && node.lifecycle.defects.length > 0);

/** Match the family so callers can use its issuance type. */
export const isSecurityFamily = <C extends CollectionKey>(node: SecurityNode, family: C): node is SecurityNode<C> =>
  node.family === family;

/** Find the security in its family even if removed or awaiting issuance. */
export const securityAt = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = securityById(nodes, securityId);
  return node !== undefined && isSecurityFamily(node, family) ? node : undefined;
};

/** Find an outstanding security in this family by ID. */
export const outstandingSecurity = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = securityById(nodes, securityId);
  return node !== undefined && isSecurityFamily(node, family) && isOutstanding(node) ? node : undefined;
};

/** Include all securities in this family in issuance order, including removed ones. */
export const securitiesIn = <C extends CollectionKey>(nodes: NodeMap, family: C): SecurityNode<C>[] =>
  [...securityRecords(nodes, "history")].filter((node): node is SecurityNode<C> => isSecurityFamily(node, family));

/** List a family's outstanding issuances in the order used by the original collection. */
export const outstanding = <C extends CollectionKey>(nodes: NodeMap, family: C): CollectionElement[C][] => {
  const issuances: CollectionElement[C][] = [];
  for (const node of securityRecords(nodes, "outstanding")) {
    if (isSecurityFamily(node, family) && node.issuance.value !== undefined) {
      issuances.push(node.issuance.value);
    }
  }
  return issuances;
};
