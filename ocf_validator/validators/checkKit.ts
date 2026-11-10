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
 * A declared check as executable data: the public `Check` metadata plus an
 * optional `run`. A check with a `run` is performed; a check with none is a
 * declared gap. `run` returns only the failure MESSAGES — one string per
 * failure — because the factory stamps every finding's severity, check id, and
 * subject; a check body never writes those.
 *
 * `P` is the slice of the transaction payload the check reads — e.g.
 * `{ security_id: string }` — so one check object serves every transaction whose
 * payload carries that slice, and `defineValidator` rejects a check whose slice
 * the declared transaction's payload does not supply. `run` receives the slice
 * as `DeepReadonly<P>`: declare a check `satisfies CheckObject<P>` and leave
 * `run`'s parameters unannotated, so they take their types from here and
 * mutating either input is a compile error, as it is for any `GradedValidator`.
 * `run` stays a property, not a method, so its parameters are checked
 * contravariantly.
 */
export type CheckObject<P = unknown> = Pick<Check, "id" | "severity" | "description"> & {
  run?: (context: DeepReadonly<OcfMachineContext>, data: DeepReadonly<P>) => string[];
};

/**
 * Declares a check as a gap: the same metadata with no `run`, so it reports as
 * `implemented: false` and contributes no findings. Lets a module declare a gap
 * against a check another module implements, so the two declarations cannot drift.
 */
export const asGap = ({ id, severity, description }: CheckObject<any>): CheckObject => ({
  id,
  severity,
  description,
});

/**
 * A validator declaration: the transaction key (which fixes the payload type of
 * the derived validator), the collection effect, and the check objects. An
 * effect-none transaction mutates no collection, so it carries no `collection`;
 * an append or remove transaction names the family collection it touches. The
 * checks are typed loosely here; `defineValidator` ties them to the payload.
 */
type Spec =
  | { transaction: TxKey; effect: "none"; collection?: never; checks: readonly CheckObject<any>[] }
  | { transaction: TxKey; effect: "append" | "remove"; collection: CollectionKey; checks: readonly CheckObject<any>[] };

/**
 * Projects the check objects to their public `Check` metadata: drops `run` and
 * marks a runless check `implemented: false`. The key order — `id`, `severity`,
 * `description`, `implemented` — is fixed because the coverage report serializes
 * it verbatim.
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
 * Composes the check objects into a validator. The finding subject is built once
 * from the transaction under validation; then each check that has a `run` is
 * executed in list order and every message it returns is completed into a
 * `Finding` field by field — severity and check id from the check declaration,
 * subject from the transaction — so the stamping is authoritative and a check
 * body only ever supplies the message text. `data` is `any` here because the
 * payload's family is the declaration's concern, not the composer's:
 * `defineValidator` has already checked every check against the payload.
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
 * Builds a transaction descriptor from a declaration. `transaction` fixes the
 * validator's payload type, and every check must accept that payload: a check
 * reading a field the transaction does not carry is a compile error here.
 *
 * The emitted descriptor keeps `transaction` alongside `effect`, `collection`
 * (where the declaration has one), the composed `validate`, and the projected
 * `checks` metadata. Keeping it lets the table in `ocfMachine.ts` check each
 * descriptor against the key it is filed under, so a descriptor filed under
 * another transaction's key fails to compile. The table's `Descriptor` check
 * also rejects an `append` descriptor whose collection belongs to another family.
 * A `remove` descriptor's collection is not typed against its payload; the
 * `EXPECTED_COLLECTION` oracle in `tests/ocfMachine.test.ts` pins those.
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
