import type { Finding } from "../../../types/finding";
import type { Check, OcfMachineContext } from "../../../types/validator";
import { planField, type NodeMap } from "../../nodes";
import { exceeds, subtract } from "../../numeric";
import { text, toValidate, type CheckObject } from "../checkKit";

// Check the plan after all transactions for the day. A same-day balance issuance can temporarily
// count shares twice until its cancellation identifies the balance.

/** Identify the plan being checked and the date of the check. */
type PlanOnDay = { object_type: "STOCK_PLAN"; id: string; date: string };

/**
 * Compare drawn and reserved shares. Earlier failures affecting either total block this check and
 * identify which transactions to fix. Skip an unknown reserve because the available shares cannot be
 * calculated (#234).
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

/** Plan checks listed for the coverage report. */
export const STOCK_PLAN_CHECKS: readonly Check[] = [
  { id: poolNotExceeded.id, severity: poolNotExceeded.severity, description: poolNotExceeded.description },
];

const validatePlan = toValidate([poolNotExceeded]);

/**
 * Check a plan if its record changed since the day began. Comparing record identity works because
 * writes preserve earlier maps. This avoids reporting the same untouched plan on successive days.
 */
export function endOfDayFindings(context: OcfMachineContext, since: NodeMap, date: string): Finding[] {
  const findings: Finding[] = [];
  for (const [id, plan] of context.nodes.plan) {
    if (since.plan.get(id) === plan) continue;
    findings.push(...validatePlan(context, { object_type: "STOCK_PLAN", id, date }).map((finding) => ({ ...finding, date })));
  }
  return findings;
}
