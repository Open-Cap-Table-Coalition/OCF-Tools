import { defineValidator, text, underOlderName, type CheckObject } from "../checkKit";
import { isOfType, transactionsOn } from "../checks";
import { issuanceExists } from "./checks";

const noAcceptance = {
  id: "no-acceptance",
  severity: "error",
  description:
    "No equity compensation acceptance dated on or before this transaction references its security_id.",
  run: (context, data) => {
    const messages: string[] = [];

    // no-acceptance emits one finding per equity compensation acceptance on this
    // security_id dated on or before this transaction; a later acceptance cannot
    // invalidate it.
    transactionsOn(context, data.security_id).forEach((ele) => {
      if (
        isOfType(ele, "TX_EQUITY_COMPENSATION_ACCEPTANCE") &&
        ele.security_id === data.security_id &&
        ele.date <= data.date
      ) {
        messages.push(
          text`An equity compensation acceptance (${ele.id}) references the transaction's security_id.`,
        );
      }
    });

    return messages;
  },
} satisfies CheckObject<{ security_id: string; date: string }>;

export const TX_EQUITY_COMPENSATION_RETRACTION = defineValidator({
  transaction: "TX_EQUITY_COMPENSATION_RETRACTION",
  effect: "remove",
  collection: "equityCompensation",
  checks: [issuanceExists, noAcceptance],
});

/** The same validator under the transaction's older name. */
export const TX_PLAN_SECURITY_RETRACTION = underOlderName(TX_EQUITY_COMPENSATION_RETRACTION, "TX_PLAN_SECURITY_RETRACTION");
