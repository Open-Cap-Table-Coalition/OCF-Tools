import { getNextSnapshot, setup } from "xstate";
import type { LifecycleWord } from "../types/validator";
import { lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type Descriptor } from "./ocfMachine";

// ---------------------------------------------------------------------------
// The lifecycle of a security, as one chart per family (#233)
// ---------------------------------------------------------------------------
//
//   notIssued ── an issuance ──▶ outstanding ── a removal ──▶ removed
//                                   │   ▲                      │   ▲
//                                   └───┘                      └───┘
//                        what leaves it outstanding    what follows a removal
//
// The states are the same for every family. The arrows differ: a warrant's
// exercise removes it, and an equity compensation exercise leaves the grant
// outstanding. So there is one chart per family, and nobody writes one by
// hand: each descriptor in `TX_DESCRIPTORS` declares a lifecycle word, and the
// factory below turns a family's words into its arrows. Adding a transaction
// type to the table adds its arrow.
//
// A chart is a lookup, not a running actor. Nothing here keeps a security's
// state: the caller stores the state value, and `lifecycleStep` rebuilds the
// state from it, asks whether a transaction is allowed, and returns the state
// that follows. No actor is spawned per security, because a transfer is one
// write across several securities, and separate actors could apply one side
// and silently ignore the other.
//
// Nothing in the validator calls this yet. The charts run in shadow, in the
// test suite, against the two checks they are meant to replace
// (tests/lifecycleShadow.test.ts).

/** Where a security is in its life. The state value a caller stores. */
export type LifecycleState = "notIssued" | "outstanding" | "removed";

/**
 * The tag on the state a security is in while it's on the cap table. A caller
 * that wants to know which securities to show asks for the tag
 * (`isOnCapTable`), so it never names a state.
 */
export const ON_CAP_TABLE = "onCapTable";

/** The arrow each lifecycle word draws: the state it leaves and the state it reaches. */
const ARROWS = {
  issue: { from: "notIssued", to: "outstanding" },
  stays: { from: "outstanding", to: "outstanding" },
  removes: { from: "outstanding", to: "removed" },
  "after removal": { from: "removed", to: "removed" },
} as const satisfies Record<LifecycleWord, { from: LifecycleState; to: LifecycleState }>;

/**
 * What a chart's guards can read: the fields of the security the caller is
 * asking about. No arrow has a guard yet, so nothing is required of it. A
 * guard on the exercise arrow ("something is left") is what will read it.
 */
export type LifecycleContext = Readonly<Record<string, unknown>>;

/** A family's arrows by the state they leave: transaction type to the state it reaches. */
type Arrows = Record<LifecycleState, Record<string, { target: LifecycleState }>>;

/**
 * Collects a family's arrows from the descriptors: one for each transaction
 * type that lists the family, drawn by its lifecycle word.
 *
 * Every arrow names its target, including the ones that leave the security
 * where it is. On the pinned XState (5.18.2) an arrow with no target and no
 * action counts as "not allowed", so a targetless "stays" arrow would reject
 * the very transactions it's there to accept.
 */
const arrowsFor = (family: CollectionKey, descriptors: Readonly<Record<string, Descriptor>>): Arrows => {
  const arrows: Arrows = { notIssued: {}, outstanding: {}, removed: {} };
  for (const [type, descriptor] of Object.entries(descriptors)) {
    if (!lifecycleFamilies(descriptor).includes(family)) continue;
    const { from, to } = ARROWS[descriptor.lifecycle];
    arrows[from][type] = { target: to };
  }
  return arrows;
};

/**
 * Builds a family's lifecycle chart from the descriptors' lifecycle words.
 * `descriptors` defaults to the real table; a test can pass its own to see
 * that a new transaction type becomes a new arrow.
 *
 * The chart's definition is plain data (`chart.config`), so it can be drawn
 * as a diagram and read by someone who doesn't read TypeScript.
 *
 * `outstanding` has no regions yet. When it gains one (an acceptance region,
 * if #230 decides a second acceptance is an error), the "stays" arrows have
 * to move inside the region they affect: on the pinned XState an arrow from a
 * state back to itself resets that state's regions, so accepting a grant and
 * then exercising it would undo the acceptance.
 */
export function buildLifecycleChart(
  family: CollectionKey,
  descriptors: Readonly<Record<string, Descriptor>> = TX_DESCRIPTORS,
) {
  const arrows = arrowsFor(family, descriptors);
  return setup({
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

// The charts of the real table, built the first time each is asked for. Built
// on demand because this module and `ocfMachine.ts` will import each other
// once the machine consults the charts, and the table isn't there to read
// while the modules are still loading.
const charts = new Map<CollectionKey, LifecycleChart>();

/** The lifecycle chart of a family, built from `TX_DESCRIPTORS`. */
export const lifecycleChart = (family: CollectionKey): LifecycleChart => {
  let chart = charts.get(family);
  if (chart === undefined) {
    chart = buildLifecycleChart(family);
    charts.set(family, chart);
  }
  return chart;
};

/** What a chart says about one transaction on one security. */
export type LifecycleStep = { allowed: true; next: LifecycleState } | { allowed: false };

/**
 * Asks a family's chart about a transaction of `type` on a security in
 * `state`: is it allowed, and if so, what state follows? `context` is the
 * security's fields, for the chart's guards.
 *
 * It's a pure function of its arguments. The caller keeps the state value and
 * stores `next`; nothing is kept here between calls. A type the chart has no
 * arrow for, in any state, is simply not allowed.
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

/** Whether a security in `state` is on the cap table, by the chart's tag. */
export const isOnCapTable = (
  family: CollectionKey,
  state: LifecycleState,
  chart: LifecycleChart = lifecycleChart(family),
): boolean => chart.resolveState({ value: state, context: {} }).hasTag(ON_CAP_TABLE);
