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
import type { Finding, Subject } from "../types/finding";
import type { Check, GradedValidator, LifecycleWord, OcfMachineContext, PoolEffect } from "../types/validator";
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
import { applyTransaction, emptyNodes, outstanding, withPlans, type Verdict } from "./nodes";
import { endOfDayFindings } from "./validators/stock_plan/pool";
import { TX_STOCK_PLAN_POOL_ADJUSTMENT } from "./validators/stock_plan/tx_stock_plan_pool_adjustment";
import { TX_STOCK_PLAN_RETURN_TO_POOL } from "./validators/stock_plan/tx_stock_plan_return_to_pool";
import { TX_EQUITY_COMPENSATION_ISSUANCE, TX_PLAN_SECURITY_ISSUANCE } from "./validators/equity_compensation/tx_equity_compensation_issuance";
import { TX_EQUITY_COMPENSATION_ACCEPTANCE, TX_PLAN_SECURITY_ACCEPTANCE } from "./validators/equity_compensation/tx_equity_compensation_acceptance";
import { TX_EQUITY_COMPENSATION_EXERCISE, TX_PLAN_SECURITY_EXERCISE } from "./validators/equity_compensation/tx_equity_compensation_exercise";
import { TX_EQUITY_COMPENSATION_RELEASE, TX_PLAN_SECURITY_RELEASE } from "./validators/equity_compensation/tx_equity_compensation_release";
import { TX_EQUITY_COMPENSATION_REPRICING } from "./validators/equity_compensation/tx_equity_compensation_repricing";
import { TX_EQUITY_COMPENSATION_RETRACTION, TX_PLAN_SECURITY_RETRACTION } from "./validators/equity_compensation/tx_equity_compensation_retraction";
import { TX_EQUITY_COMPENSATION_CANCELLATION, TX_PLAN_SECURITY_CANCELLATION } from "./validators/equity_compensation/tx_equity_compensation_cancellation";
import { TX_EQUITY_COMPENSATION_TRANSFER, TX_PLAN_SECURITY_TRANSFER } from "./validators/equity_compensation/tx_equity_compensation_transfer";
import run_EOD from "./eod";

// The validator contract types are defined in types/validator.ts; re-exported
// here because the validator modules and the package barrel import them from
// this module. The re-export is removed once every module imports
// types/validator.ts directly.
export type { GradedValidator, OcfMachineContext } from "../types/validator";

// Security families

/**
 * These keys identify the family in the transaction table, security records and charts. They come
 * from the original collection names.
 */
export interface CollectionElement {
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
  context: LegacyContext,
  event: { data?: T },
  isGuard: boolean,
) => any;

/**
 * Legacy stock validators still read an array of outstanding stock. Build that array from the
 * current records for each call.
 */
export type LegacyContext = OcfMachineContext & { stockIssuances: OCFStockIssuance[] };

const legacyContext = (context: OcfMachineContext): LegacyContext => ({
  ...context,
  stockIssuances: outstanding(context.nodes, "stockIssuances"),
});

/**
 * A descriptor selects the validator, applicable security families, lifecycle change and optional
 * pool operation. Issuances and removals name their collection. Other transactions list their
 * families. A return to pool requires a removed security.
 *
 * The reducer applies the security and plan changes. Validators that return findings declare the
 * checks used by both the runner and coverage report. Legacy stock validators still use their guard
 * and report. The types require an issuance payload to match its collection.
 */
