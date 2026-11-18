import type { Subject } from "../types/finding";
import { withNodeField, type Field, type FieldAddress, type FieldKey, type NodeBase, type NodeMaps, type ReferenceValue } from "./node";
export type { Field, NodeBase } from "./node";
import type { PoolEffect } from "../types/validator";
import type { LifecycleState } from "./lifecycle";
import { add, isNumeric, subtract } from "./numeric";
import type { CollectionElement, CollectionKey, Descriptor } from "./ocfMachine";

// This module imports only types from `lifecycle.ts` and `ocfMachine.ts`. The
// shared checks import it, and those two modules load every validator, so a
// runtime import here would have the checks loading themselves.

// ---------------------------------------------------------------------------
// The node map (#228)
// ---------------------------------------------------------------------------
//
// Everything the run knows about the cap table is in one map of nodes. A node
// is a thing with state that transactions read and write: a security, or a
// stock plan. Stock classes and the issuer join it later (#235).
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
 *
 * Two more fields are there only once something writes them, and only an
 * equity compensation security has them (see "The stock plan pool" below):
 *
 *  - `provenance`: the transaction that named this security as its balance or
 *                  resulting security. Such a grant carries shares its source
 *                  already drew from the pool.
 *  - `draw`:       what the grant holds against a stock plan's pool.
 *
 * A transaction can name a balance or resulting security before the run
 * reaches that security's issuance. The node is created then, holding its
 * provenance and nothing else, and the issuance fills it in.
 */
export type SecurityState<C extends CollectionKey> = {
  lifecycle: LifecycleState;
  issuance: CollectionElement[C];
} & (C extends "equityCompensation" ? { provenance?: Subject; draw?: Draw } : {});

/** A discriminated union: family determines its issuance and additional fields. */
type SecuritiesByFamily = {
  [F in CollectionKey]: NodeBase<"security", SecurityState<F>> & { readonly family: F };
};
export type SecurityNode<C extends CollectionKey = CollectionKey> = SecuritiesByFamily[C];

/** What a grant holds against a stock plan's pool: the plan, and how many shares, as an OCF Numeric. */
export type Draw = { readonly plan: unknown; readonly quantity: string };

/**
 * A stock plan's pool. Both fields are OCF Numerics, kept as the strings OCF
 * writes them in and added up exactly (see `numeric.ts`).
 *
 *  - `reserved`: the shares the plan has to grant. It starts at the plan's
 *                `initial_shares_reserved`, and a pool adjustment sets it.
 *                Not known for a plan the package's stock plan files don't
 *                have, until an adjustment sets it.
 *  - `drawn`:    the shares its grants have taken. It starts at zero, a
 *                grant adds to it, and a return to pool takes from it.
 */
export type PlanState = { reserved: string; drawn: string };
export type PlanNode = NodeBase<"plan", PlanState>;

/** All concrete node kinds currently stored by the reducer. */
export type Node = SecurityNode | PlanNode;

/**
 * The node map. `security` holds every security the run has issued, removed
 * ones included, keyed by `security_id` in the order they were issued. `plan`
 * holds every stock plan the package has or a transaction has named, keyed by
 * the plan's id.
 */
export type NodeMap = NodeMaps<Node>;

/** A map with no nodes: the state before any transaction. */
export const emptyNodes = (): NodeMap => ({ security: new Map(), plan: new Map() });

/**
 * A field as a transaction writes it: the value, with that transaction as its
 * writer. Any defects on the previous field remain: a valid write
 * doesn't by itself make an unreliable field reliable. The one write that
 * does is a pool adjustment's (see `POOL_WRITES`).
 */
const written = <T>(value: T | undefined, writer: Subject, was?: Field<T>): Field<T> => ({ value, writer, defects: was?.defects ?? [] });

/** The slice of a transaction the reducer reads. Everything else it carries goes into the node unread. */
type Applied = {
  object_type: string;
  id: string;
  security_id?: unknown;
  stock_plan_id?: unknown;
  quantity?: unknown;
  shares_reserved?: unknown;
  balance_security_id?: unknown;
  resulting_security_ids?: unknown;
};

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
 *
 * A transaction with a `pool` word also writes a stock plan's pool, or has
 * those writes withheld and marked the same way: see "The stock plan pool".
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

