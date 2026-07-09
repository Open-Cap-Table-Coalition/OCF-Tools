import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_TRANSFER = defineValidator({
  transaction: "TX_PLAN_SECURITY_TRANSFER",
  effect: "passthrough",
  checks: [],
});