type Descriptor = (
  | { effect: "passthrough"; lifecycle: LifecycleWord; families: readonly CollectionKey[] }
  | { effect: "none"; lifecycle: "stays"; families: readonly CollectionKey[]; legacyValidate: Validator<unknown> }
  | {
      effect: "none";
      lifecycle: "stays" | "after removal";
      families: readonly CollectionKey[];
      validate: GradedValidator<any>;
      checks: readonly Check[];
    }
  | { effect: "remove"; lifecycle: "removes"; legacyValidate: Validator<unknown>; collection: CollectionKey }
  | { effect: "remove"; lifecycle: "removes"; validate: GradedValidator<any>; collection: CollectionKey; checks: readonly Check[] }
  | {
      [C in CollectionKey]: {
        effect: "append";
        lifecycle: "issue";
        collection: C;
        legacyValidate: Validator<CollectionElement[C]>;
      };
    }[CollectionKey]
  | {
      [C in CollectionKey]: {
        effect: "append";
        lifecycle: "issue";
        collection: C;
        validate: GradedValidator<CollectionElement[C]>;
        checks: readonly Check[];
      };
    }[CollectionKey]
) & { pool?: PoolEffect };

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
  TX_STOCK_ISSUANCE: { pool: "draws", effect: "append", lifecycle: "issue", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_issuance },
  TX_CONVERTIBLE_ISSUANCE,
  TX_WARRANT_ISSUANCE,
  TX_EQUITY_COMPENSATION_ISSUANCE,
  TX_PLAN_SECURITY_ISSUANCE,

  // --- none: validate and record, no collection mutation ------------------
  TX_STOCK_ACCEPTANCE: { effect: "none", lifecycle: "stays", families: ["stockIssuances"], legacyValidate: validators.valid_tx_stock_acceptance },
  TX_CONVERTIBLE_ACCEPTANCE,
  TX_WARRANT_ACCEPTANCE,
  TX_EQUITY_COMPENSATION_ACCEPTANCE,
  // An equity compensation exercise or release removes nothing, unlike
  // TX_WARRANT_EXERCISE: it has a quantity but no balance security, so after a
  // partial one the rest stays outstanding under the same security_id. Nothing
  // reduces the security's quantity yet, so a fully exercised or released grant
  // also stays in the collection; the quantity-outstanding gap records that.
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
  TX_STOCK_RETRACTION: { effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_retraction },
  TX_STOCK_CANCELLATION: { pool: "carriesStock", effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_cancellation },
  TX_STOCK_CONVERSION: { pool: "carriesStock", effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_conversion },
  TX_STOCK_REISSUANCE: { pool: "carriesStock", effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_reissuance },
  TX_STOCK_REPURCHASE: { pool: "carriesStock", effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_repurchase },
  TX_STOCK_TRANSFER: { pool: "carriesStock", effect: "remove", lifecycle: "removes", collection: "stockIssuances", legacyValidate: validators.valid_tx_stock_transfer },
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

export type { Descriptor };

/**
 * Return the security families affected by this transaction. An empty list means it names no
 * security.
 */
export const lifecycleFamilies = (descriptor: Descriptor): readonly CollectionKey[] =>
  "collection" in descriptor ? [descriptor.collection] : descriptor.families;

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

/** Only an error-level finding prevents the transaction's writes. */
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
  return descriptor.legacyValidate(legacyContext(context), event, true);
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
  return { report: [...context.report, descriptor.legacyValidate(legacyContext(context), event, false)] };
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

/** Apply a valid legacy transaction's effect and return any change to the security records. */
export function nodesUpdate(
  context: OcfMachineContext,
  event: OcfMachineEvent,
): Partial<OcfMachineContext> {
  if (isControlEvent(event)) return {};
  const nodes = applyTransaction(context.nodes, TX_DESCRIPTORS[event.type], event.data);
  return nodes === context.nodes ? {} : { nodes };
}

// Applying transactions that return findings

/**
 * Apply the writes unless an error-level check failed or was blocked. A failure contributes the
 * current transaction as a cause. A blocked check carries the original failures forward. Warnings
 * allow writes in either case.
 */
export function verdictOf(subject: Subject, findings: readonly Finding[]): Verdict {
  const errors = findings.filter(isErrorFinding);
  if (errors.length === 0) return { ok: true };

  const roots: Subject[] = [];
  const add = (root: Subject) => {
    if (!roots.some((held) => held.object_type === root.object_type && held.id === root.id)) roots.push(root);
  };
  if (errors.some((finding) => finding.outcome === "failed")) add(subject);
  for (const finding of errors) {
    if (finding.outcome === "blocked") finding.roots.forEach(add);
  }
  return { ok: false, roots };
}

/**
 * Run the validator once. Record its findings, apply or withhold the writes, then continue to the
 * next transaction.
 */
export function findingsUpdate(
  descriptor: Descriptor,
  validate: GradedValidator<any>,
  context: OcfMachineContext,
  event: ValidatorEvent,
): Partial<OcfMachineContext> {
  const found = validate(context, event.data);
  const subject = { object_type: event.data?.object_type, id: event.data?.id };
  const nodes = applyTransaction(context.nodes, descriptor, event.data, verdictOf(subject, found));
  return {
    ...(found.length === 0 ? {} : { findings: [...context.findings, ...found] }),
    ...(nodes === context.nodes ? {} : { nodes }),
  };
}

/**
 * Count failed errors, warnings and blocked checks separately so the result distinguishes problems
 * to fix from checks to retry. Runs that stop early report the event that stopped them.
 */
