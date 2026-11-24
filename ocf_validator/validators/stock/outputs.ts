import type { OCFStockIssuance } from "@opencaptablecoalition/ocf-types";
import type { LegacyContext } from "../../ocfMachine";
import { fieldAt, securityAt, securityField } from "../../nodes";

/**
 * Find the stock a transaction names as its balance or result. Stock removals run before transfers
 * and repurchases on the same day, so stock issued and removed on the transaction's date still
 * counts. Stock removed after an earlier issuance does not. A retraction voids the issuance, so
 * retracted stock never counts. This lists one issuance or none.
 */
export const namedStock = (context: LegacyContext, securityId: unknown, date: unknown): OCFStockIssuance[] => {
  const stock = securityAt(context.nodes, "stockIssuances", securityId);
  const issued = stock?.issuance.value;
  if (!stock || !issued) return [];
  if (stock.lifecycle.value === "outstanding") return [issued];
  if (stock.lifecycle.value !== "removed" || stock.lifecycle.writer?.object_type === "TX_STOCK_RETRACTION") return [];
  // Read the removal the way the checks do, so an older saved record still gives its date.
  const removal = fieldAt(context.nodes, securityField("stockIssuances", securityId, "removal"), context.removals)?.value;
  return removal?.date === date && issued.date === date ? [issued] : [];
};
