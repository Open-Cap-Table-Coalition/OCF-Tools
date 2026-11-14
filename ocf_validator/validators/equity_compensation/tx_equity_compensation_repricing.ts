import { defineValidator } from "../checkKit";
import { issuanceExists } from "./checks";

export const TX_EQUITY_COMPENSATION_REPRICING = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_REPRICING",
  effect: "none",
  checks: [issuanceExists],
});
