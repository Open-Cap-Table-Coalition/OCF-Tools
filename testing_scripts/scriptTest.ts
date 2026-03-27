import { VestingScheduleGenerator } from "../vesting_schedule_generator_v1";
import {
  TX_Equity_Compensation_Issuance,
  TX_Vesting_Event,
  TX_Vesting_Start,
  VestingCondition,
  VestingTerms,
} from "../vesting_schedule_generator_v1/types";
import { ExecutionPathBuilder } from "../vesting_schedule_generator_v1/ExecutionPathBuilder";
import { VestingConditionStrategyFactory } from "../vesting_schedule_generator_v1/vesting-condition-strategies/factory";
import { OcfPackageContent } from "read_ocf_package";

export function getBackLoadedCliffSchedule() {
  const vestingConditions: VestingCondition[] = [
    {
      id: "vesting-start",
      quantity: "0",
      trigger: {
        type: "VESTING_START_DATE",
      },
      next_condition_ids: ["monthly-thereafter"],
    },
    {
      id: "monthly-thereafter",
      description: "1/4th payout each month thereafter",
      portion: {
        numerator: "1",
        denominator: "4",
      },
      trigger: {
        type: "VESTING_SCHEDULE_RELATIVE",
        period: {
          length: 1,
          type: "MONTHS",
          occurrences: 4,
          day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
          cliff_installment: 2,
        },
        relative_to_condition_id: "vesting-start",
      },
      next_condition_ids: [],
    },
  ];

  const vestingTerms: VestingTerms[] = [
    {
      id: "4-months-2-month-cliff-schedule",
      object_type: "VESTING_TERMS",
      name: "4 Months / 2 Month Cliff",
      description:
        "25% of the total number of shares shall vest on the two-month anniversary of this Agreement, and an additional 1/4th of the total number of Shares shall then vest on the corresponding day of each month thereafter, until all of the Shares have been released on the 4-month anniversary of this Agreement.",
      allocation_type: "BACK_LOADED_TO_SINGLE_TRANCHE",
      vesting_conditions: vestingConditions,
    },
  ];

  const transactions: (
    | TX_Equity_Compensation_Issuance
    | TX_Vesting_Start
    | TX_Vesting_Event
  )[] = [
    {
      id: "eci_01",
      object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
      date: "2025-01-01",
      security_id: "equity_compensation_issuance_01",
      custom_id: "EC-1",
      stakeholder_id: "emilyEmployee",
      security_law_exemptions: [],
      quantity: "18",
      exercise_price: { amount: "1.0", currency: "USD" },
      early_exercisable: false,
      compensation_type: "OPTION",
      option_grant_type: "ISO",
      expiration_date: "2034-12-31",
      termination_exercise_windows: [
        {
          reason: "VOLUNTARY_GOOD_CAUSE",
          period: 3,
          period_type: "MONTHS",
        },
      ],
      vesting_terms_id: "4-months-2-month-cliff-schedule",
      valuation_id: "valuation_01",
    },
  ];

  const ocfPackage: OcfPackageContent = {
    manifest: [],
    stakeholders: [],
    stockClasses: [],
    transactions: transactions,
    stockLegends: [],
    stockPlans: [],
    vestingTerms: vestingTerms,
    valuations: [],
  };
  const securityId = "equity_compensation_issuance_01";

  const start_event: TX_Vesting_Start = {
    id: "vesting-start",
    object_type: "TX_VESTING_START",
    date: "2025-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "vesting-start",
  };

  ocfPackage.transactions.push(start_event);

  return new VestingScheduleGenerator(
    ocfPackage,
    ExecutionPathBuilder,
    VestingConditionStrategyFactory
  ).generateSchedule(securityId);
}

if (require.main === module) {
  console.table(getBackLoadedCliffSchedule());
}
