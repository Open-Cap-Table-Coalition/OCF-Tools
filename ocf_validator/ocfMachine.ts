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
import type { Finding } from "../types/finding";
import type { Check, GradedValidator, OcfMachineContext } from "../types/validator";
import validators from "./validators";
import { TX_CONVERTIBLE_ISSUANCE } from "./validators/convertible/tx_convertible_issuance";
import { TX_CONVERTIBLE_ACCEPTANCE } from "./validators/convertible/tx_convertible_acceptance";
import { TX_CONVERTIBLE_RETRACTION } from "./validators/convertible/tx_convertible_retraction";
import { TX_CONVERTIBLE_CANCELLATION } from "./validators/convertible/tx_convertible_cancellation";
import { TX_CONVERTIBLE_TRANSFER } from "./validators/convertible/tx_convertible_transfer";
import { TX_CONVERTIBLE_CONVERSION } from "./validators/convertible/tx_convertible_conversion";
import { TX_WARRANT_ISSUANCE } from "./validators/warrant/tx_warrant_issuance";
import { TX_WARRANT_ACCEPTANCE } from "./validators/warrant/tx_warrant_acceptance";
import { TX_WARRANT_RETRACTION } from "./validators/warrant/tx_warrant_retraction";
import { TX_WARRANT_CANCELLATION } from "./validators/warrant/tx_warrant_cancellation";
import { TX_WARRANT_TRANSFER } from "./validators/warrant/tx_warrant_transfer";
import { TX_WARRANT_EXERCISE } from "./validators/warrant/tx_warrant_exercise";
import run_EOD from "./eod";

// The validator contract types are defined in types/validator.ts; re-exported
// here because the validator modules and the package barrel import them from
// this module. The re-export is removed once every module imports
// types/validator.ts directly.
export type { GradedValidator, OcfMachineContext } from "../types/validator";

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

// ---------------------------------------------------------------------------
// Per-transaction descriptors
// ---------------------------------------------------------------------------

/**
 * A legacy dual-mode validator for a transaction whose payload is `T`: asked
 * with `isGuard: true` it returns a validity boolean, with `isGuard: false` its
 * report-mode entry. The payload sits in a contravariant position and is
 * optional, so control events (which carry no `data`) and the untyped
 * `event: any` validators all satisfy it.
 *
 * Transitional: this type, the `legacyValidate` field that carries it, and the
 * legacy arms of the dispatch helpers are all deleted once the last validator
 * family migrates to the graded shape.
 */
type Validator<T> = (
  context: OcfMachineContext,
  event: { data?: T },
  isGuard: boolean,
) => any;

/**
 * Everything the machine needs to know about one transaction type, keyed on its
 * `effect`. A non-passthrough descriptor names its validator under exactly one
 * of two mutually exclusive fields — `legacyValidate` (dual-mode shape) or
 * `validate` (graded shape) — so which convention a transaction uses is part of
 * the table's static description, and the machine dispatches on field presence
 * the same way it dispatches on `effect`. The validator is referenced once so
 * the guard and the recorded outcome always use the same one. The
 * `legacyValidate` arms exist only while families migrate; the union collapses
 * to the graded arms when the last one does.
 *
 *  - `passthrough`: received and silently ignored — no validator, record, or mutation.
 *  - `none`:        validate and record, but mutate no collection.
 *  - `remove`:      validate, record, and filter `collection` by `security_id`.
 *  - `append`:      validate, record, and append the issuance to `collection`.
 *
 * The `none`/`remove` graded arms take `GradedValidator<any>`, not
 * `GradedValidator<unknown>`: the payload is contravariant, so `unknown` would
 * reject every family-typed validator — like `Validator<unknown>` over the
 * `event: any` validators, the `any` constrains the shape, not the payload.
 *
 * The `append` variants distribute over `CollectionKey`, tying `collection` to
 * the payload family of the validator — under either field — so a family-typed
 * validator cannot be declared under a mismatched collection (demonstrated in
 * `types/ocf-machine-table.assert.ts`).
 *
 * Each graded arm also carries `checks`: the module's declared validation
 * coverage as structured `Check` data (see `types/validator.ts`). The machine
 * never reads it — it is documentation-grade metadata for the coverage-report
 * generator — but requiring it on the graded arms makes declaring the checks
 * inseparable from migrating a family to the graded shape. Legacy arms carry none.
 */
