import { defineValidator, text, type CheckObject } from "../checkKit";
import { issuanceExists } from "./checks";

const noAcceptance = {
  id: "no-acceptance",
  severity: "error",
  description:
    "No equity compensation acceptance dated on or before this transaction references its security_id.",
  run: (context, data) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-acceptance emits one finding per equity compensation acceptance on this
    // security_id dated on or before this transaction; a later acceptance cannot
    // invalidate it.
    transactions.forEach((ele) => {
      if (
        ele.object_type === "TX_EQUITY_COMPENSATION_ACCEPTANCE" &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        messages.push(
          text`An equity compensation acceptance (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject<{ security_id: string; date: string }>;

export const TX_EQUITY_COMPENSATION_RETRACTION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_RETRACTION",
  effect: "remove",
  collection: "equityCompensation",
  checks: [issuanceExists, noAcceptance],
});
