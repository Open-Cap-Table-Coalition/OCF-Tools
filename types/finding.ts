import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";

/** How serious a problem the check reports. */
export type Severity = "error" | "warning";

/**
 * A failed check found a problem. A blocked check could not evaluate its inputs because an earlier
 * transaction failed.
 */
export type Outcome = "failed" | "blocked";

/**
 * Identify an OCF object by its schema type and ID. A `transaction-type-known` finding is the one
 * exception: its object_type is the unrecognized string read from the package.
 */
export type Subject = { object_type: keyof ObjectTypeMap; id: string };

interface FindingFields {
  severity: Severity;
  check: string;
  message: string;
  /** The OCF object the check evaluated. Package-wide findings would need their own subject type. */
  subject: Subject;
  /** Date of the daily plan check, when applicable. */
  date?: string;
}

/** The check ran and found a problem. */
export interface FailedFinding extends FindingFields {
  outcome: "failed";
}

/** The check could not run. Each root identifies an earlier failed transaction to investigate. */
export interface BlockedFinding extends FindingFields {
  outcome: "blocked";
  roots: Subject[];
}

/**
 * A finding records a check's result for an object. A daily plan finding also gives the date. A
 * blocked finding identifies the earlier failures that prevented the check.
 */
export type Finding = FailedFinding | BlockedFinding;
