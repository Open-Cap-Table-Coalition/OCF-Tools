import { familyChecksFor } from "../checks";

/** Checks used by more than one warrant validator, worded for warrants. */
export const { issuanceExists, noOtherTransactions } = familyChecksFor({
  name: "warrant",
  collection: "warrantIssuances",
  issuance: "TX_WARRANT_ISSUANCE",
  acceptance: "TX_WARRANT_ACCEPTANCE",
  vests: true,
});
