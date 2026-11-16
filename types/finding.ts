import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";

/** How bad the problem a check looks for is. It says nothing about whether the check ran. */
export type Severity = "error" | "warning";

/**
 * What became of a check, kept apart from how bad its problem is:
 *
 *  - "failed":  the check ran and found the problem.
 *  - "blocked": the check couldn't run, because something it reads was left
 *               unreliable by a transaction that failed earlier. It says
 *               nothing about the transaction it's on. Fixing the roots
 *               either clears it or lets it run and report for itself.
 *
 * A blocked check keeps its own `severity`, so a blocked warning-level check
 * is still a warning once it's unblocked. More outcomes are expected here: a
 * failure a ratification cures (#236), and a marker for a check that failed
 * because the object it refers to is absent.
 */
export type Outcome = "failed" | "blocked";

/**
 * Where an OCF object is: its `object_type` and its OCF `id`. `object_type` is
 * keyed to the generated schema map, so an unknown type is a compile error.
 */
export type Subject = { object_type: keyof ObjectTypeMap; id: string };

interface FindingFields {
  severity: Severity;
  check: string;
  message: string;
  /**
   * The OCF object this finding is about — any object, not only a transaction.
   * A non-object-scoped check (e.g. package/file-level) would widen
   * `object_type` here — deliberately a conscious change rather than a
   * silently-bogus value.
   */
  subject: Subject;
}

/** A check that ran and found its problem. */
export interface FailedFinding extends FindingFields {
  outcome: "failed";
}

/**
 * A check that couldn't run. `roots` names every transaction whose failure it
 * traces back to, not only the first, each located the way a finding's
 * `subject` is. Each root has a failed finding of its own, so a reader fixes
 * the roots and never the blocked check.
 */
export interface BlockedFinding extends FindingFields {
  outcome: "blocked";
  roots: Subject[];
}

/**
 * One result of one check on one object. A finding is identified by its
 * `check` and its `subject`. Its `outcome` says whether the check ran and
 * failed or couldn't run; only a blocked finding has `roots`.
 */
export type Finding = FailedFinding | BlockedFinding;
