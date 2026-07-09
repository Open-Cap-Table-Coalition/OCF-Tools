import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_RELEASE = defineValidator({
  transaction: "TX_PLAN_SECURITY_RELEASE",
  effect: "passthrough",
  checks: [],
});
