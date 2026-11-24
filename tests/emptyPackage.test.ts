import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { ocfSnapshot } from "../ocf_snapshot";
import { validatePackage } from "./helpers";

// The noTransactions fixture is a company on the day it was formed. Two founders are listed, Common
// Stock is authorized and the board has adopted an equity plan that reserves 1,000,000 shares. No
// shares have been issued, so the manifest lists no transaction files.

const newlyFormedCo = path.resolve(__dirname, "..", "testing_scripts", "noTransactions");

describe("a company that has not issued anything yet", () => {
  const context = ocfValidator(newlyFormedCo);

  it("completes, and says that it found no transactions to check", () => {
    expect(context.result).toBe("The validation of the OCF package for Newly Formed Co is complete and found no transactions to check.");
    expect(context.findings).toEqual([]);
  });

  it("takes no snapshot, because no day has a transaction", () => {
    // The run used to record one snapshot dated null (#184).
    expect(context.snapshots).toEqual([]);
  });

  it("returns the package it read, with both founders", () => {
    expect(context.ocfPackageContent.manifest.issuer.legal_name).toBe("Newly Formed Co");
    expect(context.ocfPackageContent.stakeholders.map((stakeholder: { id: string }) => stakeholder.id)).toEqual(["ada", "grace"]);
    expect(context.ocfPackageContent.transactions).toEqual([]);
  });

  it("records the equity plan with its full reserve and nothing drawn", () => {
    expect([...context.nodes.security]).toEqual([]);
    expect(context.nodes.plan.get("plan-2024")).toEqual({
      kind: "plan",
      id: "plan-2024",
      reserved: { value: "1000000", writer: undefined, defects: [] },
      drawn: { value: "0", writer: undefined, defects: [] },
    });
  });

  it("has no cap table to show on any date", () => {
    expect(ocfSnapshot(newlyFormedCo, "2024-03-01")).toBeNull();
    expect(ocfSnapshot(newlyFormedCo, "2030-01-01")).toBeNull();
  });

  it("leaves nothing to throw after it returns", async () => {
    // The run used to return and then throw from a timer, which ends a Node process (#184). Waiting
    // a turn lets a late throw happen inside this test, where Vitest reports it as an unhandled
    // error.
    ocfValidator(newlyFormedCo);
    await new Promise((resolve) => setTimeout(resolve));
  });
});

describe("a transactions file with no items", () => {
  it("gets the same result as a manifest that lists no transaction files", () => {
    const context = validatePackage([], [{ id: "ada" }]);

    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found no transactions to check.");
    expect(context.findings).toEqual([]);
    expect(context.snapshots).toEqual([]);
  });
});
