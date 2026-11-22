import { describe, expect, it } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { contextAfterCancellation, runValidator, validatePackage, validatePackageWith } from "./helpers";

describe("removal checks after a failure", () => {
  it("names only the applied removal when a cancellation precedes the first issuance", () => {
    const security_id = "w";
    const context = validatePackageWith(ocfValidator)([
      { id: "early", object_type: "TX_WARRANT_CANCELLATION", security_id, date: "2022-01-01" },
      { id: "issue", object_type: "TX_WARRANT_ISSUANCE", security_id, stakeholder_id: "holder", date: "2022-02-01" },
      { id: "transfer", object_type: "TX_WARRANT_TRANSFER", security_id, date: "2022-03-01" },
      { id: "vest", object_type: "TX_VESTING_EVENT", security_id, date: "2022-04-01" },
    ], [{ id: "holder" }]);

    expect(context.findings).toMatchObject([
      { subject: { id: "early" }, check: "issuance-exists", outcome: "failed" },
      { subject: { id: "vest" }, check: "no-earlier-removal", message: "The security w was removed from the cap table by transfer on 2022-03-01." },
    ]);
    expect(context.snapshots.map((day) => day.warrants.length)).toEqual([0, 1, 0, 0]);
  });

  it("recognizes an applied removal when resuming a record written before removal dates were stored", () => {
    const context = contextAfterCancellation("WARRANT");
    const security = new Map(structuredClone(context.nodes.security));
    const { removal, ...older } = security.get("sec1")!;
    security.set("sec1", older);
    const issuance = { ...older.issuance.value!, id: "again", date: "2022-01-01" };
    const findings = runValidator("TX_WARRANT_ISSUANCE", { ...context, nodes: { security } }, issuance);
    expect(findings).toMatchObject([{ check: "no-earlier-removal", message: "The security sec1 was removed from the cap table by cancel on 2020-06-01." }]);
  });

  it("can still identify a duplicate ID when a failed removal blocks the lifecycle check", () => {
    const issue = { id: "first", object_type: "TX_WARRANT_ISSUANCE", security_id: "w", stakeholder_id: "holder", date: "2022-01-01" };
    const context = validatePackageWith(ocfValidator)([
      issue,
      { id: "exercise", object_type: "TX_WARRANT_EXERCISE", security_id: "w", resulting_security_ids: ["missing"], date: "2022-02-01" },
      { ...issue, id: "second", date: "2022-03-01" },
    ], [{ id: "holder" }]);
    expect(context.findings.filter((finding) => finding.subject.id === "second")).toMatchObject([
      { check: "no-earlier-removal", outcome: "blocked", roots: [{ id: "exercise" }] },
      { check: "unique-security-id", outcome: "failed", message: "The security ID w was already issued by first." },
    ]);
  });

  it("blocks a later vesting event on a failed removal instead of inventing a second root", () => {
    const context = validatePackage([
      { id: "issue", object_type: "TX_WARRANT_ISSUANCE", security_id: "w", stakeholder_id: "holder", date: "2022-01-01" },
      { id: "exercise", object_type: "TX_WARRANT_EXERCISE", security_id: "w", resulting_security_ids: ["missing"], date: "2022-02-01" },
      { id: "vest", object_type: "TX_VESTING_EVENT", security_id: "w", date: "2022-03-01" },
    ], [{ id: "holder" }]);

    expect(context.findings.filter((finding) => finding.outcome === "failed").map((finding) => finding.subject.id)).toEqual(["exercise"]);
    expect(context.findings.find((finding) => finding.subject.id === "vest")).toMatchObject({
      check: "no-earlier-removal",
      outcome: "blocked",
      roots: [{ object_type: "TX_WARRANT_EXERCISE", id: "exercise" }],
    });
    expect(context.snapshots).toHaveLength(3);
  });
});
