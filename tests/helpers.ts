// Shared test helpers: a full empty context, an actor seeded straight into
// `capTable`, the test-only event cast, and the family-agnostic validator
// helpers every migrated-family suite builds on. Imported by every suite that
// drives the machine or a graded validator, so each family's tests share one
// definition.

import { expect } from "vitest";
import { createActor } from "xstate";
import { ocfMachine, TX_DESCRIPTORS, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import type { Finding } from "../types/finding";
import type { GradedValidator, OcfMachineContext } from "../types/validator";

/** A full, mostly-empty machine context; `overrides` replace top-level fields. */
export const baseContext = (overrides: Partial<OcfMachineContext> = {}): OcfMachineContext => ({
  stockIssuances: [],
  convertibleIssuances: [],
  warrantIssuances: [],
  equityCompensation: [],
  ocfPackageContent: {
    manifest: { issuer: { legal_name: "Test Co" } },
    stakeholders: [],
    stockClasses: [],
    transactions: [],
    stockLegends: [],
    stockPlans: [],
    vestingTerms: [],
    valuations: [],
  } as OcfMachineContext["ocfPackageContent"],
  report: [],
  findings: [],
  lastErrorFindings: [],
  snapshots: [],
  result: "Incomplete",
  ...overrides,
});

/** Start an actor seeded into `capTable` with the given context. */
export const startSeeded = (context: OcfMachineContext) =>
  createActor(ocfMachine, {
    snapshot: ocfMachine.resolveState({ value: "capTable", context }),
  }).start();

/** Cast a hand-built event to the typed event union (test-only boundary). */
export const ev = (type: string, data: Record<string, unknown> = {}): OcfMachineEvent =>
  ({ type, data } as unknown as OcfMachineEvent);

/** A context whose package `transactions` list is `transactions`. */
export const contextWith = (
  overrides: Partial<OcfMachineContext> & { transactions?: any[] } = {},
): OcfMachineContext => {
  const { transactions = [], ...rest } = overrides;
  return baseContext({
    ...rest,
    ocfPackageContent: {
      ...baseContext().ocfPackageContent,
      transactions,
    } as OcfMachineContext["ocfPackageContent"],
  });
};

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

/** The check ids a descriptor declares as implemented (drops `implemented: false`). */
export const implementedCheckIds = (key: string): string[] => {
  const descriptor = TX_DESCRIPTORS[key as keyof typeof TX_DESCRIPTORS] as {
    checks?: readonly { id: string; implemented?: false }[];
  };
  return (descriptor.checks ?? []).filter((c) => c.implemented !== false).map((c) => c.id);
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
