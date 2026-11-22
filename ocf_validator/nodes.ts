import { OrderedMap } from "immutable";
import type { OcfMachineContext } from "../types/validator";
import type { Subject } from "../types/finding";
import { readNodeField, withNodeField, type Field, type NodeBase, type NodeMaps } from "./node";
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
 * Store each security's family, original issuance and lifecycle. A failed first issuance leaves both
 * values unknown and records the failure on both fields.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
  /** Set once, when a removal succeeds. */
  removal?: { id: string; date: string };
};

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

/** Securities keyed by security_id, including removed securities, in issuance order. */
export type NodeMap = NodeMaps<SecurityNode>;

type SecurityMap = OrderedMap<unknown, SecurityNode>;
type SecurityIndex = { history: SecurityMap; current: SecurityMap };
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
const written = <T>(value: T, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** Fields the reducer needs to decide what to update. It retains the complete issuance. */
type Applied = { object_type: string; id: string; security_id?: unknown; date?: string };

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

/** Keep each failed transaction once, in the order it was encountered. */
export function addRoot(roots: Subject[], root: Subject): void {
  if (!roots.some((held) => held.object_type === root.object_type && held.id === root.id)) roots.push(root);
}

function markDefects<F extends Field<unknown>>(field: F, roots: readonly Subject[]): F {
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
const withSecurity = (index: SecurityIndex, node: SecurityNode): NodeMap => fromIndex({
  history: index.history.set(node.id, node),
  current: isCurrent(node) ? index.current.set(node.id, node) : index.current.remove(node.id),
});

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
      kind: "security",
      id: transaction.security_id,
      family,
      lifecycle: written<LifecycleState>("outstanding", writer, previous?.lifecycle),
      issuance: written(transaction as unknown as Issuance, writer, previous?.issuance),
      ...(withheldByFamily && { withheldByFamily }),
    } as SecurityNode;
    return withSecurity(index, node);
  }

  if (descriptor.effect === "remove") {
    const node = outstandingSecurity(nodes, descriptor.collection, transaction.security_id);
    if (node === undefined) return nodes;
    const removed = withNodeField(node, "lifecycle", written<LifecycleState>("removed", writer, node.lifecycle));
    return withSecurity(indexOf(nodes), transaction.date === undefined ? removed : {
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
      return withSecurity(indexOf(nodes), {
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
    return withSecurity(indexOf(nodes), markIssuanceDefects(node, roots));
  }

  // Subsequent transactions cannot undo an applied removal.
  if (!held || held.lifecycle.value === "removed") return nodes;
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
  return updated === held ? nodes : withSecurity(indexOf(nodes), updated);
}

// Reading tracked fields

/**
 * Identify the security family, ID and field a check needs. The field definition determines the
 * returned value's type.
 */
export type FieldRef = {
  readonly kind: "security";
  readonly family?: CollectionKey;
  readonly id: unknown;
  readonly field: keyof SecurityState<CollectionKey>;
};
export type FieldRefValue<R extends FieldRef> =
  SecurityState<R extends { family: infer C extends CollectionKey } ? C : CollectionKey>[R["field"]];

/** Omit the family restriction for checks that apply to every security ID. */
export function securityField<C extends CollectionKey | undefined, P extends FieldRef["field"]>(family: C, id: unknown, field: P) {
  return { kind: "security", family, id, field } as const;
}

export function fieldAt<R extends FieldRef>(nodes: NodeMap, ref: R, removals?: OcfMachineContext["removals"]): Field<FieldRefValue<R>> | undefined {
  const node = securityById(nodes, ref.id);
  if (!node) return;
  if (ref.family !== undefined && node.family !== ref.family) {
    return ref.field === "removal" ? undefined : node.withheldByFamily?.[ref.family]?.[ref.field];
  }
  // A check on the ID alone depends on every family that tried to issue it.
  if (ref.family === undefined && node.withheldByFamily && ref.field !== "removal") {
    let field = node[ref.field] as Field<FieldRefValue<R>>;
    for (const fields of Object.values(node.withheldByFamily)) field = markDefects(field, fields[ref.field].defects);
    return field;
  }
  // Older saved records identify the applied removal by its lifecycle writer.
  if (ref.field === "removal" && !node.removal && node.lifecycle.value === "removed") {
    const tx = removals?.get(ref.id);
    const writer = node.lifecycle.writer;
    if (tx && writer && tx.id === writer.id && tx.object_type === writer.object_type) {
      return written({ id: tx.id, date: tx.date }, writer) as Field<FieldRefValue<R>>;
    }
  }
  return readNodeField(node, ref.field) as Field<FieldRefValue<R>> | undefined;
}

/** Check whether the security is currently outstanding. */
const isOutstanding = (node: SecurityNode): boolean => node.lifecycle.value === "outstanding";

// Include failed first issuances in snapshots, in their original position.
const isCurrent = (node: SecurityNode): boolean => isOutstanding(node) || (node.lifecycle.value === undefined && node.lifecycle.defects.length > 0);

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
