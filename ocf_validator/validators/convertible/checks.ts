import type { CheckObject } from "../checkKit";

/**
 * The convertible issuance referenced by the transaction's security_id exists in
 * the current cap-table state. Matches on security_id alone against the live
 * convertible collection, which holds only issuances.
 */
export const issuanceExists = {
  id: "issuance-exists",
  severity: "error",
  description:
    "The convertible issuance referenced by the transaction's security_id exists in the current cap-table state.",
  run: (context, data: { security_id: string }) => {
    const messages: string[] = [];

    let issuanceExists = false;
    context.convertibleIssuances.forEach((ele) => {
      if (ele.security_id === data.security_id) {
        issuanceExists = true;
      }
    });
    if (!issuanceExists) {
      messages.push(
        `No convertible issuance with security_id ${data.security_id} exists in the current cap-table state.`,
      );
    }

    return messages;
  },
} satisfies CheckObject;

/**
 * The transaction is dated on or after the convertible issuance it references.
 */
export const dateOrder = {
  id: "date-order",
  severity: "error",
  description:
    "The transaction is dated on or after the convertible issuance it references.",
  run: (context, data: { security_id: string; date: string }) => {
    const messages: string[] = [];
    const { transactions } = context.ocfPackageContent;

    // date-order scans the full package transaction history for the issuance.
    // The object_type test leads so it narrows the transaction union to a
    // security_id-bearing member before the other reads.
    let dateOrdered = false;
    transactions.forEach((ele) => {
      if (
        ele.object_type === "TX_CONVERTIBLE_ISSUANCE" &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        dateOrdered = true;
      }
    });
    if (!dateOrdered) {
      messages.push(
        `The transaction is not dated on or after a convertible issuance with security_id ${data.security_id}.`,
      );
    }

    return messages;
  },
} satisfies CheckObject;
