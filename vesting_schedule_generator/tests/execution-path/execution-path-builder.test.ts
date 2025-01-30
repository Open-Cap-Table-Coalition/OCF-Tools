import { GraphNode, TX_Vesting_Start } from "types";
import { getOCFDataBySecurityId } from "../../get-ocf-data-by-security-id";
import { ocfPackage as FourYearMonthly1YearCliff } from "../testOcfPackages/documentation_examples/4yr-1yr-cliff-schedule";
import { parseISO } from "date-fns";
import { ocfPackage as DeliberateCycle } from "../testOcfPackages/deliberate-cycle";
import { ocfPackage as NoRootNodes } from "../testOcfPackages/no-root-nodes";
import { ExecutionPathBuilder } from "../../execution-path/ExecutionPathBuilder";
import { ExecutionStrategyFactory } from "../../execution-path/factory";
import { createVestingGraph } from "../../execution-path/create-vesting-graph";
import { OcfPackageContent } from "read_ocf_package";

const getExecutionPath = (
  ocfPackage: OcfPackageContent,
  securityId: string
): Map<string, GraphNode> => {
  /**********************************
   * Get OCF Data for the securityId
   **********************************/

  const start_event: TX_Vesting_Start = {
    id: "vesting-start",
    object_type: "TX_VESTING_START",
    date: "2025-01-01",
    security_id: "equity_compensation_issuance_01",
    vesting_condition_id: "vesting-start",
  };

  ocfPackage.transactions.push(start_event);

  const ocfData = getOCFDataBySecurityId(ocfPackage, securityId);

  /******************************
   * Prepare vesting conditions
   ******************************/
  const vestingConditions = ocfData.issuanceVestingTerms!.vesting_conditions;
  const graphNodes = vestingConditions.map((vc) => {
    const graphNode: GraphNode = {
      ...vc,
      triggeredDate: undefined,
      prior_condition_ids: [],
    };

    return graphNode;
  });

  /******************************
   * Create vesting graph
   ******************************/
  const { graph, rootNodes } = createVestingGraph(graphNodes);

  /******************************
   * Create the execution stack
   ******************************/
  const builder = new ExecutionPathBuilder(
    graph,
    rootNodes,
    ocfData,
    ExecutionStrategyFactory
  );

  const executionPath = builder.build();

  return executionPath;
};

describe("4 year monthly with one year cliff", () => {
  const executionPath = getExecutionPath(
    FourYearMonthly1YearCliff,
    "equity_compensation_issuance_01"
  );

  test("Stack should be as expected", () => {
    const expectedStack = new Map<string, GraphNode>([
      [
        "vesting-start",
        {
          id: "vesting-start",
          quantity: "0",
          trigger: {
            type: "VESTING_START_DATE",
          },
          next_condition_ids: ["cliff"],
          prior_condition_ids: [],
          triggeredDate: parseISO("2025-01-01"),
        },
      ],
      [
        "cliff",
        {
          id: "cliff",
          description: "25% payout at 1 year",
          portion: {
            numerator: "12",
            denominator: "48",
          },
          trigger: {
            type: "VESTING_SCHEDULE_RELATIVE",
            period: {
              length: 12,
              type: "MONTHS",
              occurrences: 1,
              day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
            },
            relative_to_condition_id: "vesting-start",
          },
          next_condition_ids: ["monthly-thereafter"],
          prior_condition_ids: ["vesting-start"],
          triggeredDate: parseISO("2026-01-01"),
        },
      ],
      [
        "monthly-thereafter",
        {
          id: "monthly-thereafter",
          description: "1/48th payout each month thereafter",
          portion: {
            numerator: "1",
            denominator: "48",
          },
          trigger: {
            type: "VESTING_SCHEDULE_RELATIVE",
            period: {
              length: 1,
              type: "MONTHS",
              occurrences: 36,
              day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
            },
            relative_to_condition_id: "cliff",
          },
          next_condition_ids: [],
          prior_condition_ids: ["cliff"],
          triggeredDate: parseISO("2026-02-01"),
        },
      ],
    ]);

    expect(executionPath).toStrictEqual(expectedStack);
  });
});

describe("Deliberate cycle", () => {
  test("Should throw an error when cycle is detected", () => {
    expect(() =>
      getExecutionPath(DeliberateCycle, "equity_compensation_issuance_01")
    ).toThrow("Cycle detected involving the vesting condition with id 2");
  });
});

describe("No root nodes", () => {
  test("Should throw an error when cycle is detected", () => {
    expect(() =>
      getExecutionPath(NoRootNodes, "equity_compensation_issuance_01")
    ).toThrow(
      `The graph must have at least one starting condition with no prior conditions`
    );
  });
});
