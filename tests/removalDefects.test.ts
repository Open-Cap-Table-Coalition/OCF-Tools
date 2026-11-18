import { describe, expect, it } from "vitest";
import { validatePackage } from "./helpers";

describe("removal checks after a failure", () => {
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
