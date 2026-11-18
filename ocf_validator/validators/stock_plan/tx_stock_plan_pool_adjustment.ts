import { defineValidator } from "../checkKit";
import { countable } from "../checks";

// A pool adjustment sets the number of shares a stock plan has reserved. It
// names a plan and no security, so it's on no family's lifecycle chart.

export const TX_STOCK_PLAN_POOL_ADJUSTMENT = defineValidator({
  transaction: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  effect: "none",
  families: [],
  pool: "reserves",
  checks: [countable("shares_reserved")],
});
