import { createMachine, createActor } from "xstate";
import { OcfPackageContent } from "../../read_ocf_package";
import { ocfMachine, OcfMachineContext } from "../ocfMachine";
import constants from "../constants/constants";

/**
 * Runs the OCF validator against an in-memory OcfPackageContent.
 * Mirrors the logic in ocf_validator/index.ts but without reading from disk.
 */
const runValidator = (ocfPackage: OcfPackageContent): OcfMachineContext => {
  const { transactions } = ocfPackage;
  const transactionTypes = constants.transaction_types;

  const sortedTransactions = [...transactions].sort(
    (a: any, b: any) =>
      a.date.localeCompare(b.date) ||
      transactionTypes.indexOf(a.object_type) - transactionTypes.indexOf(b.object_type)
  );

  const ocfXstateMachine = createMachine(ocfMachine);
  const ocfXstateActor = createActor(ocfXstateMachine).start();

  let currentDate: any = null;

  for (let i = 0; i < sortedTransactions.length; i++) {
    const ele = sortedTransactions[i];
    if (ocfXstateActor.getSnapshot().value !== "validationError") {
      if (ele.date !== currentDate) {
        if (currentDate === null) {
          ocfXstateActor.send({ type: "START", data: ocfPackage, date: ele.date });
        } else {
          ocfXstateActor.send({ type: "RUN_EOD", date: currentDate });
        }
      }
      currentDate = ele.date;
      ocfXstateActor.send({ type: ele.object_type, data: ele });
    }
  }

  if (ocfXstateActor.getSnapshot().value !== "validationError") {
    ocfXstateActor.send({ type: "RUN_EOD", date: currentDate });
    ocfXstateActor.send({ type: "RUN_END", date: currentDate });
  }

  return ocfXstateActor.getSnapshot().context as OcfMachineContext;
};

// ─── Helpers to build OcfPackageContent ───

const baseManifest = {
  issuer: { legal_name: "Test Corp" },
};

const makeStakeholder = (id: string) => ({
  id,
  object_type: "STAKEHOLDER",
  name: { legal_name: id },
  stakeholder_type: "INDIVIDUAL",
});

const makeStockPlan = (
  id: string,
  opts: {
    boardApprovalDate?: string;
    initialSharesReserved?: string;
    stockClassIds?: string[];
  } = {}
) => ({
  id,
  object_type: "STOCK_PLAN",
  plan_name: id,
  board_approval_date: opts.boardApprovalDate ?? "2020-01-01",
  initial_shares_reserved: opts.initialSharesReserved ?? "100000",
  default_cancellation_behavior: "RETURN_TO_POOL",
  stock_class_ids: opts.stockClassIds ?? ["common"],
});

const makePlanSecurityIssuance = (
  id: string,
  securityId: string,
  opts: {
    date?: string;
    stakeholderId?: string;
    stockPlanId?: string;
    quantity?: string;
  } = {}
) => ({
  id,
  object_type: "TX_PLAN_SECURITY_ISSUANCE",
  date: opts.date ?? "2021-01-01",
  security_id: securityId,
  custom_id: id,
  stakeholder_id: opts.stakeholderId ?? "stakeholder_1",
  security_law_exemptions: [],
  stock_plan_id: opts.stockPlanId ?? "plan_1",
  stock_class_id: "common",
  quantity: opts.quantity ?? "1000",
  compensation_type: "RSU",
  option_grant_type: "NSO",
  expiration_date: null,
  termination_exercise_windows: [],
});

const makePoolAdjustment = (
  id: string,
  opts: {
    date?: string;
    stockPlanId?: string;
    sharesReserved?: string;
  } = {}
) => ({
  id,
  object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  date: opts.date ?? "2021-01-01",
  stock_plan_id: opts.stockPlanId ?? "plan_1",
  board_approval_date: opts.date ?? "2021-01-01",
  shares_reserved: opts.sharesReserved ?? "200000",
});

const makeReturnToPool = (
  id: string,
  securityId: string,
  opts: {
    date?: string;
    stockPlanId?: string;
    quantity?: string;
  } = {}
) => ({
  id,
  object_type: "TX_STOCK_PLAN_RETURN_TO_POOL",
  date: opts.date ?? "2021-06-01",
  security_id: securityId,
  stock_plan_id: opts.stockPlanId ?? "plan_1",
  reason_text: "Cancelled shares returned to pool",
  quantity: opts.quantity ?? "1000",
});

const buildPackage = (overrides: Partial<OcfPackageContent> = {}): OcfPackageContent => ({
  manifest: baseManifest,
  stakeholders: [makeStakeholder("stakeholder_1")],
  stockClasses: [{ id: "common", object_type: "STOCK_CLASS", name: "Common" }],
  transactions: [],
  stockLegends: [],
  stockPlans: [makeStockPlan("plan_1")],
  vestingTerms: [],
  valuations: [],
  ...overrides,
});

// ─── Tests ───

