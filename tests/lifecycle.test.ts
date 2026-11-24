import { describe, it, expect, vi } from "vitest";
import {
  buildLifecycleChart,
  isOnCapTable,
  lifecycleChart,
  lifecycleStep,
  type LifecycleContext,
  type LifecycleState,
} from "../ocf_validator/lifecycle";
import { TX_DESCRIPTORS, type CollectionKey, type Descriptor } from "../ocf_validator/ocfMachine";

const FAMILIES: CollectionKey[] = ["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"];
const STATES: LifecycleState[] = ["notIssued", "outstanding", "removed"];

/** Keep the last allowed state while testing the next transaction in the sequence. */
const walk = (family: CollectionKey, history: string[], context: LifecycleContext = {}): (LifecycleState | "not allowed")[] => {
  let state: LifecycleState = "notIssued";
  return history.map((type) => {
    const step = lifecycleStep(family, state, type, context);
    if (!step.allowed) return "not allowed";
    state = step.next;
    return state;
  });
};

// Chart definitions

// Expected transitions from #233. Include both names for equity compensation transactions.
const VESTING = ["TX_VESTING_START", "TX_VESTING_EVENT", "TX_VESTING_ACCELERATION"];
const EXPECTED: Record<CollectionKey, { issue: string[]; stays: string[]; removes: string[]; afterRemoval: string[] }> = {
  stockIssuances: {
    issue: ["TX_STOCK_ISSUANCE"],
    stays: ["TX_STOCK_ACCEPTANCE", ...VESTING],
    removes: [
      "TX_STOCK_RETRACTION",
      "TX_STOCK_CANCELLATION",
      "TX_STOCK_REPURCHASE",
      "TX_STOCK_TRANSFER",
      "TX_STOCK_CONVERSION",
      "TX_STOCK_REISSUANCE",
      "TX_STOCK_CONSOLIDATION",
    ],
    afterRemoval: ["TX_STOCK_PLAN_RETURN_TO_POOL"],
  },
  convertibleIssuances: {
    issue: ["TX_CONVERTIBLE_ISSUANCE"],
    stays: ["TX_CONVERTIBLE_ACCEPTANCE"],
    removes: ["TX_CONVERTIBLE_RETRACTION", "TX_CONVERTIBLE_CANCELLATION", "TX_CONVERTIBLE_TRANSFER", "TX_CONVERTIBLE_CONVERSION"],
    afterRemoval: [],
  },
  warrantIssuances: {
    issue: ["TX_WARRANT_ISSUANCE"],
    stays: ["TX_WARRANT_ACCEPTANCE", ...VESTING],
    removes: ["TX_WARRANT_RETRACTION", "TX_WARRANT_CANCELLATION", "TX_WARRANT_TRANSFER", "TX_WARRANT_EXERCISE"],
    afterRemoval: [],
  },
  equityCompensation: {
    issue: ["TX_EQUITY_COMPENSATION_ISSUANCE", "TX_PLAN_SECURITY_ISSUANCE"],
    stays: [
      "TX_EQUITY_COMPENSATION_ACCEPTANCE",
      "TX_EQUITY_COMPENSATION_REPRICING",
      "TX_EQUITY_COMPENSATION_EXERCISE",
      "TX_EQUITY_COMPENSATION_RELEASE",
      "TX_PLAN_SECURITY_ACCEPTANCE",
      "TX_PLAN_SECURITY_EXERCISE",
      "TX_PLAN_SECURITY_RELEASE",
      ...VESTING,
    ],
    removes: [
      "TX_EQUITY_COMPENSATION_RETRACTION",
      "TX_EQUITY_COMPENSATION_CANCELLATION",
      "TX_EQUITY_COMPENSATION_TRANSFER",
      "TX_PLAN_SECURITY_RETRACTION",
      "TX_PLAN_SECURITY_CANCELLATION",
      "TX_PLAN_SECURITY_TRANSFER",
    ],
    afterRemoval: ["TX_STOCK_PLAN_RETURN_TO_POOL"],
  },
};

