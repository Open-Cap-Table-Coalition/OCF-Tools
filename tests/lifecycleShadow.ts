// The lifecycle charts, run in shadow against the two checks they're meant to
// replace: no-earlier-removal and no-other-transactions (#233). Nothing in the
// validator consults a chart yet. This walks a package's transactions in run
// order, asks the chart about each one, asks the two checks about the same
// one, and reports where they disagree.
//
// `validatePackage` (tests/helpers.ts) runs it on every package a test
// validates, and tests/lifecycleShadow.test.ts runs it on the packages on
// disk. Each disagreement has to be one of the explained kinds below, or the
// test that validated the package fails.

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

/** A transaction as the walker reads it: its type and date, and whichever fields name its securities. */
type Transaction = { id?: unknown; object_type: string; date: string; security_id?: unknown; security_ids?: unknown; [field: string]: unknown };

/** One transaction on one security: what the chart said, and what the two checks said. */
export type ShadowRow = {
  id: unknown;
  object_type: string;
  date: string;
  security: unknown;
  /** The security's family, once something has issued it. */
  family: CollectionKey | undefined;
  /** The state the chart had the security in before this transaction. */
  state: LifecycleState;
  /** Whether the chart allowed the transaction. */
  allowed: boolean;
  /** Which of the two checks the run performs on this transaction. */
  runs: string[];
  /** Which of them reported a finding. */
  reported: string[];
  /** The transaction that removed the security on the chart, if one has. */
  removedBy: Transaction | undefined;
};

/**
 * The securities a transaction names. All but one name a single `security_id`.
 * A consolidation names several, in `security_ids`.
 */
const securitiesOf = (transaction: Transaction): unknown[] => {
  if ("security_id" in transaction) return [transaction.security_id];
  if (transaction.object_type === "TX_STOCK_CONSOLIDATION" && Array.isArray(transaction.security_ids)) {
    return transaction.security_ids;
  }
  return [];
};

/**
 * Which of the two checks the run performs on a transaction of this type. A
 * graded validator performs the ones it declares as implemented. The machine
 * runs no-earlier-removal itself on the transactions that can't declare it:
 * every passthrough type but the return to pool, and a legacy issuance.
 */
const checksRunOn = (type: string, descriptor: Descriptor): string[] => {
  if ("validate" in descriptor) {
    return (descriptor.checks as readonly Check[])
      .filter((check) => check.implemented !== false && SHADOWED.includes(check.id))
      .map((check) => check.id);
  }
  if (descriptor.effect === "passthrough") return type === "TX_STOCK_PLAN_RETURN_TO_POOL" ? [] : [NO_EARLIER_REMOVAL];
  return descriptor.effect === "append" ? [NO_EARLIER_REMOVAL] : [];
};

/** A check as the shadow runs it: on any transaction, whatever fields the check's own type asks for. */
type ShadowedCheck = { run: (context: any, data: any) => string[] };

/** Each graded family's own no-other-transactions, by the family's collection. */
const NO_OTHER_TRANSACTIONS_OF: Partial<Record<CollectionKey, ShadowedCheck>> = {
  convertibleIssuances: convertibleNoOtherTransactions,
  warrantIssuances: warrantNoOtherTransactions,
  equityCompensation: equityCompensationNoOtherTransactions,
};

/**
 * Which of the two checks report a finding on this transaction. Each check is
 * run on its own, not through the transaction's validator, so the answer is
 * the check's and nothing else's. Both read only the package.
 */
const checksReportedOn = (context: OcfMachineContext, transaction: Transaction, descriptor: Descriptor, runs: string[]): string[] =>
  runs.filter((id) => {
    const check: ShadowedCheck | undefined =
      id === NO_EARLIER_REMOVAL ? noEarlierRemoval : NO_OTHER_TRANSACTIONS_OF[lifecycleFamilies(descriptor)[0]];
    if (check === undefined) throw new Error(`No ${id} to run for ${transaction.object_type}.`);
    return check.run(context, transaction).length > 0;
  });

