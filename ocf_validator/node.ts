import type { Subject } from "../types/finding";

/**
 * A field stores its last known value, the transaction that wrote it and any failures that make it
 * unreliable. A missing value means unknown. Initial values can have no writer.
 */
export type Field<T> = {
  readonly value: T | undefined;
  readonly writer: Subject | undefined;
  readonly defects: readonly Subject[];
};

/** Identity and tracked fields shared by security records and other record types. */
export type NodeBase<Kind extends string, State> = {
  readonly kind: Kind;
  readonly id: unknown;
} & { readonly [P in keyof State]: Field<State[P]> };

/** Create a separate ID lookup for each record type. */
export type NodeMaps<Nodes extends { readonly kind: string; readonly id: unknown }> = {
  readonly [K in Nodes["kind"]]: ReadonlyMap<unknown, Extract<Nodes, { kind: K }>>;
};

/** Select the fields whose values can change. */
export type FieldKey<N> = {
  [P in keyof N]-?: NonNullable<N[P]> extends Field<unknown> ? P : never;
}[keyof N];

/** Get the value type from the field definition. */
export type FieldValue<N, P extends FieldKey<N>> = NonNullable<N[P]> extends Field<infer V> ? V : never;

/** Preserve the field's value type, including when it may be missing. */
export const readNodeField = <N, P extends FieldKey<N>>(node: N, field: P): N[P] => node[field];

// Select a specific family before writing a value that only that family accepts.
type FieldWrite<N, P extends keyof N> =
  (N extends unknown ? (value: N[P]) => void : never) extends (value: infer V) => void ? V : never;

/** Return a copy with one updated field and the same identity. */
export const withNodeField = <N, P extends FieldKey<N>>(node: N, field: P, value: NoInfer<FieldWrite<N, P>>): N =>
  ({ ...node, [field]: value });
