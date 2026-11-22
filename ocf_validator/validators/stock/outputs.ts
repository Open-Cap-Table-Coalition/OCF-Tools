import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { LegacyContext } from "../../ocfMachine";
import { securityAt } from "../../nodes";

/**
 * Find the stock a transaction names as its balance or result. Stock removals run before transfers
 * and repurchases on the same day, so stock issued and removed on the transaction's date still
 * counts. Stock removed after an earlier issuance does not. This lists one issuance or none.
 */
export const namedStock = (context: LegacyContext, securityId: unknown, date: unknown): OCFStockIssuance[] => {
  const stock = securityAt(context.nodes, "stockIssuances", securityId);
  const issued = stock?.issuance.value;
  if (!stock || !issued) return [];
  const removedToday = stock.lifecycle.value === "removed" && stock.removal?.value?.date === date && issued.date === date;
  return stock.lifecycle.value === "outstanding" || removedToday ? [issued] : [];
};
