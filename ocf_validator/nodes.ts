import type { Subject } from "../types/finding";
import { readNodeField, withNodeField, type Field, type FieldAddress, type FieldKey, type NodeBase, type NodeMaps, type ReferenceValue } from "./node";
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
// transaction that last wrote it, and its defects. Keeping these per field is
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
//
// A transaction that fails doesn't stop the run (#231). Its writes are
// withheld, so every field it would have written keeps the value it had, and
// each of those fields is marked with the transaction as the root. A check
// that reads a marked field can't be trusted to run, so it comes back
// blocked, naming the roots (see `toValidate` in `validators/checkKit.ts`).
// A transaction with a blocked check passes the defects on to what it writes in
// turn. Defects only ever spread: a field is never left stale and unmarked,
// and a later valid write to a marked field leaves the defects on it.

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
 *
 * A security whose issuance failed still has a node. Both fields are marked
 * and neither has a value: the validator knows something claims that
 * security_id, and nothing more.
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

/**
 * A field as a transaction writes it: the value, with that transaction as its
 * writer. Any defects on the previous field remain: a valid write
 * doesn't make an unreliable field reliable, and nothing clears defects yet.
 */
const written = <T>(value: T, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** The slice of a transaction the reducer reads. Everything else it carries goes into the node unread. */
type Applied = { object_type: string; id: string; security_id?: unknown };

/** A transaction, located the way a finding's subject is. */
const subjectOf = (transaction: Applied): Subject => ({
  object_type: transaction.object_type as Subject["object_type"],
  id: transaction.id,
});

/**
 * What a transaction's checks decided about its writes:
 *
 *  - `ok: true`:  apply them.
 *  - `ok: false`: withhold them, and mark every field they would have
 *                 written with `roots`. The roots are the transaction itself
 *                 if one of its checks failed, and whatever blocked it if one
 *                 was blocked.
 */
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly roots: readonly Subject[] };

const APPLY: Verdict = { ok: true };

/** `defects` with `roots` added, each root once. */
const withRoots = (defects: readonly Subject[], roots: readonly Subject[]): readonly Subject[] => {
  const added = roots.filter(
    (root) => !defects.some((held) => held.object_type === root.object_type && held.id === root.id),
  );
  return added.length === 0 ? defects : [...defects, ...added];
};

/** A field left as it was, and no longer to be trusted: the same value and writer, marked with `roots`. */
const markDefects = <F extends Field<unknown>>(field: F, roots: readonly Subject[]): F => ({ ...field, defects: withRoots(field.defects, roots) });

/** Mark both issuance writes while preserving their family/payload pairing. */
const markIssuanceDefects = <N extends SecurityNode>(node: N, roots: readonly Subject[]): N => ({
  ...node,
  lifecycle: markDefects(node.lifecycle, roots),
  issuance: markDefects(node.issuance, roots),
});

/** A field nothing is known about. */
const unknown = <T>(): Field<T> => ({ value: undefined, writer: undefined, defects: [] });

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

/** The families whose securities a transaction can name: its `collection`, or the `families` it lists. */
const familiesOf = (descriptor: Descriptor): readonly CollectionKey[] =>
  "collection" in descriptor ? [descriptor.collection] : descriptor.families;

/**
 * The reducer: the map that results from one transaction. Pure. It returns
 * `nodes` itself when the transaction changes nothing.
 *
 * What a valid transaction writes is its descriptor's `effect`:
 *
 *  - "append": issues the security. Its node is written whole: outstanding,
 *    holding the issuance. A security_id issued again replaces the node that
 *    was there.
 *  - "remove": sets the security's lifecycle to removed. The node stays. It
 *    acts only on an outstanding security of its own family, as filtering a
 *    family's collection did.
 *  - "none" and "passthrough": write nothing.
 *
 * A transaction whose `verdict` isn't ok writes nothing either. Every field
 * it would have written keeps its value and is marked with the verdict's
 * roots instead:
 *
 *  - "append": both fields of its security. If nothing holds that
 *    security_id, the node is created with neither value known, so a later
 *    transaction on the security finds it there and is blocked, where it
 *    would otherwise fail on a security that "doesn't exist" and report a
 *    second error for one mistake.
 *  - anything else that names a security: that security's lifecycle. A
 *    transaction that acts on a security writes where it is in its life, even
 *    one that leaves it outstanding, so when it fails that's what is in
 *    doubt. A transaction on a security the map doesn't hold in one of its
 *    families has nothing to mark.
 */
export function applyTransaction(
  nodes: NodeMap,
  descriptor: Descriptor,
  transaction: Applied,
  verdict: Verdict = APPLY,
): NodeMap {
  if (!verdict.ok) return withheld(nodes, descriptor, transaction, verdict.roots);

  const writer = subjectOf(transaction);

  if (descriptor.effect === "append") {
    // The dispatch descriptor supplies the family for this parsed issuance.
    // Bridge that runtime pairing to the discriminated union at this boundary.
    const held = nodes.security.get(transaction.security_id);
    const node = {
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

/** The map after a transaction whose writes are withheld: see `applyTransaction`. */
function withheld(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, roots: readonly Subject[]): NodeMap {
  if (!("security_id" in transaction)) return nodes;
  const held = nodes.security.get(transaction.security_id);

  if (descriptor.effect === "append") {
    // The issuance would have replaced whatever holds its security_id, of
    // whichever family.
    const node: SecurityNode = held ?? {
      kind: "security",
      id: transaction.security_id,
      family: descriptor.collection,
      lifecycle: unknown<LifecycleState>(),
      issuance: unknown<never>(),
    };
    return withSecurity(nodes, markIssuanceDefects(node, roots));
  }

  if (held === undefined || !familiesOf(descriptor).includes(held.family)) return nodes;
  return withSecurity(nodes, { ...held, lifecycle: markDefects(held.lifecycle, roots) });
}

// ---------------------------------------------------------------------------
// Reading a field
// ---------------------------------------------------------------------------

/**
 * The address of one field of one node: what a check declares it reads. A
 * security is addressed with its family, since a security of another family
 * under the same id is a different security.
 *
 * Addresses and value types are derived from the concrete node definitions.
 */
export type FieldRef = FieldAddress<SecurityNode>;
export type FieldRefValue<R extends FieldRef> = ReferenceValue<SecurityNode, R>;

/** The address of a field of the security of `family` with this `security_id`. */
export function securityField<C extends CollectionKey, P extends FieldKey<SecurityNode<C>>>(
  family: C, id: unknown, field: P,
): Extract<FieldRef, { kind: "security"; family: C; field: P }> {
  return { kind: "security", family, id, field } as Extract<FieldRef, { kind: "security"; family: C; field: P }>;
}

/** The field at an address, or `undefined` if the map holds no such node. */
export const fieldAt = <R extends FieldRef>(nodes: NodeMap, ref: R): Field<FieldRefValue<R>> | undefined => {
  const node = nodes.security.get(ref.id);
  if (node === undefined || node.family !== ref.family) return undefined;
  // The family check establishes the pairing; TypeScript cannot correlate
  // the generic address with the runtime union member selected from the map.
  return readNodeField(node, ref.field) as Field<FieldRefValue<R>>;
};

/** An address in words, for a message: "the lifecycle of security war-1". */
export const describeField = (ref: FieldRef): string => `the ${ref.field} of security ${show(ref.id)}`;

const show = (value: unknown): string => {
  try {
    return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    return "[Unserializable value]";
  }
};

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
