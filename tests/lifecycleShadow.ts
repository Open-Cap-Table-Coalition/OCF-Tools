// Compare each chart with the issuance and removal checks (#233). Follow
// transaction order even when validation fails. Whole-package tests use this comparison to catch new
// differences.

import { getNextSnapshot } from "xstate";
import { lifecycleStep, type LifecycleState } from "../ocf_validator/lifecycle";
import { checksBeforeValidation, lifecycleFamilies, ocfMachine, TX_DESCRIPTORS, type CollectionKey, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import { applyTransaction } from "../ocf_validator/nodes";
import { toValidate, type CheckObject } from "../ocf_validator/validators/checkKit";
import type { Finding } from "../types/finding";
import type { OcfMachineContext } from "../types/validator";
import { baseContext } from "./helpers";

const NO_EARLIER_REMOVAL = "no-earlier-removal";
const NO_OTHER_TRANSACTIONS = "no-other-transactions";
const SHADOWED = [NO_EARLIER_REMOVAL, NO_OTHER_TRANSACTIONS, "unique-security-id"];

/** Package fields used to compare a transaction with its chart. */
type Transaction = { id?: unknown; object_type: string; date: string; security_id?: unknown; security_ids?: unknown; [field: string]: unknown };

type Run = { context: OcfMachineContext; visits: readonly Finding[][] };

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
  blocked: boolean;
  /** Whether the validator or the replay found the issuance missing. */
  issuanceCheck?: "failed" | "replayed" | "blocked";
  /** Earlier transaction that removed this security, if known. */
  removedBy: Transaction | undefined;
  /** The first removal the validator indexed for this security. */
  indexedRemoval?: Pick<Transaction, "date" | "object_type">;
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

/** Resume from the holdings the validator kept. A failed transaction leaves those holdings alone. */
function replay(context: OcfMachineContext, transaction: Transaction, checks: readonly CheckObject<any>[]) {
  const from = ocfMachine.resolveState({ value: "capTable", context });
  const event = { type: transaction.object_type, data: transaction } as OcfMachineEvent;
  try {
    const next = getNextSnapshot(ocfMachine, from, event).context;
    return { context: next, findings: next.findings.slice(context.findings.length) };
  } catch {
    // If the full validator throws, the individual checks can still tell us what they found.
    return { context, findings: toValidate(checks)(context, transaction) };
  }
}

/**
 * Compare each named security in processing order. Skip unknown transaction types because there is
 * no chart entry for them.
 */
export function shadowRows(transactions: readonly Transaction[], run?: Run): ShadowRow[] {
  let context = run?.context ?? baseContext({
    ocfPackageContent: { ...baseContext().ocfPackageContent, transactions } as unknown as OcfMachineContext["ocfPackageContent"],
  });
  const securities = new Map<unknown, { family: CollectionKey; state: LifecycleState; issuance: Transaction; removedBy?: Transaction }>();
  const rows: ShadowRow[] = [];

  for (const [index, transaction] of transactions.entries()) {
    if (!Object.hasOwn(TX_DESCRIPTORS, transaction.object_type)) continue;
    const descriptor = TX_DESCRIPTORS[transaction.object_type as keyof typeof TX_DESCRIPTORS];
    const actual = run?.visits[index];
    const skipped = run !== undefined && actual === undefined;
    const rules: readonly CheckObject<any>[] = "rules" in descriptor ? descriptor.rules : [];
    const checks = rules.filter((rule) => rule.run && (SHADOWED.includes(rule.id) || (skipped && rule.id === "issuance-exists")));
    checks.unshift(...(checksBeforeValidation(transaction.object_type, descriptor)?.checks ?? []));
    const runs = checks.map((check) => check.id).filter((id) => SHADOWED.includes(id));
    const replayed = skipped ? replay(context, transaction, checks) : undefined;
    if (replayed) context = replayed.context;
    const findings = actual ?? replayed?.findings ?? toValidate(checks)(context, transaction);
    // Without a package run, keep the prior issuances available to the ID check.
    if (!run && findings.length === 0 && typeof transaction.id === "string") {
      context = { ...context, nodes: applyTransaction(context.nodes, descriptor, { ...transaction, id: transaction.id }) };
    }
    const failed = findings.filter((f) => f.outcome === "failed");
    const reported = [...new Set(failed.map((f) => f.check).filter((id) => SHADOWED.includes(id)))];
    const issuance = findings.find((f) => f.check === "issuance-exists" && f.severity === "error");

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
        blocked: findings.some((f) => f.outcome === "blocked" && SHADOWED.includes(f.check)),
        issuanceCheck: issuance?.outcome === "failed" && skipped ? "replayed" : issuance?.outcome,
        indexedRemoval: context.removals.get(security),
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

  "the validator stopped before checking the issuance":
    "The validator stopped earlier. When we check the removed security, its issuance is missing.",

  "an earlier failure blocked the check":
    "The validator could not determine the security’s state after an earlier failure.",

  "wrong security family":
    "The transaction's family does not match the security's issuance, so its issuance check rejects it.",

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

/** Identify a known difference so tests can report any new one. */
export function explain(row: ShadowRow): Explanation | undefined {
  const refusedInSilence = !row.allowed && row.reported.length === 0;
  if (refusedInSilence && row.blocked) return "an earlier failure blocked the check";
  if (!refusedInSilence || row.state !== "removed" || row.removedBy === undefined) return undefined;

  if (!row.family) return undefined;
  const descriptor = TX_DESCRIPTORS[row.object_type as keyof typeof TX_DESCRIPTORS];
  if (!lifecycleFamilies(descriptor).includes(row.family)) {
    return row.issuanceCheck === undefined ? undefined : "wrong security family";
  }
  if (!lifecycleStep(row.family, "outstanding", row.object_type).allowed) return undefined;
  if (row.runs.length === 0 && row.indexedRemoval === row.removedBy) {
    if (row.issuanceCheck === "blocked") return "an earlier failure blocked the check";
    if (row.issuanceCheck === "failed") return "removed, and neither check runs on it";
    if (row.issuanceCheck === "replayed") return "the validator stopped before checking the issuance";
  }
  if (row.runs.length === 1 && row.runs[0] === NO_EARLIER_REMOVAL) {
    const indexedDate = row.indexedRemoval?.date;
    if (indexedDate !== undefined && indexedDate < row.date) return undefined;
    if (indexedDate === row.date && row.removedBy.date === row.date) return "removed earlier the same day";
    if (row.removedBy.object_type === "TX_STOCK_CONSOLIDATION") {
      return "removed by a transaction the removals index doesn't hold";
    }
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
export function expectShadowExplained(transactions: readonly unknown[], run?: Run): ShadowRow[] {
  const runnable = transactions.every(
    (ele: any) => typeof ele?.date === "string" && typeof ele?.object_type === "string",
  );
  if (!runnable) return [];

  const rows = shadowRows(transactions as Transaction[], run);
  const unexplained = disagreements(rows).filter((row) => explain(row) === undefined);
  if (unexplained.length > 0) {
    throw new Error(
      `The lifecycle chart and the checks it shadows disagree, and tests/lifecycleShadow.ts has no explanation for it:\n` +
        unexplained.map((row) => `  ${show(row)}`).join("\n"),
    );
  }
  return rows;
}
