import { defineValidator } from "../checkKit";
import { issuanceExists, noStockEvent } from "./checks";

export const TX_STOCK_RETRACTION = defineValidator({
  transaction: "TX_STOCK_RETRACTION",
  effect: "remove",
  collection: "stockIssuances",
  checks: [issuanceExists, noStockEvent("TX_STOCK_ACCEPTANCE")],
});
