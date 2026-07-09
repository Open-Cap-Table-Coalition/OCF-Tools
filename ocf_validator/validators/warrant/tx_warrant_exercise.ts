import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { DeepReadonly, OcfMachineContext } from "../../../types/validator";
import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, noOtherTransactions } from "./checks";

// A warrant's conversion right can only point at a stock class, so every id in
// resulting_security_ids names a stock issuance. The three resulting checks
// locate those issuances in the package transaction history, dated the same day
// as the exercise, so the result does not depend on the order the driver
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

const resultingSecurityNamed = {
  id: "resulting-security-named",
  severity: "warning",
  description: "The exercise names at least one resulting security.",
  run: (_context, data: { resulting_security_ids: string[] }) => {
    if (data.resulting_security_ids.length > 0) return [];
    return ["The exercise names no resulting security."];
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
    "Each resulting stock issuance is dated the same day as the exercise.",
  run: (context, data: { resulting_security_ids: string[]; date: string }) => {
    const messages: string[] = [];

    // Only resulting ids backed by a stock issuance are judged here; a missing
    // id is solely resulting-stock-exists's concern.
    data.resulting_security_ids.forEach((resultingId) => {
      const issuance = resultingStockIssuance(context, resultingId);
      if (issuance !== undefined && issuance.date !== data.date) {
        messages.push(
          `The resulting stock issuance ${resultingId} is dated ${issuance.date}, which differs from the exercise date ${data.date}.`,
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
    "Each resulting stock issuance names the stakeholder of the exercised warrant issuance.",
  run: (
    context,
    data: { security_id: string; resulting_security_ids: string[] },
  ) => {
    const messages: string[] = [];

    // The reference stakeholder comes from the live warrant issuance this
    // exercise references — the same record issuance-exists matches. With no live
    // record, issuance-exists already carries the failure and there is no
    // reference to compare against, so this check stays silent.
    const reference = context.warrantIssuances.find(
      (ele) => ele.security_id === data.security_id,
    );
    if (reference === undefined) return messages;

    // As with the date check, only resulting ids backed by a stock issuance are
    // judged.
    data.resulting_security_ids.forEach((resultingId) => {
      const issuance = resultingStockIssuance(context, resultingId);
      if (issuance !== undefined && issuance.stakeholder_id !== reference.stakeholder_id) {
        messages.push(
          `The resulting stock issuance ${resultingId} names stakeholder ${issuance.stakeholder_id}, which differs from the warrant issuance's stakeholder ${reference.stakeholder_id}.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

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
