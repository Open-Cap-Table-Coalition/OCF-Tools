import type { CheckObject } from "../checkKit";
import { familyChecksFor } from "../checks";

/** Checks used by more than one equity compensation validator, worded for equity compensation. */
export const { issuanceExists, noOtherTransactions } = familyChecksFor({
  name: "equity compensation",
  collection: "equityCompensation",
  issuance: "TX_EQUITY_COMPENSATION_ISSUANCE",
  acceptance: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  vests: true,
  returnsToPool: true,
  leavesOutstanding: [
    "TX_EQUITY_COMPENSATION_EXERCISE",
    "TX_EQUITY_COMPENSATION_RELEASE",
    "TX_EQUITY_COMPENSATION_REPRICING",
  ],
  deprecatedIssuance: "TX_PLAN_SECURITY_ISSUANCE",
});

/**
 * Declared, not written yet. An exercise or release leaves its security in
 * the collection, because a partial one leaves the rest outstanding under the
 * same security_id, and nothing tracks how much is left. So issuance-exists
 * can't tell a fully exercised or released grant from one with shares left:
 * a second full release passes, and so does a cancellation after a full
 * exercise. The exercise, release, cancellation, and transfer each list this
 * check so the coverage report shows it isn't done.
 */
export const quantityOutstanding = {
  id: "quantity-outstanding",
  severity: "error",
  description:
    "The transaction's quantity is no more than the grant has left after the exercises and releases dated on or before it.",
} satisfies CheckObject;
