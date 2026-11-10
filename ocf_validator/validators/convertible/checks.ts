import { familyChecksFor } from "../checks";

/** Checks used by more than one convertible validator, worded for convertibles. */
export const { issuanceExists, noOtherTransactions } = familyChecksFor({
  name: "convertible",
  collection: "convertibleIssuances",
  issuance: "TX_CONVERTIBLE_ISSUANCE",
  acceptance: "TX_CONVERTIBLE_ACCEPTANCE",
});
