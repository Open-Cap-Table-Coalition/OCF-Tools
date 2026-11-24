import { defineValidator } from "../checkKit";
import { retirementChecks } from "./checks";

export const TX_STOCK_REPURCHASE = defineValidator({
  transaction: "TX_STOCK_REPURCHASE",
  effect: "remove",
  collection: "stockIssuances",
  pool: "carriesStock",
  checks: retirementChecks,
});