describe("a family's chart, read as data", () => {
  it.each(FAMILIES)("%s has the three states and exactly the arrows #233 lists", (family) => {
    // Read the chart configuration directly.
    const { states } = lifecycleChart(family).config as {
      states: Record<LifecycleState, { on: Record<string, { target: LifecycleState }> }>;
    };
    const arrows = (from: LifecycleState, to: LifecycleState) =>
      Object.entries(states[from].on)
        .filter(([, arrow]) => arrow.target === to)
        .map(([type]) => type)
        .sort();

    expect(Object.keys(states)).toEqual(STATES);
    const expected = EXPECTED[family];
    expect(arrows("notIssued", "outstanding")).toEqual([...expected.issue].sort());
    expect(arrows("outstanding", "outstanding")).toEqual([...expected.stays].sort());
    expect(arrows("outstanding", "removed")).toEqual([...expected.removes].sort());
    expect(arrows("removed", "removed")).toEqual([...expected.afterRemoval].sort());

    // A removed security can only stay removed.
    const count = (state: LifecycleState) => Object.keys(states[state].on).length;
    expect(count("notIssued")).toBe(expected.issue.length);
    expect(count("outstanding")).toBe(expected.stays.length + expected.removes.length);
    expect(count("removed")).toBe(expected.afterRemoval.length);
  });

  it("starts every security not issued", () => {
    for (const family of FAMILIES) expect(lifecycleChart(family).config.initial).toBe("notIssued");
  });

  it("puts every transaction type that names a security on at least one chart", () => {
    const onSomeChart = new Set(FAMILIES.flatMap((family) => Object.values(EXPECTED[family]).flat()));
    const namesNoSecurity = Object.keys(TX_DESCRIPTORS).filter((type) => !onSomeChart.has(type));
    expect(namesNoSecurity.sort()).toEqual([
      "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
      "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
      "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT",
      "TX_STOCK_CLASS_SPLIT",
      "TX_STOCK_PLAN_POOL_ADJUSTMENT",
    ]);
  });
});

// Transaction histories

