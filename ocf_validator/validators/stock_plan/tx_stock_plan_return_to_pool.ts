import { securityField } from "../../nodes";
import { defineValidator, text, type CheckObject } from "../checkKit";
import { countable } from "../checks";

// A return to pool is the one transaction that follows a security's removal:
// it records which plan the removed grant's shares went back to. It takes its
// quantity out of that plan's `drawn`. The plan needn't be the one the grant
// came from.
//
// The source must have been removed reliably before its shares can credit a
// pool, including a different plan's pool. Quantity limits remain a gap.

const securityRemoved = {
  id: "security-removed",
  severity: "error",
  description:
    "The security the shares are returned from is an equity compensation security that a transaction dated on or before this one removed.",
  reads: (data) => [securityField("equityCompensation", data.security_id, "lifecycle")],
  run: (_context, data, read) =>
    read(securityField("equityCompensation", data.security_id, "lifecycle")) === "removed"
      ? []
      : [text`The equity compensation security ${data.security_id} has not been removed, so its shares cannot be returned to a pool.`],
} satisfies CheckObject<{ security_id: string }>;

const quantityReturnable = {
  id: "quantity-returnable",
  severity: "error",
  description: "No more is returned than the security's removals took out of it, less what was returned before.",
} satisfies CheckObject;

export const TX_STOCK_PLAN_RETURN_TO_POOL = defineValidator({
  transaction: "TX_STOCK_PLAN_RETURN_TO_POOL",
  effect: "none",
  lifecycle: "after removal",
  families: ["equityCompensation"],
  pool: "returns",
  checks: [countable("quantity"), securityRemoved, quantityReturnable],
});
