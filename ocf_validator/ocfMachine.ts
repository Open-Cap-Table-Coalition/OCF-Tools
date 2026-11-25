import { setup, assign } from "xstate";
import type { OcfTransaction, TransactionFor } from "../types/ocf-input";
import type { OcfPackageContent } from "../read_ocf_package";
import type { Finding, Subject } from "../types/finding";
import type { DeepReadonly, GradedValidator, OcfMachineContext } from "../types/validator";
import { TX_DESCRIPTORS, type TxKey } from "./validators";
import { text, toValidate } from "./validators/checkKit";
import { noEarlierRemoval, transactionTypeKnown } from "./validators/checks";
import { endOfDayFindings } from "./validators/stock_plan/pool";
import { withPlans } from "./stockPlan";
import { addRoot, applyTransaction, emptyNodes, withUnrecognizedChange, type Verdict } from "./nodes";
import run_EOD from "./eod";

/** One event variant per `TxKey`, so a handler for `K` receives `TransactionFor<K>`. */
type TxEvent = {
  [K in TxKey]: { type: K; data: TransactionFor<K>; date?: string };
}[TxKey];

/** The fields the machine reads from a transaction whose type the table does not list. */
type UnrecognizedTransaction = { object_type: string; id?: unknown; security_id?: unknown };

export type OcfMachineEvent =
  | TxEvent
  // The package chooses object_type, so a type the table does not list is never sent as the event
  // type. A transaction typed "RUN_END" would otherwise be handled as the run's own RUN_END event.
  | { type: "UNRECOGNIZED"; data: UnrecognizedTransaction }
  | { type: "START"; data: OcfPackageContent }
  | { type: "RUN_EOD"; date: string }
  | { type: "RUN_END"; date: string };

const CONTROL_EVENTS = ["START", "RUN_EOD", "RUN_END", "UNRECOGNIZED"] as const;
type ControlEvent = (typeof CONTROL_EVENTS)[number];

const isControlEvent = (event: OcfMachineEvent): event is Extract<OcfMachineEvent, { type: ControlEvent }> =>
  (CONTROL_EVENTS as readonly string[]).includes(event.type);

const failureMessage = ({ manifest }: OcfPackageContent, subject: unknown, detail: unknown): string =>
  text`The validation of the OCF package for ${manifest?.issuer?.legal_name} failed on ${subject}: ${detail}`;

type ValidatorEvent = { type: string; data?: unknown };

function hasTransactionType(data: object): data is UnrecognizedTransaction {
  return "object_type" in data && typeof data.object_type === "string";
}

export function unrecognizedTransactionOf({ type, data }: ValidatorEvent): UnrecognizedTransaction {
  if (typeof data !== "object" || data === null) return { object_type: type };

  // The driver wraps the transaction. A caller sending a wildcard event supplies its type directly.
  if (type === "UNRECOGNIZED" && hasTransactionType(data)) return data;
  return { ...data, object_type: type };
}

/** What a failure message names: the transaction's id, or else the event's type. */
const subjectOf = (event: ValidatorEvent): unknown =>
  typeof event.data === "object" && event.data !== null && "id" in event.data
    ? event.data.id
    : event.type;

/** Only an error-level finding prevents the transaction's writes. */
const isErrorFinding = (finding: Finding): boolean => finding.severity === "error";

/** The runtime error and the event the driver was processing. */
export const errorResult = (ocfPackageContent: OcfPackageContent, event: ValidatorEvent, error: unknown): string =>
  failureMessage(ocfPackageContent, subjectOf(event), error);

/**
 * The `result` of a run that never starts because a transaction's date or
 * object_type isn't a string: the run sorts transactions by date and looks
 * each one up by its object_type (#218). It names the
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

/**
 * The `result` of a run over a package with no transactions. It says that nothing was checked.
 * "Appears valid" would read as though a history had passed, and would hide a manifest that lists no
 * transaction files by mistake.
 */
export const emptyResult = ({ manifest }: OcfPackageContent): string =>
  text`The validation of the OCF package for ${manifest?.issuer?.legal_name} is complete and found no transactions to check.`;

/**
 * Apply the writes unless an error-level check failed or was blocked. A failure contributes the
 * current transaction as a cause. A blocked check carries the original failures forward. Warnings
 * allow writes in either case.
 */
