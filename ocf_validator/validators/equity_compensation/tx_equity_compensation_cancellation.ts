import type { TransactionFor } from "../../../types/ocf-input";
import type { Check, GradedValidator } from "../../../types/validator";
import type { Finding } from "../../../types/finding";
import type { Descriptor } from "../../ocfMachine";

type Cancellation = TransactionFor<"TX_EQUITY_COMPENSATION_CANCELLATION">;

const checks: readonly Check[] = [
  {
    id: "issuance-exists",
    severity: "error",
    description:
      "The equity compensation issuance referenced by the transaction's security_id exists in the current cap-table state.",
  },
  {
    id: "date-order",
    severity: "error",
    description:
      "The transaction is dated on or after the equity compensation issuance it references.",
  },
  {
    id: "no-other-transactions",
    severity: "error",
    description:
      "No other transaction references the transaction's security_id, other than an equity compensation acceptance.",
  },
];

const validate: GradedValidator<Cancellation> = (context, data) => {
  const findings: Finding[] = [];
  const subject = { object_type: data.object_type, id: data.id };
  const { transactions } = context.ocfPackageContent;

  // issuance-exists here matches on security_id alone — unlike the sibling
  // validators it does not also require object_type TX_EQUITY_COMPENSATION_ISSUANCE.
  let issuanceExists = false;
  context.equityCompensation.forEach((ele) => {
    if (ele.security_id === data.security_id) {
      issuanceExists = true;
    }
  });
  if (!issuanceExists) {
    findings.push({
      severity: "error",
      check: "issuance-exists",
      message: `No equity compensation issuance with security_id ${data.security_id} exists in the current cap-table state.`,
      subject,
    });
  }

  // date-order scans the full package transaction history for the issuance.
  // The object_type test leads so it narrows the transaction union to a
  // security_id-bearing member before the other reads.
  let dateOrdered = false;
  transactions.forEach((ele) => {
    if (
      ele.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE" &&
      ele.security_id === data.security_id &&
      ele.date <= data.date
    ) {
      dateOrdered = true;
    }
  });
  if (!dateOrdered) {
    findings.push({
      severity: "error",
      check: "date-order",
      message: `The transaction is not dated on or after an equity compensation issuance with security_id ${data.security_id}.`,
      subject,
    });
  }

  // no-other-transactions emits one finding per transaction on this security_id,
  // exempting the issuance, any equity compensation acceptance, and this
  // cancellation itself. This scan keeps every transaction type in play, so it
  // narrows by property presence rather than by discriminant: a transaction that
  // carries no security_id can never reference this one.
  transactions.forEach((ele) => {
    if (
      "security_id" in ele &&
      ele.security_id === data.security_id &&
      ele.object_type !== "TX_EQUITY_COMPENSATION_ISSUANCE" &&
      ele.object_type !== "TX_EQUITY_COMPENSATION_ACCEPTANCE" &&
      !(ele.object_type === "TX_EQUITY_COMPENSATION_CANCELLATION" && ele.id === data.id)
    ) {
      findings.push({
        severity: "error",
        check: "no-other-transactions",
        message: `Another transaction (${ele.id}) references the transaction's security_id.`,
        subject,
      });
    }
  });

  return findings;
};

export const TX_EQUITY_COMPENSATION_CANCELLATION = {
  effect: "remove",
  collection: "equityCompensation",
  validate,
  checks,
} satisfies Descriptor;