type Descriptor =
  | { effect: "passthrough" }
  | { effect: "none"; legacyValidate: Validator<unknown> }
  | { effect: "none"; validate: GradedValidator<any>; checks: readonly Check[] }
  | { effect: "remove"; legacyValidate: Validator<unknown>; collection: CollectionKey }
  | { effect: "remove"; validate: GradedValidator<any>; collection: CollectionKey; checks: readonly Check[] }
  | {
      [C in CollectionKey]: {
        effect: "append";
        collection: C;
        legacyValidate: Validator<CollectionElement[C]>;
      };
    }[CollectionKey]
  | {
      [C in CollectionKey]: {
        effect: "append";
        collection: C;
        validate: GradedValidator<CollectionElement[C]>;
        checks: readonly Check[];
      };
    }[CollectionKey];

/** A non-passthrough descriptor — the shape the dispatch helpers consume. */
export type ActiveDescriptor = Exclude<Descriptor, { effect: "passthrough" }>;

export const TX_DESCRIPTORS = {
  // --- append: issuance appended to its family collection -----------------
  TX_STOCK_ISSUANCE: { effect: "append", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_issuance },
  TX_CONVERTIBLE_ISSUANCE,
  TX_WARRANT_ISSUANCE,
  TX_EQUITY_COMPENSATION_ISSUANCE: { effect: "append", collection: "equityCompensation", legacyValidate: validators.valid_tx_equity_compensation_issuance },

  // --- none: validate + report, no collection mutation --------------------
  TX_STOCK_ACCEPTANCE: { effect: "none", legacyValidate: validators.valid_tx_stock_acceptance },
  TX_CONVERTIBLE_ACCEPTANCE,
  TX_WARRANT_ACCEPTANCE,
  TX_EQUITY_COMPENSATION_ACCEPTANCE: { effect: "none", legacyValidate: validators.valid_tx_equity_compensation_acceptance },
  // TX_EQUITY_COMPENSATION_EXERCISE removes nothing today (its collection filter
  // is commented out in the legacy machine), asymmetric with TX_WARRANT_EXERCISE
  // which removes. That asymmetry is PRESERVED pending investigation, not endorsed.
  TX_EQUITY_COMPENSATION_EXERCISE: { effect: "none", legacyValidate: validators.valid_tx_equity_compensation_exercise },

  // --- remove: filter the family collection by security_id ---------------
  TX_STOCK_RETRACTION: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_retraction },
  TX_STOCK_CANCELLATION: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_cancellation },
  TX_STOCK_CONVERSION: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_conversion },
  TX_STOCK_REISSUANCE: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_reissuance },
  TX_STOCK_REPURCHASE: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_repurchase },
  TX_STOCK_TRANSFER: { effect: "remove", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_transfer },
  TX_CONVERTIBLE_RETRACTION,
  TX_CONVERTIBLE_CANCELLATION,
  TX_CONVERTIBLE_TRANSFER,
  TX_CONVERTIBLE_CONVERSION,
  TX_WARRANT_RETRACTION,
  TX_WARRANT_CANCELLATION,
  TX_WARRANT_TRANSFER,
  TX_WARRANT_EXERCISE,
  TX_EQUITY_COMPENSATION_RETRACTION: { effect: "remove", collection: "equityCompensation", legacyValidate: validators.valid_tx_equity_compensation_retraction },
  TX_EQUITY_COMPENSATION_CANCELLATION: { effect: "remove", collection: "equityCompensation", legacyValidate: validators.valid_tx_equity_compensation_cancellation },
  TX_EQUITY_COMPENSATION_TRANSFER: { effect: "remove", collection: "equityCompensation", legacyValidate: validators.valid_tx_equity_compensation_transfer },

  // --- passthrough: received and silently ignored today ------------------
  //   No validator, no report entry, no collection mutation. They stay in
  //   `capTable` so today's behavior (and the characterization snapshot, which
  //   contains TX_VESTING_START) is byte-identical. `satisfies Record<TxKey, …>`
  //   below forces any future OCF transaction type to be classified here — a
  //   compile error until it is.
  TX_EQUITY_COMPENSATION_RELEASE: { effect: "passthrough" },
  TX_EQUITY_COMPENSATION_REPRICING: { effect: "passthrough" },
  TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT: { effect: "passthrough" },
  TX_PLAN_SECURITY_ACCEPTANCE: { effect: "passthrough" },
  TX_PLAN_SECURITY_CANCELLATION: { effect: "passthrough" },
  TX_PLAN_SECURITY_EXERCISE: { effect: "passthrough" },
  TX_PLAN_SECURITY_ISSUANCE: { effect: "passthrough" },
  TX_PLAN_SECURITY_RELEASE: { effect: "passthrough" },
  TX_PLAN_SECURITY_RETRACTION: { effect: "passthrough" },
  TX_PLAN_SECURITY_TRANSFER: { effect: "passthrough" },
  TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT: { effect: "passthrough" },
  TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT: { effect: "passthrough" },
  TX_STOCK_CLASS_SPLIT: { effect: "passthrough" },
  TX_STOCK_CONSOLIDATION: { effect: "passthrough" },
  TX_STOCK_PLAN_POOL_ADJUSTMENT: { effect: "passthrough" },
  TX_STOCK_PLAN_RETURN_TO_POOL: { effect: "passthrough" },
  TX_VESTING_ACCELERATION: { effect: "passthrough" },
  TX_VESTING_EVENT: { effect: "passthrough" },
  TX_VESTING_START: { effect: "passthrough" },
} satisfies Record<TxKey, Descriptor>;

