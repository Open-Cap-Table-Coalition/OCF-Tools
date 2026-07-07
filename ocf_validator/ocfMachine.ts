import { setup, assign } from "xstate";
import type {
  ObjectTypeMap,
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { TransactionFor } from "../types/ocf-input";
import type { OcfPackageContent } from "../read_ocf_package";
import type { Snapshot } from "../types/snapshot";
import type { Finding } from "../types/finding";
import validators from "./validators";
import run_EOD from "./eod";

// ---------------------------------------------------------------------------
// Cap-table collections
// ---------------------------------------------------------------------------

/**
 * The element type held by each family collection. Pairing a collection name
 * with a payload of the wrong family is a *compile* error (see
 * `appendToCollection`).
 */
interface CollectionElement {
  stockIssuances: OCFStockIssuance;
  convertibleIssuances: OCFConvertibleIssuance;
  warrantIssuances: OCFWarrantIssuance;
  equityCompensation: OCFEquityCompensationIssuance;
}

export type CollectionKey = keyof CollectionElement;

export type OcfMachineContext = {
  stockIssuances: OCFStockIssuance[];
  equityCompensation: OCFEquityCompensationIssuance[];
  convertibleIssuances: OCFConvertibleIssuance[];
  warrantIssuances: OCFWarrantIssuance[];
  ocfPackageContent: OcfPackageContent;
  report: any[];
  findings: Finding[];
  snapshots: Snapshot[];
  result: string;
};

// ---------------------------------------------------------------------------
// Per-key event union — each transaction handler's payload is `TransactionFor<K>`
// ---------------------------------------------------------------------------

/** Every `TX_*` value a package can carry. */
export type TxKey = Extract<keyof ObjectTypeMap, `TX_${string}`>;

/** One event variant per `TxKey`, so a handler for `K` receives `TransactionFor<K>`. */
type TxEvent = {
  [K in TxKey]: { type: K; data: TransactionFor<K>; date?: string };
}[TxKey];

export type OcfMachineEvent =
  | TxEvent
  | { type: "START"; data: OcfPackageContent; date: string }
  | { type: "RUN_EOD"; date: string }
  | { type: "RUN_END"; date: string };

// ---------------------------------------------------------------------------
// Family-collection helpers
// ---------------------------------------------------------------------------

/**
 * Append `data` to a family collection. The `collection` literal pins `C`, so
 * `current` and `data` must both belong to that family — appending a wrong-family
 * payload (e.g. a warrant payload onto the convertible collection) is a COMPILE
 * error. Exercised in `types/ocf-machine-table.assert.ts`.
 */
export function appendToCollection<C extends CollectionKey>(
  _collection: C,
  current: CollectionElement[C][],
  data: CollectionElement[C],
): CollectionElement[C][] {
  return [...current, data];
}

/** Remove every member of a collection matching `securityId`. */
function removeFromCollection<E extends { security_id: string }>(
  current: E[],
  securityId: unknown,
): E[] {
  return current.filter((obj) => obj.security_id !== securityId);
}

/**
 * The family collection a transaction belongs to, derived from its `TX_<FAMILY>_*`
 * prefix. Single source of truth for the family→collection mapping, shared by the
 * machine's `remove` path and the per-type tests.
 */
export const collectionKeyFor = (type: TxKey): CollectionKey => {
  if (type.startsWith("TX_STOCK_")) return "stockIssuances";
  if (type.startsWith("TX_CONVERTIBLE_")) return "convertibleIssuances";
  if (type.startsWith("TX_WARRANT_")) return "warrantIssuances";
  return "equityCompensation";
};

// ---------------------------------------------------------------------------
// The data-driven transaction table
// ---------------------------------------------------------------------------

type Validator = (
  context: OcfMachineContext,
  event: OcfMachineEvent,
  isGuard: boolean,
) => any;

/**
 * One row per `TxKey`. An active row carries the *operation* and the *validator*
 * for that key, referenced once so the guard and the report always use the same
 * validator. A `passthrough` row is a type the machine receives and silently
 * ignores.
 *
 *  - `append`: validate, report, and append the issuance to its family collection.
 *  - `none`:   validate and report, but mutate no collection.
 *  - `remove`: validate, report, and filter the family collection by `security_id`.
 */
type TxRow =
  | { op: "append" | "none" | "remove"; validator: Validator }
  | { op: "passthrough" };

const TX_TABLE = {
  // --- append: issuance appended to its family collection -----------------
  TX_STOCK_ISSUANCE: { op: "append", validator: validators.valid_tx_stock_issuance },
  TX_CONVERTIBLE_ISSUANCE: { op: "append", validator: validators.valid_tx_convertible_issuance },
  TX_WARRANT_ISSUANCE: { op: "append", validator: validators.valid_tx_warrant_issuance },
  TX_EQUITY_COMPENSATION_ISSUANCE: { op: "append", validator: validators.valid_tx_equity_compensation_issuance },

  // --- none: validate + report, no collection mutation --------------------
  TX_STOCK_ACCEPTANCE: { op: "none", validator: validators.valid_tx_stock_acceptance },
  TX_CONVERTIBLE_ACCEPTANCE: { op: "none", validator: validators.valid_tx_convertible_acceptance },
  TX_WARRANT_ACCEPTANCE: { op: "none", validator: validators.valid_tx_warrant_acceptance },
  TX_EQUITY_COMPENSATION_ACCEPTANCE: { op: "none", validator: validators.valid_tx_equity_compensation_acceptance },
  // TX_EQUITY_COMPENSATION_EXERCISE removes nothing today (its collection filter
  // is commented out in the legacy machine), asymmetric with TX_WARRANT_EXERCISE
  // which removes. That asymmetry is PRESERVED pending investigation, not endorsed.
  TX_EQUITY_COMPENSATION_EXERCISE: { op: "none", validator: validators.valid_tx_equity_compensation_exercise },

  // --- remove: filter the family collection by security_id ---------------
  TX_STOCK_RETRACTION: { op: "remove", validator: validators.valid_tx_stock_retraction },
  TX_STOCK_CANCELLATION: { op: "remove", validator: validators.valid_tx_stock_cancellation },
  TX_STOCK_CONVERSION: { op: "remove", validator: validators.valid_tx_stock_conversion },
  TX_STOCK_REISSUANCE: { op: "remove", validator: validators.valid_tx_stock_reissuance },
  TX_STOCK_REPURCHASE: { op: "remove", validator: validators.valid_tx_stock_repurchase },
  TX_STOCK_TRANSFER: { op: "remove", validator: validators.valid_tx_stock_transfer },
  TX_CONVERTIBLE_RETRACTION: { op: "remove", validator: validators.valid_tx_convertible_retraction },
  TX_CONVERTIBLE_CANCELLATION: { op: "remove", validator: validators.valid_tx_convertible_cancellation },
  TX_CONVERTIBLE_TRANSFER: { op: "remove", validator: validators.valid_tx_convertible_transfer },
  TX_CONVERTIBLE_CONVERSION: { op: "remove", validator: validators.valid_tx_convertible_conversion },
  TX_WARRANT_RETRACTION: { op: "remove", validator: validators.valid_tx_warrant_retraction },
  TX_WARRANT_CANCELLATION: { op: "remove", validator: validators.valid_tx_warrant_cancellation },
  TX_WARRANT_TRANSFER: { op: "remove", validator: validators.valid_tx_warrant_transfer },
  TX_WARRANT_EXERCISE: { op: "remove", validator: validators.valid_tx_warrant_exercise },
  TX_EQUITY_COMPENSATION_RETRACTION: { op: "remove", validator: validators.valid_tx_equity_compensation_retraction },
  TX_EQUITY_COMPENSATION_CANCELLATION: { op: "remove", validator: validators.valid_tx_equity_compensation_cancellation },
  TX_EQUITY_COMPENSATION_TRANSFER: { op: "remove", validator: validators.valid_tx_equity_compensation_transfer },

  // --- passthrough: received and silently ignored today ------------------
  //   No validator, no report entry, no collection mutation. They stay in
  //   `capTable` so today's behavior (and the characterization snapshot, which
  //   contains TX_VESTING_START) is byte-identical. `satisfies Record<TxKey, …>`
  //   below forces any future OCF transaction type to be classified here — a
  //   compile error until it is.
  TX_EQUITY_COMPENSATION_RELEASE: { op: "passthrough" },
  TX_EQUITY_COMPENSATION_REPRICING: { op: "passthrough" },
  TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT: { op: "passthrough" },
  TX_PLAN_SECURITY_ACCEPTANCE: { op: "passthrough" },
  TX_PLAN_SECURITY_CANCELLATION: { op: "passthrough" },
  TX_PLAN_SECURITY_EXERCISE: { op: "passthrough" },
  TX_PLAN_SECURITY_ISSUANCE: { op: "passthrough" },
  TX_PLAN_SECURITY_RELEASE: { op: "passthrough" },
  TX_PLAN_SECURITY_RETRACTION: { op: "passthrough" },
  TX_PLAN_SECURITY_TRANSFER: { op: "passthrough" },
  TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT: { op: "passthrough" },
  TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT: { op: "passthrough" },
  TX_STOCK_CLASS_SPLIT: { op: "passthrough" },
  TX_STOCK_CONSOLIDATION: { op: "passthrough" },
  TX_STOCK_PLAN_POOL_ADJUSTMENT: { op: "passthrough" },
  TX_STOCK_PLAN_RETURN_TO_POOL: { op: "passthrough" },
  TX_VESTING_ACCELERATION: { op: "passthrough" },
  TX_VESTING_EVENT: { op: "passthrough" },
  TX_VESTING_START: { op: "passthrough" },
} satisfies Record<TxKey, TxRow>;

export type TxTable = typeof TX_TABLE;
export type { TxRow };

const CONTROL_EVENTS = ["START", "RUN_EOD", "RUN_END"] as const;
type ControlEvent = (typeof CONTROL_EVENTS)[number];

const isControlEvent = (event: OcfMachineEvent): event is Extract<OcfMachineEvent, { type: ControlEvent }> =>
  (CONTROL_EVENTS as readonly string[]).includes(event.type);

/** The derived validator for an event, or `undefined` for control/passthrough events. */
const validatorForEvent = (event: OcfMachineEvent): Validator | undefined => {
  if (isControlEvent(event)) return undefined;
  const row = TX_TABLE[event.type];
  return "validator" in row ? row.validator : undefined;
};

// ---------------------------------------------------------------------------
// The machine — typed via setup({ types, actions, guards })
// ---------------------------------------------------------------------------

const failureMessage = (context: OcfMachineContext, subject: string, detail: string): string =>
  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${subject}: ${detail}`;

/**
 * Valid-branch collection mutation, derived from the table `op` and the TX family
 * prefix. `append` rows push the issuance onto their family collection; `remove`
 * rows filter it by `security_id`; `none` rows (and control events) mutate nothing.
 */
export function collectionUpdate(
  context: OcfMachineContext,
  event: OcfMachineEvent,
): Partial<OcfMachineContext> {
  if (isControlEvent(event)) return {};
  const row = TX_TABLE[event.type];

  if (row.op === "append") {
    // The per-key narrowing makes `event.data` the matching family payload, so a
    // wrong-family append is a compile error (see appendToCollection).
    switch (event.type) {
      case "TX_STOCK_ISSUANCE":
        return { stockIssuances: appendToCollection("stockIssuances", context.stockIssuances, event.data) };
      case "TX_CONVERTIBLE_ISSUANCE":
        return { convertibleIssuances: appendToCollection("convertibleIssuances", context.convertibleIssuances, event.data) };
      case "TX_WARRANT_ISSUANCE":
        return { warrantIssuances: appendToCollection("warrantIssuances", context.warrantIssuances, event.data) };
      case "TX_EQUITY_COMPENSATION_ISSUANCE":
        return { equityCompensation: appendToCollection("equityCompensation", context.equityCompensation, event.data) };
      default:
        return {};
    }
  }

  if (row.op === "remove") {
    const securityId = "security_id" in event.data ? event.data.security_id : undefined;
    // `removeFromCollection` is family-agnostic (it only needs security_id); the
    // concrete field per case keeps the assign cast-free.
    switch (collectionKeyFor(event.type)) {
      case "stockIssuances":
        return { stockIssuances: removeFromCollection(context.stockIssuances, securityId) };
      case "convertibleIssuances":
        return { convertibleIssuances: removeFromCollection(context.convertibleIssuances, securityId) };
      case "warrantIssuances":
        return { warrantIssuances: removeFromCollection(context.warrantIssuances, securityId) };
      case "equityCompensation":
        return { equityCompensation: removeFromCollection(context.equityCompensation, securityId) };
    }
  }

  return {};
}

/**
 * Build the `on` map for every key in `TX_TABLE`: active keys share the
 * two-branch transition; passthrough keys are an explicit no-op (`{}`).
 */
function buildTransactionHandlers() {
  const activeTransitions = [
    {
      guard: "isValidTx",
      target: "capTable",
      actions: ["appendReport", "mutateCollection"],
    },
    {
      target: "validationError",
      actions: ["appendReport", "setValidationError"],
    },
  ] as const;
  const passthrough = {} as const;

  return (Object.keys(TX_TABLE) as TxKey[]).reduce(
    (handlers, type) => {
      handlers[type] = TX_TABLE[type].op === "passthrough" ? passthrough : activeTransitions;
      return handlers;
    },
    {} as Record<TxKey, typeof activeTransitions | typeof passthrough>,
  );
}

export const ocfMachine = setup({
  types: {} as {
    context: OcfMachineContext;
    events: OcfMachineEvent;
  },
  guards: {
    // Guard the valid branch via the type's own validator in `true` (boolean) mode.
    isValidTx: ({ context, event }) => {
      const validator = validatorForEvent(event);
      return validator ? validator(context, event, true) : false;
    },
  },
  actions: {
    // Append the validator's report entry. Same validator reference as the guard,
    // so the guard and the report can never diverge.
    appendReport: assign({
      report: ({ context, event }) => {
        const validator = validatorForEvent(event);
        return validator ? [...context.report, validator(context, event, false)] : context.report;
      },
    }),

    // Invalid branch: record the failure message. `appendReport` runs immediately
    // before this action on the invalid branch, so the validator's report entry is
    // already at the tail of `report` — reuse it instead of re-running the
    // (package-scanning) validator a third time.
    setValidationError: assign({
      result: ({ context, event }) => {
        const subject = "data" in event && "id" in event.data ? event.data.id : event.type;
        const lastReport = context.report[context.report.length - 1];
        const detail = context.report.length ? JSON.stringify(lastReport, null, 2) : "";
        return failureMessage(context, subject, detail);
      },
    }),

    // Valid branch collection mutation, derived from the table `op` and the TX
    // family prefix. `none` rows (and control events) mutate nothing.
    mutateCollection: assign(({ context, event }) => collectionUpdate(context, event)),
  },
}).createMachine({
  id: "OCF-xstate",
  initial: "capTable",
  context: {
    stockIssuances: [],
    equityCompensation: [],
    convertibleIssuances: [],
    warrantIssuances: [],
    ocfPackageContent: {
      manifest: {},
      stakeholders: [],
      stockClasses: [],
      transactions: [],
      stockLegends: [],
      stockPlans: [],
      vestingTerms: [],
      valuations: [],
    },
    report: [],
    findings: [],
    snapshots: [],
    result: "Incomplete",
  },
  states: {
    capTable: {
      on: {
        // Active handlers all share this two-branch shape; the table-driven
        // actions resolve the per-type validator/op. Passthrough handlers
        // are explicit no-ops so the `'*'` wildcard never catches a known type.
        ...buildTransactionHandlers(),
        START: {
          target: "capTable",
          actions: assign({
            ocfPackageContent: ({ event }) => event.data,
          }),
        },
        RUN_EOD: {
          target: "capTable",
          actions: assign({
            snapshots: ({ context, event }) => [...context.snapshots, run_EOD(context, event)],
          }),
        },
        RUN_END: {
          target: "capTable",
          actions: assign({
            result: ({ context }) =>
              `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} is complete and the package appears valid.`,
          }),
        },
        // Fires only for runtime `type` strings outside TxKey (genuinely unknown /
        // malformed). Builds its message from `event.type`, never `event.data`.
        "*": {
          target: "validationError",
          actions: assign({
            result: ({ context, event }) =>
              `The validation of the OCF package for ${context.ocfPackageContent.manifest?.issuer?.legal_name} failed on ${event.type} because it is not a valid TX type.`,
          }),
        },
      },
    },
    validationError: {
      type: "final",
    },
  },
});
