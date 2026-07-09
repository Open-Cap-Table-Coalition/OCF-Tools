import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT = defineValidator({
  transaction: "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT",
  effect: "passthrough",
  checks: [],
});
