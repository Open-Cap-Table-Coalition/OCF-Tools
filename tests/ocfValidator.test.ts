import { afterEach, describe, it, expect, vi } from "vitest";
import { errorResult, TX_DESCRIPTORS } from "../ocf_validator/ocfMachine";
import { baseContext, validatePackage } from "./helpers";

// ---------------------------------------------------------------------------
// A run that throws
// ---------------------------------------------------------------------------

describe("a run that throws", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops the run on that transaction and names it and the error in result", async () => {
    vi.spyOn(TX_DESCRIPTORS.TX_CONVERTIBLE_ISSUANCE, "validate").mockImplementation(() => {
      throw new Error("validator bug");
    });

    const context = validatePackage(
      [
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        // Invalid, so a run that went on past ci-1 would record a finding for it.
        { id: "wi-bad", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "nobody", date: "2021-02-01" },
      ],
      [{ id: "sh-1" }],
    );

    expect(context.result).toMatch(/^The validation of the OCF package for Test Co failed on ci-1: /);
    expect(context.result).toContain("validator bug");
    expect(context.findings).toEqual([]);

    // xstate rethrows an error nothing observes on a timer, after the run has
    // returned. Waiting a turn lets that happen inside this test, where Vitest
    // reports it as an unhandled error.
    await new Promise((resolve) => setTimeout(resolve));
  });

  it("reports a throw even from a package with no issuer", () => {
    // The driver builds this result outside the actor, where a throw would
    // escape ocfValidator, so it reads the issuer null-safely.
    expect(errorResult({ ...baseContext().ocfPackageContent, manifest: {} }, { type: "RUN_END" }, new Error("boom"))).toBe(
      "The validation of the OCF package for undefined failed on RUN_END: Error: boom",
    );
  });

  it("names the control event when the run throws on one", async () => {
    // A package with no transactions never sends START, so RUN_END throws
    // reading the issuer from the machine's placeholder manifest. Handling an
    // empty package is #184's; until then, the run reports that throw.
    const context = validatePackage([]);

    expect(context.result).toMatch(/^The validation of the OCF package for Test Co failed on RUN_END: /);
    await new Promise((resolve) => setTimeout(resolve));
  });
});
