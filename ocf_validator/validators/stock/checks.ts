import { namedStock, outputReads, stockField } from "./outputs";
import { isStockPlanId } from "../../stockPlan";
import { addsUpTo, exceeds, isNumeric, isQuantity } from "../../numeric";
import { familyChecksFor, isVestingTransaction, transactionsOn } from "../checks";
import { text, type CheckObject, type ReadField } from "../checkKit";

export const { issuanceExists } = familyChecksFor({
  name: "stock",
  collection: "stockIssuances",
  issuance: "TX_STOCK_ISSUANCE",
  acceptance: "TX_STOCK_ACCEPTANCE",
  vests: true,
  returnsToPool: true,
});

type Security = { security_id: string };
type Balance = Security & { balance_security_id?: string; date: string };
type Movement = Balance &
  (
    | { object_type: "TX_STOCK_CONVERSION"; quantity_converted: string }
    | { object_type: "TX_STOCK_TRANSFER" | "TX_STOCK_CANCELLATION" | "TX_STOCK_REPURCHASE"; quantity: string }
  );

export const sourceReads = (data: Security) => [stockField(data.security_id)];
export const balanceReads = (data: Balance) =>
  data.balance_security_id ? outputReads(data.balance_security_id) : [];
const balanceIssuanceReads = (data: Balance) =>
  data.balance_security_id ? [stockField(data.balance_security_id)] : [];
const bothReads = (data: Balance) =>
  data.balance_security_id ? [...sourceReads(data), ...balanceIssuanceReads(data)] : [];
const balanceIssuance = (data: Balance, read: ReadField) =>
  data.balance_security_id ? read(stockField(data.balance_security_id)) : undefined;
const amount = (data: Movement) =>
  data.object_type === "TX_STOCK_CONVERSION" ? data.quantity_converted : data.quantity;

export const balanceExists = {
  id: "balance-stock-exists",
  severity: "error",
  description: "A named balance security is a stock issuance.",
  reads: balanceReads,
  run: (_ctx, data, read) =>
    data.balance_security_id && !namedStock(read, data.balance_security_id, data.date)
      ? [text`No issued stock has the balance security ID ${data.balance_security_id}.`]
      : [],
} satisfies CheckObject<Balance>;

export const balanceDated = {
  id: "balance-stock-dated",
  severity: "error",
  description: "Balance stock is issued on the transaction date.",
  reads: balanceIssuanceReads,
  run: (_ctx, data, read) => {
    const balance = balanceIssuance(data, read);
    return balance && balance.date !== data.date
      ? [text`Balance ${balance.security_id} was issued on ${balance.date}, expected ${data.date}.`]
      : [];
  },
} satisfies CheckObject<Balance>;

export function balanceMatches(field: "stock_class_id" | "stakeholder_id") {
  return {
    id: field === "stock_class_id" ? "balance-stock-class" : "balance-stakeholder",
    severity: "error",
    description: `Balance stock has the same ${field} as the source.`,
    reads: bothReads,
    run: (_ctx, data, read) => {
      const balance = balanceIssuance(data, read);
      if (!balance) return [];
      const source = read(stockField(data.security_id));
      return source && source[field] !== balance[field]
        ? [text`Balance ${balance.security_id} differs from ${data.security_id} in ${field}.`]
        : [];
    },
  } satisfies CheckObject<Balance>;
}

const positiveBalance = {
  id: "balance-quantity-positive",
  severity: "error",
  description: "A balance issuance has a positive share quantity.",
  reads: balanceIssuanceReads,
  run: (_ctx, data, read) => {
    const balance = balanceIssuance(data, read);
    return balance && !(parseFloat(balance.quantity) > 0)
      ? [text`Balance ${balance.security_id} must have a positive quantity.`]
      : [];
  },
} satisfies CheckObject<Balance>;