export function completedResult(context: OcfMachineContext): string {
  const count = (matches: (finding: Finding) => boolean) => context.findings.filter(matches).length;
  const errors = count((finding) => finding.outcome === "failed" && finding.severity === "error");
  const blocked = count((finding) => finding.outcome === "blocked");
  const warnings = count((finding) => finding.outcome === "failed" && finding.severity === "warning");

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const counted = warnings === 0 ? "" : `, with ${plural(warnings, "warning")}`;
  const { legal_name } = context.ocfPackageContent.manifest.issuer;

  if (errors === 0 && blocked === 0) {
    return text`The validation of the OCF package for ${legal_name} is complete and the package appears valid${counted}.`;
  }
  const consequences = blocked === 0 ? "" : ` and ${plural(blocked, "check")} blocked by ${errors === 1 ? "it" : "them"}`;
  return text`The validation of the OCF package for ${legal_name} is complete and found ${plural(errors, "error")}${consequences}${counted}.`;
}

// ---------------------------------------------------------------------------
// Removed securities
// ---------------------------------------------------------------------------

/** Index the earliest recorded removal attempt for each security ID when the run starts. */
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

/** Wrap the shared removal check so the machine can call it like a transaction validator. */
const notRemoved = {
  effect: "none",
  lifecycle: "stays",
  families: [],
  validate: toValidate([noEarlierRemoval]),
  checks: [noEarlierRemoval],
} satisfies ActiveDescriptor;

/**
 * Run validators that return findings once per transaction and continue after recording the result.
 * Passthrough transactions use the earlier-removal check. Returns to pool have their own check for a
 * removed security. Legacy stock validation still stops on failure.
 */
function buildTransactionHandlers() {
  const legacyTransitions = [
    {
      guard: "isValidTx",
      target: "capTable",
      actions: ["recordOutcome", "applyToNodes"],
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
  const byFindings = { target: "capTable", actions: ["applyByFindings"] } as const;

  const handlerFor = (type: TxKey) => {
    const descriptor = TX_DESCRIPTORS[type];
    if (descriptor.effect === "passthrough" || "validate" in descriptor) return byFindings;
    if (descriptor.effect === "append") return [afterRemoval, ...legacyTransitions];
    return legacyTransitions;
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
    // Use the legacy validator to choose the success or failure transition. Control events have
    // their own handlers.
    isValidTx: ({ context, event }) => {
      if (isControlEvent(event)) return false;
      const descriptor = activeDescriptorFor(event.type);
      return descriptor ? isValidOutcome(descriptor, context, event) : false;
    },
    // Check a legacy issuance for an earlier removal.
    followsRemoval: ({ context, event }) =>
      !isControlEvent(event) && !isValidOutcome(notRemoved, context, event),
  },
  actions: {
    // Record the findings and apply the transaction only if its checks allow it.
    applyByFindings: assign(({ context, event }) => {
      if (isControlEvent(event)) return {};
      const descriptor = TX_DESCRIPTORS[event.type];
      if ("validate" in descriptor) return findingsUpdate(descriptor, descriptor.validate, context, event);
      return descriptor.effect === "passthrough" ? findingsUpdate(descriptor, notRemoved.validate, context, event) : {};
    }),

    // Use the same legacy validator for the report and the pass/fail decision.
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

    // Apply a successful legacy transaction's effect.
    applyToNodes: assign(({ context, event }) => nodesUpdate(context, event)),

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
  // Create fresh collections for each run so a caller cannot change another run's results.
  context: () => ({
    nodes: emptyNodes(),
    nodesAtStartOfDay: emptyNodes(),
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
          actions: assign(({ context, event }) => {
            // Load plans before saving the starting map so an initial reserve does not count as a
            // first-day transaction.
            const nodes = withPlans(context.nodes, event.data.stockPlans);
            return {
              ocfPackageContent: event.data,
              removals: earliestRemovals(event.data.transactions),
              nodes,
              nodesAtStartOfDay: nodes,
            };
          }),
        },
        // Check the day's final totals before taking the snapshot. Save this map as the starting
        // point for the next day.
        RUN_EOD: {
          target: "capTable",
          actions: assign(({ context, event }) => {
            const found = endOfDayFindings(context, context.nodesAtStartOfDay, event.date);
            return {
              ...(found.length === 0 ? {} : { findings: [...context.findings, ...found] }),
              snapshots: [...context.snapshots, run_EOD(context, event)],
              nodesAtStartOfDay: context.nodes,
            };
          }),
        },
        RUN_END: {
          target: "capTable",
          actions: assign({ result: ({ context }) => completedResult(context) }),
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
