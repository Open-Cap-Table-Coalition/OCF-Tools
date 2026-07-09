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
 * subject; a check body never writes those. `run`'s `data` is `any` because one
 * check object serves modules with different transaction payloads: each concrete
 * check narrows `data` structurally in its own body, so the `any` lives only at
 * this seam. Declaring a check `satisfies CheckObject` lets the compiler enforce
 * this shape — including the `string[]` return — contextually.
 */
export type CheckObject = Pick<Check, "id" | "severity" | "description"> & {
  run?: (context: DeepReadonly<OcfMachineContext>, data: any) => string[];
};

/**
 * A validator declaration: the transaction key (which fixes the payload type of
 * the derived validator), the collection effect, and the check objects. An
 * effect-none transaction mutates no collection, so it carries no `collection`;
 * an append or remove transaction names the family collection it touches.
 */
type Spec =
  | { transaction: TxKey; effect: "none"; collection?: never; checks: readonly CheckObject[] }
  | { transaction: TxKey; effect: "append" | "remove"; collection: CollectionKey; checks: readonly CheckObject[] };

/**
 * Projects the check objects to their public `Check` metadata: drops `run` and
 * marks a runless check `implemented: false`. The key order — `id`, `severity`,
 * `description`, `implemented` — is fixed because the coverage report serializes
 * it verbatim.
 */
const toMetadata = (checks: readonly CheckObject[]): readonly Check[] =>
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
 * body only ever supplies the message text. `data` is `any` here for the same
 * reason it is on `CheckObject.run`: the payload's family is the declaration's
 * concern, not the composer's.
 */
const toValidate =
  (checks: readonly CheckObject[]): GradedValidator<any> =>
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
 * validator's payload type and is dropped from the emitted descriptor, which
 * carries only `effect`, `collection` (where the declaration has one), the
 * composed `validate`, and the projected `checks` metadata. The result is
 * checked against the machine's `Descriptor` type where the table assembles it,
 * so a payload wired to the wrong family collection fails there.
 */
export function defineValidator<const S extends Spec>(
  spec: S,
): Omit<S, "transaction" | "checks"> & {
  validate: GradedValidator<TransactionFor<S["transaction"]>>;
  checks: readonly Check[];
} {
  const { transaction, checks, ...rest } = spec;
  return {
    ...rest,
    validate: toValidate(checks),
    checks: toMetadata(checks),
  } as Omit<S, "transaction" | "checks"> & {
    validate: GradedValidator<TransactionFor<S["transaction"]>>;
    checks: readonly Check[];
  };
}
