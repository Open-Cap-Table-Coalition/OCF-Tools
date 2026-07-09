import type { OCFEquityCompensationIssuance } from "@opencaptablecoalition/ocf-types";
import type { Check, GradedValidator } from "../../../types/validator";
import type { Finding } from "../../../types/finding";
import type { Descriptor } from "../../ocfMachine";

const checks: readonly Check[] = [
  {
    id: "stakeholder-exists",
    severity: "error",
    description:
      "The stakeholder referenced by the transaction exists in the stakeholder file.",
  },
];

const validate: GradedValidator<OCFEquityCompensationIssuance> = (context, data) => {
  const findings: Finding[] = [];
  const { stakeholders } = context.ocfPackageContent;

  let stakeholderExists = false;
  stakeholders.forEach((ele: any) => {
    if (ele.id === data.stakeholder_id) stakeholderExists = true;
  });
  if (!stakeholderExists) {
    findings.push({
      severity: "error",
      check: "stakeholder-exists",
      message: `The stakeholder ${data.stakeholder_id} referenced by the transaction was not found in the stakeholder file.`,
      subject: { object_type: data.object_type, id: data.id },
    });
  }

  return findings;
};

export const TX_EQUITY_COMPENSATION_ISSUANCE = {
  effect: "append",
  collection: "equityCompensation",
  validate,
  checks,
} satisfies Descriptor;
