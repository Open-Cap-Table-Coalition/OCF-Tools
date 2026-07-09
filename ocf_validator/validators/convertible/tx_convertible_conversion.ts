import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { DeepReadonly, OcfMachineContext } from "../../../types/validator";
import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

// A convertible's conversion right can only point at a stock class, so every id
// in resulting_security_ids names a stock issuance. The three resulting checks
// locate those issuances in the package transaction history, dated the same day
// as the conversion, so the result does not depend on the order the driver
// processes same-day transactions in.

// The stock issuance a resulting id names: the first TX_STOCK_ISSUANCE in
// package order matching the id, so each resulting check makes one comparison
// per id even when an id matches more than one issuance.
const resultingStockIssuance = (
  context: DeepReadonly<OcfMachineContext>,
  resultingId: string,
): DeepReadonly<OCFStockIssuance> | undefined =>
  context.ocfPackageContent.transactions.find(
    (ele): ele is DeepReadonly<OCFStockIssuance> =>
      ele.object_type === "TX_STOCK_ISSUANCE" && ele.security_id === resultingId,
  );

const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction dated on or before this transaction references its security_id, other than a convertible acceptance.",
  run: (context, data: { id: string; security_id: string; date: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // One finding per transaction on this security_id dated on or before this
    // conversion, exempting the issuance, any convertible acceptance, and this
    // conversion itself. The scan keeps every transaction type in play, so it
    // narrows by property presence rather than by discriminant: a transaction
    // carrying no security_id can never reference this one. The conversion
    // appears in its own history, so the self-exemption is by id, not by type.
    transactions.forEach((ele) => {
      if (
        "security_id" in ele &&
        ele.security_id === data.security_id &&
        ele.date <= data.date &&
        ele.object_type !== "TX_CONVERTIBLE_ISSUANCE" &&
        ele.object_type !== "TX_CONVERTIBLE_ACCEPTANCE" &&
        !(ele.object_type === "TX_CONVERTIBLE_CONVERSION" && ele.id === data.id)
      ) {
        messages.push(
          `Another transaction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

const resultingSecurityNamed = {
  id: "resulting-security-named",
  severity: "warning",
  description: "The conversion names at least one resulting security.",
  run: (_context, data: { resulting_security_ids: string[] }) => {
    if (data.resulting_security_ids.length > 0) return [];
    return ["The conversion names no resulting security."];
  },
} satisfies CheckObject;

const resultingStockExists = {
  id: "resulting-stock-exists",
  severity: "error",
  description:
    "Each resulting security is a stock issuance present in the package.",
  run: (context, data: { resulting_security_ids: string[] }) => {
    const messages: string[] = [];

    // One finding per resulting id with no matching stock issuance in history.
    data.resulting_security_ids.forEach((resultingId) => {
      if (resultingStockIssuance(context, resultingId) === undefined) {
        messages.push(
          `No stock issuance with security_id ${resultingId} appears in the package.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

const resultingStockDated = {
  id: "resulting-stock-dated",
  severity: "error",
  description:
    "Each resulting stock issuance is dated the same day as the conversion.",
  run: (context, data: { resulting_security_ids: string[]; date: string }) => {
    const messages: string[] = [];

    // Only resulting ids backed by a stock issuance are judged here; a missing
    // id is solely resulting-stock-exists's concern.
    data.resulting_security_ids.forEach((resultingId) => {
      const issuance = resultingStockIssuance(context, resultingId);
      if (issuance !== undefined && issuance.date !== data.date) {
        messages.push(
          `The resulting stock issuance ${resultingId} is dated ${issuance.date}, which differs from the conversion date ${data.date}.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

const resultingStockStakeholder = {
  id: "resulting-stock-stakeholder",
  severity: "error",
  description:
    "Each resulting stock issuance names the stakeholder of the converted convertible issuance.",
  run: (
    context,
    data: { security_id: string; resulting_security_ids: string[] },
  ) => {
    const messages: string[] = [];

    // The reference stakeholder comes from the live convertible issuance this
    // conversion converts — the same record issuance-exists matches. With no live
    // record, issuance-exists already carries the failure and there is no
    // reference to compare against, so this check stays silent.
    const reference = context.convertibleIssuances.find(
      (ele) => ele.security_id === data.security_id,
    );
    if (reference === undefined) return messages;

    // As with the date check, only resulting ids backed by a stock issuance are
    // judged.
    data.resulting_security_ids.forEach((resultingId) => {
      const issuance = resultingStockIssuance(context, resultingId);
      if (issuance !== undefined && issuance.stakeholder_id !== reference.stakeholder_id) {
        messages.push(
          `The resulting stock issuance ${resultingId} names stakeholder ${issuance.stakeholder_id}, which differs from the convertible issuance's stakeholder ${reference.stakeholder_id}.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

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
