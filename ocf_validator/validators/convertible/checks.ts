import { familyChecksFor } from "../checks";

/** The family checks shared within the convertible family. */
export const { issuanceExists, dateOrder, noOtherTransactions } = familyChecksFor({
  name: "convertible",
  collection: "convertibleIssuances",
  issuance: "TX_CONVERTIBLE_ISSUANCE",
  acceptance: "TX_CONVERTIBLE_ACCEPTANCE",
  cancellation: "TX_CONVERTIBLE_CANCELLATION",
});