/** The map after a valid transaction's writes to its security: see `applyTransaction`. */
function applied(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, writer: Subject): NodeMap {
  if (descriptor.effect === "append") {
    const held = nodes.security.get(transaction.security_id);
    // The descriptor supplies the family for this parsed issuance. Bridge
    // that runtime pairing to the discriminated union at this boundary.
    const node = {
      // A node created when the security was named as a balance or resulting
      // security, or left by an earlier issuance of the same id, keeps what
      // it knows of the pool.
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

/** A security nothing is known about yet: the node a failed issuance or an early naming creates. */
function blankSecurity<C extends CollectionKey>(id: unknown, family: C): SecurityNode<C>;
function blankSecurity(id: unknown, family: CollectionKey): SecurityNode {
  return { kind: "security", id, family, lifecycle: unknown<LifecycleState>(), issuance: unknown<never>() };
}

/** The map after a transaction whose writes to its security are withheld: see `applyTransaction`. */
function withheld(nodes: NodeMap, descriptor: Descriptor, transaction: Applied, roots: readonly Subject[]): NodeMap {
  if (!("security_id" in transaction)) return nodes;
  const held = nodes.security.get(transaction.security_id);

  if (descriptor.effect === "append") {
    // The issuance would have replaced whatever holds its security_id, of
    // whichever family.
    const node = held ?? blankSecurity(transaction.security_id, descriptor.collection);
    return withSecurity(nodes, markIssuanceDefects(node, roots));
  }

  // A return to pool acts on a security that's already removed. It reads the
  // security and writes the plan, so its failure leaves the security alone.
  if (descriptor.lifecycle === "after removal") return nodes;

  if (held === undefined || !familiesOf(descriptor).includes(held.family)) return nodes;
  return withSecurity(nodes, { ...held, lifecycle: markDefects(held.lifecycle, roots) });
}

// ---------------------------------------------------------------------------
// The stock plan pool (#235)
// ---------------------------------------------------------------------------
//
// A plan's `drawn` is what its grants have taken from its pool. The rule:
//
//  - A grant draws its quantity once, at its first issuance.
//  - A grant another transaction names as its balance or resulting security
//    adds nothing. It carries shares its source already drew: a partial
//    cancellation's balance grant, or the grants a transfer results in.
//  - Removing a grant takes nothing back. Only a return to pool reduces
//    `drawn`.
//  - A grant with no `stock_plan_id` touches no pool.
//
// "Names" runs both ways in time, and the reducer never looks ahead. A balance
// grant is usually issued earlier the same day than the cancellation that
// names it, so it has drawn by the time it's named: the naming takes that
// draw back. If the cancellation comes first, it leaves a node holding the
// provenance, and the issuance finds it there and draws nothing. Either way
// the day ends with the same number, and the pool is only ever judged on the
// end-of-day state.
//
// Each descriptor declares its part in this as its `pool` word:
//
//  - "draws":    a grant. Adds to `drawn`.
//  - "carries":  a removal that can name a balance or resulting grant.
//  - "returns":  a return to pool. Takes from `drawn`.
//  - "reserves": a pool adjustment. Sets `reserved`.
//
// A transaction whose writes are withheld marks the pool fields it would
// have written, like any other field: a failed grant marks its plan's
// `drawn`, and a failed pool adjustment marks the plan's `reserved`.
//
// A valid pool adjustment clears defects on `reserved`, because it sets the
// figure outright. Nothing clears `drawn`, which is a running total (see
// `POOL_WRITES`).

/** How a write is made: under the transaction's name, or withheld and marked with the roots. */
type Stamp = { readonly ok: true; readonly writer: Subject } | { readonly ok: false; readonly roots: readonly Subject[] };

/** A field after a transaction's write of `value` to it: written, or left as it was and marked. */
const stamped = <T>(field: Field<T> | undefined, value: T | undefined, by: Stamp): Field<T> =>
  by.ok ? written(value, by.writer, field) : markDefects(field ?? unknown<T>(), by.roots);

/**
 * How each `pool` word writes its field, which decides what a valid write
 * does to defects already on it:
 *
 *  - "sets":    the new value is the transaction's own figure and owes
 *               nothing to the old one. A valid write of this kind makes the
 *               field trustworthy again from that point on, so it clears the
 *               defects. Without this, one bad pool adjustment would block the
 *               plan's pool check for the rest of the run, even after a clean
 *               adjustment replaced the figure.
 *  - "adjusts": the new value is the old one moved by the transaction's
 *               quantity. If the old one couldn't be trusted, neither can the
 *               new one, so the defects stay. Nothing clears `drawn`.
 */
export const POOL_WRITES = {
  draws: { field: "drawn", write: "adjusts" },
  carries: { field: "drawn", write: "adjusts" },
  returns: { field: "drawn", write: "adjusts" },
  reserves: { field: "reserved", write: "sets" },
} as const satisfies Record<PoolEffect, { field: FieldKey<PlanNode>; write: "sets" | "adjusts" }>;

/**
 * A pool field after a transaction's write of `value` under the `pool` word
 * `word`: withheld and marked if the transaction isn't valid, and otherwise
 * written, with or without the defects it had, as `POOL_WRITES` says.
 */
const settled = (field: Field<string>, value: () => string, by: Stamp, word: PoolEffect): Field<string> => {
  if (!by.ok) return markDefects(field, by.roots);
  return POOL_WRITES[word].write === "sets" ? { value: value(), writer: by.writer, defects: [] } : written(value(), by.writer, field);
};

const ZERO = "0";

/** A plan's node, or the node a plan the map doesn't hold yet starts with: nothing drawn, and its reserve not known. */
const planAt = (nodes: NodeMap, id: unknown): PlanNode =>
  nodes.plan.get(id) ?? { kind: "plan", id, reserved: unknown(), drawn: { value: ZERO, writer: undefined, defects: [] } };

/** A new map with `plan` in it, sharing every other node with `nodes`. */
const withPlan = (nodes: NodeMap, plan: PlanNode): NodeMap => ({ ...nodes, plan: new Map(nodes.plan).set(plan.id, plan) });

/** Whether a transaction names something in an id field: the field is there and isn't null. */
const names = (id: unknown): boolean => id !== undefined && id !== null;

/**
 * The map with a plan node for each stock plan in the package's stock plan
 * files, added to `nodes`. The run starts here: `reserved` is the plan's
 * `initial_shares_reserved`, written by no transaction, and nothing is drawn.
 *
 * The stock plan files aren't validated before the run (#234). A plan with no
 * usable `initial_shares_reserved` starts with its reserve not known, and an
 * entry that isn't a plan object is passed over.
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

/** The transaction's writes to the pool, by its descriptor's `pool` word. `before` is the map as the transaction found it. */
function poolWrites(before: NodeMap, nodes: NodeMap, descriptor: Descriptor, transaction: Applied, by: Stamp): NodeMap {
  switch (descriptor.pool) {
    case "draws":
      return drawn(before, nodes, transaction, by);
    case "carries":
      return "collection" in descriptor && descriptor.collection === "equityCompensation" ? carried(nodes, transaction, by) : nodes;
    case "returns":
      return adjusted(nodes, transaction.stock_plan_id, transaction.quantity, subtract, by, "returns");
    case "reserves":
      return reserved(nodes, transaction, by);
    default:
      return nodes;
  }
}

/** A plan's `drawn` moved by `quantity`, up with `add` or down with `subtract`, for the `pool` word `word`. */
function adjusted(nodes: NodeMap, planId: unknown, quantity: unknown, move: typeof add, by: Stamp, word: PoolEffect): NodeMap {
  if (!names(planId)) return nodes;
  const plan = planAt(nodes, planId);
  const moved = () => {
    // A valid transaction's quantity has passed its check. One that hasn't is
    // a fault in the validator, not in the package.
    if (!by.ok || !isNumeric(quantity)) throw new Error(`A transaction reached stock plan ${String(planId)}'s pool with a quantity that isn't a Numeric.`);
    return move(plan.drawn.value ?? ZERO, quantity);
  };
  return withPlan(nodes, withNodeField(plan, POOL_WRITES[word].field, settled(plan[POOL_WRITES[word].field], moved, by, word)));
}

/** A grant's draw on its plan, if it makes one: see the rule above. */
function drawn(before: NodeMap, nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  if (!names(transaction.stock_plan_id)) return nodes;
  const held = before.security.get(transaction.security_id);

  // Not a first issuance: a security_id that has been issued before drew then.
  if (held !== undefined && held.lifecycle.value !== undefined) return nodes;

  // Named as a balance or resulting security before it was issued: it carries
  // shares already drawn.
  const provenance = held !== undefined && isSecurityFamily(held, "equityCompensation") ? held.provenance : undefined;
  const inDoubt = provenance !== undefined && provenance.defects.length > 0;
  if (provenance?.value !== undefined && !inDoubt) return nodes;

  // If the naming itself failed, whether this grant draws is in doubt, and so
  // is the pool: the draw is withheld and marked with the naming's roots.
  const how: Stamp = inDoubt ? { ok: false, roots: by.ok ? provenance.defects : withRoots(by.roots, provenance.defects) } : by;

  const node = nodes.security.get(transaction.security_id);
  const marked =
    node === undefined || !isSecurityFamily(node, "equityCompensation")
      ? nodes
      : withSecurity(nodes, {
          ...node,
          draw: stamped(node.draw, { plan: transaction.stock_plan_id, quantity: transaction.quantity as string }, how),
        });
  return adjusted(marked, transaction.stock_plan_id, transaction.quantity, add, how, "draws");
}

/**
 * A removal's naming of its balance and resulting grants. Each gets its
 * provenance, and gives back whatever it drew on its own account.
 */
function carried(nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  const resulting = Array.isArray(transaction.resulting_security_ids) ? transaction.resulting_security_ids : [];
  const named = [...new Set([transaction.balance_security_id, ...resulting].filter(names))];
  const source = subjectOf(transaction);

  return named.reduce<NodeMap>((map, id) => {
    const held = map.security.get(id);
    // A security of another family under that id isn't the grant it names.
    if (held !== undefined && !isSecurityFamily(held, "equityCompensation")) return map;
    const node = held ?? blankSecurity(id, "equityCompensation");

    const drew = node.draw?.value;
    const gaveBack = drew !== undefined && drew.quantity !== ZERO;
    const next = withSecurity(map, {
      ...node,
      provenance: stamped(node.provenance, source, by),
      ...(gaveBack ? { draw: stamped(node.draw, { plan: drew.plan, quantity: ZERO }, by) } : {}),
    });
    return gaveBack ? adjusted(next, drew.plan, drew.quantity, subtract, by, "carries") : next;
  }, nodes);
}

/**
 * A pool adjustment's write of the plan's `reserved`. It sets the figure, so
 * a valid one leaves the field with no defects (see `POOL_WRITES`); a failed
 * one is withheld and marked like any other write.
 */
function reserved(nodes: NodeMap, transaction: Applied, by: Stamp): NodeMap {
  if (!names(transaction.stock_plan_id)) return nodes;
  const plan = planAt(nodes, transaction.stock_plan_id);
  const figure = () => transaction.shares_reserved as string;
  return withPlan(nodes, withNodeField(plan, POOL_WRITES.reserves.field, settled(plan.reserved, figure, by, "reserves")));
}

// ---------------------------------------------------------------------------
// Reading a field
// ---------------------------------------------------------------------------

/**
 * The address of one field of one node: what a check declares it reads. A
 * security is addressed with its family, since a security of another family
 * under the same id is a different security. A stock plan is addressed by its
 * id alone.
 *
 * Addresses and value types are derived from the concrete node definitions.
 */
export type FieldRef = FieldAddress<Node>;
export type FieldRefValue<R extends FieldRef> = ReferenceValue<Node, R>;

/** The address of a field of the security of `family` with this `security_id`. */
export function securityField<C extends CollectionKey, P extends FieldKey<SecurityNode<C>>>(
  family: C, id: unknown, field: P,
): Extract<FieldRef, { kind: "security"; family: C; field: P }> {
  return { kind: "security", family, id, field } as Extract<FieldRef, { kind: "security"; family: C; field: P }>;
}

/** The address of a field of the stock plan with this id. */
export function planField<P extends FieldKey<PlanNode>>(id: unknown, field: P): Extract<FieldRef, { kind: "plan"; field: P }> {
  return { kind: "plan", id, field } as Extract<FieldRef, { kind: "plan"; field: P }>;
}

/** Whether two addresses are of the same field of the same node. */
export const sameField = (a: FieldRef, b: FieldRef): boolean =>
  a.kind === b.kind &&
  a.id === b.id &&
  a.field === b.field &&
  (a.kind !== "security" || b.kind !== "security" || a.family === b.family);

/** The field at an address, or `undefined` if the map holds no such node. */
export const fieldAt = <R extends FieldRef>(nodes: NodeMap, ref: R): Field<FieldRefValue<R>> | undefined => {
  const node = nodes[ref.kind].get(ref.id);
  if (node === undefined || ("family" in ref && (!("family" in node) || node.family !== ref.family))) return undefined;
  // The kind/family lookup establishes the pairing. TypeScript cannot
  // correlate a generic address with the union member selected from the map.
  const fields: Partial<Record<FieldRef["field"], Field<unknown>>> = node;
  return fields[ref.field] as Field<FieldRefValue<R>> | undefined;
};

/** An address in words, for a message: "the lifecycle of security war-1", "the shares drawn from stock plan plan-1". */
export const describeField = (ref: FieldRef): string => {
  if (ref.kind === "security") return `the ${ref.field} of security ${show(ref.id)}`;
  return ref.field === "drawn" ? `the shares drawn from stock plan ${show(ref.id)}` : `the shares reserved for stock plan ${show(ref.id)}`;
};

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

/** A stored security of the requested family, including removed and provisional nodes. */
export const securityAt = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = nodes.security.get(securityId);
  return node !== undefined && isSecurityFamily(node, family) ? node : undefined;
};

/** The outstanding security under this id, narrowed to the requested family. */
export const outstandingSecurity = <C extends CollectionKey>(nodes: NodeMap, family: C, securityId: unknown): SecurityNode<C> | undefined => {
  const node = securityAt(nodes, family, securityId);
  return node !== undefined && isOutstanding(node) ? node : undefined;
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
