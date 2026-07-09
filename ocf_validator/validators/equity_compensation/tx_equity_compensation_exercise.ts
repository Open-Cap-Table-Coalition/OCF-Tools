import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

// The exercise documents these resulting-security checks but implements none of
// them: each is metadata with no run, so it reports as a gap and contributes no
// findings. Unlike warrant exercise — which removes the exercised security and
// implements the resulting-security checks — equity compensation exercise
// mutates no collection and leaves these unwritten.

const resultingStockExists = {
  id: "resulting-stock-exists",
  severity: "error",
  description:
    "Each resulting security is a stock issuance present in the package.",
} satisfies CheckObject;

const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction dated on or before this transaction references its security_id, other than an equity compensation acceptance.",
} satisfies CheckObject;

const resultingStockDated = {
  id: "resulting-stock-dated",
  severity: "error",
  description:
    "Each resulting stock issuance is dated the same day as the exercise.",
} satisfies CheckObject;

const resultingStockStakeholder = {
  id: "resulting-stock-stakeholder",
  severity: "error",
  description:
    "Each resulting stock issuance names the stakeholder of the exercised equity compensation issuance.",
} satisfies CheckObject;

const resultingQuantitySum = {
  id: "resulting-quantity-sum",
  severity: "error",
  description:
    "The exercised quantity_converted equals the sum of the resulting stock issuances' quantities.",
} satisfies CheckObject;

export const TX_EQUITY_COMPENSATION_EXERCISE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_EXERCISE",
  effect: "none",
  checks: [
    issuanceExists,
    resultingStockExists,
    noOtherTransactions,
    resultingStockDated,
    resultingStockStakeholder,
    resultingQuantitySum,
  ],
});
