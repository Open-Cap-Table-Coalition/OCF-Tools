// Compare each chart's decisions with no-earlier-removal and no-other-transactions (#233). Follow
// transaction order even when validation fails. Whole-package tests use this comparison to catch new
// differences.

import { lifecycleStep, type LifecycleState } from "../ocf_validator/lifecycle";
import { lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type Descriptor } from "../ocf_validator/ocfMachine";
import { noEarlierRemoval } from "../ocf_validator/validators/checks";
import { noOtherTransactions as convertibleNoOtherTransactions } from "../ocf_validator/validators/convertible/checks";
import { noOtherTransactions as equityCompensationNoOtherTransactions } from "../ocf_validator/validators/equity_compensation/checks";
import { noOtherTransactions as warrantNoOtherTransactions } from "../ocf_validator/validators/warrant/checks";
import type { Check, OcfMachineContext } from "../types/validator";
import { baseContext } from "./helpers";

const NO_EARLIER_REMOVAL = "no-earlier-removal";
const NO_OTHER_TRANSACTIONS = "no-other-transactions";
const SHADOWED = [NO_EARLIER_REMOVAL, NO_OTHER_TRANSACTIONS];

/** Package fields used to compare a transaction with its chart. */
type Transaction = { id?: unknown; object_type: string; date: string; security_id?: unknown; security_ids?: unknown; [field: string]: unknown };

/** One comparison for each security named by a transaction. */
export type ShadowRow = {
  id: unknown;
  object_type: string;
  date: string;
  security: unknown;
  /** Family assigned at issuance. */
  family: CollectionKey | undefined;
  /** State before this transaction. */
  state: LifecycleState;
  /** Whether the chart accepts this transaction. */
  allowed: boolean;
  /** Checks the validator uses for this transaction. */
  runs: string[];
  /** Checks that reported a problem. */
  reported: string[];
  /** Earlier transaction that removed this security, if known. */
  removedBy: Transaction | undefined;
};

/**
 * A consolidation lists several security IDs. Other transactions that name a security use a single
 * ID.
 */
const securitiesOf = (transaction: Transaction): unknown[] => {
  if ("security_id" in transaction) return [transaction.security_id];
  if (transaction.object_type === "TX_STOCK_CONSOLIDATION" && Array.isArray(transaction.security_ids)) {
    return transaction.security_ids;
  }
  return [];
};

/**
 * Compare the checks implemented for this transaction type. The machine adds the earlier-removal
 * check for passthrough types and legacy issuances.
 */
const checksRunOn = (descriptor: Descriptor): string[] => {
  if ("validate" in descriptor) {
    return (descriptor.checks as readonly Check[])
      .filter((check) => check.implemented !== false && SHADOWED.includes(check.id))
      .map((check) => check.id);
  }
  return descriptor.effect === "passthrough" || descriptor.effect === "append" ? [NO_EARLIER_REMOVAL] : [];
};

/** Run a check on a transaction read from the test package. */
type ShadowedCheck = { run: (context: any, data: any, read: any) => string[] };

/**
 * Compare the rules on the recorded transactions before checking whether earlier failures make their
 * inputs unreliable.
 */
const noReads = () => {
  throw new Error("A shadowed check read the node map.");
};

/** Look up the transaction history check for each family that implements it. */
const NO_OTHER_TRANSACTIONS_OF: Partial<Record<CollectionKey, ShadowedCheck>> = {
  convertibleIssuances: convertibleNoOtherTransactions,
  warrantIssuances: warrantNoOtherTransactions,
  equityCompensation: equityCompensationNoOtherTransactions,
};

/**
 * Run each rule directly to compare lifecycle decisions. This comparison includes transactions that
 * failed in the validator.
 */
const checksReportedOn = (context: OcfMachineContext, transaction: Transaction, descriptor: Descriptor, runs: string[]): string[] =>
  runs.filter((id) => {
    const check: ShadowedCheck | undefined =
      id === NO_EARLIER_REMOVAL ? noEarlierRemoval : NO_OTHER_TRANSACTIONS_OF[lifecycleFamilies(descriptor)[0]];
    if (check === undefined) throw new Error(`No ${id} to run for ${transaction.object_type}.`);
    return check.run(context, transaction, noReads).length > 0;
  });

/**
 * Compare each named security in processing order. Skip unknown transaction types because there is
 * no chart entry for them.
 */
