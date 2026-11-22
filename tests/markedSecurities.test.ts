import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { collection } from "./helpers";

// The markedSecurities fixture combines a warrant issued to a missing stakeholder, a later
// acceptance, a SAFE conversion with missing resulting stock and an unrelated valid warrant. Only
// the acceptance depends on the failed issuance.

const context = ocfValidator(path.resolve(__dirname, "..", "testing_scripts", "markedSecurities"));

const WARRANT_ISSUANCE = { object_type: "TX_WARRANT_ISSUANCE", id: "wi-1" };
const CONVERSION = { object_type: "TX_CONVERTIBLE_CONVERSION", id: "cv-1" };

describe("a package with two unrelated mistakes", () => {
  it("reports the two root errors and the acceptance that depends on the failed warrant", () => {
    expect(context.findings).toEqual([
      {
        severity: "error", outcome: "failed", check: "stakeholder-exists", subject: WARRANT_ISSUANCE,
        message: "The stakeholder nobody referenced by the transaction was not found in the stakeholder file.",
      },
      {
        severity: "error", outcome: "blocked", check: "issuance-exists",
        subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "wa-1" }, roots: [WARRANT_ISSUANCE],
        message: "Not checked: it reads the lifecycle of security war-1, which can't be relied on because TX_WARRANT_ISSUANCE wi-1 failed.",
      },
      {
        severity: "error", outcome: "failed", check: "resulting-stock-exists", subject: CONVERSION,
        message: "No stock issuance with security_id stock-that-was-never-issued appears in the package.",
      },
    ]);
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
    // Show the failed issuance even though its details are unknown.
    const failedWarrant = { defects: { lifecycle: [WARRANT_ISSUANCE], issuance: [WARRANT_ISSUANCE] } };
    // Keep the SAFE in the snapshot and identify the failure affecting its lifecycle.
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

    // The failed issuance creates a record with unknown values.
    expect(security.get("war-1")).toEqual({
      kind: "security",
      id: "war-1",
      family: "warrantIssuances",
      lifecycle: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
      issuance: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
    });
    // The failed conversion leaves the SAFE outstanding. Its lifecycle keeps the prior writer, and
    // its issuance remains reliable.
    expect(security.get("safe-1")?.lifecycle).toEqual({
      value: "outstanding",
      writer: { object_type: "TX_CONVERTIBLE_ISSUANCE", id: "ci-1" },
      defects: [CONVERSION],
    });
    expect(security.get("safe-1")?.issuance.defects).toEqual([]);
    // Both failures leave the second warrant reliable.
    expect(security.get("war-2")?.lifecycle.defects).toEqual([]);
    expect(security.get("war-2")?.issuance.defects).toEqual([]);

    expect(collection(context, "warrantIssuances").map((warrant) => warrant.id)).toEqual(["wi-2"]);
    expect(collection(context, "convertibleIssuances").map((convertible) => convertible.id)).toEqual(["ci-1"]);
  });
});
