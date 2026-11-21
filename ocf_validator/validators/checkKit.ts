import type { TransactionFor } from "../../types/ocf-input";
import type { Finding } from "../../types/finding";
import type {
  Check,
  DeepReadonly,
  GradedValidator,
  LifecycleWord,
  OcfMachineContext,
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
  run?: (context: DeepReadonly<OcfMachineContext>, data: DeepReadonly<P>) => string[];
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
 * Declare the transaction, its checks and its effect. Issuances add to a collection, removals take a
 * security out, and other checked transactions list the families they can affect.
 */
type Spec =
  | { transaction: TxKey; effect: "none"; collection?: never; families: readonly CollectionKey[]; checks: readonly CheckObject<any>[] }
  | { transaction: TxKey; effect: "append" | "remove"; collection: CollectionKey; checks: readonly CheckObject<any>[] };

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

/**
 * Builds the validator function from the checks. It runs each check that has a
 * `run`, in list order, and turns every message returned into a finding. The
 * finding's severity and check id come from the check; its subject (the
 * transaction's type and id) comes from the transaction being validated. The
 * only thing a check controls is the message text.
 *
 * A check that throws produces one error finding saying so, whatever the
 * check's severity: a check that couldn't finish has checked nothing, so the
 * transaction can't pass on it. The other checks still run. A package value
 * of the wrong type can make a check throw (#218), and a throw that left the
 * validator would stop the whole run.
 *
 * `data` is typed `any` here. `defineValidator` checks every check against the
 * transaction's type before building one; any other caller must make sure its
 * checks can read the transactions it gives them.
 */
export const toValidate =
  (checks: readonly CheckObject<any>[]): GradedValidator<any> =>
  (context, data: any) => {
    const subject = { object_type: data.object_type, id: data.id };
    const findings: Finding[] = [];
    for (const check of checks) {
      if (!check.run) continue;
      let severity = check.severity;
      let messages: string[];
      try {
        messages = check.run(context, data);
      } catch (error) {
        severity = "error";
        messages = [text`The check threw ${error}`];
      }
      for (const message of messages) {
        findings.push({
          severity,
          check: check.id,
          message,
          subject,
        });
      }
    }
    return findings;
  };

/**
 * Generate validation and the check list from the same declaration. TypeScript checks that the
 * transaction supplies each field a check needs. The descriptor table checks issuance families, and
 * the collection tests check removal families.
 */
export function defineValidator<const S extends Spec>(
  spec: S & { checks: readonly CheckObject<TransactionFor<S["transaction"]>>[] },
): Defined<S> {
  const { checks, ...rest } = spec;
  return {
    ...rest,
    lifecycle: LIFECYCLE_OF_EFFECT[spec.effect],
    rules: checks,
    validate: toValidate(checks),
    checks: toMetadata(checks),
  } as Defined<S>;
}

/** Preserve the transaction and family types when adding validation and check metadata. */
type Defined<S extends Spec> = Omit<S, "checks"> & {
  rules: S["checks"];
  lifecycle: (typeof LIFECYCLE_OF_EFFECT)[S["effect"]];
  validate: GradedValidator<TransactionFor<S["transaction"]>>;
  checks: readonly Check[];
};
