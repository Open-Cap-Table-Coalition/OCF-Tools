import type { CheckObject } from "../checkKit";

/**
 * The equity compensation issuance referenced by the transaction's security_id
 * is outstanding as of the transaction's date. Passes on a bare security_id
 * match against the live equity compensation collection, which holds only
 * issuances. When the live match fails, the message consults the full package
 * transaction history and states one of three causes by elimination: the
 * security was never issued, it is issued only later, or it was issued on or
 * before this date but is no longer outstanding. The cause and any date it
 * displays come from a single history record — a match dated on or before the
 * transaction is preferred over a later-dated one.
 */
export const issuanceExists = {
  id: "issuance-exists",
  severity: "error",
  description:
    "The equity compensation issuance referenced by the transaction's security_id is outstanding as of the transaction's date.",
  run: (context, data: { security_id: string; date: string }) => {
    const messages: string[] = [];

    let issuanceExists = false;
    context.equityCompensation.forEach((ele) => {
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
        ele.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE" &&
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
        `No equity compensation issuance with security_id ${data.security_id} appears in the package.`,
      );
    } else if (onOrBeforeDate === undefined) {
      messages.push(
        `The equity compensation issuance referenced by security_id ${data.security_id} is dated ${firstIssuanceDate}, after this transaction (${data.date}).`,
      );
    } else {
      messages.push(
        `The equity compensation issuance referenced by security_id ${data.security_id} (dated ${onOrBeforeDate}) is not outstanding as of this transaction's date.`,
      );
    }

    return messages;
  },
} satisfies CheckObject;

/**
 * No other transaction dated on or before this transaction references its
 * security_id, other than an equity compensation acceptance. One finding per
 * offending transaction. The scan keeps every transaction type in play, so it
 * narrows by property presence rather than by discriminant: a transaction
 * carrying no security_id can never reference this one. The transaction under
 * validation appears in its own history, so it is exempted by id.
 */
export const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "No other transaction dated on or before this transaction references its security_id, other than an equity compensation acceptance.",
  run: (context, data: { id: string; security_id: string; date: string }) => {
    const messages: string[] = [];

    context.ocfPackageContent.transactions.forEach((ele) => {
      if (
        "security_id" in ele &&
        ele.security_id === data.security_id &&
        ele.date <= data.date &&
        ele.object_type !== "TX_EQUITY_COMPENSATION_ISSUANCE" &&
        ele.object_type !== "TX_EQUITY_COMPENSATION_ACCEPTANCE" &&
        ele.id !== data.id
      ) {
        messages.push(
          `Another transaction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject;
