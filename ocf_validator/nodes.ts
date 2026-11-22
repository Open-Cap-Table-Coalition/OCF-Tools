import { OrderedMap } from "immutable";
import type { Subject } from "../types/finding";
import { withNodeField, type Field, type NodeBase, type NodeMaps } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// Import only types from the chart and machine here. Both load validators that already import this
// module.

// Look up securities by ID and keep removed records so later checks can explain what happened. Each
// field records its own value and writer. Index updates share unchanged records with earlier states.

/** Issuance transaction for any of the four security families. */
export type Issuance = CollectionElement[CollectionKey];

/**
 * Keep the original issuance and current lifecycle together. The family determines which issuance
 * fields callers can read.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
};

/** The family determines the type of the stored issuance. */
type SecuritiesByFamily = {
  [F in CollectionKey]: NodeBase<"security", SecurityState<F>> & { readonly family: F };
};
export type SecurityNode<C extends CollectionKey = CollectionKey> = SecuritiesByFamily[C];

/** Securities keyed by security_id, including removed securities, in issuance order. */
export type NodeMap = NodeMaps<SecurityNode>;

type SecurityMap = OrderedMap<unknown, SecurityNode>;
type SecurityIndex = { history: SecurityMap; outstanding: SecurityMap };
const indexes = new WeakMap<NodeMap, SecurityIndex>();

/** Keep the public native map available for callers and structuredClone. */
function fromIndex(index: SecurityIndex): NodeMap {
  let history: ReadonlyMap<unknown, SecurityNode> | undefined;
  const nodes = {
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
  const index = { history, outstanding: history.filter(isOutstanding) };
  indexes.set(nodes, index);
  return index;
}

export const emptyNodes = (): NodeMap => {
  const history = OrderedMap<unknown, SecurityNode>();
  return fromIndex({ history, outstanding: history });
};

/** Look up any security, including one that has been removed. */
export const securityById = (nodes: NodeMap, id: unknown): SecurityNode | undefined => {
  const index = indexes.get(nodes);
  return index ? index.history.get(id) : nodes.security.get(id);
};

/** Iterate in issuance order. Use the smaller index when only outstanding records are needed. */
export const securityRecords = (nodes: NodeMap, scope: keyof SecurityIndex): Iterable<SecurityNode> =>
  indexOf(nodes)[scope].values();

/** Record the new value and the transaction that supplied it. */
const written = <T>(value: T, writer: Subject): Field<T> => ({ value, writer, defects: [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = { object_type: string; id: string; security_id?: unknown };

/** Identify the transaction by type and ID. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/** Each write shares the unchanged branches of both ordered indexes. */
const withSecurity = (index: SecurityIndex, node: SecurityNode): NodeMap => fromIndex({
  history: index.history.set(node.id, node),
  outstanding: isOutstanding(node) ? index.outstanding.set(node.id, node) : index.outstanding.remove(node.id),
});

/**
 * Apply a valid transaction to its family's securities. Issuance stores the record, removal updates
 * its lifecycle and other effects preserve the map. Keep removed records so checks can identify the
 * transaction responsible.
 */
export function applyTransaction(nodes: NodeMap, descriptor: Descriptor, transaction: Applied): NodeMap {
  const writer = subjectOf(transaction);

  if (descriptor.effect === "append") {
    const index = indexOf(nodes);
    if (index.history.has(transaction.security_id)) return nodes;
    // The descriptor selects the family for the parsed issuance. TypeScript needs that relationship
    // stated here.
    const node = {
      kind: "security",
      id: transaction.security_id,
      family: descriptor.collection,
      lifecycle: written<LifecycleState>("outstanding", writer),
      issuance: written(transaction as unknown as Issuance, writer),
    } as SecurityNode;
    return withSecurity(index, node);
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    return withSecurity(indexOf(nodes), withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer)));
  }

  return nodes;
}

/** Check whether the security is currently outstanding. */
const isOutstanding = (node: SecurityNode): boolean => node.lifecycle.value === "outstanding";

/** Match the family so callers can use its issuance type. */
export const isSecurityFamily = <C extends CollectionKey>(node: SecurityNode, family: C): node is SecurityNode<C> =>
  node.family === family;

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
