import type { Subject } from "../types/finding";
import { withNodeField, type Field, type NodeBase, type NodeMaps } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// Import only types from the chart and machine here. Both load validators that already import this
// module.

// Look up securities by ID and keep removed records so later checks can explain what happened. Each
// field records its own value and writer. Updates copy the map and reuse unchanged records, so
// earlier snapshots can read the earlier state.

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

/** Initial state before reading any transactions. */
export const emptyNodes = (): NodeMap => ({ security: new Map() });

/** Record the new value and the transaction that supplied it. */
const written = <T>(value: T, writer: Subject): Field<T> => ({ value, writer, defects: [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = { object_type: string; id: string; security_id?: unknown };

/** Identify the transaction by type and ID. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/** Copy the index and reuse the other records. */
const withSecurity = (nodes: NodeMap, node: SecurityNode): NodeMap => {
  const security = new Map(nodes.security);
  security.set(node.id, node);
  return { ...nodes, security };
};

/**
 * Apply a valid transaction to its family's securities. Issuance stores the record, removal updates
 * its lifecycle and other effects preserve the map. Keep removed records so checks can identify the
 * transaction responsible.
 */
export function applyTransaction(nodes: NodeMap, descriptor: Descriptor, transaction: Applied): NodeMap {
  const writer = subjectOf(transaction);

  if (descriptor.effect === "append") {
    if (nodes.security.has(transaction.security_id)) return nodes;
    // The descriptor selects the family for the parsed issuance. TypeScript needs that relationship
    // stated here.
    const node = {
      kind: "security",
      id: transaction.security_id,
      family: descriptor.collection,
      lifecycle: written<LifecycleState>("outstanding", writer),
      issuance: written(transaction as unknown as Issuance, writer),
    } as SecurityNode;
    return withSecurity(nodes, node);
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    return withSecurity(nodes, withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer)));
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
  const node = nodes.security.get(securityId);
  return node !== undefined && isSecurityFamily(node, family) && isOutstanding(node) ? node : undefined;
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
