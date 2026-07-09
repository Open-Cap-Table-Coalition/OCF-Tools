import { defineValidator } from "../checkKit";

// Declaration only: no checks yet.
export const TX_VESTING_ACCELERATION = defineValidator({
  transaction: "TX_VESTING_ACCELERATION",
  effect: "passthrough",
  checks: [],
});
