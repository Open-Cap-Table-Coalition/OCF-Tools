import type { TransactionFor } from "../../types/ocf-input";
import type { Finding, Subject } from "../../types/finding";
import { describeField, fieldAt, type FieldRef, type FieldRefValue, type NodeMap } from "../nodes";
import type {
  Check,
  DeepReadonly,
  GradedValidator,
  LifecycleWord,
  OcfMachineContext,
  PoolEffect,
} from "../../types/validator";
import type { CollectionKey, TxKey } from "../ocfMachine";

/**
 * One validation check, written as a plain object: its id, severity, and
 * description, plus a `run` function that performs it.
 *
 * `run` returns a list of failure messages, one per problem found, or an empty
 * list if the check passes. It returns only the message text. `defineValidator`
 * fills in each finding's severity, check id, and subject from this object, so
 * a check can't get them wrong.
 *
 * A check with no `run` is a declared gap: a check we know is needed but
 * haven't written yet. The coverage report lists it as not implemented, and it
 * never produces findings.
 *
 * `P` names the transaction fields the check reads, e.g. `{ security_id: string }`.
 * Any transaction that has those fields can reuse the check, and
 * `defineValidator` won't compile a check attached to a transaction that lacks
 * them.
 *
 * `reads` declares what the check reads of the cap table's state: the fields
 * of the node map it depends on, as addresses, worked out from the
 * transaction. Before the check runs, each address is looked up. If any of
 * those fields is marked, the check isn't run: it comes back blocked, with
 * the roots of the defects, because its answer would rest on state an earlier
 * failure left unreliable. The transaction's other checks still run.
 *
 * A check gets at the node map only through `read`, the third argument to
 * `run`, and `read` hands back only the fields `reads` declared. Reading
 * anything else throws, and the context a check is given has no node map on
 * it. So a check can't depend on state it didn't declare, which is what would
 * let it run when it should have been blocked. A check that reads only the
 * package (its transaction history, its stakeholders) declares nothing.
 *
 * Write a check as `{ ... } satisfies CheckObject<P>` and leave `run`'s
 * parameters unannotated. They then take their types from here, which makes the
 * context and the transaction read-only inside `run`: a check that tries to
 * modify either won't compile.
 *
 * Keep `run` declared as a property (`run?: (...) => ...`), not a method
 * (`run?(...)`). TypeScript checks method parameters more loosely, so the
 * wrong-field protection above would quietly stop working.
 */
export type CheckObject<P = unknown> = Pick<Check, "id" | "severity" | "description"> & {
  reads?: (data: DeepReadonly<P>) => readonly FieldRef[];
  run?: (context: DeepReadonly<CheckContext>, data: DeepReadonly<P>, read: ReadField) => string[];
};

/** The context a check is given: the machine's without the node map, which a check reads through `read`. */
export type CheckContext = Omit<OcfMachineContext, "nodes">;

/**
 * Reads one field of the node map for a check: its value, or `undefined` if
 * the map holds no such node or the value isn't known. It throws for a field
 * the check didn't declare in `reads`.
 */
export type ReadField = <R extends FieldRef>(ref: R) => FieldRefValue<R> | undefined;

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
 * What a validator module declares: which transaction it validates, what that
 * transaction does to the cap table, and its list of checks.
 *
 * `effect` is one of:
 *  - "none":   validate only; no collection changes (e.g. acceptances).
 *  - "append": add the transaction to `collection` (issuances).
 *  - "remove": remove the security from `collection` (e.g. cancellations).
 * A "none" transaction changes no collection, so it can't name one. It lists
 * `families` instead: the families whose securities it can name, which is
 * where its lifecycle word goes (see `Descriptor` in `ocfMachine.ts`). Its
 * word is "stays" unless it declares "after removal".
 *
 * `pool` is the transaction's part in a stock plan's pool, if it has one (see
 * `PoolEffect`).
 *
 * The checks are typed loosely here; `defineValidator` makes sure each one fits
 * the transaction.
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

/**
 * The lifecycle word each `effect` implies. A validator module declares its
 * effect, and `defineValidator` fills in the word from here, so the two can't
 * disagree.
 */
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

const sameField = (a: FieldRef, b: FieldRef): boolean =>
  a.kind === b.kind && a.id === b.id && a.field === b.field &&
  (a.kind !== "security" || (b.kind === "security" && a.family === b.family));

/** The roots marking any of the fields at `refs`, each once, with the first marked field's address. */
const defectsOn = (nodes: NodeMap, refs: readonly FieldRef[]): { roots: Subject[]; ref?: FieldRef } => {
  const roots: Subject[] = [];
  let first: FieldRef | undefined;
  for (const ref of refs) {
    const defects = fieldAt(nodes, ref)?.defects ?? [];
    if (defects.length > 0) first ??= ref;
    for (const root of defects) {
      if (!roots.some((held) => held.object_type === root.object_type && held.id === root.id)) roots.push(root);
    }
  }
  return { roots, ref: first };
};

/** "TX_WARRANT_ISSUANCE wi-1", or "x, y, and z" for several roots. */
const namesOf = (roots: readonly Subject[]): string => {
  const names = roots.map((root) => text`${root.object_type} ${root.id}`);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
};

