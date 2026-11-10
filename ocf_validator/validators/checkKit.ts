import type { TransactionFor } from "../../types/ocf-input";
import type { Finding } from "../../types/finding";
import type {
  Check,
  DeepReadonly,
  GradedValidator,
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
 * A "none" transaction changes no collection, so it can't name one.
 *
 * The checks are typed loosely here; `defineValidator` makes sure each one fits
 * the transaction.
 */
type Spec =
  | { transaction: TxKey; effect: "none"; collection?: never; checks: readonly CheckObject<any>[] }
  | { transaction: TxKey; effect: "append" | "remove"; collection: CollectionKey; checks: readonly CheckObject<any>[] };

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
 * `data` is typed `any` here. That's safe because `defineValidator` has already
 * checked every check against the transaction's type.
 */
const toValidate =
  (checks: readonly CheckObject<any>[]): GradedValidator<any> =>
  (context, data: any) => {
    const subject = { object_type: data.object_type, id: data.id };
    const findings: Finding[] = [];
    for (const check of checks) {
      if (!check.run) continue;
      for (const message of check.run(context, data)) {
        findings.push({
          severity: check.severity,
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
 * The result keeps `transaction`, `effect`, and `collection` from the
 * declaration and adds `validate` (the function that runs the checks) and
 * `checks` (the list the coverage report reads).
 *
 * Keeping `transaction` lets the table in `ocfMachine.ts` catch an entry filed
 * under the wrong key. The table also catches an "append" entry pointed at
 * another family's collection. The types don't catch a "remove" entry pointed
 * at the wrong collection; the hand-written `EXPECTED_COLLECTION` list in
 * `tests/ocfMachine.test.ts` does.
 */
export function defineValidator<const S extends Spec>(
  spec: S & { checks: readonly CheckObject<TransactionFor<S["transaction"]>>[] },
): Omit<S, "checks"> & {
  validate: GradedValidator<TransactionFor<S["transaction"]>>;
  checks: readonly Check[];
} {
  const { checks, ...rest } = spec;
  return {
    ...rest,
    validate: toValidate(checks),
    checks: toMetadata(checks),
  } as Omit<S, "checks"> & {
    validate: GradedValidator<TransactionFor<S["transaction"]>>;
    checks: readonly Check[];
  };
}
