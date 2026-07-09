import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

const noAcceptance = {
  id: "no-acceptance",
  severity: "error",
  description: "No convertible acceptance dated on or before this transaction references its security_id.",
  run: (context, data: { security_id: string; date: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-acceptance emits one finding per convertible acceptance on this security_id
    // dated on or before this transaction; a later acceptance cannot invalidate it.
    transactions.forEach((ele) => {
      if (
        ele.object_type === "TX_CONVERTIBLE_ACCEPTANCE" &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        messages.push(
          `A convertible acceptance (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

export const TX_CONVERTIBLE_RETRACTION = defineValidator({
  transaction: "TX_CONVERTIBLE_RETRACTION",
  effect: "remove",
  collection: "convertibleIssuances",
  checks: [issuanceExists, noAcceptance],
});