export function quantityWithinSource(positive: boolean) {
  return {
    id: "quantity-within-source",
    severity: "error",
    description: positive
      ? "The transaction quantity is positive and within the issued quantity."
      : "The transfer quantity is within the issued quantity.",
    reads: sourceReads,
    run: (_ctx, data, read) => {
      const source = read(stockField(data.security_id));
      if (!source) return [];
      const quantity = amount(data);
      const strict = isRetirement(data) && isStockPlanId(source.stock_plan_id);
      const valid = isNumeric(quantity) && isNumeric(source.quantity)
        ? !exceeds(quantity, source.quantity) && (!positive || exceeds(quantity, "0"))
        : !strict && parseFloat(quantity) <= parseFloat(source.quantity) && (!positive || parseFloat(quantity) > 0);
      return valid
        ? []
        : [
            text`Quantity ${quantity} is outside the allowed range for ${data.security_id} (${source.quantity} issued).`,
          ];
    },
  } satisfies CheckObject<Movement>;
}

export const balanceReconciles = {
  id: "balance-quantity-reconciles",
  severity: "error",
  description: "The quantity moved plus any balance equals the source quantity.",
  reads: (data) =>
    data.object_type === "TX_STOCK_CONVERSION" && !data.balance_security_id
      ? []
      : [...sourceReads(data), ...balanceReads(data)],
  run: (_ctx, data, read) => {
    // Conversion only checks the balance equation when it names a balance.
    if (data.object_type === "TX_STOCK_CONVERSION" && !data.balance_security_id) return [];
    const source = read(stockField(data.security_id));
    const balance = data.balance_security_id ? namedStock(read, data.balance_security_id, data.date) : undefined;
    if (!source || (data.balance_security_id && !balance)) return [];
    const kept = balance ? balance.quantity : "0";
    const moved = amount(data);
    const strict = isRetirement(data) && isStockPlanId(source.stock_plan_id);
    return (!strict || [source.quantity, kept, moved].every(isQuantity)) && addsUpTo([moved, kept], source.quantity)
      ? []
      : [
          text`The quantity moved (${moved}) plus the balance (${kept}) must equal ${source.quantity} shares.`,
        ];
  },
} satisfies CheckObject<Movement>;

type StockEvent = Security & { object_type: string; id: string; date: string };

export const noOtherTransactions = {
  id: "no-other-transactions",
  severity: "error",
  description:
    "Only issuance, acceptance, vesting and this transaction reference the stock, except for an eligible return after retirement.",
  reads: (data) => (isRetirement(data) ? sourceReads(data) : []),
  run: (context, data, read) => {
    const canReturn = isRetirement(data) && isStockPlanId(read(stockField(data.security_id))?.stock_plan_id);
    return transactionsOn(context, data.security_id).flatMap((tx) => {
      // A TX_VESTING_START, TX_VESTING_EVENT or TX_VESTING_ACCELERATION leaves the stock outstanding,
      // so it can't conflict with this transaction. One dated after the stock was removed fails its
      // own no-earlier-removal check.
      if (
        tx.object_type === "TX_STOCK_ISSUANCE" ||
        tx.object_type === "TX_STOCK_ACCEPTANCE" ||
        isVestingTransaction(tx.object_type) ||
        (tx.object_type === data.object_type && tx.id === data.id) ||
        (canReturn && tx.object_type === "TX_STOCK_PLAN_RETURN_TO_POOL" && tx.date >= data.date)
      )
        return [];
      return [text`Transaction ${tx.id} also references stock ${data.security_id}.`];
    });
  },
} satisfies CheckObject<StockEvent>;

const isRetirement = (data: { object_type: string }) =>
  data.object_type === "TX_STOCK_CANCELLATION" || data.object_type === "TX_STOCK_REPURCHASE";

export function noStockEvent(type: "TX_STOCK_ACCEPTANCE" | "TX_STOCK_RETRACTION") {
  return {
    id: type === "TX_STOCK_ACCEPTANCE" ? "no-acceptance" : "no-retraction",
    severity: "error",
    description: `No ${type} references the stock.`,
    run: (context, data) =>
      transactionsOn(context, data.security_id).flatMap((tx) =>
        tx.object_type === type
          ? [text`Transaction ${tx.id} (${type}) references stock ${data.security_id}.`]
          : [],
      ),
  } satisfies CheckObject<Security>;
}

export const retirementChecks = [
  issuanceExists,
  balanceExists,
  balanceDated,
  balanceMatches("stock_class_id"),
  positiveBalance,
  quantityWithinSource(true),
  balanceReconciles,
  noOtherTransactions,
] as const;
