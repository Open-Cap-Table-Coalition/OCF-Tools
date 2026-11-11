import { defineValidator } from "../checkKit";
import { stakeholderExists } from "../checks";

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  checks: [stakeholderExists],
});
