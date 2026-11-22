import { defineValidator, text, underOlderName, type CheckObject } from "../checkKit";
import { isOfType, transactionsOn } from "../checks";
import { issuanceExists } from "./checks";

const noRetraction = {
  id: "no-retraction",
  severity: "error",
  description:
    "No equity compensation retraction dated on or before this transaction references its security_id.",
  run: (context, data) => {
    const messages: string[] = [];

    // no-retraction emits one finding per equity compensation retraction on this
    // security_id dated on or before this transaction; a later retraction cannot
    // invalidate it.
    transactionsOn(context, data.security_id).forEach((ele) => {
      if (
        isOfType(ele, "TX_EQUITY_COMPENSATION_RETRACTION") &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        messages.push(
          text`An equity compensation retraction (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject<{ security_id: string; date: string }>;

export const TX_EQUITY_COMPENSATION_ACCEPTANCE = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_ACCEPTANCE",
  effect: "none",
  families: ["equityCompensation"],
  checks: [issuanceExists, noRetraction],
});

/** Reuse the validator for the older transaction name. */
export const TX_PLAN_SECURITY_ACCEPTANCE = underOlderName(TX_EQUITY_COMPENSATION_ACCEPTANCE, "TX_PLAN_SECURITY_ACCEPTANCE");
