import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";

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

    // `ocfPackageContent` is just the input package echoed back onto the machine
    // context; exclude it so the snapshot captures derived behavior, not the fixture.
    const { ocfPackageContent, ...output } = context;

    expect(output).toMatchSnapshot();
  });
});
