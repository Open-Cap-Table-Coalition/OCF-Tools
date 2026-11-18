import type { Subject } from "../types/finding";

/**
 * One field of a node.
 *
 *  - `value`:  what the field holds. `undefined` means not known.
 *  - `writer`: the transaction that last wrote the value, located the way a
 *              finding's subject is. `undefined` for a value no transaction
 *              wrote.
 *  - `taint`:  the transactions whose failure leaves this field unreliable.
 *              Empty for a field that can be trusted. Nothing taints a field
 *              yet (#231).
 */
export type Field<T> = {
  readonly value: T | undefined;
  readonly writer: Subject | undefined;
  readonly taint: readonly Subject[];
};

/** Common identity and tracked state for every kind of cap-table node. */
export type NodeBase<Kind extends string, State> = {
  readonly kind: Kind;
  readonly id: unknown;
} & { readonly [P in keyof State]: Field<State[P]> };

/** One map per node kind, derived from the concrete node definitions. */
export type NodeMaps<Nodes extends { readonly kind: string; readonly id: unknown }> = {
  readonly [K in Nodes["kind"]]: ReadonlyMap<unknown, Extract<Nodes, { kind: K }>>;
};

/** Only tracked state fields, excluding node identity and discriminators. */
export type FieldKey<N> = {
  [P in keyof N]-?: NonNullable<N[P]> extends Field<unknown> ? P : never;
}[keyof N];

/** The value a tracked field holds, derived from its node's definition. */
export type FieldValue<N, P extends FieldKey<N>> = NonNullable<N[P]> extends Field<infer V> ? V : never;

/** Read a declared field without erasing its value type or optionality. */
export const readNodeField = <N, P extends FieldKey<N>>(node: N, field: P): N[P] => node[field];

// For a union node, a write must fit every possible variant. Narrow the
// family before replacing a family-specific field such as its issuance.
type FieldWrite<N, P extends keyof N> =
  (N extends unknown ? (value: N[P]) => void : never) extends (value: infer V) => void ? V : never;

/** Replace one tracked field, sharing all others. Identity is never a field write. */
export const withNodeField = <N, P extends FieldKey<N>>(node: N, field: P, value: NoInfer<FieldWrite<N, P>>): N =>
  ({ ...node, [field]: value });
