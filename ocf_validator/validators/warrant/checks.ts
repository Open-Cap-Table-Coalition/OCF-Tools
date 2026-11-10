import { familyChecksFor } from "../checks";

/** The family checks shared within the warrant family. */
export const { issuanceExists, dateOrder, noOtherTransactions } = familyChecksFor({
  name: "warrant",
  collection: "warrantIssuances",
  issuance: "TX_WARRANT_ISSUANCE",
  acceptance: "TX_WARRANT_ACCEPTANCE",
  cancellation: "TX_WARRANT_CANCELLATION",
});
