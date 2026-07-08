// Shared machine-test helpers: a full empty context, an actor seeded straight
// into `capTable`, and the test-only event cast. Imported by every suite that
// drives the machine, so each validator family's tests build on one definition.

import { createActor } from "xstate";
import { ocfMachine, type OcfMachineEvent } from "../ocf_validator/ocfMachine";
import type { OcfMachineContext } from "../types/validator";

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
