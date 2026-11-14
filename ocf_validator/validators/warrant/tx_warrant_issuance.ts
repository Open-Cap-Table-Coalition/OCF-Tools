import { defineValidator } from "../checkKit";
import { noEarlierRemoval, stakeholderExists } from "../checks";

export const TX_WARRANT_ISSUANCE = defineValidator({
  transaction: "TX_WARRANT_ISSUANCE",
  effect: "append",
  collection: "warrantIssuances",
  checks: [stakeholderExists, noEarlierRemoval],
});