export type { Descriptor };

const CONTROL_EVENTS = ["START", "RUN_EOD", "RUN_END"] as const;
type ControlEvent = (typeof CONTROL_EVENTS)[number];

const isControlEvent = (event: OcfMachineEvent): event is Extract<OcfMachineEvent, { type: ControlEvent }> =>
  (CONTROL_EVENTS as readonly string[]).includes(event.type);

/** The descriptor for a transaction type, or `undefined` for passthrough types. */
const activeDescriptorFor = (type: TxKey): ActiveDescriptor | undefined => {
  const descriptor = TX_DESCRIPTORS[type];
  return descriptor.effect === "passthrough" ? undefined : descriptor;
};

// ---------------------------------------------------------------------------
// Validator dispatch — legacyValidate vs validate
// ---------------------------------------------------------------------------
//
// Each helper takes the descriptor as a parameter (rather than resolving it
// from the table) and branches on which validator field it carries: a
// `legacyValidate` validator receives the whole event plus the guard flag; a
// `validate` (graded) validator receives only `event.data` and returns
// findings. The legacy arms are today's dispatch relocated into one place, not
// new behavior; they are deleted with `legacyValidate` when the last family
// migrates, leaving each helper single-armed.

const failureMessage = (context: OcfMachineContext, subject: string, detail: string): string =>
  `The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} failed on ${subject}: ${detail}`;

/**
 * The event slice the dispatch helpers read. `data` is `any` for the same
 * reason legacy validators declare `event: any`: the payload's family is the
 * descriptor table's concern, not the dispatcher's.
 */
type ValidatorEvent = { type: string; data?: any };

/** The single blocking rule for graded findings: only an error blocks. */
const isErrorFinding = (finding: Finding): boolean => finding.severity === "error";

/**
 * Guard outcome for one transaction under `descriptor`'s validator. A graded
 * validator's findings decide: valid iff none carries severity "error", so
 * warnings alone do not block. A legacy validator is asked directly in guard
 * (boolean) mode.
 */
export function isValidOutcome(
  descriptor: ActiveDescriptor,
  context: OcfMachineContext,
  event: ValidatorEvent,
): boolean {
  if ("validate" in descriptor) {
    return !descriptor.validate(context, event.data).some(isErrorFinding);
  }
  return descriptor.legacyValidate(context, event, true);
}

/**
 * The record-channel update for one transaction's outcome, valid or invalid:
 * a graded validator's findings are appended to `findings` and its error
 * slice is stashed on `lastErrorFindings` for the failure branch; `report` is
 * never written. A legacy validator's report-mode entry is appended to
 * `report`.
 */
export function outcomeUpdate(
  descriptor: ActiveDescriptor,
  context: OcfMachineContext,
  event: ValidatorEvent,
): Partial<OcfMachineContext> {
  if ("validate" in descriptor) {
    const found = descriptor.validate(context, event.data);
    return {
      findings: [...context.findings, ...found],
      lastErrorFindings: found.filter(isErrorFinding),
    };
  }
  return { report: [...context.report, descriptor.legacyValidate(context, event, false)] };
}

