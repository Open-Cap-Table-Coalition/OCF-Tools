import type { Subject } from "../types/finding";
import { readNodeField, withNodeField, type Field, type FieldAddress, type FieldKey, type NodeBase, type NodeMaps, type ReferenceValue } from "./node";
export type { Field, NodeBase } from "./node";
import type { LifecycleState } from "./lifecycle";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// Import only types from the chart and machine here. Both load validators that already import this
// module.

// Keep a record for each security, including removed ones. Each field stores its last known value
// and writer. When a transaction fails, preserve those values and record which failures make each
// affected field unreliable. Later checks can still use independent fields.

/** Issuance transaction for any of the four security families. */
export type Issuance = CollectionElement[CollectionKey];

/**
 * Store each security's family, original issuance and lifecycle. A failed first issuance leaves both
 * values unknown and records the failure on both fields.
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

/** Record the value and its writer. Preserve earlier failures on this field. */
const written = <T>(value: T, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = { object_type: string; id: string; security_id?: unknown };

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
  if (!verdict.ok) return withheld(nodes, descriptor, transaction, verdict.roots);

  const writer = subjectOf(transaction);

  if (descriptor.effect === "append") {
    // The descriptor selects the family for the parsed issuance. TypeScript needs that relationship
    // stated here.
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

/** Mark the fields affected by a transaction that could not be applied. */
function withheld(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, roots: readonly Subject[]): NodeMap {
  if (!("security_id" in transaction)) return nodes;
  const held = nodes.security.get(transaction.security_id);

  if (descriptor.effect === "append") {
    // An issuance would replace the existing record under this ID.
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

// Reading tracked fields

/**
 * Identify the security family, ID and field a check needs. The field definition determines the
 * returned value's type.
 */
export type FieldRef = FieldAddress<SecurityNode>;
export type FieldRefValue<R extends FieldRef> = ReferenceValue<SecurityNode, R>;

/** Identify one field of a security within its family. */
export function securityField<C extends CollectionKey, P extends FieldKey<SecurityNode<C>>>(
  family: C, id: unknown, field: P,
): Extract<FieldRef, { kind: "security"; family: C; field: P }> {
  return { kind: "security", family, id, field } as Extract<FieldRef, { kind: "security"; family: C; field: P }>;
}

/** Look up the requested field. A missing record or optional field yields undefined. */
export const fieldAt = <R extends FieldRef>(nodes: NodeMap, ref: R): Field<FieldRefValue<R>> | undefined => {
  const node = nodes.security.get(ref.id);
  if (node === undefined || node.family !== ref.family) return undefined;
  // The family check selects the matching record. TypeScript needs the link between that record and
  // the field's value type stated here.
  return readNodeField(node, ref.field) as Field<FieldRefValue<R>>;
};

/** Name the security and field in a finding. */
export const describeField = (ref: FieldRef): string => `the ${ref.field} of security ${show(ref.id)}`;

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
