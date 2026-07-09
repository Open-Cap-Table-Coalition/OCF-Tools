import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_STOCK_PLAN_RETURN_TO_POOL = defineValidator({
  transaction: "TX_STOCK_PLAN_RETURN_TO_POOL",
  effect: "passthrough",
  checks: [],
});
