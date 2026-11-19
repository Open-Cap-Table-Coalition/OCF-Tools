import { defineValidator } from "../checkKit";
import { countable } from "../checks";

// A pool adjustment sets reserved shares and names no security.

export const TX_STOCK_PLAN_POOL_ADJUSTMENT = defineValidator({
  transaction: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  effect: "none",
  families: [],
  pool: "reserves",
  checks: [countable("shares_reserved")],
});
