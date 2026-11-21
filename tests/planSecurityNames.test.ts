import { describe, it, expect } from "vitest";
import constants from "../ocf_validator/constants/constants";
import { lifecycleFamilies, TX_DESCRIPTORS, type TxKey } from "../ocf_validator/ocfMachine";
import { currentName, OLDER_NAMES } from "../ocf_validator/validators/checks";
import { validatePackage } from "./helpers";

// Check that the seven older names share validation and state changes with the corresponding current
// names.

const PAIRS = Object.entries(OLDER_NAMES) as [TxKey, TxKey][];
const VALID = "The validation of the OCF package for Test Co is complete and the package appears valid.";

describe("each plan security type is its equity compensation type under an older name", () => {
  it("covers the seven plan security types and nothing else", () => {
    const planSecurityKeys = (Object.keys(TX_DESCRIPTORS) as TxKey[]).filter((key) => key.startsWith("TX_PLAN_SECURITY_"));
    expect(new Set(Object.keys(OLDER_NAMES))).toEqual(new Set(planSecurityKeys));
    expect(planSecurityKeys).toHaveLength(7);
  });

  it.each(PAIRS)("%s shares %s's validator, checks, collection, and lifecycle word", (olderName, name) => {
    const older = TX_DESCRIPTORS[olderName] as Record<string, unknown>;
    const current = TX_DESCRIPTORS[name] as Record<string, unknown>;

    // Both entries must reuse the same validator and checks.
    expect(older.validate).toBe(current.validate);
    expect(older.checks).toBe(current.checks);
    expect(older.effect).toBe(current.effect);
    expect(older.collection).toBe(current.collection);
    expect(older.lifecycle).toBe(current.lifecycle);
    expect(lifecycleFamilies(TX_DESCRIPTORS[olderName])).toEqual(lifecycleFamilies(TX_DESCRIPTORS[name]));
    // Only the descriptor's transaction name changes.
    expect(older.transaction).toBe(olderName);
    expect(current.transaction).toBe(name);
  });

  it("names a finding's subject by the type the transaction carries", () => {
    const context = validatePackage([
      { id: "psi-1", object_type: "TX_PLAN_SECURITY_ISSUANCE", security_id: "opt-1", stakeholder_id: "nobody", date: "2021-01-01" },
    ]);

    expect(context.findings).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "stakeholder-exists",
        message: "The stakeholder nobody referenced by the transaction was not found in the stakeholder file.",
        subject: { object_type: "TX_PLAN_SECURITY_ISSUANCE", id: "psi-1" },
      },
    ]);
  });

  it("maps only the older names, leaving any other value as it is", () => {
    expect(currentName("TX_PLAN_SECURITY_EXERCISE")).toBe("TX_EQUITY_COMPENSATION_EXERCISE");
    expect(currentName("TX_EQUITY_COMPENSATION_EXERCISE")).toBe("TX_EQUITY_COMPENSATION_EXERCISE");
    expect(currentName("TX_WARRANT_EXERCISE")).toBe("TX_WARRANT_EXERCISE");
    // An inherited JavaScript property is an unknown transaction name.
    expect(currentName("constructor")).toBe("constructor");
    expect(currentName(undefined)).toBeUndefined();
  });
});

