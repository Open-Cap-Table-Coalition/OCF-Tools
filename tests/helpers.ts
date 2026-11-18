// Shared test helpers: a full empty context, a whole-validator run over a
// temporary package, an actor seeded straight into `capTable`, the test-only
// event cast, and the family-agnostic validator helpers every migrated-family
// suite builds on. Imported by every suite that drives the machine or a graded
// validator, so each family's tests share one definition.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { expect } from "vitest";
import { createActor } from "xstate";
import { ocfValidator } from "../ocf_validator";
import { applyTransaction, emptyNodes, outstanding, type NodeMap } from "../ocf_validator/nodes";
import { earliestRemovals, ocfMachine, TX_DESCRIPTORS, type CollectionKey, type Descriptor, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import type { Finding } from "../types/finding";
import { expectShadowExplained } from "./lifecycleShadow";
import type { Check, GradedValidator, OcfMachineContext } from "../types/validator";

/** The four security families, by the names of the arrays the context once held for them. */
const FAMILIES = ["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"] as const satisfies readonly CollectionKey[];

/**
 * What a test can seed a context with: any of its fields, and, per family,
 * the issuances to start with outstanding. The context held those four arrays
 * until the node map replaced them (#228); a test still states its starting
 * cap table the same way, and `baseContext` puts it in the map.
 */
export type ContextSeed = Partial<OcfMachineContext> & { [C in CollectionKey]?: readonly unknown[] };

/** An "append" descriptor for a family: all the reducer reads off one to issue a security. */
const issues = (collection: CollectionKey) => ({ effect: "append", collection }) as unknown as Descriptor;

/**
 * A node map holding the seeded issuances as outstanding securities, built by
 * the same reducer the machine uses. Added to `nodes` if the seed has one.
 */
const seededNodes = (seed: ContextSeed): NodeMap =>
  FAMILIES.reduce(
    (nodes, family) =>
      (seed[family] ?? []).reduce<NodeMap>((map, issuance) => applyTransaction(map, issues(family), issuance as any), nodes),
    seed.nodes ?? emptyNodes(),
  );

/**
 * A full, mostly-empty machine context; `overrides` replace top-level fields,
 * and a family's array of issuances seeds the node map (see `ContextSeed`).
 * Unless overridden, `removals` indexes the package's transactions, as START
 * builds it, so a seeded actor sees the same removals a real run would.
 */
export const baseContext = (overrides: ContextSeed = {}): OcfMachineContext => {
  const { stockIssuances, convertibleIssuances, warrantIssuances, equityCompensation, ...fields } = overrides;
  const ocfPackageContent =
    fields.ocfPackageContent ??
    ({
      manifest: { issuer: { legal_name: "Test Co" } },
      stakeholders: [],
      stockClasses: [],
      transactions: [],
      stockLegends: [],
      stockPlans: [],
      vestingTerms: [],
      valuations: [],
    } as OcfMachineContext["ocfPackageContent"]);
  return {
    ocfPackageContent,
    removals: earliestRemovals(ocfPackageContent.transactions),
    report: [],
    findings: [],
    lastErrorFindings: [],
    snapshots: [],
    result: "Incomplete",
    ...fields,
    nodes: seededNodes(overrides),
  };
};

/**
 * The issuances outstanding in a family, in the order issued: what the
 * context's array of that name held before the node map (#228).
 */
export const collection = <C extends CollectionKey>(context: OcfMachineContext, family: C) =>
  outstanding(context.nodes, family);

/**
 * Runs the whole validator over a package holding the given transactions,
 * stakeholders, stock classes, and stock plans, so the run goes through the
 * driver and same-day sort as a real one does. It writes a minimal package (a
 * manifest and a file for each of those) to a temporary directory and removes
 * it afterwards.
 *
 * It also runs the lifecycle charts over the package in shadow, and fails if
 * they disagree with the checks they're to replace in a way that isn't
 * explained (see tests/lifecycleShadow.ts).
 */
export const validatePackage = (
  transactions: Record<string, unknown>[],
  stakeholders: { id: string }[] = [],
  stockClasses: { id: string }[] = [],
  stockPlans: Record<string, unknown>[] = [],
): OcfMachineContext => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-tools-test-"));
  try {
    const write = (name: string, content: unknown) =>
      fs.writeFileSync(path.join(dir, name), JSON.stringify(content));
    write("Stakeholders.ocf.json", { items: stakeholders });
    write("StockClasses.ocf.json", { items: stockClasses });
    write("StockPlans.ocf.json", { items: stockPlans });
    write("Transactions.ocf.json", { items: transactions });
    write("Manifest.ocf.json", {
      issuer: { legal_name: "Test Co" },
      stakeholders_files: [{ filepath: "Stakeholders.ocf.json" }],
      transactions_files: [{ filepath: "Transactions.ocf.json" }],
      stock_classes_files: [{ filepath: "StockClasses.ocf.json" }],
      vesting_terms_files: [],
      stock_plans_files: [{ filepath: "StockPlans.ocf.json" }],
      stock_legend_templates_files: [],
      valuations_files: [],
    });
    const context = ocfValidator(dir);
    // Every package a test validates also goes through the lifecycle charts in
    // shadow (#233). The driver has sorted the package's transactions in
    // place, so they're in run order here.
    expectShadowExplained(context.ocfPackageContent.transactions);
    return context;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Start an actor seeded into `capTable` with the given context. A family's
 * array of issuances spread onto the context is put in its node map, as
 * `baseContext` does.
 */
export const startSeeded = (context: OcfMachineContext & ContextSeed) =>
  createActor(ocfMachine, {
    snapshot: ocfMachine.resolveState({ value: "capTable", context: baseContext(context) }),
  }).start();

/** Cast a hand-built event to the typed event union (test-only boundary). */
export const ev = (type: string, data: Record<string, unknown> = {}): OcfMachineEvent =>
  ({ type, data } as unknown as OcfMachineEvent);

/** A context whose package `transactions` and `stakeholders` lists are the ones given. */
export const contextWith = (
  overrides: ContextSeed & { transactions?: any[]; stakeholders?: { id: string }[] } = {},
): OcfMachineContext => {
  const { transactions = [], stakeholders = [], ...rest } = overrides;
  return baseContext({
    ...rest,
    ocfPackageContent: {
      ...baseContext().ocfPackageContent,
      stakeholders,
      transactions,
    } as OcfMachineContext["ocfPackageContent"],
  });
};

/** A context whose stakeholder file holds one stakeholder, `id`. */
export const withStakeholder = (id: string): OcfMachineContext => contextWith({ stakeholders: [{ id }] });

/** A transaction record of the given type on `security_id`, for building offenders and exempt records. */
export const txRecord = (object_type: string, id: string, security_id = "sec1", date = "2021-06-01") => ({
  id,
  object_type,
  security_id,
  date,
});

/** Invoke the graded validator a migrated descriptor carries. */
export const runValidator = (
  key: string,
  context: OcfMachineContext,
  data: Record<string, unknown>,
): Finding[] => {
  const descriptor = TX_DESCRIPTORS[key as keyof typeof TX_DESCRIPTORS] as {
    validate?: GradedValidator<any>;
  };
  if (!descriptor.validate) throw new Error(`${key} carries no graded validate`);
  return descriptor.validate(context, data);
};

/** The checks a descriptor declares, gaps included; empty for a legacy or passthrough descriptor. */
export const declaredChecks = (key: string): readonly Check[] => {
  const descriptor = TX_DESCRIPTORS[key as keyof typeof TX_DESCRIPTORS] as { checks?: readonly Check[] };
  return descriptor.checks ?? [];
};

/** The check ids a descriptor declares as implemented (drops `implemented: false`). */
export const implementedCheckIds = (key: string): string[] =>
  declaredChecks(key).filter((c) => c.implemented !== false).map((c) => c.id);

/**
 * For each of a family's transaction types, scenarios that each fail at least
 * one implemented check. A family suite pairs these with `emittedCheckIds` to
 * show that the checks a descriptor declares implemented are exactly the ones
 * its validator can emit.
 */
export type FailingScenarios<K extends string> = Record<
  K,
  { context: OcfMachineContext; data: Record<string, unknown> }[]
>;

/** Every check id emitted across the failing scenarios for `key`. */
export const emittedCheckIds = <K extends string>(scenarios: FailingScenarios<K>, key: K): Set<string> => {
  const emitted = new Set<string>();
  for (const { context, data } of scenarios[key]) {
    for (const finding of runValidator(key, context, data)) emitted.add(finding.check);
  }
  return emitted;
};

/** Assert a finding carries the declared id, error severity, a failed outcome, and the transaction as subject. */
export const expectFindingShape = (
  finding: Finding,
  check: string,
  subject: { object_type: string; id: string },
) => {
  expect(finding.check).toBe(check);
  expect(finding.severity).toBe("error");
  expect(finding.outcome).toBe("failed");
  expect(finding.subject).toEqual(subject);
};
