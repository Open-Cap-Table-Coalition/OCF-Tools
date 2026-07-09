import type {
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { OcfPackageContent } from "../read_ocf_package";
import type { Snapshot } from "./snapshot";
import type { Finding, Severity } from "./finding";

/**
 * The machine context a validator receives: the package under validation, the
 * per-family collections accumulated so far, and the record channels —
 * `report` for legacy dual-mode validators, `findings` for graded ones.
 * `report` retires with the legacy convention once every family returns
 * findings.
 */
export type OcfMachineContext = {
  stockIssuances: OCFStockIssuance[];
  equityCompensation: OCFEquityCompensationIssuance[];
  convertibleIssuances: OCFConvertibleIssuance[];
  warrantIssuances: OCFWarrantIssuance[];
  ocfPackageContent: OcfPackageContent;
  report: any[];
  findings: Finding[];
  /**
   * Machine bookkeeping, not validator input: the error findings of the most
   * recently recorded transaction. Written at record time, read only by the
   * failure branch to build the failure message.
   */
  lastErrorFindings: Finding[];
  snapshots: Snapshot[];
  result: string;
};

/**
 * Recursively readonly view of `T`: every property is readonly and every array
 * loses its mutating methods. Validator inputs are typed through this so that
 * mutating them is a compile error.
 */
export type DeepReadonly<T> = T extends readonly (infer E)[]
  ? readonly DeepReadonly<E>[]
  : T extends Function
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * A graded validator for a transaction whose payload is `T`: receives the
 * payload directly — no guard flag — and returns findings. The machine derives
 * everything else from that one return value: the transaction is valid iff no
 * finding carries severity "error" (warnings alone do not block), and the
 * findings are recorded on `context.findings`, never on `context.report`.
 * The machine invokes a validator up to twice per transaction (guard and
 * record), always with identical inputs, so a validator must be pure; its
 * inputs are typed `DeepReadonly` so mutating them is a compile error.
 */
export type GradedValidator<T> = (
  context: DeepReadonly<OcfMachineContext>,
  data: DeepReadonly<T>,
) => Finding[];

/**
 * One declared validation check for a module, written as structured data in
 * place of the free-text `CURRENT CHECKS` / `MISSING CHECKS` comment blocks.
 * This is documentation-grade metadata: the machine never reads it at runtime —
 * a finding's own severity, not the declared one here, drives validity — so it
 * exists purely to be rolled up by the coverage-report generator.
 *
 *  - `id`:          the check's identifier, unique within its own descriptor (the
 *                   report renders per transaction type), not globally — reusing a
 *                   generic id across modules is fine.
 *  - `severity`:    the severity the report renders for this check, reusing the
 *                   `Finding` severities. It states declared intent; it does not
 *                   constrain the severity a validator actually emits.
 *  - `description`: the human-readable sentence the report renders. Required — it
 *                   is what replaces the prose comment blocks.
 *  - `implemented`: absent for a check the module performs, or literally `false`
 *                   for a declared gap (replacing today's `MISSING CHECKS` prose).
 *                   Typing it `false` makes `implemented: true` noise
 *                   unrepresentable, so the field is only ever a gap marker.
 */
export type Check = {
  id: string;
  severity: Severity;
  description: string;
  implemented?: false;
};