describe("TX_PLAN_SECURITY_ISSUANCE validation", () => {
  test("valid issuance passes", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1"),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
    expect(result.planSecurityIssuances).toHaveLength(1);
  });

  test("missing stakeholder fails", () => {
    const pkg = buildPackage({
      stakeholders: [], // no stakeholders
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1"),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });

  test("missing stock plan fails", () => {
    const pkg = buildPackage({
      stockPlans: [], // no plans
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1"),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });

  test("board approval after issuance date fails", () => {
    const pkg = buildPackage({
      stockPlans: [
        makeStockPlan("plan_1", { boardApprovalDate: "2022-01-01" }),
      ],
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-06-01" }),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });

  test("insufficient pool shares fails", () => {
    const pkg = buildPackage({
      stockPlans: [
        makeStockPlan("plan_1", { initialSharesReserved: "500" }),
      ],
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { quantity: "1000" }),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });

  test("pool adjustment restores capacity for subsequent issuance", () => {
    const pkg = buildPackage({
      stockPlans: [
        makeStockPlan("plan_1", { initialSharesReserved: "500" }),
      ],
      transactions: [
        makePoolAdjustment("adj_1", {
          date: "2020-06-01",
          sharesReserved: "2000",
        }),
        makePlanSecurityIssuance("psi_1", "sec_1", {
          date: "2021-01-01",
          quantity: "1500",
        }),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
  });

  test("return to pool restores capacity for subsequent issuance", () => {
    const pkg = buildPackage({
      stockPlans: [
        makeStockPlan("plan_1", { initialSharesReserved: "1000" }),
      ],
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", {
          date: "2021-01-01",
          quantity: "800",
        }),
        {
          id: "psc_1",
          object_type: "TX_PLAN_SECURITY_CANCELLATION",
          date: "2021-03-01",
          security_id: "sec_1",
          balance_security_id: "",
          reason_text: "Cancelled",
          quantity: "800",
        },
        makeReturnToPool("rtp_1", "sec_1", {
          date: "2021-03-01",
          quantity: "800",
        }),
        makePlanSecurityIssuance("psi_2", "sec_2", {
          date: "2021-06-01",
          quantity: "900",
        }),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
  });

  test("multiple pools tracked independently", () => {
    const pkg = buildPackage({
      stockPlans: [
        makeStockPlan("plan_1", { initialSharesReserved: "1000" }),
        makeStockPlan("plan_2", { initialSharesReserved: "500" }),
      ],
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", {
          date: "2021-01-01",
          stockPlanId: "plan_1",
          quantity: "900",
        }),
        // This should succeed — plan_2 has 500 available
        makePlanSecurityIssuance("psi_2", "sec_2", {
          date: "2021-01-01",
          stockPlanId: "plan_2",
          quantity: "400",
        }),
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
    expect(result.planSecurityIssuances).toHaveLength(2);
  });
});

describe("TX_PLAN_SECURITY_ACCEPTANCE validation", () => {
  test("valid acceptance passes", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psa_1",
          object_type: "TX_PLAN_SECURITY_ACCEPTANCE",
          date: "2021-01-15",
          security_id: "sec_1",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
  });

  test("acceptance with prior retraction fails", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psr_1",
          object_type: "TX_PLAN_SECURITY_RETRACTION",
          date: "2021-01-10",
          security_id: "sec_1",
          reason_text: "Retracted",
        },
        {
          id: "psa_1",
          object_type: "TX_PLAN_SECURITY_ACCEPTANCE",
          date: "2021-01-15",
          security_id: "sec_1",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });
});

describe("TX_PLAN_SECURITY_RETRACTION validation", () => {
  test("valid retraction passes and removes from state", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psr_1",
          object_type: "TX_PLAN_SECURITY_RETRACTION",
          date: "2021-01-10",
          security_id: "sec_1",
          reason_text: "Issued in error",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
    expect(result.planSecurityIssuances).toHaveLength(0);
  });

  test("retraction with prior acceptance fails", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psa_1",
          object_type: "TX_PLAN_SECURITY_ACCEPTANCE",
          date: "2021-01-05",
          security_id: "sec_1",
        },
        {
          id: "psr_1",
          object_type: "TX_PLAN_SECURITY_RETRACTION",
          date: "2021-01-10",
          security_id: "sec_1",
          reason_text: "Trying to retract after acceptance",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });
});

describe("TX_PLAN_SECURITY_CANCELLATION validation", () => {
  test("valid cancellation passes and removes from state", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psa_1",
          object_type: "TX_PLAN_SECURITY_ACCEPTANCE",
          date: "2021-01-05",
          security_id: "sec_1",
        },
        {
          id: "psc_1",
          object_type: "TX_PLAN_SECURITY_CANCELLATION",
          date: "2021-06-01",
          security_id: "sec_1",
          balance_security_id: "",
          reason_text: "Cancelled",
          quantity: "1000",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("appears valid");
    expect(result.planSecurityIssuances).toHaveLength(0);
  });

  test("cancellation with conflicting transaction fails", () => {
    const pkg = buildPackage({
      transactions: [
        makePlanSecurityIssuance("psi_1", "sec_1", { date: "2021-01-01" }),
        {
          id: "psr_1",
          object_type: "TX_PLAN_SECURITY_RETRACTION",
          date: "2021-01-10",
          security_id: "sec_1",
          reason_text: "Retracted",
        },
        {
          id: "psc_1",
          object_type: "TX_PLAN_SECURITY_CANCELLATION",
          date: "2021-06-01",
          security_id: "sec_1",
          balance_security_id: "",
          reason_text: "Trying to cancel after retraction",
          quantity: "1000",
        },
      ] as any,
    });

    const result = runValidator(pkg);
    expect(result.result).toContain("failed");
  });
});
