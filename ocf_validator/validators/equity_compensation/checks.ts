import { familyChecksFor } from "../checks";

/** Checks used by more than one equity compensation validator, worded for equity compensation. */
export const { issuanceExists, noOtherTransactions } = familyChecksFor({
  name: "equity compensation",
  collection: "equityCompensation",
  issuance: "TX_EQUITY_COMPENSATION_ISSUANCE",
  acceptance: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  vests: true,
  returnsToPool: true,
  leavesOutstanding: [
    "TX_EQUITY_COMPENSATION_EXERCISE",
    "TX_EQUITY_COMPENSATION_RELEASE",
    "TX_EQUITY_COMPENSATION_REPRICING",
  ],
});
