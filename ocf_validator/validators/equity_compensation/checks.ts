import { familyChecksFor } from "../checks";

/** Checks used by more than one equity compensation validator, worded for equity compensation. */
export const { issuanceExists, noOtherTransactions } = familyChecksFor({
  name: "equity compensation",
  collection: "equityCompensation",
  issuance: "TX_EQUITY_COMPENSATION_ISSUANCE",
  acceptance: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  vests: true,
});
