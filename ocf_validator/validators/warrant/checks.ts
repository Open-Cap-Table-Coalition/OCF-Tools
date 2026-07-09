import type { CheckObject } from "../checkKit";

/**
 * The warrant issuance referenced by the transaction's security_id is
 * outstanding as of the transaction's date. Passes on a bare security_id match
 * against the live warrant collection, which holds only issuances. When the
 * live match fails, the message consults the full package transaction history
 * and states one of three causes by elimination: the security was never issued,
 * it is issued only later, or it was issued on or before this date but is no
 * longer outstanding. The cause and any date it displays come from a single
 * history record — a match dated on or before the transaction is preferred over
 * a later-dated one.
 */
export const issuanceExists = {
  id: "issuance-exists",
  severity: "error",
  description:
    "The warrant issuance referenced by the transaction's security_id is outstanding as of the transaction's date.",
  run: (context, data: { security_id: string; date: string }) => {
    const messages: string[] = [];

    let issuanceExists = false;
    context.warrantIssuances.forEach((ele) => {
      if (ele.security_id === data.security_id) {
        issuanceExists = true;
      }
    });
    if (issuanceExists) return messages;

    const { transactions } = context.ocfPackageContent;
    let firstIssuanceDate: string | undefined;
    let onOrBeforeDate: string | undefined;
    transactions.forEach((ele) => {
      if (
        ele.object_type === "TX_WARRANT_ISSUANCE" &&
        ele.security_id === data.security_id
      ) {
        if (firstIssuanceDate === undefined) firstIssuanceDate = ele.date;
        if (onOrBeforeDate === undefined && ele.date <= data.date) {
          onOrBeforeDate = ele.date;
        }
      }
    });

    if (firstIssuanceDate === undefined) {
      messages.push(
        `No warrant issuance with security_id ${data.security_id} appears in the package.`,
      );
    } else if (onOrBeforeDate === undefined) {
      messages.push(
        `The warrant issuance referenced by security_id ${data.security_id} is dated ${firstIssuanceDate}, after this transaction (${data.date}).`,
      );
    } else {
      messages.push(
        `The warrant issuance referenced by security_id ${data.security_id} (dated ${onOrBeforeDate}) is not outstanding as of this transaction's date.`,
      );
    }

    return messages;
  },
} satisfies CheckObject;
