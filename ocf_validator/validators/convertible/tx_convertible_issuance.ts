import { defineValidator } from "../checkKit";
import { noEarlierRemoval, stakeholderExists } from "../checks";

export const TX_CONVERTIBLE_ISSUANCE = defineValidator({
  transaction: "TX_CONVERTIBLE_ISSUANCE",
  effect: "append",
  collection: "convertibleIssuances",
  checks: [stakeholderExists, noEarlierRemoval],
});