/**
 * The invalid-branch `result` message, with a shape-specific failure detail.
 * Both arms read what the record action wrote immediately before this one,
 * rather than re-running the (package-scanning) validator: the graded arm
 * serializes `lastErrorFindings` (this transaction's error findings, in
 * return order), the legacy arm the report entry at the tail of `report`.
 */
export function failureResult(
  descriptor: ActiveDescriptor | undefined,
  context: OcfMachineContext,
  event: ValidatorEvent,
): string {
  const subject =
    typeof event.data === "object" && event.data !== null && "id" in event.data
      ? event.data.id
      : event.type;
  if (descriptor && "validate" in descriptor) {
    return failureMessage(context, subject, JSON.stringify(context.lastErrorFindings, null, 2));
  }
  const lastReport = context.report[context.report.length - 1];
  const detail = context.report.length ? JSON.stringify(lastReport, null, 2) : "";
  return failureMessage(context, subject, detail);
}

// ---------------------------------------------------------------------------
// The machine — typed via setup({ types, actions, guards })
// ---------------------------------------------------------------------------

/**
 * Valid-branch collection mutation, driven by the descriptor's `effect` and
 * `collection`. `append` descriptors push the issuance onto their family
 * collection; `remove` descriptors filter it by `security_id`; `none` descriptors
 * (and control events) mutate nothing.
 */
export function collectionUpdate(
  context: OcfMachineContext,
  event: OcfMachineEvent,
): Partial<OcfMachineContext> {
  if (isControlEvent(event)) return {};
  const descriptor = TX_DESCRIPTORS[event.type];

  if (descriptor.effect === "append") {
    // The per-key narrowing makes `event.data` the matching family payload, so a
    // wrong-family append is a compile error (see appendToCollection). TypeScript
    // cannot pair a runtime `descriptor.collection` with the narrowed payload, so
    // the collection literal comes from the per-type case, not the descriptor.
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

  if (descriptor.effect === "remove") {
    const securityId = "security_id" in event.data ? event.data.security_id : undefined;
    // `removeFromCollection` is family-agnostic (it only needs security_id); the
    // descriptor's own `collection` picks the field, retiring the name-prefix guess.
    switch (descriptor.collection) {
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
 * Build the `on` map for every key in `TX_DESCRIPTORS`: active keys share the
 * two-branch transition; passthrough keys are an explicit no-op (`{}`).
 */
function buildTransactionHandlers() {
  const activeTransitions = [
    {
      guard: "isValidTx",
      target: "capTable",
      actions: ["recordOutcome", "mutateCollection"],
    },
    {
      target: "validationError",
      actions: ["recordOutcome", "setValidationError"],
    },
  ] as const;
  const passthrough = {} as const;

  return (Object.keys(TX_DESCRIPTORS) as TxKey[]).reduce(
    (handlers, type) => {
      handlers[type] = TX_DESCRIPTORS[type].effect === "passthrough" ? passthrough : activeTransitions;
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
    // Guard the valid branch via the type's own validator, legacyValidate or
    // validate (see isValidOutcome). Control events never reach this guard
    // (they have their own handlers); the narrow drops them so `event` carries
    // the `data` the validator reads.
    isValidTx: ({ context, event }) => {
      if (isControlEvent(event)) return false;
      const descriptor = activeDescriptorFor(event.type);
      return descriptor ? isValidOutcome(descriptor, context, event) : false;
    },
  },
  actions: {
    // Record the validator's outcome on its shape's channel — legacy report
    // entries onto `report`, graded findings onto `findings`. Same descriptor
    // as the guard, so the guard and the record can never diverge.
    recordOutcome: assign(({ context, event }) => {
      if (isControlEvent(event)) return {};
      const descriptor = activeDescriptorFor(event.type);
      return descriptor ? outcomeUpdate(descriptor, context, event) : {};
    }),

    // Invalid branch: record the failure message (see failureResult for the
    // shape-specific detail sourcing).
    setValidationError: assign({
      result: ({ context, event }) =>
        failureResult(isControlEvent(event) ? undefined : activeDescriptorFor(event.type), context, event),
    }),

    // Valid branch collection mutation, driven by the descriptor's `effect` and
    // `collection`. `none` descriptors (and control events) mutate nothing.
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
    lastErrorFindings: [],
    snapshots: [],
    result: "Incomplete",
  },
  states: {
    capTable: {
      on: {
        // Active handlers all share this two-branch shape; the descriptor-driven
        // actions resolve the per-type validator and effect. Passthrough handlers
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
