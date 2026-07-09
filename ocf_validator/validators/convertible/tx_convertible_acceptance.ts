import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, dateOrder } from "./checks";

const noRetraction = {
  id: "no-retraction",
  severity: "error",
  description: "No convertible retraction references the transaction's security_id.",
  run: (context, data: { security_id: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-retraction emits one finding per convertible retraction on this security_id.
    transactions.forEach((ele) => {
      if (ele.object_type === "TX_CONVERTIBLE_RETRACTION" && ele.security_id === data.security_id) {
        messages.push(
          `A convertible retraction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

export const TX_CONVERTIBLE_ACCEPTANCE = defineValidator({
  transaction: "TX_CONVERTIBLE_ACCEPTANCE",
  effect: "none",
  checks: [issuanceExists, dateOrder, noRetraction],
});
