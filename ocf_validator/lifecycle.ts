import { getNextSnapshot, setup } from "xstate";
import type { LifecycleWord } from "../types/validator";
import { lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type Descriptor } from "./ocfMachine";
import { hasStockPlan } from "./validators/stock/tx_stock_cancellation";

// Build one chart per family from the descriptors. Exercise removes a warrant but leaves an equity
// grant outstanding. The caller keeps each security's state. Tests compare transitions with the
// existing checks. Snapshots use the chart's tag to decide which securities to show.

/** The security's state between transactions. */
export type LifecycleState = "notIssued" | "outstanding" | "removed";

/** Snapshots use this tag to decide which securities to include. */
export const ON_CAP_TABLE = "onCapTable";

/** The required starting state and resulting state for each lifecycle change. */
const ARROWS = {
  issue: { from: "notIssued", to: "outstanding" },
  stays: { from: "outstanding", to: "outstanding" },
  removes: { from: "outstanding", to: "removed" },
  "after removal": { from: "removed", to: "removed" },
} as const satisfies Record<LifecycleWord, { from: LifecycleState; to: LifecycleState }>;

/** Fields from the security's issuance. */
export type LifecycleContext = Readonly<Record<string, unknown>>;

/** Allowed transactions and their destinations, grouped by starting state. */
type Arrows = Record<LifecycleState, Record<string, { target: LifecycleState; guard?: "issuedFromPlan" }>>;

/**
 * Include only the transactions that apply to this family. Give every transition a target because
 * XState 5.18.2 treats a transition without a target or action as unavailable.
 */
const arrowsFor = (family: CollectionKey, descriptors: Readonly<Record<string, Descriptor>>): Arrows => {
  const arrows: Arrows = { notIssued: {}, outstanding: {}, removed: {} };
  for (const [type, descriptor] of Object.entries(descriptors)) {
    if (!lifecycleFamilies(descriptor).includes(family)) continue;
    const { from, to } = ARROWS[descriptor.lifecycle];
    arrows[from][type] = { target: to };
    if (family === "stockIssuances" && type === "TX_STOCK_PLAN_RETURN_TO_POOL") arrows[from][type].guard = "issuedFromPlan";
  }
  return arrows;
};

/**
 * Build from the transaction table so a new descriptor also updates the chart. Tests can supply a
 * smaller table. If outstanding securities gain nested states, put each self-transition in the state
 * it changes. Re-entering the parent resets its nested states in XState 5.18.2.
 */
export function buildLifecycleChart(
  family: CollectionKey,
  descriptors: Readonly<Record<string, Descriptor>> = TX_DESCRIPTORS,
) {
  const arrows = arrowsFor(family, descriptors);
  return setup({
    guards: { issuedFromPlan: ({ context }) => hasStockPlan(context.stock_plan_id) },
    types: {} as {
      context: LifecycleContext;
      events: { type: string };
      tags: typeof ON_CAP_TABLE;
    },
  }).createMachine({
    id: `lifecycle.${family}`,
    initial: "notIssued",
    context: {},
    states: {
      notIssued: { on: arrows.notIssued },
      outstanding: { tags: [ON_CAP_TABLE], on: arrows.outstanding },
      removed: { on: arrows.removed },
    },
  });
}

export type LifecycleChart = ReturnType<typeof buildLifecycleChart>;

// Build each family's chart on first use so the transaction table has finished loading.
const charts = new Map<CollectionKey, LifecycleChart>();

/** Reuse the chart for this security family. */
export const lifecycleChart = (family: CollectionKey): LifecycleChart => {
  let chart = charts.get(family);
  if (chart === undefined) {
    chart = buildLifecycleChart(family);
    charts.set(family, chart);
  }
  return chart;
};

/** Whether the transaction is allowed and, if so, the resulting state. */
export type LifecycleStep = { allowed: true; next: LifecycleState } | { allowed: false };

/**
 * Use the caller's saved state to check one transaction. The caller can store the returned state if
 * the transition succeeds.
 */
export function lifecycleStep(
  family: CollectionKey,
  state: LifecycleState,
  type: string,
  context: LifecycleContext = {},
  chart: LifecycleChart = lifecycleChart(family),
): LifecycleStep {
  const from = chart.resolveState({ value: state, context });
  const event = { type };
  if (!from.can(event)) return { allowed: false };
  return { allowed: true, next: getNextSnapshot(chart, from, event).value as LifecycleState };
}

const visibility = new WeakMap<LifecycleChart, Record<LifecycleState, boolean>>();

/** Resolve each state's tag once per chart. */
export function isOnCapTable(family: CollectionKey, state: LifecycleState, chart = lifecycleChart(family)): boolean {
  let states = visibility.get(chart);
  if (!states) {
    const tagged = (value: LifecycleState) => chart.resolveState({ value, context: {} }).hasTag(ON_CAP_TABLE);
    states = { notIssued: tagged("notIssued"), outstanding: tagged("outstanding"), removed: tagged("removed") };
    visibility.set(chart, states);
  }
  return states[state];
}
