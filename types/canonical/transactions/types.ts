// Port of canonical transaction types from OCF-Composed-Schemas:
//   https://github.com/Open-Cap-Table-Coalition/OCF-Composed-Schemas/tree/main/canonical/transactions
//
// The canonical transactions supersede the OCF DAG-based vesting transactions
// (TX_EQUITY_COMPENSATION_ISSUANCE, TX_VESTING_START, TX_VESTING_EVENT). The
// canonical issuance is field-for-field equivalent to OCF's except that
// `vesting_terms_id` (DAG ref) is replaced with `vesting_template_id` (canonical
// template ref). The canonical vesting-start and vesting-event transactions
// carry the runtime data the compiler needs to resolve DATE and EVENT anchors.

import type { Fraction, OCFDate } from "../vesting/types";
import type { Vesting } from "../..";

export interface TX_Canonical_Equity_Compensation_Issuance {
  id: string;
  comments?: string[];
  object_type: "TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE";
  date: OCFDate;
  security_id: string;
  custom_id: string;
  stakeholder_id: string;
  board_approval_date?: OCFDate;
  stockholder_approval_date?: OCFDate;
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
  // References a canonical VestingScheduleTemplate.id (replaces OCF's
  // vesting_terms_id which pointed at a DAG-based VestingTerms object).
  vesting_template_id?: string;
  // Optional materialized projection — { date, amount } pairs that should
  // equal compileVesting's output for this grant's template + runtime.
  vestings?: Vesting[];
  expiration_date: OCFDate | null;
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
  // Not part of the canonical schema; retained from OCF-Tools for consumers
  // that link issuances to a 409A valuation.
  valuation_id?: string;
}

// Per-security date anchor for DATE-anchored statements. The grant's
// vesting_template_id is read from the issuance transaction; this transaction
// supplies only the per-security date. One per security.
export interface TX_Canonical_Vesting_Start {
  id: string;
  comments?: string[];
  object_type: "TX_CANONICAL_VESTING_START";
  date: OCFDate;
  security_id: string;
}

// Witness record for an event firing. Resolves the anchor for any
// EVENT-anchored statement on the security's template whose
// vesting_base.event_id matches this transaction's event_id. Multiple
// statements may match a single firing (the canonical model supports
// fan-out). Optional realized_fraction scales the matching statement's
// contribution for partial payouts.
export interface TX_Canonical_Vesting_Event {
  id: string;
  comments?: string[];
  object_type: "TX_CANONICAL_VESTING_EVENT";
  date: OCFDate;
  security_id: string;
  event_id: string;
  realized_fraction?: Fraction;
}

export type CanonicalTransaction =
  | TX_Canonical_Equity_Compensation_Issuance
  | TX_Canonical_Vesting_Start
  | TX_Canonical_Vesting_Event;