describe("the lookup on short real histories", () => {
  it("issues, accepts, and cancels a convertible, and allows nothing after", () => {
    expect(
      walk("convertibleIssuances", [
        "TX_CONVERTIBLE_ISSUANCE",
        "TX_CONVERTIBLE_ACCEPTANCE",
        "TX_CONVERTIBLE_CANCELLATION",
        "TX_CONVERTIBLE_ACCEPTANCE",
        "TX_CONVERTIBLE_CONVERSION",
      ]),
    ).toEqual(["outstanding", "outstanding", "removed", "not allowed", "not allowed"]);
  });

  it("removes a warrant when it's exercised", () => {
    expect(walk("warrantIssuances", ["TX_WARRANT_ISSUANCE", "TX_VESTING_START", "TX_WARRANT_EXERCISE", "TX_WARRANT_EXERCISE"])).toEqual([
      "outstanding",
      "outstanding",
      "removed",
      "not allowed",
    ]);
  });

  it("leaves a grant outstanding through a repricing, exercises and a release, until it's cancelled", () => {
    expect(
      walk("equityCompensation", [
        "TX_EQUITY_COMPENSATION_ISSUANCE",
        "TX_EQUITY_COMPENSATION_ACCEPTANCE",
        "TX_VESTING_EVENT",
        "TX_EQUITY_COMPENSATION_REPRICING",
        "TX_EQUITY_COMPENSATION_EXERCISE",
        "TX_EQUITY_COMPENSATION_EXERCISE",
        "TX_EQUITY_COMPENSATION_RELEASE",
        "TX_EQUITY_COMPENSATION_CANCELLATION",
        "TX_EQUITY_COMPENSATION_EXERCISE",
      ]),
    ).toEqual([
      "outstanding",
      "outstanding",
      "outstanding",
      "outstanding",
      "outstanding",
      "outstanding",
      "outstanding",
      "removed",
      "not allowed",
    ]);
  });

  it("allows a return to pool only once the grant is removed, and as often as it's recorded", () => {
    expect(
      walk("equityCompensation", [
        "TX_STOCK_PLAN_RETURN_TO_POOL",
        "TX_EQUITY_COMPENSATION_ISSUANCE",
        "TX_STOCK_PLAN_RETURN_TO_POOL",
        "TX_EQUITY_COMPENSATION_RETRACTION",
        "TX_STOCK_PLAN_RETURN_TO_POOL",
        "TX_STOCK_PLAN_RETURN_TO_POOL",
      ]),
    ).toEqual(["not allowed", "outstanding", "not allowed", "removed", "removed", "removed"]);
  });

  it("allows a plan-issued stock return only after cancellation", () => {
    expect(walk("stockIssuances", [
      "TX_STOCK_ISSUANCE", "TX_STOCK_PLAN_RETURN_TO_POOL", "TX_STOCK_CANCELLATION", "TX_STOCK_PLAN_RETURN_TO_POOL",
    ], { stock_plan_id: "plan-1" })).toEqual(["outstanding", "not allowed", "removed", "removed"]);
  });

  it("follows a grant under the plan security names the same way", () => {
    expect(
      walk("equityCompensation", [
        "TX_PLAN_SECURITY_ISSUANCE",
        "TX_PLAN_SECURITY_EXERCISE",
        "TX_PLAN_SECURITY_CANCELLATION",
        "TX_PLAN_SECURITY_RELEASE",
        "TX_STOCK_PLAN_RETURN_TO_POOL",
      ]),
    ).toEqual(["outstanding", "outstanding", "removed", "not allowed", "removed"]);
  });

  it("removes stock on a consolidation, which names it in a list", () => {
    expect(walk("stockIssuances", ["TX_STOCK_ISSUANCE", "TX_STOCK_ACCEPTANCE", "TX_STOCK_CONSOLIDATION", "TX_STOCK_TRANSFER"])).toEqual([
      "outstanding",
      "outstanding",
      "removed",
      "not allowed",
    ]);
  });

  it("allows nothing but an issuance on a security that isn't issued, and no second issuance", () => {
    expect(walk("warrantIssuances", ["TX_WARRANT_ACCEPTANCE", "TX_WARRANT_CANCELLATION", "TX_WARRANT_ISSUANCE", "TX_WARRANT_ISSUANCE"])).toEqual([
      "not allowed",
      "not allowed",
      "outstanding",
      "not allowed",
    ]);
  });

  it("doesn't issue a removed security again", () => {
    expect(walk("convertibleIssuances", ["TX_CONVERTIBLE_ISSUANCE", "TX_CONVERTIBLE_RETRACTION", "TX_CONVERTIBLE_ISSUANCE"])).toEqual([
      "outstanding",
      "removed",
      "not allowed",
    ]);
  });

  it("refuses another family's transaction, a vesting transaction on a convertible, and a type it has never heard of", () => {
    for (const state of STATES) {
      expect(lifecycleStep("convertibleIssuances", state, "TX_WARRANT_ACCEPTANCE")).toEqual({ allowed: false });
      expect(lifecycleStep("convertibleIssuances", state, "TX_VESTING_EVENT")).toEqual({ allowed: false });
      expect(lifecycleStep("convertibleIssuances", state, "TX_STOCK_CLASS_SPLIT")).toEqual({ allowed: false });
      expect(lifecycleStep("convertibleIssuances", state, "TX_NOT_A_REAL_TYPE")).toEqual({ allowed: false });
    }
  });
});

// Independent securities

