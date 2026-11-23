import { defineValidator } from "../checkKit";
import { retirementChecks } from "./checks";

export const TX_STOCK_CANCELLATION = defineValidator({
  transaction: "TX_STOCK_CANCELLATION",
  effect: "remove",
  collection: "stockIssuances",
  pool: "carriesStock",
  checks: retirementChecks,
});
