import type { TransactionFor } from "../../types/ocf-input";
import type { Finding, Subject } from "../../types/finding";
import { addRoot, fieldAt, type FieldRef, type FieldRefValue, type NodeMap } from "../nodes";
import type {
  Check,
  DeepReadonly,
  GradedValidator,
  LifecycleWord,
  OcfMachineContext,
  PoolEffect,
} from "../../types/validator";
import type { CollectionKey, TxKey } from "../validators";

/**
 * Define each check once with an ID, severity, description and optional run function. Return one
 * message per problem. Omitting run lists a known gap in coverage.
 *
 * Declare each state field the check needs in reads. The runner blocks the check if an earlier
 * failure makes one of those fields unreliable. Other checks still run. Use the supplied read
 * function for those fields. Package data is available through the context.
 *
 * Use satisfies CheckObject<P> to check the input fields and keep the inputs read-only. Declare run
 * as a function property so TypeScript checks parameter compatibility.
 */
export type CheckObject<P = unknown> = Pick<Check, "id" | "severity" | "description"> & {
  /** Run separately for each named reference so one blocked read cannot hide another failure. */
  references?: (data: DeepReadonly<P>) => readonly (string | undefined)[];
  reads?: (data: DeepReadonly<P>, context: DeepReadonly<CheckContext>, reference?: string) => readonly FieldRef[];
  run?: (context: DeepReadonly<CheckContext>, data: DeepReadonly<P>, read: ReadField, reference?: string) => string[];
};

/** Checks use declared reads for derived state. */
export type CheckContext = Pick<OcfMachineContext, "ocfPackageContent" | "removals">;

/** Read a declared field. A missing or unknown value produces undefined. An undeclared read throws. */
export type ReadField = {
  <R extends FieldRef>(ref: R): DeepReadonly<FieldRefValue<R>> | undefined;
  writer(ref: FieldRef): DeepReadonly<Subject> | undefined;
};

const show = (value: unknown): string => {
  try {
    return typeof value === "object" && value !== null && !(value instanceof Error)
      ? JSON.stringify(value) ?? "[Unserializable value]"
      : String(value);
  } catch {
    return "[Unserializable value]";
  }
};

/**
 * Message text built from package values, as a template tag:
 * text`No issuance with security_id ${id}.` Nothing checks a package against
 * the OCF schema before its values reach a message, so a value may not be the
 * string the schema promises, and interpolating an object whose own
 * `toString` isn't a function throws (#218). A string or other primitive
 * appears as it is and an error as its name and message, but any other object
 * appears as its JSON, so a malformed value reads as itself rather than as
 * "[object Object]". A value that can't be rendered (e.g. one holding a BigInt)
 * appears as "[Unserializable value]", so rendering a message never throws.
 */
export const text = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  strings.reduce((message, string, i) => message + show(values[i - 1]) + string);

/**
 * Turns a check into a declared gap by dropping its `run`. Use it when one
 * transaction performs a check and another needs the same check but doesn't
 * perform it yet. For example, cancellation runs no-other-transactions and
 * transfer only declares it. Both share one definition, so their id and wording
 * can't drift apart.
 */
export const asGap = ({ id, severity, description }: CheckObject<any>): CheckObject => ({
  id,
  severity,
  description,
});

/**
 * Declare the transaction, its checks, its security change and any pool operation. Issuances and
 * removals name a collection. Other checked transactions list their families and can require a
 * previously removed security.
 */
type Spec = { pool?: PoolEffect } & (
  | {
      transaction: TxKey;
      effect: "none";
      collection?: never;
      lifecycle?: "after removal";
      families: readonly CollectionKey[];
      checks: readonly CheckObject<any>[];
    }
  | { transaction: TxKey; effect: "append" | "remove"; collection: CollectionKey; checks: readonly CheckObject<any>[] }
);

/** Derive the usual lifecycle change from the effect so authors only specify it once. */
const LIFECYCLE_OF_EFFECT = {
  append: "issue",
  none: "stays",
  remove: "removes",
} as const satisfies Record<Spec["effect"], LifecycleWord>;

/**
 * Builds the check list the coverage report reads: each check's id, severity,
 * and description, plus `implemented: false` for a check with no `run`. Keep
 * the field order as is; the report writes it out exactly.
 */
const toMetadata = (checks: readonly CheckObject<any>[]): readonly Check[] =>
  checks.map((check) => {
    const metadata: Check = {
      id: check.id,
      severity: check.severity,
      description: check.description,
    };
    if (!check.run) metadata.implemented = false;
    return metadata;
  });

const describeField = (ref: FieldRef): string => {
  if (ref.kind === "security") return text`the ${ref.field} of security ${ref.id}`;
  return ref.field === "drawn"
    ? text`the shares drawn from stock plan ${ref.id}`
    : text`the shares reserved for stock plan ${ref.id}`;
};

