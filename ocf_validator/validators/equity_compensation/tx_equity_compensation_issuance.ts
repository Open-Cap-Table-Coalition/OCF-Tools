import { defineValidator } from "../checkKit";
import { noEarlierRemoval, stakeholderExists } from "../checks";

export const TX_EQUITY_COMPENSATION_ISSUANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ISSUANCE",
  effect: "append",
  collection: "equityCompensation",
  checks: [stakeholderExists, noEarlierRemoval],
});
