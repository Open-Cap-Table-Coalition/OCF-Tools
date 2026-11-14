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
import { earliestRemovals, ocfMachine, TX_DESCRIPTORS, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import type { Finding } from "../types/finding";
import type { Check, GradedValidator, OcfMachineContext } from "../types/validator";

/**
 * A full, mostly-empty machine context; `overrides` replace top-level fields.
 * Unless overridden, `removals` indexes the package's transactions, as START
 * builds it, so a seeded actor sees the same removals a real run would.
 */
export const baseContext = (overrides: Partial<OcfMachineContext> = {}): OcfMachineContext => {
  const ocfPackageContent =
    overrides.ocfPackageContent ??
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
    stockIssuances: [],
    convertibleIssuances: [],
    warrantIssuances: [],
    equityCompensation: [],
    ocfPackageContent,
    removals: earliestRemovals(ocfPackageContent.transactions),
    report: [],
    findings: [],
    lastErrorFindings: [],
    snapshots: [],
    result: "Incomplete",
    ...overrides,
  };
};

/**
 * Runs the whole validator over a package holding the given transactions,
 * stakeholders, and stock classes, so the run goes through the driver and
 * same-day sort as a real one does. It writes a minimal package (a manifest, a
 * stakeholders file, a stock classes file, and a transactions file) to a
 * temporary directory and removes it afterwards.
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
    return ocfValidator(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** Start an actor seeded into `capTable` with the given context. */
export const startSeeded = (context: OcfMachineContext) =>
  createActor(ocfMachine, {
    snapshot: ocfMachine.resolveState({ value: "capTable", context }),
  }).start();

/** Cast a hand-built event to the typed event union (test-only boundary). */
export const ev = (type: string, data: Record<string, unknown> = {}): OcfMachineEvent =>
  ({ type, data } as unknown as OcfMachineEvent);

/** A context whose package `transactions` and `stakeholders` lists are the ones given. */
export const contextWith = (
  overrides: Partial<OcfMachineContext> & { transactions?: any[]; stakeholders?: { id: string }[] } = {},
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

/** Assert a finding carries the declared id, error severity, and the transaction as subject. */
export const expectFindingShape = (
  finding: Finding,
  check: string,
  subject: { object_type: string; id: string },
) => {
  expect(finding.check).toBe(check);
  expect(finding.severity).toBe("error");
  expect(finding.subject).toEqual(subject);
};
