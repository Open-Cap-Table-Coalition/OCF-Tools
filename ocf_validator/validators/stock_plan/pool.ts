import type { Finding } from "../../../types/finding";
import type { Check, OcfMachineContext } from "../../../types/validator";
import { planField, type NodeMap } from "../../nodes";
import { exceeds, subtract } from "../../numeric";
import { text, toValidate, type CheckObject } from "../checkKit";

// ---------------------------------------------------------------------------
// The stock plan pool check (#235)
// ---------------------------------------------------------------------------
//
// An aggregate check: it's about a stock plan, not about any one transaction,
// and it runs at the end of a day, on the day's net. A day's transactions
// can pass through states no one would call wrong: a balance grant is issued
// before the cancellation that names it, so for a moment the pool holds both
// the grant and its balance. Judging the pool once the day is done leaves
// that order out of it.

/** A stock plan on a day: what the check is run on, and its findings' subject. */
type PlanOnDay = { object_type: "STOCK_PLAN"; id: string; date: string };

/**
 * A stock plan's grants have drawn no more shares than the plan has reserved.
 *
 * It reads both of the plan's fields, so it's blocked when either is marked:
 * by a grant that failed, whose shares may or may not belong in `drawn`, or by
 * a pool adjustment that failed. The finding then points at those
 * transactions, and the plan's other grants are still checked on their own
 * terms.
 *
 * A plan whose reserve isn't known has nothing to be held against, so the
 * check passes over it. That's a plan the package's stock plan files don't
 * have: saying so is for the reference data check (#234), not this one.
 */
export const poolNotExceeded = {
  id: "pool-not-exceeded",
  severity: "error",
  description: "At the end of each day, a stock plan's grants have drawn no more shares than the plan has reserved.",
  reads: (data) => [planField(data.id, "reserved"), planField(data.id, "drawn")],
  run: (_context, data, read) => {
    const reserved = read(planField(data.id, "reserved"));
    const drawn = read(planField(data.id, "drawn"));
    if (reserved === undefined || drawn === undefined || !exceeds(drawn, reserved)) return [];
    return [
      text`As of ${data.date}, stock plan ${data.id} has ${drawn} shares drawn against ${reserved} reserved: ${subtract(drawn, reserved)} more than it has.`,
    ];
  },
} satisfies CheckObject<PlanOnDay>;

/** The checks run on a stock plan at the end of a day, as the coverage report lists a transaction's. */
export const STOCK_PLAN_CHECKS: readonly Check[] = [
  { id: poolNotExceeded.id, severity: poolNotExceeded.severity, description: poolNotExceeded.description },
];

const validatePlan = toValidate([poolNotExceeded]);

/**
 * The findings of the end-of-day checks for `date`.
 *
 * A plan is checked on a day something wrote to its pool: its node isn't the
 * one the day started with. `since` is the node map as the day began, and the
 * map is immutable, so a node that is still the same object hasn't changed. A
 * plan nothing touched was checked the last time something did, and isn't
 * reported again each day after.
 */
export function endOfDayFindings(context: OcfMachineContext, since: NodeMap, date: string): Finding[] {
  const findings: Finding[] = [];
  for (const [id, plan] of context.nodes.plan) {
    if (since.plan.get(id) === plan) continue;
    findings.push(...validatePlan(context, { object_type: "STOCK_PLAN", id, date }));
  }
  return findings;
}
