import { defineValidator } from "../checkKit";
import { resultingChecksFor } from "../checks";
import { issuanceExists, noOtherTransactions } from "./checks";

const { resultingSecurityNamed, resultingStockExists, resultingStockDated, resultingStockStakeholder } =
  resultingChecksFor({
    name: "warrant",
    collection: "warrantIssuances",
    action: "exercise",
    participle: "exercised",
  });

export const TX_WARRANT_EXERCISE = defineValidator({
  transaction: "TX_WARRANT_EXERCISE",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [
    issuanceExists,
    noOtherTransactions,
    resultingSecurityNamed,
    resultingStockExists,
    resultingStockDated,
    resultingStockStakeholder,
  ],
});
