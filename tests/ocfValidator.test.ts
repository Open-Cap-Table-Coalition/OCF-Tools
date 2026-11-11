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

// ---------------------------------------------------------------------------
// Malformed package values
// ---------------------------------------------------------------------------

// JSON.parse gives `{ "toString": null }` an own toString that isn't a function,
// so interpolating it into a template literal throws.
const unprintable = JSON.parse('{ "toString": null }');

describe("malformed package values", () => {
  it("fails a conversion whose resulting id isn't a string, naming the value", () => {
    const context = validatePackage(
      [
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        { id: "cv-1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "safe-1", resulting_security_ids: [unprintable], date: "2021-06-01" },
      ],
      [{ id: "sh-1" }],
    );

    const finding = {
      severity: "error",
      check: "resulting-stock-exists",
      message: 'No stock issuance with security_id {"toString":null} appears in the package.',
      subject: { object_type: "TX_CONVERTIBLE_CONVERSION", id: "cv-1" },
    };
    expect(context.findings).toEqual([finding]);
    expect(context.result).toBe(
      `The validation of the OCF package for Test Co failed on cv-1: ${JSON.stringify([finding], null, 2)}`,
    );
  });

  it("names a failing transaction whose id isn't a string", () => {
    const context = validatePackage([
      { id: unprintable, object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "nobody", date: "2021-01-01" },
    ]);

    expect(context.result).toMatch(/^The validation of the OCF package for Test Co failed on \{"toString":null\}: /);
    expect(context.findings.map((f) => f.check)).toEqual(["stakeholder-exists"]);
  });

  const issuance = { id: "ci-2", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-2", stakeholder_id: "sh-1", date: "2021-02-01" };
  it.each([
    { shape: "a numeric date", item: { ...issuance, date: 20210101 }, failure: "ci-2: its date (20210101) and object_type (TX_CONVERTIBLE_ISSUANCE)" },
    { shape: "no date", item: { ...issuance, date: undefined }, failure: "ci-2: its date (undefined) and object_type (TX_CONVERTIBLE_ISSUANCE)" },
    { shape: "an unprintable date", item: { ...issuance, date: unprintable }, failure: 'ci-2: its date ({"toString":null}) and object_type (TX_CONVERTIBLE_ISSUANCE)' },
    { shape: "a numeric object_type", item: { ...issuance, object_type: 5 }, failure: "ci-2: its date (2021-02-01) and object_type (5)" },
    { shape: "nothing but null", item: null, failure: "null: its date (undefined) and object_type (undefined)" },
  ])("stops the run before it starts on a transaction with $shape", ({ item, failure }) => {
    const context = validatePackage(
      [{ id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-01-01" }, item as any],
      [{ id: "sh-1" }],
    );

    expect(context.result).toBe(`The validation of the OCF package for Test Co failed on ${failure} must both be strings.`);
    expect(context.findings).toEqual([]);
    expect(context.snapshots).toEqual([]);
    expect(context.convertibleIssuances).toEqual([]);
  });

  it("gives each run its own arrays, so changing one run's result can't change the next's", () => {
    const malformed = [{ id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: 20210101 }];
    validatePackage(malformed).findings.push({ severity: "error", check: "leaked", message: "", subject: { object_type: "TX_CONVERTIBLE_ISSUANCE", id: "ci-1" } });

    expect(validatePackage(malformed).findings).toEqual([]);
  });
});
