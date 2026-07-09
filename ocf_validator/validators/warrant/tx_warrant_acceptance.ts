import type { TransactionFor } from "../../../types/ocf-input";
import type { Check, GradedValidator } from "../../../types/validator";
import type { Finding } from "../../../types/finding";
import type { Descriptor } from "../../ocfMachine";

type Acceptance = TransactionFor<"TX_WARRANT_ACCEPTANCE">;

const checks: readonly Check[] = [
  {
    id: "issuance-exists",
    severity: "error",
    description:
      "The warrant issuance referenced by the transaction's security_id exists in the current cap-table state.",
  },
  {
    id: "date-order",
    severity: "error",
    description:
      "The transaction is dated on or after the warrant issuance it references.",
  },
  {
    id: "no-retraction",
    severity: "error",
    description: "No warrant retraction references the transaction's security_id.",
  },
];

const validate: GradedValidator<Acceptance> = (context, data) => {
  const findings: Finding[] = [];
  const subject = { object_type: data.object_type, id: data.id };
  const { transactions } = context.ocfPackageContent;

  // issuance-exists scans the live warrant collection.
  let issuanceExists = false;
  context.warrantIssuances.forEach((ele) => {
    if (ele.security_id === data.security_id && ele.object_type === "TX_WARRANT_ISSUANCE") {
      issuanceExists = true;
    }
  });
  if (!issuanceExists) {
    findings.push({
      severity: "error",
      check: "issuance-exists",
      message: `No warrant issuance with security_id ${data.security_id} exists in the current cap-table state.`,
      subject,
    });
  }

  // date-order scans the full package transaction history for the issuance.
  // The object_type test leads so it narrows the transaction union to a
  // security_id-bearing member before the other reads.
  let dateOrdered = false;
  transactions.forEach((ele) => {
    if (
      ele.object_type === "TX_WARRANT_ISSUANCE" &&
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
      message: `The transaction is not dated on or after a warrant issuance with security_id ${data.security_id}.`,
      subject,
    });
  }

  // no-retraction emits one finding per warrant retraction on this security_id.
  transactions.forEach((ele) => {
    if (ele.object_type === "TX_WARRANT_RETRACTION" && ele.security_id === data.security_id) {
      findings.push({
        severity: "error",
        check: "no-retraction",
        message: `A warrant retraction (${ele.id}) references the transaction's security_id.`,
        subject,
      });
    }
  });

  return findings;
};

export const TX_WARRANT_ACCEPTANCE = {
  effect: "none",
  validate,
  checks,
} satisfies Descriptor;
