import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_ACCEPTANCE = defineValidator({
  transaction: "TX_PLAN_SECURITY_ACCEPTANCE",
  effect: "passthrough",
  checks: [],
});
