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

/** Security families use the original collection names. */
const FAMILIES = ["stockIssuances", "convertibleIssuances", "warrantIssuances", "equityCompensation"] as const satisfies readonly CollectionKey[];

/**
 * Tests can supply starting issuances by family. baseContext stores them in the same form as the
 * validator.
 */
export type ContextSeed = Partial<OcfMachineContext> & { [C in CollectionKey]?: readonly unknown[] };

/** The reducer needs only a collection and an issuance effect to seed this family. */
const issues = (collection: CollectionKey) => ({ effect: "append", collection }) as unknown as Descriptor;

/** Add the starting issuances using the production reducer. */
const seededNodes = (seed: ContextSeed): NodeMap =>
  FAMILIES.reduce(
    (nodes, family) =>
      (seed[family] ?? []).reduce<NodeMap>((map, issuance) => applyTransaction(map, issues(family), issuance as any), nodes),
    seed.nodes ?? emptyNodes(),
  );

/**
 * Start with an empty context, apply test overrides and index removals from the package as the START
 * event does.
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

/** Read the family's outstanding issuances in issuance order. */
export const collection = <C extends CollectionKey>(context: OcfMachineContext, family: C) =>
  outstanding(context.nodes, family);

/**
 * Write a temporary OCF package and call the public validator so tests use the real reader and
 * same-day order. Compare the charts with the two existing checks on that order, then remove the
 * package.
 */
export const validatePackage = (
  transactions: Record<string, unknown>[],
  stakeholders: { id: string }[] = [],
  stockClasses: { id: string }[] = [],
): OcfMachineContext => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocf-tools-test-"));
  try {
    const write = (name: string, content: unknown) =>
      fs.writeFileSync(path.join(dir, name), JSON.stringify(content));
    write("Stakeholders.ocf.json", { items: stakeholders });
    write("StockClasses.ocf.json", { items: stockClasses });
    write("Transactions.ocf.json", { items: transactions });
    write("Manifest.ocf.json", {
      issuer: { legal_name: "Test Co" },
      stakeholders_files: [{ filepath: "Stakeholders.ocf.json" }],
      transactions_files: [{ filepath: "Transactions.ocf.json" }],
      stock_classes_files: [{ filepath: "StockClasses.ocf.json" }],
      vesting_terms_files: [],
      stock_plans_files: [],
      stock_legend_templates_files: [],
      valuations_files: [],
    });
    const context = ocfValidator(dir);
    // The validator sorts the input in place. Compare the charts and the two checks in that same
    // order.
    expectShadowExplained(context.ocfPackageContent.transactions);
    return context;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** Start the machine in capTable with the supplied records and issuances. */
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

/** Check the error level, outcome, check ID and transaction named in the finding. */
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
