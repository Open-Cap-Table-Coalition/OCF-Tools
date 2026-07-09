import { defineValidator, type CheckObject } from "../checkKit";

const stakeholderExists = {
  id: "stakeholder-exists",
  severity: "error",
  description:
    "The stakeholder referenced by the transaction exists in the stakeholder file.",
  run: (context, data: { stakeholder_id: string }) => {
    const messages: string[] = [];
    const { stakeholders } = context.ocfPackageContent;

    let stakeholderExists = false;
    stakeholders.forEach((ele: any) => {
      if (ele.id === data.stakeholder_id) stakeholderExists = true;
    });
    if (!stakeholderExists) {
      messages.push(
        `The stakeholder ${data.stakeholder_id} referenced by the transaction was not found in the stakeholder file.`,
      );
    }

    return messages;
  },
} satisfies CheckObject;

export const TX_WARRANT_ISSUANCE = defineValidator({
  transaction: "TX_WARRANT_ISSUANCE",
  effect: "append",
  collection: "warrantIssuances",
  checks: [stakeholderExists],
});
