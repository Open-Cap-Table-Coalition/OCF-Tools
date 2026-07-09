import { defineValidator, type CheckObject } from "../checkKit";
import { issuanceExists, dateOrder } from "./checks";

const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction references the transaction's security_id, other than a warrant acceptance.",
  run: (context, data: { id: string; security_id: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // no-other-transactions emits one finding per transaction on this security_id,
    // exempting the issuance, any warrant acceptance, and this cancellation itself.
    // This scan keeps every transaction type in play, so it narrows by property
    // presence rather than by discriminant: a transaction that carries no
    // security_id can never reference this one.
    transactions.forEach((ele) => {
      if (
        "security_id" in ele &&
        ele.security_id === data.security_id &&
        ele.object_type !== "TX_WARRANT_ISSUANCE" &&
        ele.object_type !== "TX_WARRANT_ACCEPTANCE" &&
        !(ele.object_type === "TX_WARRANT_CANCELLATION" && ele.id === data.id)
      ) {
        messages.push(
          `Another transaction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;

export const TX_WARRANT_CANCELLATION = defineValidator({
  transaction: "TX_WARRANT_CANCELLATION",
  effect: "remove",
  collection: "warrantIssuances",
  checks: [issuanceExists, dateOrder, noOtherTransactions],
});
