import { asGap, defineValidator } from "../checkKit";
import {
  balanceDated,
  balanceExists,
  issuanceExists,
  noOtherTransactions,
  quantityWithinSource,
} from "./checks";
import { replacementSum, resultsDated, resultsExist, transferSum } from "./results";

export const TX_STOCK_TRANSFER = defineValidator({
  transaction: "TX_STOCK_TRANSFER",
  effect: "remove",
  collection: "stockIssuances",
  pool: "carriesStock",
  checks: [
    issuanceExists,
    quantityWithinSource(false),
    resultsExist,
    resultsDated,
    balanceExists,
    balanceDated,
    transferSum,
    replacementSum,
    asGap(noOtherTransactions),
  ],
});
