import { defineValidator } from "../checkKit";
import { stakeholderExists } from "../checks";

export const TX_WARRANT_ISSUANCE = defineValidator({
  transaction: "TX_WARRANT_ISSUANCE",
  effect: "append",
  collection: "warrantIssuances",
  checks: [stakeholderExists],
});
