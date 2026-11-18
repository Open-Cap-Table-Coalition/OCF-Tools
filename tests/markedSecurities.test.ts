import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { collection } from "./helpers";

// ---------------------------------------------------------------------------
// A package with two unrelated mistakes
// ---------------------------------------------------------------------------
//
// testing_scripts/markedSecurities, in date order:
//
//   2021-01-05  ci-1  a SAFE is issued to ada
//   2021-01-10  wi-1  a warrant is issued to a stakeholder the package doesn't have
//   2021-02-01  wa-1  that warrant is accepted
//   2021-03-01  cv-1  the SAFE converts into a stock issuance the package doesn't have
//   2021-04-01  wi-2  a second warrant is issued to grace
//   2021-04-15  wa-2  and accepted
//
// Before #231 the run stopped at wi-1: one error, two snapshots, and nothing
// said about the conversion. Now it reports both mistakes, marks the
// acceptance as a consequence of the first and not a mistake of its own, and
// carries on through the second warrant to the last day.

const context = ocfValidator(path.resolve(__dirname, "..", "testing_scripts", "markedSecurities"));

const WARRANT_ISSUANCE = { object_type: "TX_WARRANT_ISSUANCE", id: "wi-1" };
const CONVERSION = { object_type: "TX_CONVERTIBLE_CONVERSION", id: "cv-1" };

describe("a package with two unrelated mistakes", () => {
  it("reports both root errors", () => {
    const roots = context.findings.filter((finding) => finding.outcome === "failed");

    expect(roots).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "stakeholder-exists",
        message: "The stakeholder nobody referenced by the transaction was not found in the stakeholder file.",
        subject: WARRANT_ISSUANCE,
      },
      {
        severity: "error",
        outcome: "failed",
        check: "resulting-stock-exists",
        message: "No stock issuance with security_id stock-that-was-never-issued appears in the package.",
        subject: CONVERSION,
      },
    ]);
  });

  it("blocks the acceptance of the failed warrant, pointing at its issuance", () => {
    const blocked = context.findings.filter((finding) => finding.outcome === "blocked");

    // One blocked check, on the acceptance: the one that reads the warrant.
    // It isn't a second "no such warrant" error for the one mistake.
    expect(blocked).toEqual([
      {
        severity: "error",
        outcome: "blocked",
        check: "issuance-exists",
        message:
          "Not checked: it reads the lifecycle of security war-1, which can't be relied on because TX_WARRANT_ISSUANCE wi-1 failed.",
        subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "wa-1" },
        roots: [WARRANT_ISSUANCE],
      },
    ]);
    // The acceptance's other check reads only the package, so it ran, and passed.
    expect(context.findings.filter((finding) => finding.subject.id === "wa-1")).toHaveLength(1);
  });

  it("finds nothing wrong with the transactions that have nothing wrong with them", () => {
    const subjects = new Set(context.findings.map((finding) => finding.subject.id));

    expect(subjects).toEqual(new Set(["wi-1", "wa-1", "cv-1"]));
    expect(context.findings).toHaveLength(3);
    expect(context.report).toEqual([]);
  });

  it("counts the root errors and the blocked check separately in result", () => {
    expect(context.result).toBe(
      "The validation of the OCF package for Defect Demo Co is complete and found 2 errors and 1 check blocked by them.",
    );
  });

  it("takes a snapshot for every day through the last", () => {
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2021-01-05",
      "2021-01-10",
      "2021-02-01",
      "2021-03-01",
      "2021-04-01",
      "2021-04-15",
    ]);
  });

  it("marks the entries the two mistakes left in doubt, and no others", () => {
    const safe = { date: "2021-01-05", custom_id: "SAFE-1", stakeholder: "ada" };
    const secondWarrant = { date: "2021-04-01", custom_id: "W-2", stakeholder: "grace", purchase_price: { amount: "50.00", currency: "USD" } };
    // The failed warrant: something claims a place on the cap table, and
    // nothing about it is known.
    const failedWarrant = { defects: { lifecycle: [WARRANT_ISSUANCE], issuance: [WARRANT_ISSUANCE] } };
    // The SAFE after its conversion failed: shown as it stood, with its
    // lifecycle in doubt.
    const unconvertedSafe = { ...safe, defects: { lifecycle: [CONVERSION] } };

    const entries = context.snapshots.map((snapshot) => ({ convertibles: snapshot.convertibles, warrants: snapshot.warrants }));
    expect(entries).toEqual([
      { convertibles: [safe], warrants: [] },
      { convertibles: [safe], warrants: [failedWarrant] },
      { convertibles: [safe], warrants: [failedWarrant] },
      { convertibles: [unconvertedSafe], warrants: [failedWarrant] },
      { convertibles: [unconvertedSafe], warrants: [failedWarrant, secondWarrant] },
      { convertibles: [unconvertedSafe], warrants: [failedWarrant, secondWarrant] },
    ]);
  });

  it("withholds what the failed transactions would have written, and marks it", () => {
    const { security } = context.nodes;

    // The failed issuance wrote no values, and the node is there all the same.
    expect(security.get("war-1")).toEqual({
      kind: "security",
      id: "war-1",
      family: "warrantIssuances",
      lifecycle: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
      issuance: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
    });
    // The failed conversion didn't remove the SAFE. Its lifecycle keeps the
    // value and writer it had, and its issuance was never in doubt.
    expect(security.get("safe-1")?.lifecycle).toEqual({
      value: "outstanding",
      writer: { object_type: "TX_CONVERTIBLE_ISSUANCE", id: "ci-1" },
      defects: [CONVERSION],
    });
    expect(security.get("safe-1")?.issuance.defects).toEqual([]);
    // The second warrant is untouched by either.
    expect(security.get("war-2")?.lifecycle.defects).toEqual([]);
    expect(security.get("war-2")?.issuance.defects).toEqual([]);

    expect(collection(context, "warrantIssuances").map((warrant) => warrant.id)).toEqual(["wi-2"]);
    expect(collection(context, "convertibleIssuances").map((convertible) => convertible.id)).toEqual(["ci-1"]);
  });
});
