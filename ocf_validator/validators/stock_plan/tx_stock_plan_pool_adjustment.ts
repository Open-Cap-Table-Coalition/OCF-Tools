import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_STOCK_PLAN_POOL_ADJUSTMENT = defineValidator({
  transaction: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  effect: "passthrough",
  checks: [],
});