describe("a history under the older names runs as the same history under the current ones", () => {
  const grant = (object_type: string) => ({ id: "g-1", object_type, security_id: "opt-1", stakeholder_id: "sh-1", quantity: "100", date: "2021-01-01" });
  const on = (object_type: string, id: string, date: string, fields: Record<string, unknown> = {}) => ({ id, object_type, security_id: "opt-1", date, ...fields });

  it("issues, accepts, exercises, releases, and cancels a grant", () => {
    const transactions = [
      grant("TX_PLAN_SECURITY_ISSUANCE"),
      on("TX_PLAN_SECURITY_ACCEPTANCE", "a-1", "2021-02-01"),
      on("TX_PLAN_SECURITY_EXERCISE", "x-1", "2021-03-01", { quantity: "10", resulting_security_ids: [] }),
      on("TX_PLAN_SECURITY_RELEASE", "r-1", "2021-04-01", { quantity: "10", resulting_security_ids: [] }),
      on("TX_PLAN_SECURITY_CANCELLATION", "c-1", "2021-05-01", { quantity: "80" }),
    ];
    const context = validatePackage(transactions, [{ id: "sh-1" }]);

    // These older acceptance, exercise and release names are allowed before cancellation.
    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
    // Cancellation removes the outstanding grant.
    expect(context.snapshots.map((snapshot) => snapshot.equityCompensation.length)).toEqual([1, 1, 1, 1, 0]);
    expect(context.equityCompensation).toEqual([]);
  });

  it.each([
    ["TX_PLAN_SECURITY_RETRACTION", "TX_EQUITY_COMPENSATION_RETRACTION"],
    ["TX_PLAN_SECURITY_TRANSFER", "TX_EQUITY_COMPENSATION_TRANSFER"],
  ])("removes a grant on a %s, as on a %s", (olderName, name) => {
    for (const removal of [olderName, name]) {
      const context = validatePackage(
        [grant("TX_PLAN_SECURITY_ISSUANCE"), on(removal, "rm-1", "2021-02-01", { resulting_security_ids: [] })],
        [{ id: "sh-1" }],
      );
      expect(context.result).toBe(VALID);
      expect(context.equityCompensation).toEqual([]);
    }
  });

  it("mixes the two sets of names on one security", () => {
    const context = validatePackage(
      [
        grant("TX_PLAN_SECURITY_ISSUANCE"),
        on("TX_EQUITY_COMPENSATION_ACCEPTANCE", "a-1", "2021-02-01"),
        on("TX_PLAN_SECURITY_EXERCISE", "x-1", "2021-03-01", { quantity: "10", resulting_security_ids: [] }),
        on("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1", "2021-05-01", { quantity: "90" }),
      ],
      [{ id: "sh-1" }],
    );

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID);
  });

  it("fails an acceptance of a grant retracted under the older name, by no-retraction", () => {
    // The retraction also removes the grant. Check that no-retraction recognizes the older name
    // independently of issuance-exists.
    const context = validatePackage(
      [grant("TX_EQUITY_COMPENSATION_ISSUANCE"), on("TX_PLAN_SECURITY_RETRACTION", "rt-1", "2021-02-01"), on("TX_EQUITY_COMPENSATION_ACCEPTANCE", "a-1", "2021-03-01")],
      [{ id: "sh-1" }],
    );

    expect(context.findings.map((finding) => [finding.subject.id, finding.check, finding.message])).toEqual([
      ["a-1", "issuance-exists", "The equity compensation issuance referenced by security_id opt-1 (dated 2021-01-01) is not outstanding as of this transaction's date."],
      ["a-1", "no-retraction", "An equity compensation retraction (rt-1) references the transaction's security_id."],
    ]);
  });

  it("fails a retraction of a grant accepted under the older name, by no-acceptance", () => {
    const context = validatePackage(
      [grant("TX_EQUITY_COMPENSATION_ISSUANCE"), on("TX_PLAN_SECURITY_ACCEPTANCE", "a-1", "2021-02-01"), on("TX_EQUITY_COMPENSATION_RETRACTION", "rt-1", "2021-03-01")],
      [{ id: "sh-1" }],
    );

    expect(context.findings.map((finding) => [finding.subject.id, finding.check, finding.message])).toEqual([
      ["rt-1", "no-acceptance", "An equity compensation acceptance (a-1) references the transaction's security_id."],
    ]);
  });

  it("fails a cancellation after a transfer under the older name, by no-other-transactions", () => {
    // Transfers under either name conflict with a later cancellation.
    const context = validatePackage(
      [
        grant("TX_EQUITY_COMPENSATION_ISSUANCE"),
        on("TX_PLAN_SECURITY_TRANSFER", "t-1", "2021-02-01", { resulting_security_ids: [] }),
        on("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1", "2021-03-01", { quantity: "100" }),
      ],
      [{ id: "sh-1" }],
    );

    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([
      ["c-1", "issuance-exists"],
      ["c-1", "no-other-transactions"],
    ]);
  });

  it("fails a second issuance of a security removed under the older name", () => {
    // The earlier-removal check must recognize a cancellation under its older name.
    const context = validatePackage(
      [
        grant("TX_PLAN_SECURITY_ISSUANCE"),
        on("TX_PLAN_SECURITY_CANCELLATION", "c-1", "2021-02-01", { quantity: "100" }),
        { ...grant("TX_PLAN_SECURITY_ISSUANCE"), id: "g-2", date: "2021-03-01" },
      ],
      [{ id: "sh-1" }],
    );

    expect(context.findings.map((finding) => [finding.subject.id, finding.check, finding.message])).toEqual([
      ["g-2", "no-earlier-removal", "The security opt-1 was removed from the cap table by c-1 on 2021-02-01."],
    ]);
  });
});

describe("same-day order still ranks the older names apart from their equivalents", () => {
  // Older names have different same-day sort positions. Record the order because changing only the
  // name can change validation (#232).
  const rank = (type: string) => (constants.transaction_types as readonly string[]).indexOf(type);

  it("puts every older name after every equity compensation type", () => {
    const lastCurrent = Math.max(...PAIRS.map(([, name]) => rank(name)), rank("TX_EQUITY_COMPENSATION_REPRICING"));
    for (const [olderName] of PAIRS) expect(rank(olderName)).toBeGreaterThan(lastCurrent);
  });

  it("orders a same-day exercise and cancellation differently under the two sets of names", () => {
    // The current names put a partial exercise before cancellation of the rest. The older names
    // reverse that order.
    expect(rank("TX_EQUITY_COMPENSATION_EXERCISE")).toBeLessThan(rank("TX_EQUITY_COMPENSATION_CANCELLATION"));
    expect(rank("TX_PLAN_SECURITY_EXERCISE")).toBeGreaterThan(rank("TX_PLAN_SECURITY_CANCELLATION"));
  });
});
