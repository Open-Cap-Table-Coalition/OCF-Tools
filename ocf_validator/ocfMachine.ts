import { setup, assign } from "xstate";
import type {
  ObjectTypeMap,
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { OcfTransaction, TransactionFor } from "../types/ocf-input";
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
import { text, toValidate } from "./validators/checkKit";
import { noEarlierRemoval } from "./validators/checks";
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
 *  - `passthrough`: no validator or mutation. The machine checks only that its
 *                   security wasn't removed earlier (see buildTransactionHandlers).
 *  - `none`:        validate and record, but mutate no collection.
 *  - `remove`:      validate, record, and filter `collection` by `security_id`.
 *  - `append`:      validate, record, and append the issuance to `collection`.
 *                   An issuance's security mustn't have been removed earlier.
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
 * Graded descriptors (the ones with `validate`) must also list their checks in
 * `checks` (see `types/validator.ts`). The machine doesn't read this list while
 * validating; it's for the coverage report, which shows what each transaction
 * type checks. Making it required means no family can move to the graded style
 * without listing its checks. Legacy descriptors don't have it.
 *
 * The list isn't only documentation, though. For validators built with
 * `defineValidator`, the same check definitions produce the findings, and each
 * finding's severity is copied from its check. Changing a check's severity
 * changes whether a failing transaction is blocked.
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

/**
 * The type the descriptor table must satisfy: one descriptor for every
 * transaction type. If a descriptor says which transaction it's for (every one
 * built by `defineValidator` does), that must match the key it's listed under.
 *
 * For example, listing the warrant retraction validator under
 * `TX_CONVERTIBLE_RETRACTION` won't compile. `Descriptor` alone wouldn't catch
 * that: it checks an "append" descriptor's validator against its collection,
 * but accepts any validator on a "none" or "remove" descriptor.
 */
export type DescriptorTable = { [K in TxKey]: Descriptor & { transaction?: K } };

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

  // --- passthrough: no validator of their own -----------------------------
  //   No report entry, no collection mutation. Except for the return to pool,
  //   the machine fails one on a security an earlier transaction removed (see
  //   buildTransactionHandlers); otherwise they stay in `capTable` with nothing
  //   recorded, so the characterization snapshot (which contains
  //   TX_VESTING_START) records nothing for it.
  //   `satisfies DescriptorTable` below forces any future OCF transaction type
  //   to be classified here — a compile error until it is.
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
} satisfies DescriptorTable;

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

// The driver also builds this message (errorResult, malformedResult), outside
// the actor, where a throw would escape ocfValidator, so it reads the issuer
// null-safely.
const failureMessage = ({ manifest }: OcfPackageContent, subject: unknown, detail: unknown): string =>
  text`The validation of the OCF package for ${manifest?.issuer?.legal_name} failed on ${subject}: ${detail}`;

/**
 * The event slice the dispatch helpers read. `data` is `any` for the same
 * reason legacy validators declare `event: any`: the payload's family is the
 * descriptor table's concern, not the dispatcher's.
 */
type ValidatorEvent = { type: string; data?: any };

/** What a failure message names: the transaction's id, or else the event's type. */
const subjectOf = (event: ValidatorEvent): string =>
  typeof event.data === "object" && event.data !== null && "id" in event.data
    ? event.data.id
    : event.type;

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
  const subject = subjectOf(event);
  if (descriptor && "validate" in descriptor) {
    return failureMessage(context.ocfPackageContent, subject, JSON.stringify(context.lastErrorFindings, null, 2));
  }
  const lastReport = context.report[context.report.length - 1];
  const detail = context.report.length ? JSON.stringify(lastReport, null, 2) : "";
  return failureMessage(context.ocfPackageContent, subject, detail);
}

/**
 * The `result` of a run that stopped because handling `event` threw. A throw
 * stops the actor before it can record anything, so the driver builds this
 * result itself. It passes the package it read, since the machine's context
 * lacks it when no transaction started the run (#184).
 */
export const errorResult = (ocfPackageContent: OcfPackageContent, event: ValidatorEvent, error: unknown): string =>
  failureMessage(ocfPackageContent, subjectOf(event), error);

/**
 * The `result` of a run that never starts because a transaction's date or
 * object_type isn't a string: the run sorts transactions by date and sends
 * each to the machine as an event of its object_type (#218). It names the
 * transaction by its id, or shows the whole item if it has none.
 */
export const malformedResult = (ocfPackageContent: OcfPackageContent, transaction: unknown): string => {
  const { id, date, object_type } = (transaction ?? {}) as { id?: unknown; date?: unknown; object_type?: unknown };
  return failureMessage(
    ocfPackageContent,
    id ?? transaction,
    text`its date (${date}) and object_type (${object_type}) must both be strings.`,
  );
};

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

