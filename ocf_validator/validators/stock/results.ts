import type { DeepReadonly } from "../../../types/validator";
import { addsUpTo } from "../../numeric";
import { text, type CheckObject, type ReadField } from "../checkKit";
import { balanceReads, sourceReads } from "./checks";
import { namedStock, outputReads, stockField } from "./outputs";

type Results = {
  object_type: string;
  resulting_security_ids: string[];
  security_id: string;
  date: string;
  split_transaction_id?: string;
};
const ids = (data: DeepReadonly<Results>): readonly string[] =>
  Array.isArray(data.resulting_security_ids) ? data.resulting_security_ids : [];
const needsAvailableOutput = (data: DeepReadonly<Results>) =>
  data.object_type === "TX_STOCK_TRANSFER" ||
  (data.object_type === "TX_STOCK_REISSUANCE" && data.split_transaction_id == null);

const issuanceReads = (id?: string) => id === undefined ? [] : [stockField(id)];

export const resultsExist = {
  id: "resulting-stock-exists",
  severity: "error",
  description: "At least one resulting stock issuance is named and every named issuance exists.",
  references: (data) => ids(data).length ? ids(data) : [undefined],
  reads: (data, _ctx, id) => id !== undefined && needsAvailableOutput(data) ? outputReads(id) : issuanceReads(id),
  run: (_ctx, data, read, id) => {
    if (id === undefined) return ["Expected a nonempty resulting_security_ids list."];
    const stock = needsAvailableOutput(data) ? namedStock(read, id, data.date) : read(stockField(id));
    return stock ? [] : [text`No eligible stock issuance has the resulting security ID ${id}.`];
  },
} satisfies CheckObject<Results>;

export const resultsDated = {
  id: "resulting-stock-dated",
  severity: "error",
  description: "Each resulting stock issuance has the transaction date.",
  references: ids,
  reads: (_data, _ctx, id) => issuanceReads(id),
  run: (_ctx, data, read, id) => {
    const stock = id === undefined ? undefined : read(stockField(id));
    return stock && stock.date !== data.date
      ? [text`Result ${id} was issued on ${stock.date}, expected ${data.date}.`]
      : [];
  },
} satisfies CheckObject<Results>;

export function compareResults(field: "stock_class_id" | "stakeholder_id", same: boolean) {
  return {
    id: field === "stock_class_id" ? "resulting-stock-class" : "resulting-stock-stakeholder",
    severity: "error",
    description: `Each resulting issuance must have ${same ? "the same" : "a different"} ${field} relative to the source.`,
    references: ids,
    reads: (data, _ctx, id) => [...sourceReads(data), ...issuanceReads(id)],
    run: (_ctx, data, read, id) => {
      const source = read(stockField(data.security_id));
      const stock = id === undefined ? undefined : read(stockField(id));
      return source && stock && (stock[field] === source[field]) !== same
        ? [text`Result ${id} must have ${same ? "the same" : "a different"} ${field} relative to ${data.security_id}.`]
        : [];
    },
  } satisfies CheckObject<Results>;
}

const resultReads = (data: DeepReadonly<Results>) => ids(data).flatMap(outputReads);

function resultQuantities(data: DeepReadonly<Results>, read: ReadField) {
  const quantities: string[] = [];
  for (const id of ids(data)) {
    const stock = namedStock(read, id, data.date);
    if (!stock) return;
    quantities.push(stock.quantity);
  }
  return quantities.length ? quantities : undefined;
}

type Transfer = Results & { quantity: string; balance_security_id?: string };
export const transferSum = {
  id: "resulting-quantity",
  severity: "error",
  description: "The resulting shares total the transferred quantity.",
  reads: resultReads,
  run: (_ctx, data, read) => {
    const quantities = resultQuantities(data, read);
    if (!quantities) return [];
    return addsUpTo(quantities, data.quantity)
      ? []
      : [text`Resulting shares must total the transfer quantity ${data.quantity}.`];
  },
} satisfies CheckObject<Transfer>;

type Replacement = Results &
  (
    | { object_type: "TX_STOCK_TRANSFER"; balance_security_id?: string }
    | { object_type: "TX_STOCK_REISSUANCE"; split_transaction_id?: string }
  );
const splitNamed = (data: DeepReadonly<Replacement>) =>
  data.object_type === "TX_STOCK_REISSUANCE" && data.split_transaction_id != null;
export const replacementSum = {
  id: "replacement-quantity",
  severity: "error",
  description: "Resulting and balance shares total the source shares unless a split is named.",
  reads: (data) =>
    splitNamed(data)
      ? []
      : [
          ...sourceReads(data),
          ...resultReads(data),
          ...(data.object_type === "TX_STOCK_TRANSFER" ? balanceReads(data) : []),
        ],
  run: (_ctx, data, read) => {
    if (splitNamed(data)) return [];
    const source = read(stockField(data.security_id));
    const balanceId = data.object_type === "TX_STOCK_TRANSFER" && data.balance_security_id;
    const balance = balanceId ? namedStock(read, balanceId, data.date) : undefined;
    const quantities = resultQuantities(data, read);
    if (!source || !quantities || (balanceId && !balance)) return [];
    if (balance) quantities.push(balance.quantity);
    return addsUpTo(quantities, source.quantity)
      ? []
      : [
          text`The resulting shares and balance must total ${source.quantity} shares from ${data.security_id}.`,
        ];
  },
} satisfies CheckObject<Replacement>;
