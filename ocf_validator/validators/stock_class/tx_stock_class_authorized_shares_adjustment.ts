import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT = defineValidator({
  transaction: "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
  effect: "passthrough",
  checks: [],
});
