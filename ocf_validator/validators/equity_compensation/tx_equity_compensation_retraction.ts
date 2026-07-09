import type { TransactionFor } from "../../../types/ocf-input";
import type { Check, GradedValidator } from "../../../types/validator";
import type { Finding } from "../../../types/finding";
import type { Descriptor } from "../../ocfMachine";

type Retraction = TransactionFor<"TX_EQUITY_COMPENSATION_RETRACTION">;

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
    id: "no-acceptance",
    severity: "error",
    description: "No equity compensation acceptance references the transaction's security_id.",
  },
];

const validate: GradedValidator<Retraction> = (context, data) => {
  const findings: Finding[] = [];
  const subject = { object_type: data.object_type, id: data.id };
  const { transactions } = context.ocfPackageContent;

  // issuance-exists scans the live equity compensation collection.
  let issuanceExists = false;
  context.equityCompensation.forEach((ele) => {
    if (ele.security_id === data.security_id && ele.object_type === "TX_EQUITY_COMPENSATION_ISSUANCE") {
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

  // no-acceptance emits one finding per equity compensation acceptance on this security_id.
  transactions.forEach((ele) => {
    if (ele.object_type === "TX_EQUITY_COMPENSATION_ACCEPTANCE" && ele.security_id === data.security_id) {
      findings.push({
        severity: "error",
        check: "no-acceptance",
        message: `An equity compensation acceptance (${ele.id}) references the transaction's security_id.`,
        subject,
      });
    }
  });

  return findings;
};

export const TX_EQUITY_COMPENSATION_RETRACTION = {
  effect: "remove",
  collection: "equityCompensation",
  validate,
  checks,
} satisfies Descriptor;