describe("the lookup is a pure function of the stored state", () => {
  it("answers from the state value it's handed, whatever it was asked before", () => {
    // Two securities can use the same chart and keep separate states.
    expect(lifecycleStep("warrantIssuances", "outstanding", "TX_WARRANT_EXERCISE")).toEqual({ allowed: true, next: "removed" });
    expect(lifecycleStep("warrantIssuances", "outstanding", "TX_WARRANT_ACCEPTANCE")).toEqual({ allowed: true, next: "outstanding" });
    expect(lifecycleStep("warrantIssuances", "removed", "TX_WARRANT_ACCEPTANCE")).toEqual({ allowed: false });
    expect(lifecycleStep("warrantIssuances", "notIssued", "TX_WARRANT_ISSUANCE")).toEqual({ allowed: true, next: "outstanding" });
  });

  it("allows a transaction that leaves the security where it is", () => {
    for (const type of EXPECTED.equityCompensation.stays) {
      expect(lifecycleStep("equityCompensation", "outstanding", type)).toEqual({ allowed: true, next: "outstanding" });
    }
    expect(lifecycleStep("equityCompensation", "removed", "TX_STOCK_PLAN_RETURN_TO_POOL")).toEqual({ allowed: true, next: "removed" });
  });

  it.each([undefined, ""])("refuses a stock return when the issuance has no plan (%s)", (stock_plan_id) => {
    expect(lifecycleStep("stockIssuances", "removed", "TX_STOCK_PLAN_RETURN_TO_POOL", { stock_plan_id })).toEqual({ allowed: false });
  });
});

// Snapshot visibility

describe("the on-the-cap-table tag", () => {
  it("reuses the chart's tag decisions across snapshots", () => {
    const chart = buildLifecycleChart("warrantIssuances");
    const resolve = vi.spyOn(chart, "resolveState");
    const visible = () => STATES.filter((state) => isOnCapTable("warrantIssuances", state, chart));
    expect(visible()).toEqual(["outstanding"]);
    resolve.mockClear();
    expect(visible()).toEqual(["outstanding"]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(FAMILIES)("marks only an outstanding %s security", (family) => {
    expect(STATES.filter((state) => isOnCapTable(family, state))).toEqual(["outstanding"]);
  });
});

// Building charts

describe("the factory builds a chart from the descriptors it's given", () => {
  // Use one transaction per lifecycle change and one transaction the family should exclude.
  const descriptor = (lifecycle: Descriptor["lifecycle"], families: CollectionKey[]): Descriptor => ({
    effect: "passthrough",
    lifecycle,
    families,
  });
  const table = {
    GRANT: descriptor("issue", ["equityCompensation"]),
    VEST: descriptor("stays", ["equityCompensation", "warrantIssuances"]),
    FORFEIT: descriptor("removes", ["equityCompensation"]),
    RETURN: descriptor("after removal", ["equityCompensation"]),
    WARRANT_ONLY: descriptor("stays", ["warrantIssuances"]),
    NO_SECURITY: descriptor("stays", []),
  };

  const stepOn = (chart: ReturnType<typeof buildLifecycleChart>, state: LifecycleState, type: string) =>
    lifecycleStep("equityCompensation", state, type, {}, chart);

  it("draws one arrow per word and leaves out other families' transactions", () => {
    const chart = buildLifecycleChart("equityCompensation", table);

    expect(stepOn(chart, "notIssued", "GRANT")).toEqual({ allowed: true, next: "outstanding" });
    expect(stepOn(chart, "outstanding", "VEST")).toEqual({ allowed: true, next: "outstanding" });
    expect(stepOn(chart, "outstanding", "FORFEIT")).toEqual({ allowed: true, next: "removed" });
    expect(stepOn(chart, "removed", "RETURN")).toEqual({ allowed: true, next: "removed" });
    for (const state of STATES) {
      expect(stepOn(chart, state, "WARRANT_ONLY")).toEqual({ allowed: false });
      expect(stepOn(chart, state, "NO_SECURITY")).toEqual({ allowed: false });
    }
  });

  it("adds an arrow when a transaction type is added to the table", () => {
    const before = buildLifecycleChart("equityCompensation", table);
    const after = buildLifecycleChart("equityCompensation", { ...table, EXPIRE: descriptor("removes", ["equityCompensation"]) });

    expect(stepOn(before, "outstanding", "EXPIRE")).toEqual({ allowed: false });
    expect(stepOn(after, "outstanding", "EXPIRE")).toEqual({ allowed: true, next: "removed" });
  });
});
