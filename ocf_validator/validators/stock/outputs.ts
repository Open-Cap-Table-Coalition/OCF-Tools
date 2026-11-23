import { securityField } from "../../nodes";
import type { ReadField } from "../checkKit";

export const stockField = (id: string) => securityField("stockIssuances", id, "issuance");
const lifecycleField = (id: string) => securityField("stockIssuances", id, "lifecycle");
const removalField = (id: string) => securityField("stockIssuances", id, "removal");

export const outputReads = (id: string) => [stockField(id), lifecycleField(id), removalField(id)];

/** An output issued and removed today still counts unless its issuance was retracted. */
export function namedStock(read: ReadField, id: string, date: string) {
  const issued = read(stockField(id));
  if (!issued) return;
  const lifecycle = lifecycleField(id);
  const state = read(lifecycle);
  if (state === "outstanding") return issued;
  if (state === "removed" && issued.date === date && read(removalField(id))?.date === date &&
      read.writer(lifecycle)?.object_type !== "TX_STOCK_RETRACTION") return issued;
}