/**
 * Builds the validator function from the checks. It runs each check that has a
 * `run`, in list order, and turns every message returned into a finding. The
 * finding's severity and check id come from the check; its subject (the
 * transaction's type and id) comes from the transaction being validated. Its
 * outcome is "failed": a check that returns a message ran and found its
 * problem. The only thing a check controls is the message text.
 *
 * A check isn't run if a field it declares in `reads` is marked. It produces
 * one finding instead, with the outcome "blocked" and the roots of the defects,
 * at the check's own severity. The other checks still run.
 *
 * A check that throws produces one error finding saying so, whatever the
 * check's severity: a check that couldn't finish has checked nothing, so the
 * transaction can't pass on it. The other checks still run. A package value
 * of the wrong type can make a check throw (#218), and a throw that left the
 * validator would stop the whole run. A check that reads a field it didn't
 * declare throws too, so it's reported the same way.
 *
 * `data` is typed `any` here. `defineValidator` checks every check against the
 * transaction's type before building one; any other caller must make sure its
 * checks can read the transactions it gives them.
 */
export const toValidate =
  (checks: readonly CheckObject<any>[]): GradedValidator<any> =>
  (context, data: any) => {
    const subject = { object_type: data.object_type, id: data.id };
    const { nodes, ...checkContext } = context;
    const findings: Finding[] = [];
    for (const check of checks) {
      if (!check.run) continue;
      let severity = check.severity;
      let messages: string[];
      try {
        const refs = check.reads?.(data) ?? [];
        const { roots, ref } = defectsOn(nodes, refs);
        if (ref !== undefined) {
          findings.push({
            severity,
            outcome: "blocked",
            check: check.id,
            message: `Not checked: it reads ${describeField(ref)}, which can't be relied on because ${namesOf(roots)} failed.`,
            subject,
            roots,
          });
          continue;
        }
        const read: ReadField = (wanted) => {
          if (!refs.some((declared) => sameField(declared, wanted))) {
            throw new Error(`It read ${describeField(wanted)}, which it doesn't declare in its reads.`);
          }
          return fieldAt(nodes, wanted)?.value;
        };
        messages = check.run(checkContext, data, read);
      } catch (error) {
        severity = "error";
        messages = [text`The check threw ${error}`];
      }
      for (const message of messages) {
        findings.push({
          severity,
          outcome: "failed",
          check: check.id,
          message,
          subject,
        });
      }
    }
    return findings;
  };

/**
 * Builds a validator's entry in the descriptor table from its declaration.
 *
 * `transaction` decides what the validator's input looks like, and every check
 * must work on that input. Attaching a check that reads a field the transaction
 * doesn't have (e.g. the stakeholder check on an acceptance) won't compile.
 *
 * The result keeps `transaction`, `effect`, `pool`, and `collection` or
 * `families` from the declaration and adds `lifecycle` (the word the effect
 * implies, unless the declaration states one),
 * `validate` (the function that runs the checks), and `checks` (the list the
 * coverage report reads).
 *
 * Keeping `transaction` lets the table in `ocfMachine.ts` catch an entry filed
 * under the wrong key. The table also catches an "append" entry pointed at
 * another family's collection. The types don't catch a "remove" entry pointed
 * at the wrong collection; the hand-written `EXPECTED_COLLECTION` list in
 * `tests/ocfMachine.test.ts` does.
 */
export function defineValidator<const S extends Spec>(
  spec: S & { checks: readonly CheckObject<TransactionFor<S["transaction"]>>[] },
): Defined<S> {
  const { checks, ...rest } = spec;
  return {
    lifecycle: LIFECYCLE_OF_EFFECT[spec.effect],
    ...rest,
    validate: toValidate(checks),
    checks: toMetadata(checks),
  } as Defined<S>;
}

/** A validator's entry in the descriptor table, as `defineValidator` builds it from the declaration `S`. */
type Defined<S extends Spec> = Omit<S, "checks" | "lifecycle"> & {
  lifecycle: S extends { lifecycle: infer Declared extends LifecycleWord } ? Declared : (typeof LIFECYCLE_OF_EFFECT)[S["effect"]];
  validate: GradedValidator<TransactionFor<S["transaction"]>>;
  checks: readonly Check[];
};

/**
 * A validator's table entry again, filed under an older name OCF still
 * accepts for its transaction (see `OLDER_NAMES` in `checks.ts`). Everything
 * but `transaction` is the same object's: the validator function, the checks,
 * the effect, the collection or families, and the lifecycle word. So the two
 * names can't drift apart, and a transaction under the older name is validated
 * and applied exactly as its equivalent is.
 *
 * It won't compile unless the older name's payload is one the validator
 * already accepts.
 */
export function underOlderName<D extends { transaction: TxKey }, const K extends TxKey>(
  descriptor: D,
  olderName: TransactionFor<K> extends TransactionFor<D["transaction"]> ? K : never,
): Omit<D, "transaction"> & { transaction: K } {
  return { ...descriptor, transaction: olderName };
}