/**
 * Walks `transactions`, which must be in run order, and returns a row for
 * every transaction on every security it names. A transaction of a type the
 * validator doesn't know is skipped: it stops the run, and no chart has it.
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
    const runs = checksRunOn(transaction.object_type, descriptor);
    const reported = checksReportedOn(context, transaction, descriptor, runs);

    for (const security of securitiesOf(transaction)) {
      let known = securities.get(security);
      const state = known?.state ?? "notIssued";

      // A security nothing has issued has no family yet. An issuance gives it
      // one; anything else is asked of the transaction's own family, where a
      // security that isn't issued allows nothing but an issuance.
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

/** The rows where the chart and the two checks disagree: one allows what the other reports. */
export const disagreements = (rows: readonly ShadowRow[]): ShadowRow[] =>
  rows.filter((row) => row.allowed !== (row.reported.length === 0));

// ---------------------------------------------------------------------------
// Explained disagreements
// ---------------------------------------------------------------------------

/**
 * Every way the charts are known to disagree with the two checks, and why.
 * `explain` decides which one a disagreement is from the row alone.
 *
 * In all three the chart refuses a transaction the two checks say nothing
 * about. No package in the suite has a transaction the checks report and the
 * chart allows.
 */
export const EXPLANATIONS = {
  /**
   * The security was removed, and the transaction is one neither check runs
   * on: an acceptance, a retraction, a transfer, or one that leaves the
   * security outstanding, such as a repricing or an equity compensation
   * exercise. The run still fails it today, through issuance-exists, which no
   * longer finds the security in its collection. So the run and the chart
   * agree; it's only these two checks that don't cover it. When the chart
   * becomes the source of truth, it reports this case with the removal that
   * caused it, where issuance-exists can only say "not outstanding".
   */
  "removed, and neither check runs on it":
    "The run fails it through issuance-exists; neither of the two checks runs on this transaction type.",

  /**
   * The security was removed earlier the same day. no-earlier-removal only
   * counts a removal dated before the transaction, on purpose: a security can
   * vest and be cancelled on one day (#214). The chart has no dates. It takes
   * transactions in run order, and the same-day order ranks a cancellation
   * before a vesting event, so it sees the vesting event arrive after the
   * removal.
   *
   * This one is a real difference. A package that passes today would fail if
   * the chart became the source of truth as it stands. It goes away when
   * same-day order comes from what each transaction references (#232), or the
   * charts have to allow for it some other way before step 4 of #233.
   */
  "removed earlier the same day":
    "no-earlier-removal ignores a removal dated the same day; the chart follows run order, which puts the removal first.",

  /**
   * The security was removed by a transaction the `removals` index doesn't
   * hold, so no-earlier-removal doesn't know it's gone. The index keeps
   * transactions whose effect is "remove", by their `security_id`. That
   * leaves out a consolidation, which is passthrough and names its securities
   * in `security_ids`. This is the gap #224 left and #233 says the chart
   * closes. (The plan security removals were the other half of it until they
   * became equity compensation removals.)
   */
  "removed by a transaction the removals index doesn't hold":
    "The chart removed the security on a consolidation, which no-earlier-removal's index leaves out.",
} as const;

export type Explanation = keyof typeof EXPLANATIONS;

/** Whether the `removals` index holds a transaction: its effect is "remove" and it names one `security_id`. */
const isIndexedRemoval = (transaction: Transaction): boolean =>
  "security_id" in transaction &&
  (TX_DESCRIPTORS as Record<string, Descriptor>)[transaction.object_type]?.effect === "remove";

/** Which explained disagreement a row is, or `undefined` for one nothing explains yet. */
export function explain(row: ShadowRow): Explanation | undefined {
  const refusedInSilence = !row.allowed && row.reported.length === 0;
  if (!refusedInSilence || row.state !== "removed" || row.removedBy === undefined) return undefined;

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
 * Fails if the charts and the two checks disagree about a package in a way
 * nothing explains. `transactions` is the package's, in run order. A package
 * whose run never starts (a transaction with no usable date or type) has no
 * run order, so it's passed over.
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
