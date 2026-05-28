// Ideally we'll eventually import these from OCF

/******************************
 * Vesting Condition
 ******************************/
export type Day_Of_Month =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "25"
  | "26"
  | "27"
  | "28"
  | "29_OR_LAST_DAY_OF_MONTH"
  | "30_OR_LAST_DAY_OF_MONTH"
  | "31_OR_LAST_DAY_OF_MONTH"
  | "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";

export interface Period_Months {
  length: number;
  type: "MONTHS";
  occurrences: number;
  day_of_month: Day_Of_Month;
  cliff_installment?: number;
}

export interface Period_Days {
  length: number;
  type: "DAYS";
  occurrences: number;
  cliff_installment?: number;
}

export interface Trigger {
  type: string;
}

export interface VestingStartTrigger extends Trigger {
  type: "VESTING_START_DATE";
}

export interface VestingAbsoluteTrigger extends Trigger {
  type: "VESTING_SCHEDULE_ABSOLUTE";
  date: string;
}

export interface VestingRelativeTrigger extends Trigger {
  type: "VESTING_SCHEDULE_RELATIVE";
  period: Period_Months | Period_Days;
  relative_to_condition_id: string;
}

export interface VestingEventTrigger extends Trigger {
  type: "VESTING_EVENT";
}

interface VestingConditionBase {
  id: string;
  description?: string;
  portion?: {
    numerator: string;
    denominator: string;
    remainder?: boolean;
  };
  quantity?: string;
  next_condition_ids: string[];
}

export interface VestingCondition_VestingStart extends VestingConditionBase {
  trigger: VestingStartTrigger;
}

export interface VestingCondition_VestingScheduleAbsolute
  extends VestingConditionBase {
  trigger: VestingAbsoluteTrigger;
}

export interface VestingCondition_VestingScheduleRelative
  extends VestingConditionBase {
  trigger: VestingRelativeTrigger;
}

export interface VestingCondition_VestingEvent extends VestingConditionBase {
  trigger: VestingEventTrigger;
}

export type VestingCondition =
  | VestingCondition_VestingStart
  | VestingCondition_VestingScheduleAbsolute
  | VestingCondition_VestingScheduleRelative
  | VestingCondition_VestingEvent;

/******************************
 * Vesting Terms
 ******************************/

export type Allocation_Type =
  | "CUMULATIVE_ROUNDING"
  | "CUMULATIVE_ROUND_DOWN"
  | "FRONT_LOADED"
  | "BACK_LOADED"
  | "FRONT_LOADED_TO_SINGLE_TRANCHE"
  | "BACK_LOADED_TO_SINGLE_TRANCHE"
  | "FRACTIONAL";

export interface VestingTerms {
  id: string;
  comments?: string[];
  object_type: "VESTING_TERMS";
  name: string;
  description: string;
  allocation_type: Allocation_Type;
  vesting_conditions: VestingCondition[];
}

export interface vestingObject {
  date: string;
  amount: string;
}

/******************************
 * Valuation
 ******************************/
export interface Valuation {
  id: string;
  comments?: string[];
  object_type: "VALUATION";
  provider?: string;
  board_approval_date?: string;
  stockholder_approval_date?: string;
  price_per_share: {
    amount: string;
    currency: string;
  };
  effective_date: string;
  stock_class_id: string;
  valuation_type: "409A";
}

/******************************
 * Transactions
 ******************************/
export interface TX_Vesting_Start {
  id: string;
  comments?: string[];
  object_type: "TX_VESTING_START";
  date: string;
  security_id: string;
  vesting_condition_id: string;
}

export interface TX_Vesting_Event {
  id: string;
  comments?: string[];
  object_type: "TX_VESTING_EVENT";
  date: string;
  security_id: string;
  vesting_condition_id: string;
}

export interface TX_Equity_Compensation_Issuance {
  id: string;
  comments?: string[];
  object_type: "TX_PLAN_SECURITY_ISSUANCE" | "TX_EQUITY_COMPENSATION_ISSUANCE";
  date: string;
  security_id: string;
  custom_id: string;
  stakeholder_id: string;
  board_approval_date?: string;
  stockholder_approval_date?: string;
  consideration_text?: string;
  security_law_exemptions: {
    description: string;
    jurisdiction: string;
  }[];
  stock_plan_id?: string;
  stock_class_id?: string;
  compensation_type:
    | "OPTION_NSO"
    | "OPTION_ISO"
    | "OPTION"
    | "RSU"
    | "CSAR"
    | "SSAR";
  option_grant_type: "NSO" | "ISO" | "INTL";
  quantity: string;
  exercise_price?: {
    amount: string;
    currency: string;
  };
  base_price?: {
    amount: string;
    currency: string;
  };
  early_exercisable?: boolean;
  vesting_terms_id?: string;
  vestings?: vestingObject[];
  expiration_date: string | null;
  termination_exercise_windows: {
    reason:
      | "VOLUNTARY_OTHER"
      | "VOLUNTARY_GOOD_CAUSE"
      | "VOLUNTARY_RETIREMENT"
      | "INVOLUNTARY_OTHER"
      | "INVOLUNTARY_DEATH"
      | "INVOLUNTARY_DISABILITY"
      | "INVOLUNTARY_WITH_CAUSE";
    period: number;
    period_type: "DAYS" | "MONTHS" | "YEARS";
  }[];
  valuation_id?: string; // this isn't part of the schema yet
}

export interface TX_Equity_Compensation_Exercise {
  id: string;
  comments: string[];
  object_type: "TX_EQUITY_COMPENSATION_EXERCISE";
  date: string;
  security_id: string;
  consideration_text: string;
  resulting_security_ids: string[];
  quantity: string;
}

export interface TX_Equity_Compensation_Cancellation {
  id: string;
  comments?: string[];
  object_type: "TX_EQUITY_COMPENSATION_CANCELLATION";
  date: string;
  security_id: string;
  balance_security_id?: string;
  reason_text: string;
  quantity: string;
}

export type Transaction =
  | TX_Equity_Compensation_Issuance
  | TX_Vesting_Start
  | TX_Vesting_Event
  | TX_Equity_Compensation_Exercise
  | TX_Equity_Compensation_Cancellation;
