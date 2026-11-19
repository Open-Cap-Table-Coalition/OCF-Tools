import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { collection } from "./helpers";

/**
 * Characterization test: pins the validator's *current* output over the
 * `testPackage` fixture. This is a safety net, not a correctness oracle — if a
 * refactor changes this snapshot, that surfaces a behavior change for review.
 * It deliberately captures present behavior including the known-suspect paths
 * (e.g. warrant/convertible accumulation) flagged in the roadmap (discussion #145);
 * the snapshot is expected to change when those are fixed in later phases.
 */
const testPackagePath = path.resolve(__dirname, "..", "testing_scripts", "testPackage");

describe("ocfValidator over testPackage", () => {
  it("produces a stable validation result and report", () => {
    const context = ocfValidator(testPackagePath);

    // Record the validator's results. Omit the input package, its removal index and the two internal
    // maps from the comparison.
    const { ocfPackageContent, removals, nodes, nodesAtStartOfDay, ...output } = context;

    // Read the outstanding issuances under the original collection names so the recorded snapshot
    // still tests the same behavior.
    const collections = {
      stockIssuances: collection(context, "stockIssuances"),
      convertibleIssuances: collection(context, "convertibleIssuances"),
      warrantIssuances: collection(context, "warrantIssuances"),
      equityCompensation: collection(context, "equityCompensation"),
    };

    expect({ ...output, ...collections }).toMatchSnapshot();
  });
});
