import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

const noRetraction = {
  id: "no-retraction",
  severity: "error",
  description: "No warrant retraction dated on or before this transaction references its security_id.",
  run: (context, data: { security_id: string; date: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-retraction emits one finding per warrant retraction on this security_id
    // dated on or before this transaction; a later retraction cannot invalidate it.
    transactions.forEach((ele) => {
      if (
        ele.object_type === "TX_WARRANT_RETRACTION" &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        messages.push(
          `A warrant retraction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

export const TX_WARRANT_ACCEPTANCE = defineValidator({
  transaction: "TX_WARRANT_ACCEPTANCE",
  effect: "none",
  checks: [issuanceExists, noRetraction],
});
