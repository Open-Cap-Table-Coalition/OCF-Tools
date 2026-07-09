import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_CANCELLATION = defineValidator({
  transaction: "TX_PLAN_SECURITY_CANCELLATION",
  effect: "passthrough",
  checks: [],
});
