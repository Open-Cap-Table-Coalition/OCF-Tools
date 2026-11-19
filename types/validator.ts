import type { NodeMap } from "../ocf_validator/nodes";
import type { OcfPackageContent } from "../read_ocf_package";
import type { OcfTransaction } from "./ocf-input";
import type { Snapshot } from "./snapshot";
import type { Finding, Severity } from "./finding";

/**
 * The context holds the input package, current records and results. Older validators write to
 * report. Validators built from checks write to findings.
 */
export type OcfMachineContext = {
  /**
   * Current security records. Applying a transaction returns an updated map. Use outstanding to list
   * a family's current issuances.
   */
  nodes: NodeMap;
  ocfPackageContent: OcfPackageContent;
  /**
   * An index of the package, not a record of the run: each security's
   * earliest transaction in the package that removes it from its collection
   * (a cancellation, conversion, transfer, and so on), by security_id, even if
   * the run stops before it. Built when the run starts, for the
   * no-earlier-removal check.
   */
  removals: ReadonlyMap<unknown, DeepReadonly<OcfTransaction>>;
  report: any[];
  findings: Finding[];
  /**
   * Store the findings that stopped a legacy issuance after an earlier removal so the failure
   * message can identify the cause.
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
 * A validator returns findings for one transaction. The machine records them and applies writes only
 * when no error-level finding prevents it. Warnings allow writes, and later transactions still run.
 */
export type GradedValidator<T> = (
  context: DeepReadonly<OcfMachineContext>,
  data: DeepReadonly<T>,
) => Finding[];

/**
 * Describe what the coverage report should show for each check. The ID is unique within a validator.
 * The same definition supplies the message severity used during validation. A check without run
 * appears with implemented set to false.
 */
export type Check = {
  id: string;
  severity: Severity;
  description: string;
  implemented?: false;
};

/**
 * A security starts unissued. Issuance makes it outstanding and removal ends that state. A "stays"
 * transaction requires an outstanding security. An "after removal" transaction requires a removed
 * security.
 */
export type LifecycleWord = "issue" | "stays" | "removes" | "after removal";
