import type { Subject } from "../types/finding";
import { withNodeField, type Field, type NodeBase, type NodeMaps } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// This module imports only types from `lifecycle.ts` and `ocfMachine.ts`. The
// shared checks import it, and those two modules load every validator, so a
// runtime import here would have the checks loading themselves.

// ---------------------------------------------------------------------------
// The node map (#228)
// ---------------------------------------------------------------------------
//
// Everything the run knows about the cap table is in one map of nodes. A node
// is a thing with state that transactions read and write. Today that is a
// security; stock classes, stock plans, and the issuer join it later (#235).
//
// A node is addressed by its kind and its id. The kind is part of the address
// because OCF doesn't promise that a security_id differs from every stock
// plan's or stock class's id, and two nodes that shared a key would silently
// become one.
//
// A node's state is held field by field. Each field has its value, the
// transaction that last wrote it, and its taint. Keeping these per field is
// what later lets a check that reads one field run while another field of the
// same node is unreliable.
//
// The map is immutable. A write returns a new map that shares every node it
// didn't change, so keeping one map per day costs one small index, and a
// reader holding an earlier map never sees it move.
//
// A removed security stays in the map with its lifecycle set to removed. A
// later transaction that names it can then be told it was removed and by
// what, and a return to pool can read the grant it returns.

/** The issuance record of a security of any family. */
export type Issuance = CollectionElement[CollectionKey];

/**
 * A security: one issuance and what has become of it since.
 *
 *  - `family`:    which of the four families it was issued in, named by the
 *                 family's collection key.
 *  - `lifecycle`: where it is in its life (see `lifecycle.ts`). Written by its
 *                 issuance and by whatever removes it.
 *  - `issuance`:  the issuance transaction itself: its stakeholder, quantity,
 *                 and so on. Written once, by the issuance.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
};

/** A discriminated union: family determines the issuance payload. */
type SecuritiesByFamily = {
  [F in CollectionKey]: NodeBase<"security", SecurityState<F>> & { readonly family: F };
};
export type SecurityNode<C extends CollectionKey = CollectionKey> = SecuritiesByFamily[C];

/**
 * The node map. `security` holds every security the run has issued, removed
 * ones included, keyed by `security_id` in the order they were issued.
 */
export type NodeMap = NodeMaps<SecurityNode>;

/** A map with no nodes: the state before any transaction. */
export const emptyNodes = (): NodeMap => ({ security: new Map() });

/** A field as a transaction writes it: the value, with that transaction as its writer. */
const written = <T>(value: T, writer: Subject): Field<T> => ({ value, writer, taint: [] });

/** The slice of a transaction the reducer reads. Everything else it carries goes into the node unread. */
type Applied = { object_type: string; id: string; security_id?: unknown };

/** A transaction, located the way a finding's subject is. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/**
 * A new map with `node` in it, sharing every other node with `nodes`.
 *
 * `last` moves the node to the end of the order. An issuance does that, so a
 * security_id issued again after it was removed sits where the newer issuance
 * belongs, as it did when issuances were appended to an array.
 */
const withSecurity = (nodes: NodeMap, node: SecurityNode, { last = false } = {}): NodeMap => {
  const security = new Map(nodes.security);
  if (last) security.delete(node.id);
  security.set(node.id, node);
  return { ...nodes, security };
};

/**
 * The reducer: the map that results from applying one valid transaction.
 * Pure. It returns `nodes` itself when the transaction changes nothing.
 *
 * What a transaction does is its descriptor's `effect`:
 *
 *  - "append": issues the security. Its node is written whole: outstanding,
 *    holding the issuance. A security_id issued again replaces the node that
 *    was there.
 *  - "remove": sets the security's lifecycle to removed. The node stays. It
 *    acts only on an outstanding security of its own family, as filtering a
 *    family's collection did.
 *  - "none" and "passthrough": change nothing.
 */
export function applyTransaction(nodes: NodeMap, descriptor: Descriptor, transaction: Applied): NodeMap {
  const writer = subjectOf(transaction);

  if (descriptor.effect === "append") {
    // The dispatch descriptor supplies the family for this parsed issuance.
    // Bridge that runtime pairing to the discriminated union at this boundary.
    const node = {
      kind: "security",
      id: transaction.security_id,
      family: descriptor.collection,
      lifecycle: written<LifecycleState>("outstanding", writer),
      issuance: written(transaction as unknown as Issuance, writer),
    } as SecurityNode;
    return withSecurity(nodes, node, { last: true });
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    return withSecurity(nodes, withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer)));
  }

  return nodes;
}

/** Whether a security is outstanding: issued, and not removed. */
const isOutstanding = (node: SecurityNode): boolean => node.lifecycle.value === "outstanding";

/** Narrow a stored security by its family discriminator. */
export const isSecurityFamily = <C extends CollectionKey>(node: SecurityNode, family: C): node is SecurityNode<C> =>
  node.family === family;

/** The outstanding security under this id, narrowed to the requested family. */
export const outstandingSecurity = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = nodes.security.get(securityId);
  return node !== undefined && isSecurityFamily(node, family) && isOutstanding(node) ? node : undefined;
};

/** Every security of a family the map holds, removed ones included, in the order issued. */
export const securitiesIn = <C extends CollectionKey>(nodes: NodeMap, family: C): SecurityNode<C>[] =>
  [...nodes.security.values()].filter((node): node is SecurityNode<C> => isSecurityFamily(node, family));

/**
 * The issuances of a family's outstanding securities, in the order issued:
 * what the context's collection of that name held before the node map.
 */
export const outstanding = <C extends CollectionKey>(nodes: NodeMap, family: C): CollectionElement[C][] => {
  const issuances: CollectionElement[C][] = [];
  for (const node of securitiesIn(nodes, family)) {
    if (isOutstanding(node) && node.issuance.value !== undefined) {
      issuances.push(node.issuance.value);
    }
  }
  return issuances;
};
