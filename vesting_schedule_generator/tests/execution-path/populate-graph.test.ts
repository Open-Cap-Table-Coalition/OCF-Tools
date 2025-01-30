import { createVestingGraph } from "../../execution-path/create-vesting-graph";
import type { GraphNode } from "types";
import {
  buildPopulatedGraphNode,
  buildUnpopulatedGraphNode,
} from "../helpers/graph-builder";
import { formatISO } from "date-fns";

describe("Four Year Monthly With 1 Year Cliff", () => {
  const graphNodes: GraphNode[] = [
    {
      id: "vesting-start",
      description: "vesting start",
      trigger: {
        type: "VESTING_START_DATE",
      },
      next_condition_ids: ["monthly-vesting"],
      prior_condition_ids: [],
      triggeredDate: undefined,
    },

    {
      id: "monthly-vesting",
      description: "monthly vesting",
      trigger: {
        type: "VESTING_SCHEDULE_RELATIVE",
        period: {
          length: 1,
          type: "MONTHS",
          occurrences: 48,
          day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
        },
        relative_to_condition_id: "vesting-start",
      },
      next_condition_ids: [],
      prior_condition_ids: [],
      triggeredDate: undefined,
    },
  ];

  const vestingGraph = createVestingGraph(graphNodes);

  const expectedRootNodes = ["vesting-start"];
  const expectedGraph = new Map<string, GraphNode>([
    [
      "vesting-start",
      {
        id: "vesting-start",
        description: "vesting start",
        trigger: {
          type: "VESTING_START_DATE",
        },
        next_condition_ids: ["monthly-vesting"],
        prior_condition_ids: [],
        triggeredDate: undefined,
      },
    ],
    [
      "monthly-vesting",
      {
        id: "monthly-vesting",
        description: "monthly vesting",
        trigger: {
          type: "VESTING_SCHEDULE_RELATIVE",
          period: {
            length: 1,
            type: "MONTHS",
            occurrences: 48,
            day_of_month: "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH",
          },
          relative_to_condition_id: "vesting-start",
        },
        next_condition_ids: [],
        prior_condition_ids: ["vesting-start"],
        triggeredDate: undefined,
      },
    ],
  ]);

  test("Expect root nodes to return as expected", () => {
    expect(vestingGraph.rootNodes).toStrictEqual(expectedRootNodes);
  });

  test("Expected populated graph to return as expected", () => {
    expect(vestingGraph.graph).toStrictEqual(expectedGraph);
  });
});

describe("Start followed by event", () => {
  const first = buildUnpopulatedGraphNode("first", ["second"], {
    type: "VESTING_START_DATE",
  });
  const second = buildUnpopulatedGraphNode("second", [], {
    type: "VESTING_EVENT",
  });

  const vestingGraph = createVestingGraph([first, second]);

  const expectedRootNodes = [first.id];

  const expectedGraph = new Map<string, GraphNode>([
    [first.id, buildPopulatedGraphNode(first, [])],
    [second.id, buildPopulatedGraphNode(second, [first.id])],
  ]);

  test("Expect root nodes to return as expected", () => {
    expect(vestingGraph.rootNodes).toStrictEqual(expectedRootNodes);
  });

  test("Expect populated graph to return as expected", () => {
    expect(vestingGraph.graph).toStrictEqual(expectedGraph);
  });
});
