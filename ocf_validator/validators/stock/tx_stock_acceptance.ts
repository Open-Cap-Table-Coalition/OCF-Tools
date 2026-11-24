import { defineValidator } from "../checkKit";
import { issuanceExists, noStockEvent } from "./checks";

export const TX_STOCK_ACCEPTANCE = defineValidator({
  transaction: "TX_STOCK_ACCEPTANCE",
  effect: "none",
  families: ["stockIssuances"],
  checks: [issuanceExists, noStockEvent("TX_STOCK_RETRACTION")],
});