export function shadowRows(transactions: readonly Transaction[]): ShadowRow[] {
  const context = baseContext({
    ocfPackageContent: { ...baseContext().ocfPackageContent, transactions } as unknown as OcfMachineContext["ocfPackageContent"],
  });
  const securities = new Map<unknown, { family: CollectionKey; state: LifecycleState; removedBy?: Transaction }>();
  const rows: ShadowRow[] = [];

  for (const transaction of transactions) {
    const descriptor = (TX_DESCRIPTORS as Record<string, Descriptor>)[transaction.object_type];
    if (descriptor === undefined) continue;
    const runs = checksRunOn(descriptor);
    const reported = checksReportedOn(context, transaction, descriptor, runs);

    for (const security of securitiesOf(transaction)) {
      let known = securities.get(security);
      const state = known?.state ?? "notIssued";

      // Issuance establishes the family. Before then, try the family named by the transaction.
      const family = known?.family ?? lifecycleFamilies(descriptor)[0];
      const step = family === undefined ? { allowed: false as const } : lifecycleStep(family, state, transaction.object_type);

      if (step.allowed) {
        if (known === undefined) {
          known = { family, state };
          securities.set(security, known);
        }
        if (step.next === "removed" && state !== "removed") known.removedBy = transaction;
        known.state = step.next;
      }

      rows.push({
        id: transaction.id,
        object_type: transaction.object_type,
        date: transaction.date,
        security,
        family: known?.family,
        state,
        allowed: step.allowed,
        runs,
        reported,
        removedBy: state === "removed" ? known?.removedBy : undefined,
      });
    }
  }
  return rows;
}

/** Return transactions where the chart and checks give different answers. */
export const disagreements = (rows: readonly ShadowRow[]): ShadowRow[] =>
  rows.filter((row) => row.allowed !== (row.reported.length === 0));

// Reasons for known differences

/** Use the transaction and its history to identify each known reason for a disagreement. */
export const EXPLANATIONS = {
  "return before removal":
    "The run fails it through security-removed; neither of the two shadowed checks requires a removal before a return to pool.",
  /**
   * The chart rejects a transaction on a never-issued security. The full validator detects the
   * missing security through issuance-exists.
   */
  "never issued":
    "The run fails it through issuance-exists; neither of the two checks asks whether the security was ever issued.",


  /**
   * The two checks omit this transaction type. The full validator still rejects it because
   * issuance-exists requires an outstanding security.
   */
  "removed, and neither check runs on it":
    "The run fails it through issuance-exists; neither of the two checks runs on this transaction type.",

  /**
   * The date check allows vesting on the day of removal (#214). The chart follows processing order,
   * which puts cancellation first. Resolve this difference before using the chart to reject packages
   * (#232).
   */
  "removed earlier the same day":
    "no-earlier-removal ignores a removal dated the same day; the chart follows run order, which puts the removal first.",

  /**
   * A consolidation lists several security IDs and has no removal effect in the validator. The chart
   * sees each removal, while the index misses them (#224).
   */
  "removed by a transaction the removals index doesn't hold":
    "The chart removed the security on a consolidation, which no-earlier-removal's index leaves out.",
} as const;

export type Explanation = keyof typeof EXPLANATIONS;

/** The removal index requires a removal effect and one security_id. */
const isIndexedRemoval = (transaction: Transaction): boolean =>
  "security_id" in transaction &&
  (TX_DESCRIPTORS as Record<string, Descriptor>)[transaction.object_type]?.effect === "remove";

/** Identify a known difference so tests can report any new one. */
export function explain(row: ShadowRow): Explanation | undefined {
  const refusedInSilence = !row.allowed && row.reported.length === 0;
  if (!refusedInSilence) return undefined;

  const descriptor = (TX_DESCRIPTORS as Record<string, Descriptor>)[row.object_type];
  if (descriptor?.lifecycle === "after removal" && row.state !== "removed") return "return before removal";
  if (row.state === "notIssued") {
    // The issuance-exists check requires an outstanding security.
    return descriptor !== undefined && "validate" in descriptor && descriptor.lifecycle !== "issue" && row.family === undefined
      ? "never issued"
      : undefined;
  }
  if (row.state !== "removed" || row.removedBy === undefined) return undefined;

  if (row.runs.length === 0) return "removed, and neither check runs on it";
  if (row.runs.length === 1 && row.runs[0] === NO_EARLIER_REMOVAL) {
    if (!isIndexedRemoval(row.removedBy)) return "removed by a transaction the removals index doesn't hold";
    if (row.removedBy.date === row.date) return "removed earlier the same day";
  }
  return undefined;
}

const show = (row: ShadowRow): string =>
  `${row.object_type} ${JSON.stringify(row.id)} on security ${JSON.stringify(row.security)} (${row.state}): ` +
  `the chart ${row.allowed ? "allows" : "refuses"} it, and ` +
  (row.reported.length ? `${row.reported.join(" and ")} reported it` : `the checks run on it (${row.runs.join(", ") || "neither"}) reported nothing`);

/**
 * Fail on unexplained differences. Skip packages with unusable dates or transaction types because
 * the driver cannot order them.
 */
export function expectShadowExplained(transactions: readonly unknown[]): void {
  const runnable = transactions.every(
    (ele: any) => typeof ele?.date === "string" && typeof ele?.object_type === "string",
  );
  if (!runnable) return;

  const unexplained = disagreements(shadowRows(transactions as Transaction[])).filter((row) => explain(row) === undefined);
  if (unexplained.length > 0) {
    throw new Error(
      `The lifecycle chart and the checks it shadows disagree, and tests/lifecycleShadow.ts has no explanation for it:\n` +
        unexplained.map((row) => `  ${show(row)}`).join("\n"),
    );
  }
}
