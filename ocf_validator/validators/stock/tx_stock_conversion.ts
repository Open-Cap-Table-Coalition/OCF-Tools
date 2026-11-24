import { defineValidator } from "../checkKit";
import {
  balanceDated,
  balanceExists,
  balanceMatches,
  balanceReconciles,
  issuanceExists,
  noOtherTransactions,
  quantityWithinSource,
} from "./checks";
import { compareResults, resultsDated, resultsExist } from "./results";

export const TX_STOCK_CONVERSION = defineValidator({
  transaction: "TX_STOCK_CONVERSION",
  effect: "remove",
  collection: "stockIssuances",
  pool: "carriesStock",
  checks: [
    issuanceExists,
    resultsExist,
    resultsDated,
    balanceExists,
    balanceDated,
    balanceMatches("stock_class_id"),
    balanceMatches("stakeholder_id"),
    balanceReconciles,
    noOtherTransactions,
    quantityWithinSource(true),
    compareResults("stock_class_id", false),
    compareResults("stakeholder_id", true),
    {
      id: "converted-quantity",
      severity: "error",
      description: "The quantity converted reconciles with the resulting stock.",
    },
  ],
});