export function verdictOf(subject: Subject, findings: readonly Finding[]): Verdict {
  const errors = findings.filter(isErrorFinding);
  if (errors.length === 0) return { ok: true };

  const roots: Subject[] = errors.some((finding) => finding.outcome === "failed") ? [subject] : [];
  for (const finding of errors) {
    if (finding.outcome === "blocked") {
      for (const root of finding.roots) addRoot(roots, root);
    }
  }
  const invalidReplacement = errors.some((finding) => finding.outcome === "failed" &&
    (finding.check === "plan-replacement" || finding.check === "plan-source-quantity"));
  return invalidReplacement ? { ok: false, roots, invalidReplacement } : { ok: false, roots };
}

/**
 * Count failed errors, warnings and blocked checks separately so the result distinguishes problems
 * to fix from checks to retry. Runs that stop early report the event that stopped them.
 */
export function completedResult(context: OcfMachineContext): string {
  let errors = 0;
  let warnings = 0;
  let blocked = 0;
  for (const finding of context.findings) {
    if (finding.outcome === "blocked") blocked++;
    else if (finding.severity === "error") errors++;
    else warnings++;
  }

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
    // An object_type with no descriptor has no removal the validator can apply.
    if ("security_id" in ele && TX_DESCRIPTORS[ele.object_type]?.effect === "remove") {
      const earlier = removals.get(ele.security_id);
      if (earlier === undefined || ele.date < earlier.date) removals.set(ele.security_id, ele);
    }
  }
  return removals;
};

export const passthroughRules = [noEarlierRemoval];
const validatePassthrough = toValidate(passthroughRules);

/** The one check run on a transaction whose type the table does not list. */
export const unrecognizedTypeRules = [transactionTypeKnown];
const validateUnrecognized = toValidate(unrecognizedTypeRules);

type ValidationTable = {
  [K in TxKey]: { validate: GradedValidator<TransactionFor<K>> } | { effect: "passthrough" };
};

function checkTransaction<K extends TxKey>(context: OcfMachineContext, type: K, data: DeepReadonly<TransactionFor<K>>) {
  const table: ValidationTable = TX_DESCRIPTORS;
  const descriptor = table[type];
  return "validate" in descriptor ? descriptor.validate(context, data) : validatePassthrough(context, data);
}

const handlers = Object.fromEntries(
  Object.keys(TX_DESCRIPTORS).map((type) => [type, { actions: "applyByFindings" } as const]),
) as Record<TxKey, { actions: "applyByFindings" }>;

export const ocfMachine = setup({
  types: {} as {
    context: OcfMachineContext;
    events: OcfMachineEvent;
  },
  actions: {
    // Record the findings and apply the transaction only if its checks allow it.
    applyByFindings: assign(({ context, event }) => {
      if (isControlEvent(event)) return {};
      const descriptor = TX_DESCRIPTORS[event.type];
      const found = checkTransaction(context, event.type, event.data);
      const nodes = applyTransaction(context.nodes, descriptor, event.data, verdictOf({ object_type: event.type, id: event.data.id }, found));
      return {
        ...(found.length > 0 && { findings: [...context.findings, ...found] }),
        ...(nodes !== context.nodes && { nodes }),
      };
    }),
    // Record that the transaction could not be checked, and stop relying on the security it names.
    // The run continues, so one new transaction type does not hide the rest of the package.
    reportUnrecognizedType: assign(({ context, event }) => {
      const transaction = unrecognizedTransactionOf(event);
      const found = validateUnrecognized(context, transaction);
      const nodes = withUnrecognizedChange(context.nodes, transaction.security_id, found[0].subject);
      return {
        findings: [...context.findings, ...found],
        ...(nodes !== context.nodes && { nodes }),
      };
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
    findings: [],
    snapshots: [],
    result: "Incomplete",
  }),
  states: {
    capTable: {
      on: {
        // Known transactions run their declared checks.
        ...handlers,
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
              ...(found.length > 0 && { findings: [...context.findings, ...found] }),
              snapshots: [...context.snapshots, run_EOD(context, event)],
              nodesAtStartOfDay: context.nodes,
            };
          }),
        },
        RUN_END: {
          target: "capTable",
          actions: assign({ result: ({ context }) => completedResult(context) }),
        },
        UNRECOGNIZED: {
          target: "capTable",
          actions: "reportUnrecognizedType",
        },
        // Fires only for an event type the machine has no entry for. The driver never sends one.
        "*": {
          target: "capTable",
          actions: "reportUnrecognizedType",
        },
      },
    },
  },
});
