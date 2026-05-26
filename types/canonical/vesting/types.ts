// Port of canonical vesting types from OCF-Composed-Schemas:
// https://github.com/Open-Cap-Table-Coalition/OCF-Composed-Schemas/blob/main/canonical/vesting/types.ts
//
// Divergence from OCF: the canonical spec does NOT carry a day_of_month field
// equivalent to OCF's VestingDayOfMonth enum. The compileVesting function
// assumes VESTING_START_DAY_OR_LAST_DAY_OF_MONTH semantics — see
// /vesting_compiler/dates.ts for the implementation. Revisit if the canonical
// spec is extended.

// ─── OCF types we $ref ───────────────────────────────────────
// From types/Date.schema.json: ISO 8601 YYYY-MM-DD
export type OCFDate = string;

// From enums/PeriodType.schema.json
export type PeriodType = "DAYS" | "MONTHS" | "YEARS";

export interface VestingScheduleTemplate {
  id: string;
  statements: VestingStatement[]; // chained implicitly by order (DATE statements only)
}

export interface VestingStatement {
  order: number; // 1-based sequence position
  vesting_base: VestingBase; // anchor: per-grant date (DATE) or named event (EVENT)
  occurrences: number; // integer >= 1; number of vesting events in segment
  period: number; // integer >= 0; length of one installment, in period_type units
  period_type: PeriodType;
  cliff?: Cliff;
  percentage: Fraction; // share of total grant this vesting statement covers
}

// Discriminated union for how a VestingStatement's schedule is anchored.
// DATE-anchored statements take their start from a per-grant date supplied
// out-of-band (in OCF-Tools, via VestingRuntime.startDate). EVENT-anchored
// statements anchor to the firing date of a named event (in OCF-Tools, via
// VestingRuntime.eventFirings). The event's definition (what it means, how
// it's achieved) is not modeled here; the consumer maintains that out-of-band.
// Multiple statements may reference the same event_id — a single firing fans
// out to all matching statements.
export type VestingBase = VestingBaseDate | VestingBaseEvent;

export interface VestingBaseDate {
  type: "DATE";
}

export interface VestingBaseEvent {
  type: "EVENT";
  event_id: string;
}

export interface Fraction {
  numerator: number; // integer
  denominator: number; // integer >= 1
}

export interface Cliff {
  occurrence: number; // 1-indexed installment at which the cliff applies (must be <= containing statement's occurrences)
  percentage: Fraction; // share of the statement that vests at cliff
}
