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

export interface VestingSchedule {
  template_id: string; // refs a VestingScheduleTemplate
  start_date: OCFDate;
}

export interface VestingScheduleTemplate {
  id: string;
  statements: VestingStatement[]; // chained implicitly by order
}

export interface VestingStatement {
  order: number; // 1-based sequence position
  occurrences: number; // integer >= 1; number of vesting events in segment
  period: number; // integer >= 0; length of one installment, in period_type units
  period_type: PeriodType;
  cliff?: Cliff;
  percentage: Fraction; // share of total grant this vesting statement covers
}

export interface Fraction {
  numerator: number; // integer
  denominator: number; // integer >= 1
}

export interface Cliff {
  occurrence: number; // 1-indexed installment at which the cliff applies (must be <= containing statement's occurrences)
  percentage: Fraction; // share of the statement that vests at cliff
}
