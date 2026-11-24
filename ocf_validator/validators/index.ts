import type {
  ObjectTypeMap,
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { TransactionFor } from "../../types/ocf-input";
import type { Check, GradedValidator, LifecycleWord, PoolEffect } from "../../types/validator";
import { TX_STOCK_ACCEPTANCE } from "./stock/tx_stock_acceptance";
import { TX_CONVERTIBLE_ISSUANCE } from "./convertible/tx_convertible_issuance";
import { TX_CONVERTIBLE_ACCEPTANCE } from "./convertible/tx_convertible_acceptance";
import { TX_CONVERTIBLE_RETRACTION } from "./convertible/tx_convertible_retraction";
import { TX_CONVERTIBLE_CANCELLATION } from "./convertible/tx_convertible_cancellation";
import { TX_CONVERTIBLE_TRANSFER } from "./convertible/tx_convertible_transfer";
import { TX_CONVERTIBLE_CONVERSION } from "./convertible/tx_convertible_conversion";
import { TX_WARRANT_ISSUANCE } from "./warrant/tx_warrant_issuance";
import { TX_WARRANT_ACCEPTANCE } from "./warrant/tx_warrant_acceptance";
import { TX_WARRANT_RETRACTION } from "./warrant/tx_warrant_retraction";
import { TX_WARRANT_CANCELLATION } from "./warrant/tx_warrant_cancellation";
import { TX_WARRANT_TRANSFER } from "./warrant/tx_warrant_transfer";
import { TX_WARRANT_EXERCISE } from "./warrant/tx_warrant_exercise";
import { TX_STOCK_PLAN_POOL_ADJUSTMENT } from "./stock_plan/tx_stock_plan_pool_adjustment";
import { TX_STOCK_PLAN_RETURN_TO_POOL } from "./stock_plan/tx_stock_plan_return_to_pool";
import { TX_EQUITY_COMPENSATION_ISSUANCE, TX_PLAN_SECURITY_ISSUANCE } from "./equity_compensation/tx_equity_compensation_issuance";
import { TX_EQUITY_COMPENSATION_ACCEPTANCE, TX_PLAN_SECURITY_ACCEPTANCE } from "./equity_compensation/tx_equity_compensation_acceptance";
import { TX_EQUITY_COMPENSATION_EXERCISE, TX_PLAN_SECURITY_EXERCISE } from "./equity_compensation/tx_equity_compensation_exercise";
import { TX_EQUITY_COMPENSATION_RELEASE, TX_PLAN_SECURITY_RELEASE } from "./equity_compensation/tx_equity_compensation_release";
import { TX_EQUITY_COMPENSATION_REPRICING } from "./equity_compensation/tx_equity_compensation_repricing";
import { TX_EQUITY_COMPENSATION_RETRACTION, TX_PLAN_SECURITY_RETRACTION } from "./equity_compensation/tx_equity_compensation_retraction";
import { TX_EQUITY_COMPENSATION_CANCELLATION, TX_PLAN_SECURITY_CANCELLATION } from "./equity_compensation/tx_equity_compensation_cancellation";
import { TX_EQUITY_COMPENSATION_TRANSFER, TX_PLAN_SECURITY_TRANSFER } from "./equity_compensation/tx_equity_compensation_transfer";
import { TX_STOCK_ISSUANCE } from "./stock/tx_stock_issuance";
import { TX_STOCK_CANCELLATION } from "./stock/tx_stock_cancellation";
import { TX_STOCK_CONVERSION } from "./stock/tx_stock_conversion";
import { TX_STOCK_REISSUANCE } from "./stock/tx_stock_reissuance";
import { TX_STOCK_REPURCHASE } from "./stock/tx_stock_repurchase";
import { TX_STOCK_RETRACTION } from "./stock/tx_stock_retraction";
import { TX_STOCK_TRANSFER } from "./stock/tx_stock_transfer";

export interface CollectionElement {
  stockIssuances: OCFStockIssuance;
  convertibleIssuances: OCFConvertibleIssuance;
  warrantIssuances: OCFWarrantIssuance;
  equityCompensation: OCFEquityCompensationIssuance;
}

export type CollectionKey = keyof CollectionElement;

export type TxKey = Extract<keyof ObjectTypeMap, `TX_${string}`>;

export type Descriptor = (
  | { effect: "passthrough"; lifecycle: LifecycleWord; families: readonly CollectionKey[] }
  | { effect: "none"; lifecycle: "stays" | "after removal"; families: readonly CollectionKey[]; validate: GradedValidator<never>; checks: readonly Check[] }
  | { effect: "remove"; lifecycle: "removes"; collection: CollectionKey; validate: GradedValidator<never>; checks: readonly Check[] }
  | { [C in CollectionKey]: {
      effect: "append"; lifecycle: "issue"; collection: C; validate: GradedValidator<CollectionElement[C]>; checks: readonly Check[];
    } }[CollectionKey]
) & { pool?: PoolEffect };

export type DescriptorTable = {
  [K in TxKey]: Descriptor & ({ effect: "passthrough" } | { transaction: K; validate: GradedValidator<TransactionFor<K>> });
};

/** Include keys that appear on only one member of the union. */
type KeyOfAny<T> = T extends unknown ? keyof T : never;

/** A family supports vesting if its issuance type has a vesting terms or template ID. */
export type VestingFamily = {
  [C in CollectionKey]: Extract<KeyOfAny<CollectionElement[C]>, "vesting_terms_id" | "vesting_template_id"> extends never
    ? never
    : C;
}[CollectionKey];

/**
 * Keep this list in step with the issuance types that have vesting terms. The build checks the
 * match.
 */
export const VESTING_FAMILIES = [
  "stockIssuances",
  "warrantIssuances",
  "equityCompensation",
] as const satisfies readonly VestingFamily[];

export const TX_DESCRIPTORS = {
  // Reuse the current equity compensation descriptors for all seven older transaction names.

  // --- append: issuance appended to its family collection -----------------
  TX_STOCK_ISSUANCE,
  TX_CONVERTIBLE_ISSUANCE,
  TX_WARRANT_ISSUANCE,
  TX_EQUITY_COMPENSATION_ISSUANCE,
  TX_PLAN_SECURITY_ISSUANCE,

  // --- none: validate and record, no collection mutation ------------------
  TX_STOCK_ACCEPTANCE,
  TX_CONVERTIBLE_ACCEPTANCE,
  TX_WARRANT_ACCEPTANCE,
  TX_EQUITY_COMPENSATION_ACCEPTANCE,
  TX_EQUITY_COMPENSATION_EXERCISE,
  TX_EQUITY_COMPENSATION_RELEASE,
  TX_EQUITY_COMPENSATION_REPRICING,
  TX_PLAN_SECURITY_ACCEPTANCE,
  TX_PLAN_SECURITY_EXERCISE,
  TX_PLAN_SECURITY_RELEASE,
  // A return credits a plan after the security's removal. An adjustment sets the plan's reserve and
  // needs no security.
  TX_STOCK_PLAN_RETURN_TO_POOL,
  TX_STOCK_PLAN_POOL_ADJUSTMENT,

  // --- remove: filter the family collection by security_id ---------------
  TX_STOCK_RETRACTION,
  TX_STOCK_CANCELLATION,
  TX_STOCK_CONVERSION,
  TX_STOCK_REISSUANCE,
  TX_STOCK_REPURCHASE,
  TX_STOCK_TRANSFER,
  TX_CONVERTIBLE_RETRACTION,
  TX_CONVERTIBLE_CANCELLATION,
  TX_CONVERTIBLE_TRANSFER,
  TX_CONVERTIBLE_CONVERSION,
  TX_WARRANT_RETRACTION,
  TX_WARRANT_CANCELLATION,
  TX_WARRANT_TRANSFER,
  TX_WARRANT_EXERCISE,
  TX_EQUITY_COMPENSATION_RETRACTION,
  TX_EQUITY_COMPENSATION_CANCELLATION,
  TX_EQUITY_COMPENSATION_TRANSFER,
  TX_PLAN_SECURITY_RETRACTION,
  TX_PLAN_SECURITY_CANCELLATION,
  TX_PLAN_SECURITY_TRANSFER,

  // The machine checks these transactions for earlier removal. Vesting leaves stock, warrants and
  // equity grants outstanding. Successful passthrough transactions make no change to the outstanding
  // securities.
  TX_VESTING_START: { effect: "passthrough", lifecycle: "stays", families: VESTING_FAMILIES },
  TX_VESTING_EVENT: { effect: "passthrough", lifecycle: "stays", families: VESTING_FAMILIES },
  TX_VESTING_ACCELERATION: { effect: "passthrough", lifecycle: "stays", families: VESTING_FAMILIES },
  // A consolidation replaces several stock securities with one.
  TX_STOCK_CONSOLIDATION: { pool: "carriesStock", effect: "passthrough", lifecycle: "removes", families: ["stockIssuances"] },
  // Class and issuer transactions name no individual security. They have no entry on a security
  // family's chart.
  TX_STOCK_CLASS_SPLIT: { effect: "passthrough", lifecycle: "stays", families: [] },
  TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT: { effect: "passthrough", lifecycle: "stays", families: [] },
  TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT: { effect: "passthrough", lifecycle: "stays", families: [] },
  TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT: { effect: "passthrough", lifecycle: "stays", families: [] },
} satisfies DescriptorTable;

export const lifecycleFamilies = (descriptor: Descriptor): readonly CollectionKey[] =>
  "collection" in descriptor ? [descriptor.collection] : descriptor.families;
