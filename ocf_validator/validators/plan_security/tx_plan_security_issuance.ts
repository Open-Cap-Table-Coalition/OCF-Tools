import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_PLAN_SECURITY_ISSUANCE = defineValidator({
  transaction: "TX_PLAN_SECURITY_ISSUANCE",
  effect: "passthrough",
  checks: [],
});
