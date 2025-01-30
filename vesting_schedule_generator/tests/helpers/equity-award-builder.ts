import { addMonths, formatISO, parseISO, subMonths } from "date-fns";
import { OcfPackageContent } from "read_ocf_package";
import {
  Allocation_Type,
  TX_Equity_Compensation_Issuance,
  TX_Vesting_Start,
  VestingCondition,
  VestingTerms,
} from "types";

export interface BuildEquityAwardConfig {
  id: string;
  grantDate: string;
  stakeholderId: string;
  quantity: number;
  exercisePrice: number;
  vestingTermsConfig: {
    id: string;
    installmentCount: number;
    monthsPerInstallment: number;
  };
  VCD?: string;
  earlyExercisable?: boolean;
  NSO?: boolean;
}

export const buildEquityAward = (configs: BuildEquityAwardConfig[]) => {
  let transactions: Array<TX_Equity_Compensation_Issuance | TX_Vesting_Start> =
    [];
  let vestingTermsArray: Array<VestingTerms> = [];

  configs.forEach((config, index) => {
    const { vestingTermsConfig, ...restOfConfig } = config;

    const vestingConditions = buildVestingConditions(config.vestingTermsConfig);

    const { VCD, ...issuanceTxConfig } = restOfConfig;

    const issuanceTx = buildIssuanceTx({
      ...issuanceTxConfig,
      vestingTermsId: vestingTermsConfig.id,
    });
    const startTx = buildVestingStartTx(
      config.id,
      "start_condition",
      VCD ?? config.grantDate
    );

    const vestingTerms = buildVestingTerms(
      vestingTermsConfig.id,
      vestingConditions
    );

    transactions.push(issuanceTx);
    transactions.push(startTx);
    vestingTermsArray.push(vestingTerms);
  });

  const ocfPackage: OcfPackageContent = {
    manifest: [],
    stakeholders: [],
    stockClasses: [],
    transactions: transactions,
    stockLegends: [],
    stockPlans: [],
    vestingTerms: vestingTermsArray,
    valuations: [],
  };

  return ocfPackage;
};

const buildIssuanceTx = (config: {
  id: string;
  grantDate: string;
  stakeholderId: string;
  quantity: number;
  exercisePrice: number;
  vestingTermsId: string;
  earlyExercisable?: boolean;
  NSO?: boolean;
}) => {
  const {
    id,
    grantDate,
    stakeholderId,
    quantity,
    exercisePrice,
    vestingTermsId,
    earlyExercisable,
    NSO,
  } = config;

  const issuanceTx: TX_Equity_Compensation_Issuance = {
    id,
    object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
    date: grantDate,
    security_id: id,
    custom_id: id,
    stakeholder_id: stakeholderId,
    security_law_exemptions: [],
    quantity: quantity.toString(),
    exercise_price: {
      amount: exercisePrice.toString(),
      currency: "USD",
    },
    early_exercisable: earlyExercisable,
    compensation_type: "OPTION",
    option_grant_type: NSO ? "NSO" : "ISO",
    expiration_date: formatISO(addMonths(parseISO(grantDate), 120)),
    termination_exercise_windows: [
      {
        reason: "VOLUNTARY_GOOD_CAUSE",
        period: 3,
        period_type: "MONTHS",
      },
    ],
    vesting_terms_id: vestingTermsId,
    valuation_id: "valuation_01",
  };

  return issuanceTx;
};

const buildVestingConditions = (config: {
  installmentCount: number;
  monthsPerInstallment: number;
}) => {
  const { installmentCount, monthsPerInstallment } = config;
  const vestingConditions: VestingCondition[] = [
    {
      id: "start_condition",
      description: "start_condition",
      quantity: "0",
      trigger: {
        type: "VESTING_START_DATE",
      },
      next_condition_ids: ["monthly_vesting_condition"],
    },
    {
      id: "monthly_vesting_condition",
      description: "monthly_vesting_condition",
      portion: {
        numerator: "1",
        denominator: installmentCount.toString(),
      },
      trigger: {
        type: "VESTING_SCHEDULE_RELATIVE",
        period: {
          length: monthsPerInstallment,
          type: "MONTHS",
          occurrences: installmentCount,
          day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
        },
        relative_to_condition_id: "start_condition",
      },
      next_condition_ids: [],
    },
  ];

  return vestingConditions;
};

const buildVestingStartTx = (
  id: string,
  vesting_condition_id: string,
  VCD: string
) => {
  const vestingStartTx: TX_Vesting_Start = {
    object_type: "TX_VESTING_START",
    id,
    security_id: id,
    vesting_condition_id,
    date: VCD,
  };

  return vestingStartTx;
};

const buildVestingTerms = (
  id: string,
  vesting_conditions: VestingCondition[],
  allocation_type: Allocation_Type = "CUMULATIVE_ROUND_DOWN"
) => {
  const vestingTerms: VestingTerms = {
    id,
    object_type: "VESTING_TERMS",
    name: id,
    description: id,
    allocation_type,
    vesting_conditions,
  };

  return vestingTerms;
};
