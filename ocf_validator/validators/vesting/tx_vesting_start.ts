import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_VESTING_START = defineValidator({
  transaction: "TX_VESTING_START",
  effect: "passthrough",
  checks: [],
});
