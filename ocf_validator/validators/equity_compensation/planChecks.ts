import type { DeepReadonly } from "../../../types/validator";
import { currentName } from "../../constants/constants";
import { securityField } from "../../nodes";
import { add, exceeds, isQuantity, subtract } from "../../numeric";
import { isStockPlanId } from "../../stockPlan";
import { text, type CheckObject } from "../checkKit";
import { isOfType, transactionsOn } from "../checks";

type Movement = {
  object_type: string;
  security_id: string;
  quantity: string;
  date: string;
  settlement_date?: string;
  balance_security_id?: string;
  resulting_security_ids?: readonly string[];
};

export const planSourceQuantity = {
  id: "plan-source-quantity",
  severity: "error",
  description: "The plan grant has enough unexercised and unreleased units for this transaction.",
  reads: ({ security_id }) => [
    securityField("equityCompensation", security_id, "remaining"),
    securityField("equityCompensation", security_id, "issuance"),
  ],
  run: (_context, { security_id, quantity }, read) => {
    const source = read(securityField("equityCompensation", security_id, "issuance"));
    if (!isStockPlanId(source?.stock_plan_id)) return [];
    const remaining = read(securityField("equityCompensation", security_id, "remaining")) ?? source.quantity;
    if (isQuantity(remaining) && isQuantity(quantity) && !exceeds(quantity, remaining)) return [];
    return [text`The transaction quantity (${quantity}) must be a nonnegative OCF quantity within the ${remaining} shares left on grant ${security_id}.`];
  },
} satisfies CheckObject<Movement>;

/** List the securities the transaction names and the date their issuances must carry. */
function outputs(data: DeepReadonly<Movement>) {
  const type = currentName(data.object_type);
  const stock = type === "TX_EQUITY_COMPENSATION_EXERCISE" || type === "TX_EQUITY_COMPENSATION_RELEASE";
  const balance = !stock && data.balance_security_id;
  const results = type !== "TX_EQUITY_COMPENSATION_CANCELLATION" && Array.isArray(data.resulting_security_ids) ? data.resulting_security_ids : [];
  const date = type === "TX_EQUITY_COMPENSATION_RELEASE" ? data.settlement_date ?? data.date : data.date;
  return { stock, date, ids: balance ? [balance, ...results] : results };
}

/** Check the issuance even when settlement or same-day processing puts it after the source. */
export const planReplacement = {
  id: "plan-replacement",
  severity: "error",
  description: "Replacement grants and same-plan settlement stock match their source and its available shares.",
  reads: (data) => {
    const { stock, date, ids } = outputs(data);
    if (!ids.length) return [];
    // Another source's failed reference to an unissued output blocks this check only if both could
    // name the same issuance.
    const claim = { source: data.security_id, date };
    return [
      securityField("equityCompensation", data.security_id, "issuance"),
      securityField("equityCompensation", data.security_id, "remaining"),
      ...ids.flatMap((id) => [
        securityField(undefined, id, "issuance"),
        securityField(undefined, id, "lifecycle"),
        stock ? securityField("stockIssuances", id, "removal") : securityField("equityCompensation", id, "removal"),
        stock ? securityField("stockIssuances", id, "carry", claim) : securityField("equityCompensation", id, "provenance", claim),
      ]),
    ];
  },
  run: (context, data, read) => {
    const { stock, date, ids } = outputs(data);
    if (!ids.length) return [];
    const source = read(securityField("equityCompensation", data.security_id, "issuance"));
    if (!source) return []; // The issuance-exists check reports a missing source.
    const family = stock ? "TX_STOCK_ISSUANCE" : "TX_EQUITY_COMPENSATION_ISSUANCE";
    // Usually the target has already been issued. Look ahead only for outstanding references.
    const targets = ids.map((id) => read(securityField(undefined, id, "issuance")) ??
      transactionsOn(context, id).find((tx) => isOfType(tx, family)));
    // A planless grant or stock from a different plan has no charge to carry from this source.
    const carriesCharge = targets.some((tx) => tx && "stock_plan_id" in tx && isStockPlanId(tx.stock_plan_id) &&
      (!stock || tx.stock_plan_id === source.stock_plan_id));
    if (!carriesCharge && (stock || !isStockPlanId(source.stock_plan_id))) return [];
    if (ids.includes(data.security_id) || new Set(ids).size !== ids.length) return ["Each replacement must identify a distinct new security."];
    const remaining = read(securityField("equityCompensation", data.security_id, "remaining")) ?? source.quantity;
    if (!isQuantity(remaining) || !isQuantity(data.quantity) || exceeds(data.quantity, remaining)) {
      return isStockPlanId(source.stock_plan_id) ? [] : ["The source quantity cannot support the replacement issuances."];
    }
    let total = "0";
    let hasResults = false;
    for (const [index, id] of ids.entries()) {
      const target = targets[index];
      // Only an earlier source that could reach the same issuance has claimed the output.
      const claim = { source: data.security_id, date };
      const claimed = stock ? read(securityField("stockIssuances", id, "carry", claim)) : read(securityField("equityCompensation", id, "provenance", claim));
      const balance = !stock && id === data.balance_security_id;
      // An output can be issued and removed before this transaction runs that day.
      const removal = stock ? read(securityField("stockIssuances", id, "removal")) : read(securityField("equityCompensation", id, "removal"));
      const removedEarlier = read(securityField(undefined, id, "lifecycle")) === "removed" && (!date || removal?.date !== date);
      if (!target || !isOfType(target, family) || removedEarlier ||
          claimed || target.date !== date || !isQuantity(target.quantity) ||
          (source.stock_class_id && target.stock_class_id && source.stock_class_id !== target.stock_class_id) ||
          (!stock && (target.stock_plan_id !== source.stock_plan_id ||
            ("compensation_type" in target && target.compensation_type !== source.compensation_type))) ||
          ((balance || stock) && target.stakeholder_id !== source.stakeholder_id)) {
        return [text`Security ${id} does not match the source grant's replacement issuance.`];
      }
      if (balance) {
        const expected = subtract(remaining, data.quantity);
        if (subtract(expected, target.quantity) !== "0") return [text`Balance ${id} must hold the ${expected} shares left on the source grant.`];
      } else {
        hasResults = true;
        total = add(total, target.quantity);
      }
    }
    return hasResults && subtract(total, data.quantity) !== "0" ? [text`Resulting issuances total ${total} shares for a transaction of ${data.quantity}.`] : [];
  },
} satisfies CheckObject<Movement>;
