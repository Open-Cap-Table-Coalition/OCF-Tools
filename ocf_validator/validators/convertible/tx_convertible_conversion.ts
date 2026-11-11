import { defineValidator, type CheckObject } from "../checkKit";
import { resultingChecksFor } from "../checks";
import { issuanceExists, noOtherTransactions } from "./checks";

const { resultingSecurityNamed, resultingStockExists, resultingStockDated, resultingStockStakeholder } =
  resultingChecksFor({
    name: "convertible",
    collection: "convertibleIssuances",
    action: "conversion",
    participle: "converted",
  });

// Declared but not implemented: the same metadata with no run, so each reports
// as a gap and contributes no findings.
const quantityReconciles = {
  id: "quantity-reconciles",
  severity: "error",
  description:
    "The quantity converted equals the sum across the resulting securities.",
} satisfies CheckObject;

const balanceSecurityExists = {
  id: "balance-security-exists",
  severity: "error",
  description:
    "The balance security, when named, is a convertible issuance present in the package.",
} satisfies CheckObject;

export const TX_CONVERTIBLE_CONVERSION = defineValidator({
  transaction: "TX_CONVERTIBLE_CONVERSION",
  effect: "remove",
  collection: "convertibleIssuances",
  checks: [
    issuanceExists,
    noOtherTransactions,
    resultingSecurityNamed,
    resultingStockExists,
    resultingStockDated,
    resultingStockStakeholder,
    quantityReconciles,
    balanceSecurityExists,
  ],
});
