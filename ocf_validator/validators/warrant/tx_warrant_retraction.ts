import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, dateOrder } from "./checks";

const noAcceptance = {
  id: "no-acceptance",
  severity: "error",
  description: "No warrant acceptance references the transaction's security_id.",
  run: (context, data: { security_id: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-acceptance emits one finding per warrant acceptance on this security_id.
    transactions.forEach((ele) => {
      if (ele.object_type === "TX_WARRANT_ACCEPTANCE" && ele.security_id === data.security_id) {
        messages.push(
          `A warrant acceptance (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

export const TX_WARRANT_RETRACTION = defineValidator({
  transaction: "TX_WARRANT_RETRACTION",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [issuanceExists, dateOrder, noAcceptance],
});
