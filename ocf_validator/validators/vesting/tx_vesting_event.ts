import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_VESTING_EVENT = defineValidator({
  transaction: "TX_VESTING_EVENT",
  effect: "passthrough",
  checks: [],
});
