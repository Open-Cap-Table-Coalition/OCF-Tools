import type { TransactionFor } from "../../../types/ocf-input";
import type { Check, GradedValidator } from "../../../types/validator";
import type { Finding } from "../../../types/finding";
import type { Descriptor } from "../../ocfMachine";

type Cancellation = TransactionFor<"TX_CONVERTIBLE_CANCELLATION">;

const checks: readonly Check[] = [
  {
    id: "issuance-exists",
    severity: "error",
    description:
      "The convertible issuance referenced by the transaction's security_id exists in the current cap-table state.",
  },
  {
    id: "date-order",
    severity: "error",
    description:
      "The transaction is dated on or after the convertible issuance it references.",
  },
  {
    id: "no-other-transactions",
    severity: "error",
    description:
      "No other transaction references the transaction's security_id, other than a convertible acceptance.",
  },
];

const validate: GradedValidator<Cancellation> = (context, data) => {
  const findings: Finding[] = [];
  const subject = { object_type: data.object_type, id: data.id };
  const { transactions } = context.ocfPackageContent;

  // issuance-exists here matches on security_id alone — unlike the sibling
  // validators it does not also require object_type TX_CONVERTIBLE_ISSUANCE.
  let issuanceExists = false;
  context.convertibleIssuances.forEach((ele) => {
    if (ele.security_id === data.security_id) {
      issuanceExists = true;
    }
  });
  if (!issuanceExists) {
    findings.push({
      severity: "error",
      check: "issuance-exists",
      message: `No convertible issuance with security_id ${data.security_id} exists in the current cap-table state.`,
      subject,
    });
  }

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
    findings.push({
      severity: "error",
      check: "date-order",
      message: `The transaction is dated before the convertible issuance it references (security_id ${data.security_id}).`,
      subject,
    });
  }

  // no-other-transactions emits one finding per transaction on this security_id,
  // exempting the issuance, any convertible acceptance, and this cancellation itself.
  // This scan keeps every transaction type in play, so it narrows by property
  // presence rather than by discriminant: a transaction that carries no
  // security_id can never reference this one.
  transactions.forEach((ele) => {
    if (
      "security_id" in ele &&
      ele.security_id === data.security_id &&
      ele.object_type !== "TX_CONVERTIBLE_ISSUANCE" &&
      ele.object_type !== "TX_CONVERTIBLE_ACCEPTANCE" &&
      !(ele.object_type === "TX_CONVERTIBLE_CANCELLATION" && ele.id === data.id)
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

export const TX_CONVERTIBLE_CANCELLATION = {
  effect: "remove",
  collection: "convertibleIssuances",
  validate,
  checks,
} satisfies Descriptor;
