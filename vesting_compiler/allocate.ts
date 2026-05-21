import type { Allocation_Type } from "../types";
import type { Fraction } from "../types/canonical/vesting";

// OCF allocation types are defined in ../types (Allocation_Type). Only
// CUMULATIVE_ROUND_DOWN is implemented today — the canonical/vesting spec
// restricts itself to this mode. The other cases in `allocate` throw so the
// dispatch shape is in place for when the spec carries allocation_type and
// new modes need to be added.

/**
 * Compute floor(totalShares × cumulative). Uses BigInt for the intermediate
 * multiply so the product is exact even when totalShares × numerator would
 * overflow Number.MAX_SAFE_INTEGER. The final quotient is bounded by
 * totalShares, which is in safe-integer range by precondition, so the
 * Number() cast is safe.
 */
export const floorSharesAt = (
  totalShares: number,
  cumulative: Fraction,
): number => {
  const total = BigInt(totalShares);
  const num = BigInt(cumulative.numerator);
  const den = BigInt(cumulative.denominator);
  return Number((total * num) / den);
};

/**
 * Compute the integer share amount that should vest at the current event.
 *
 * Inputs:
 *   - type: which allocation method to apply.
 *   - totalShares: the grant's total share count (integer).
 *   - cumulative: the running exact-rational fraction-of-grant that has been
 *     scheduled to vest through (and including) this event.
 *   - vestedSoFar: the integer share count already emitted by prior events.
 *
 * The returned amount, added to vestedSoFar, gives the per-event amounts that
 * telescope to sum exactly to totalShares once cumulative reaches 1/1.
 */
export const allocate = (
  type: Allocation_Type,
  totalShares: number,
  cumulative: Fraction,
  vestedSoFar: number,
): number => {
  switch (type) {
    case "CUMULATIVE_ROUND_DOWN":
      // floor(totalShares × cumulative) − vestedSoFar. Cumulative-round-down
      // invariant: cumulative ends at 1/1, so the final floor === totalShares.
      return floorSharesAt(totalShares, cumulative) - vestedSoFar;

    case "CUMULATIVE_ROUNDING":
    case "FRONT_LOADED":
    case "BACK_LOADED":
    case "FRONT_LOADED_TO_SINGLE_TRANCHE":
    case "BACK_LOADED_TO_SINGLE_TRANCHE":
    case "FRACTIONAL":
      throw new Error(
        `Allocation type "${type}" is not yet implemented; only CUMULATIVE_ROUND_DOWN is supported.`,
      );
  }
};