// ---------------------------------------------------------------------------
// Removed securities
// ---------------------------------------------------------------------------

/**
 * The earliest transaction in `transactions` that removes each security from
 * its collection (an effect of "remove"), by security_id: the machine's
 * `removals`, which no-earlier-removal reads. START builds it, once per run.
 */
export const earliestRemovals = (transactions: readonly OcfTransaction[]): OcfMachineContext["removals"] => {
  const removals = new Map<unknown, OcfTransaction>();
  for (const ele of transactions) {
    // An object_type with no descriptor stops the run when it's reached.
    if ("security_id" in ele && TX_DESCRIPTORS[ele.object_type]?.effect === "remove") {
      const earlier = removals.get(ele.security_id);
      if (earlier === undefined || ele.date < earlier.date) removals.set(ele.security_id, ele);
    }
  }
  return removals;
};

/** noEarlierRemoval in the shape the dispatch helpers take. */
const notRemoved = {
  effect: "none",
  validate: toValidate([noEarlierRemoval]),
  checks: [noEarlierRemoval],
} satisfies ActiveDescriptor;

/**
 * Build the `on` map for every key in `TX_DESCRIPTORS`. Active keys share the
 * two-branch transition. Graded validators declare no-earlier-removal where it
 * applies; for the transactions that can't declare it, the machine runs it
 * first. A legacy issuance runs it before its own validator, and a
 * passthrough type runs only it and is otherwise a no-op. The return to pool
 * is exempt: it records where a removed security's shares went.
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
  const afterRemoval = {
    guard: "followsRemoval",
    target: "validationError",
    actions: ["recordRemoval", "setRemovalError"],
  } as const;

  const handlerFor = (type: TxKey) => {
    const descriptor = TX_DESCRIPTORS[type];
    if (descriptor.effect === "passthrough") {
      return type === "TX_STOCK_PLAN_RETURN_TO_POOL" ? {} : [afterRemoval];
    }
    if (descriptor.effect === "append" && "legacyValidate" in descriptor) {
      return [afterRemoval, ...activeTransitions];
    }
    return activeTransitions;
  };

  return (Object.keys(TX_DESCRIPTORS) as TxKey[]).reduce(
    (handlers, type) => {
      handlers[type] = handlerFor(type);
      return handlers;
    },
    {} as Record<TxKey, ReturnType<typeof handlerFor>>,
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
    // A passthrough transaction or issuance on a removed security (see
    // noEarlierRemoval and buildTransactionHandlers).
    followsRemoval: ({ context, event }) =>
      !isControlEvent(event) && !isValidOutcome(notRemoved, context, event),
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

    // The followsRemoval branch's record and failure message, as for a
    // graded validator's invalid branch.
    recordRemoval: assign(({ context, event }) => outcomeUpdate(notRemoved, context, event)),
    setRemovalError: assign({
      result: ({ context, event }) => failureResult(notRemoved, context, event),
    }),
  },
}).createMachine({
  id: "OCF-xstate",
  initial: "capTable",
  // A function, so each run starts with its own arrays: a caller that changes
  // one in a run's returned context can't change the next run's.
  context: () => ({
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
    removals: new Map(),
    report: [],
    findings: [],
    lastErrorFindings: [],
    snapshots: [],
    result: "Incomplete",
  }),
  states: {
    capTable: {
      on: {
        // One handler per transaction type (see buildTransactionHandlers); the
        // descriptor-driven actions resolve the per-type validator and effect.
        // Every known type has a handler, so the `'*'` wildcard never catches
        // one, even when none of its guards passes.
        ...buildTransactionHandlers(),
        START: {
          target: "capTable",
          actions: assign({
            ocfPackageContent: ({ event }) => event.data,
            removals: ({ event }) => earliestRemovals(event.data.transactions),
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
            // Warnings don't stop a run, so a valid package can have them. The
            // result counts them, so a caller reading only `result` knows to
            // look at `findings` (#215).
            result: ({ context }) => {
              const warnings = context.findings.filter((finding) => finding.severity === "warning").length;
              const counted = warnings === 0 ? "" : `, with ${warnings} warning${warnings === 1 ? "" : "s"}`;
              return text`The validation of the OCF package for ${context.ocfPackageContent.manifest.issuer.legal_name} is complete and the package appears valid${counted}.`;
            },
          }),
        },
        // Fires only for runtime `type` strings outside TxKey (genuinely unknown /
        // malformed). Builds its message from `event.type`, never `event.data`.
        "*": {
          target: "validationError",
          actions: assign({
            result: ({ context, event }) =>
              text`The validation of the OCF package for ${context.ocfPackageContent.manifest?.issuer?.legal_name} failed on ${event.type} because it is not a valid TX type.`,
          }),
        },
      },
    },
    validationError: {
      type: "final",
    },
  },
});
