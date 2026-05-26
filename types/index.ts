// Top-level OCF-Tools types. The canonical vesting model (spec + transactions)
// supersedes the OCF DAG-based VestingTerms/VestingCondition machinery and
// its associated transactions; those types are no longer carried here. See
// `./canonical/vesting` for the spec types (template + statement + cliff +
// fraction + vesting_base) and `./canonical/transactions` for the canonical
// transaction types (issuance, vesting-start, vesting-event).
//
// The OCF `Vesting` projection type (`{ date, amount }`) is retained — it
// remains the materialized output of the compiler and the shape of the
// optional `vestings[]` array on canonical issuances.

/******************************
 * Vesting
 ******************************/
export type Allocation_Type =
  | "CUMULATIVE_ROUNDING"
  | "CUMULATIVE_ROUND_DOWN"
  | "FRONT_LOADED"
  | "BACK_LOADED"
  | "FRONT_LOADED_TO_SINGLE_TRANCHE"
  | "BACK_LOADED_TO_SINGLE_TRANCHE"
  | "FRACTIONAL";

// OCF Vesting projection event: { date, amount } pair representing a single
// materialized vesting event. The compileVesting function (in vesting_compiler/)
// produces these from a canonical VestingScheduleTemplate + VestingRuntime.
export interface Vesting {
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

// Canonical equity-compensation lifecycle transactions: issuance + vesting
// runtime are re-exported from ./canonical/transactions. Other
// equity-compensation lifecycle transactions (exercise, cancellation) are
// defined here — they apply equally to canonical-issued securities.
export type {
  CanonicalTransaction,
  TX_Canonical_Equity_Compensation_Issuance,
  TX_Canonical_Vesting_Event,
  TX_Canonical_Vesting_Start,
} from "./canonical/transactions";

import type {
  TX_Canonical_Equity_Compensation_Issuance,
  TX_Canonical_Vesting_Event,
  TX_Canonical_Vesting_Start,
} from "./canonical/transactions";

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
  | TX_Canonical_Equity_Compensation_Issuance
  | TX_Canonical_Vesting_Start
  | TX_Canonical_Vesting_Event
  | TX_Equity_Compensation_Exercise
  | TX_Equity_Compensation_Cancellation;
