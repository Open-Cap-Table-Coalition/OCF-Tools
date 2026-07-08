import { describe, it, expect } from "vitest";
import { TX_DESCRIPTORS } from "../ocf_validator/ocfMachine";

// ---------------------------------------------------------------------------
// Per-descriptor check-id uniqueness
// ---------------------------------------------------------------------------
//
// Declared check ids are unique per descriptor, not globally: the coverage
// report renders per transaction type, so reusing a generic id (e.g.
// `stakeholder-exists`) across modules is fine, even desirable. A duplicate is
// therefore only a duplicate within one descriptor's own `checks`. The detector
// below scans a descriptor map and returns structured diagnostics rather than
// throwing, so the guard test can assert on its return value — and so synthetic
// maps can exercise it directly. The real table now declares graded checks (the
// convertible family), which the final case guards for duplicate ids.

/** A single check id a descriptor declares more than once. */
type DuplicateCheckId = { key: string; id: string };

/**
 * The slice of a descriptor the detector reads: its declared checks, if any.
 * `effect` is named only so the input is typed as descriptor-shaped rather than
 * an arbitrary bag of optional fields; the detector itself reads only `checks`.
 */
type CheckedDescriptor = { effect: string; checks?: readonly { id: string }[] };

/**
 * Report every check id a descriptor declares more than once, naming the
 * transaction key and the repeated id. Each repeated id is reported once per
 * descriptor; a descriptor with no `checks` contributes nothing. An empty result
 * means every descriptor's own ids are distinct.
 */
function findDuplicateCheckIds(
  descriptors: Record<string, CheckedDescriptor>,
): DuplicateCheckId[] {
  const duplicates: DuplicateCheckId[] = [];
  for (const [key, descriptor] of Object.entries(descriptors)) {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const { id } of descriptor.checks ?? []) {
      if (seen.has(id) && !reported.has(id)) {
        duplicates.push({ key, id });
        reported.add(id);
      }
      seen.add(id);
    }
  }
  return duplicates;
}

describe("per-descriptor check-id uniqueness", () => {
  it("flags a descriptor that repeats a check id, naming the key and id", () => {
    const descriptors = {
      TX_STOCK_ISSUANCE: {
        effect: "append",
        checks: [{ id: "stakeholder-exists" }, { id: "stakeholder-exists" }],
      },
    };
    expect(findDuplicateCheckIds(descriptors)).toEqual([
      { key: "TX_STOCK_ISSUANCE", id: "stakeholder-exists" },
    ]);
  });

  it("returns nothing when ids are distinct within each descriptor, even if shared across descriptors", () => {
    const descriptors = {
      TX_STOCK_ISSUANCE: { effect: "append", checks: [{ id: "stakeholder-exists" }, { id: "quantity-positive" }] },
      // The same id under a different transaction type is not a duplicate.
      TX_WARRANT_ISSUANCE: { effect: "append", checks: [{ id: "stakeholder-exists" }] },
    };
    expect(findDuplicateCheckIds(descriptors)).toEqual([]);
  });

  it("reports no duplicate check ids across the real descriptor table", () => {
    expect(findDuplicateCheckIds(TX_DESCRIPTORS)).toEqual([]);
  });
});
