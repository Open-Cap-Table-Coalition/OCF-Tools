import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_RETRACTION = defineValidator({
  transaction: "TX_PLAN_SECURITY_RETRACTION",
  effect: "passthrough",
  checks: [],
});
