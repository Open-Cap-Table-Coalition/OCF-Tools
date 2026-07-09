import { defineValidator } from "../checkKit";
import { issuanceExists } from "./checks";

export const TX_EQUITY_COMPENSATION_RELEASE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_RELEASE",
  effect: "none",
  checks: [issuanceExists],
});