const sameField = (a: FieldRef, b: FieldRef): boolean =>
  a.kind === b.kind && a.id === b.id && a.field === b.field &&
  (a.kind !== "security" || (b.kind === "security" && a.family === b.family));

/** Collect the distinct failures affecting these fields and the first affected field for the message. */
const defectsOn = (nodes: NodeMap, refs: readonly FieldRef[]): { roots: Subject[]; ref?: FieldRef } => {
  const roots: Subject[] = [];
  let first: FieldRef | undefined;
  for (const ref of refs) {
    const defects = fieldAt(nodes, ref)?.defects ?? [];
    if (defects.length > 0) first ??= ref;
    for (const root of defects) addRoot(roots, root);
  }
  return { roots, ref: first };
};

/** Format the transaction types and IDs for a finding. */
const namesOf = (roots: readonly Subject[]): string => {
  const names = roots.map((root) => text`${root.object_type} ${root.id}`);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
};

/**
 * Run implemented checks in order. Produce a failed finding for each message. A check with
 * unreliable inputs produces a blocked finding naming the earlier failures. Continue with the
 * remaining checks. A thrown exception produces an error finding.
 */
export const toValidate =
  (checks: readonly CheckObject<any>[]): GradedValidator<any> =>
  (context, data: any) => {
    const subject = { object_type: data.object_type, id: data.id };
    const { nodes, ocfPackageContent, removals } = context;
    const checkContext = { ocfPackageContent, removals };
    const findings: Finding[] = [];
    for (const check of checks) {
      if (!check.run) continue;
      const failure = (error: unknown) => {
        findings.push({ subject, check: check.id, severity: "error", outcome: "failed", message: text`The check threw ${error}` });
      };
      let references;
      try {
        references = check.references?.(data) ?? [undefined];
      } catch (error) {
        failure(error);
        continue;
      }
      for (const reference of references) {
        try {
          const refs = check.reads?.(data, checkContext, reference) ?? [];
          const { roots, ref } = defectsOn(nodes, refs);
          if (ref !== undefined) {
            const label = reference === undefined ? "Not checked" : text`Not checked for ${reference}`;
            findings.push({
              severity: check.severity, outcome: "blocked", check: check.id, subject, roots,
              message: `${label}: it reads ${describeField(ref)}, which can't be relied on because ${namesOf(roots)} failed.`,
            });
            continue;
          }
          const declaredField = <R extends FieldRef>(wanted: R) => {
            if (!refs.some((declared) => sameField(declared, wanted))) {
              throw new Error(`It read ${describeField(wanted)}, which it doesn't declare in its reads.`);
            }
            return fieldAt(nodes, wanted, removals);
          };
          const read: ReadField = Object.assign(
            <R extends FieldRef>(ref: R) => declaredField(ref)?.value as DeepReadonly<FieldRefValue<R>> | undefined,
            { writer: (ref: FieldRef) => declaredField(ref)?.writer },
          );
          for (const message of check.run(checkContext, data, read, reference)) {
            findings.push({ subject, severity: check.severity, outcome: "failed", check: check.id, message });
          }
        } catch (error) {
          failure(error);
        }
      }
    }
    return findings;
  };

/**
 * Build the validator and coverage metadata from the same checks. Keep the transaction type so the
 * table can check the validator's input and issuance family. Use the lifecycle implied by the effect
 * unless the declaration requires an already removed security.
 */
export function defineValidator<const S extends Spec>(
  spec: S & { checks: readonly CheckObject<TransactionFor<S["transaction"]>>[] },
): Defined<S> {
  const { checks, ...rest } = spec;
  return {
    lifecycle: LIFECYCLE_OF_EFFECT[spec.effect],
    ...rest,
    rules: checks,
    validate: toValidate(checks),
    checks: toMetadata(checks),
  } as Defined<S>;
}

/** Preserve the transaction and family types when adding validation and check metadata. */
type Defined<S extends Spec> = Omit<S, "checks" | "lifecycle"> & {
  rules: S["checks"];
  lifecycle: S extends { lifecycle: infer Declared extends LifecycleWord } ? Declared : (typeof LIFECYCLE_OF_EFFECT)[S["effect"]];
  validate: GradedValidator<TransactionFor<S["transaction"]>>;
  checks: readonly Check[];
};

/**
 * Reuse the current validator, checks and effects under an older OCF name. TypeScript checks that
 * the validator accepts the older payload.
 */
export function underOlderName<D extends { transaction: TxKey }, const K extends TxKey>(
  descriptor: D,
  olderName: TransactionFor<K> extends TransactionFor<D["transaction"]> ? K : never,
): Omit<D, "transaction"> & { transaction: K } {
  return { ...descriptor, transaction: olderName };
}
