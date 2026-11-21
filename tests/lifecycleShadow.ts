// Compare each chart's decisions with no-earlier-removal and no-other-transactions (#233). Follow
// transaction order even when validation fails. Whole-package tests use this comparison to catch new
// differences.

import { lifecycleStep, type LifecycleState } from "../ocf_validator/lifecycle";
import { checksRemovalFirst, lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type Descriptor } from "../ocf_validator/ocfMachine";
import { noEarlierRemoval } from "../ocf_validator/validators/checks";
import { noOtherTransactions as convertibleNoOtherTransactions } from "../ocf_validator/validators/convertible/checks";
import { noOtherTransactions as equityCompensationNoOtherTransactions } from "../ocf_validator/validators/equity_compensation/checks";
import { noOtherTransactions as warrantNoOtherTransactions } from "../ocf_validator/validators/warrant/checks";
import type { Finding } from "../types/finding";
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
  /** The full validator rejected this transaction because it could not find the issuance. */
  failedIssuanceCheck: boolean;
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

/** Pick the two checks we compare with the chart. */
const checksRunOn = (type: string, descriptor: Descriptor): string[] => {
  const checks: readonly Check[] = "validate" in descriptor ? descriptor.checks : [];
  const runs = checks.filter((check) => check.implemented !== false && SHADOWED.includes(check.id)).map((check) => check.id);
  return checksRemovalFirst(type, descriptor) ? [NO_EARLIER_REMOVAL, ...runs] : runs;
};

/** Run a check on a transaction read from the test package. */
type ShadowedCheck = { run: (context: any, data: any) => string[] };

/** Look up the transaction history check for each family that implements it. */
const NO_OTHER_TRANSACTIONS_OF: Partial<Record<CollectionKey, ShadowedCheck>> = {
  convertibleIssuances: convertibleNoOtherTransactions,
  warrantIssuances: warrantNoOtherTransactions,
  equityCompensation: equityCompensationNoOtherTransactions,
};

/** Run the two checks separately so a failure in another check cannot affect the comparison. */
const checksReportedOn = (context: OcfMachineContext, transaction: Transaction, descriptor: Descriptor, runs: string[]): string[] =>
  runs.filter((id) => {
    const check: ShadowedCheck | undefined =
      id === NO_EARLIER_REMOVAL ? noEarlierRemoval : NO_OTHER_TRANSACTIONS_OF[lifecycleFamilies(descriptor)[0]];
    if (check === undefined) throw new Error(`No ${id} to run for ${transaction.object_type}.`);
    return check.run(context, transaction).length > 0;
  });

/**
 * Compare each named security in processing order. Skip unknown transaction types because there is
 * no chart entry for them.
 */
export function shadowRows(transactions: readonly Transaction[], findings: readonly Finding[] = []): ShadowRow[] {
  const context = baseContext({
    ocfPackageContent: { ...baseContext().ocfPackageContent, transactions } as unknown as OcfMachineContext["ocfPackageContent"],
  });
  const failure = findings.find((f) => f.check === "issuance-exists" && f.severity === "error");
  // A finding names a type and ID. If two transactions share both, we can't tell which one failed.
  const matches = failure ? transactions.filter((tx) => tx.object_type === failure.subject.object_type && tx.id === failure.subject.id) : [];
  const securities = new Map<unknown, { family: CollectionKey; state: LifecycleState; issuance: Transaction; removedBy?: Transaction }>();
  const rows: ShadowRow[] = [];

  for (const transaction of transactions) {
    if (!Object.hasOwn(TX_DESCRIPTORS, transaction.object_type)) continue;
    const descriptor = (TX_DESCRIPTORS as Record<string, Descriptor>)[transaction.object_type];
    const runs = checksRunOn(transaction.object_type, descriptor);
    const reported = checksReportedOn(context, transaction, descriptor, runs);

    for (const security of securitiesOf(transaction)) {
      let known = securities.get(security);
      const state = known?.state ?? "notIssued";

      // Issuance establishes the family. Before then, try the family named by the transaction.
      const family = known?.family ?? lifecycleFamilies(descriptor)[0];
      const step = family === undefined ? { allowed: false as const } : lifecycleStep(family, state, transaction.object_type, known?.issuance);

      if (step.allowed) {
        if (known === undefined) {
          known = { family, state, issuance: transaction };
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
        failedIssuanceCheck: matches.length === 1 && matches[0] === transaction,
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
   * The removal index requires a single security_id and a removal effect. It misses consolidations
   * and, at this point, removals under the older plan security names.
   */
  "removed by a transaction the removals index doesn't hold":
    "The chart removed the security on a consolidation or a plan security removal, which no-earlier-removal's index leaves out.",
} as const;

export type Explanation = keyof typeof EXPLANATIONS;

/** The removal index requires a removal effect and one security_id. */
const isIndexedRemoval = (transaction: Transaction): boolean =>
  "security_id" in transaction &&
  (TX_DESCRIPTORS as Record<string, Descriptor>)[transaction.object_type]?.effect === "remove";

/** Identify a known difference so tests can report any new one. */
export function explain(row: ShadowRow): Explanation | undefined {
  const refusedInSilence = !row.allowed && row.reported.length === 0;
  if (!refusedInSilence || row.state !== "removed" || row.removedBy === undefined) return undefined;

  if (!row.family || !lifecycleStep(row.family, "outstanding", row.object_type).allowed) return undefined;
  if (row.runs.length === 0 && isIndexedRemoval(row.removedBy) && row.failedIssuanceCheck) {
    return "removed, and neither check runs on it";
  }
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
export function expectShadowExplained(transactions: readonly unknown[], findings: readonly Finding[] = []): void {
  const runnable = transactions.every(
    (ele: any) => typeof ele?.date === "string" && typeof ele?.object_type === "string",
  );
  if (!runnable) return;

  const unexplained = disagreements(shadowRows(transactions as Transaction[], findings)).filter((row) => explain(row) === undefined);
  if (unexplained.length > 0) {
    throw new Error(
      `The lifecycle chart and the checks it shadows disagree, and tests/lifecycleShadow.ts has no explanation for it:\n` +
        unexplained.map((row) => `  ${show(row)}`).join("\n"),
    );
  }
}
