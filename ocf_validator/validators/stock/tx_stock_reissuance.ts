import type { OCFStockReissuance } from "@opencaptablecoalition/ocf-types";
import { defineValidator, text, type CheckObject } from "../checkKit";
import { stockClassSplit } from "../checks";
import { issuanceExists, noOtherTransactions, sourceReads } from "./checks";
import { stockField } from "./outputs";
import { compareResults, replacementSum, resultsDated, resultsExist } from "./results";

function splitCheck(field: "exists" | "date" | "class"): CheckObject<OCFStockReissuance> {
  const descriptions = {
    exists: "A named split is a stock class split in the package.",
    date: "The split and reissuance have the same date.",
    class: "The split and the original stock belong to the same class.",
  };
  return {
    id: `split-${field}`,
    severity: "error",
    description: descriptions[field],
    reads: (data) => (field === "class" && data.split_transaction_id != null ? sourceReads(data) : []),
    run: (context, data, read) => {
      if (data.split_transaction_id == null) return [];
      const split = stockClassSplit(context, data.split_transaction_id);
      if (!split)
        return field === "exists" ? [text`Split ${data.split_transaction_id} was not found.`] : [];
      if (field === "date" && split.date !== data.date)
        return [text`Split ${split.id} was recorded on ${split.date}, expected ${data.date}.`];
      if (field === "class") {
        const source = read(stockField(data.security_id));
        if (source && split.stock_class_id !== source.stock_class_id)
          return [text`Split ${split.id} does not apply to class ${source.stock_class_id}.`];
      }
      return [];
    },
  };
}

export const TX_STOCK_REISSUANCE = defineValidator({
  transaction: "TX_STOCK_REISSUANCE",
  effect: "remove",
  collection: "stockIssuances",
  pool: "carriesStock",
  checks: [
    issuanceExists,
    resultsExist,
    resultsDated,
    noOtherTransactions,
    replacementSum,
    compareResults("stock_class_id", true),
    compareResults("stakeholder_id", true),
    splitCheck("exists"),
    splitCheck("date"),
    splitCheck("class"),
  ],
});
