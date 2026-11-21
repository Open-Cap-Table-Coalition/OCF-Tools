import * as path from "path";
import { describe, it, expect, vi } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { POOL_WRITES } from "../ocf_validator/nodes";
import { poolNotExceeded, STOCK_PLAN_CHECKS } from "../ocf_validator/validators/stock_plan/pool";
import type { Finding, Subject } from "../types/finding";
import { validatePackage } from "./helpers";

// Check each changed plan's reserved and drawn shares after the day's transactions. A failure
// belongs to the plan on that date. A blocked comparison identifies the transactions that made the
// totals unreliable.

const subject = (object_type: string, id: string) => ({ object_type, id }) as Subject;
const plan = (id: string) => subject("STOCK_PLAN", id);

// In stockPlanPool, plan A has a grant to a missing stakeholder followed by a valid grant. Plan B
// grants 110 shares against 100 reserved. Plan C grants 100, replaces a cancelled grant with a
// 60-share balance, and returns 40.

const context = ocfValidator(path.resolve(__dirname, "..", "testing_scripts", "stockPlanPool"));

const A_BAD = subject("TX_EQUITY_COMPENSATION_ISSUANCE", "a-bad");
const on = (id: string) => context.findings.filter((finding) => finding.subject.id === id);
const poolRow = (date: string, id: string) => context.snapshots.find((snapshot) => snapshot.date === date)?.stockPlans.find((row) => row.id === id);
const drawnByDay = (id: string) => context.snapshots.map((snapshot) => [snapshot.date, snapshot.stockPlans.find((row) => row.id === id)?.drawn]);

describe("plan A: a grant to an unknown stakeholder, then a valid grant", () => {
  it("fails the bad grant on its own check, as a root error", () => {
    expect(on("a-bad")).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "stakeholder-exists",
        message: "The stakeholder nobody referenced by the transaction was not found in the stakeholder file.",
        subject: A_BAD,
      },
    ]);
  });

  it("runs the valid grant's own checks, which pass: nothing of its is blocked", () => {
    // The failed grant makes the pool total unreliable. The next grant can still check its
    // stakeholder and removal history.
    expect(on("a-good")).toEqual([]);
    expect(context.snapshots.at(-1)?.equityCompensation).toContainEqual({ date: "2022-01-20", custom_id: "A-2", stakeholder: "emily", quantity: "300" });
  });

  it("blocks only the plan's pool check, pointing at the bad grant", () => {
    const blocked = context.findings.filter((finding) => finding.outcome === "blocked");

    // Only plan A's pool comparison is blocked, once for each day its pool changes.
    expect(blocked).toEqual(
      ["2022-01-10", "2022-01-20"].map((date) => ({
        date,
        severity: "error",
        outcome: "blocked",
        check: "pool-not-exceeded",
        message:
          "Not checked: it reads the shares drawn from stock plan plan-a, which can't be relied on because TX_EQUITY_COMPENSATION_ISSUANCE a-bad failed.",
        subject: plan("plan-a"),
        roots: [A_BAD],
      })),
    );
  });

  it("counts the valid grant and not the bad one, and says the number can't be trusted", () => {
    expect(poolRow("2022-01-10", "plan-a")).toEqual({ id: "plan-a", reserved: "1000", drawn: "0", defects: { drawn: [A_BAD] } });
    expect(poolRow("2022-01-20", "plan-a")).toEqual({ id: "plan-a", reserved: "1000", drawn: "300", defects: { drawn: [A_BAD] } });
    // The reserve remains reliable, and the earlier failure still affects drawn shares.
    expect(poolRow("2022-05-01", "plan-a")).toEqual({ id: "plan-a", reserved: "1000", drawn: "300", defects: { drawn: [A_BAD] } });
  });
});

describe("plan B: granted more than it has", () => {
  it("passes while its grants fit", () => {
    expect(poolRow("2022-02-01", "plan-b")).toEqual({ id: "plan-b", reserved: "100", drawn: "80" });
    expect(on("b-1")).toEqual([]);
  });

  it("fails the pool check the day they don't, as a root error of its own with the plan as its subject", () => {
    expect(on("plan-b")).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "pool-not-exceeded",
        message: "As of 2022-02-15, stock plan plan-b has 110 shares drawn against 100 reserved: 10 more than it has.",
        subject: plan("plan-b"),
        date: "2022-02-15",
      },
    ]);
  });

  it("doesn't fail the grant that took it over, or mark anything", () => {
    // Attribute the excess to the plan while attribution to individual transactions remains open
    // (#236).
    expect(on("b-2")).toEqual([]);
    expect(poolRow("2022-02-15", "plan-b")).toEqual({ id: "plan-b", reserved: "100", drawn: "110" });
  });

  it("isn't reported again on the days after, when nothing touches it", () => {
    expect(context.findings.filter((finding) => finding.subject.id === "plan-b")).toHaveLength(1);
  });
});

describe("plan C: a grant under the older name, partly cancelled with a balance grant, then returned", () => {
  it("has nothing wrong with it", () => {
    for (const id of ["c-1", "c-cancel", "c-balance", "c-return", "plan-c"]) expect(on(id)).toEqual([]);
  });

  it("counts the grant issued as a TX_PLAN_SECURITY_ISSUANCE", () => {
    expect(poolRow("2022-02-15", "plan-c")).toEqual({ id: "plan-c", reserved: "500", drawn: "0" });
    expect(poolRow("2022-03-01", "plan-c")).toEqual({ id: "plan-c", reserved: "500", drawn: "100" });
  });

  it("stays unchanged at the cancellation: the balance grant adds nothing, and the cancelled shares aren't back yet", () => {
    expect(poolRow("2022-04-01", "plan-c")).toEqual({ id: "plan-c", reserved: "500", drawn: "100" });
    // The balance grant replaces the original in the snapshot.
    expect(context.snapshots.find((snapshot) => snapshot.date === "2022-04-01")?.equityCompensation).toContainEqual({
      date: "2022-04-01",
      custom_id: "C-1B",
      stakeholder: "omar",
      quantity: "60",
    });
  });

  it("drops only at the return to pool", () => {
    expect(drawnByDay("plan-c")).toEqual([
      ["2022-01-10", "0"],
      ["2022-01-20", "0"],
      ["2022-02-01", "0"],
      ["2022-02-15", "0"],
      ["2022-03-01", "100"],
      ["2022-04-01", "100"],
      ["2022-05-01", "60"],
    ]);
  });
});

describe("the package as a whole", () => {
  it("has two root errors and two blocked checks, and says so in result", () => {
    expect(context.findings.map((finding) => [finding.subject.id, finding.check, finding.outcome])).toEqual([
      ["a-bad", "stakeholder-exists", "failed"],
      ["plan-a", "pool-not-exceeded", "blocked"],
      ["plan-a", "pool-not-exceeded", "blocked"],
      ["plan-b", "pool-not-exceeded", "failed"],
    ]);
    expect(context.result).toBe("The validation of the OCF package for Pool Co is complete and found 2 errors and 2 checks blocked by them.");
  });

  it("takes a snapshot for every day through the last", () => {
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2022-01-10",
      "2022-01-20",
      "2022-02-01",
      "2022-02-15",
      "2022-03-01",
      "2022-04-01",
      "2022-05-01",
    ]);
  });
});

// Daily pool comparison

const PLAN = { id: "plan-1", object_type: "STOCK_PLAN", plan_name: "Plan", initial_shares_reserved: "100" };
const stakeholders = [{ id: "sh-1" }];
const grant = (id: string, quantity: string, date: string, fields: Record<string, unknown> = {}) => ({
  id,
  object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
  security_id: `opt-${id}`,
  stakeholder_id: "sh-1",
  stock_plan_id: "plan-1",
  quantity,
  date,
  ...fields,
});
const adjustment = (id: string, shares_reserved: unknown, date: string) => ({
  id,
  object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  stock_plan_id: "plan-1",
  shares_reserved,
  date,
});
const run = (transactions: Record<string, unknown>[], plans: Record<string, unknown>[] = [PLAN]) =>
  validatePackage(transactions, stakeholders, [], plans);
const poolFindings = (findings: Finding[]) => findings.filter((finding) => finding.check === "pool-not-exceeded");

describe("the pool check", () => {
  it("checks only pools written that day, including the first day", () => {
    const checked = vi.spyOn(poolNotExceeded, "run");
    try {
      run([grant("g-1", "10", "2022-01-01")], [PLAN, { ...PLAN, id: "untouched" }]);
      expect(checked.mock.calls.map(([, data]) => data.id)).toEqual(["plan-1"]);
    } finally {
      checked.mockRestore();
    }
  });

  it("is declared as an error on a stock plan, reading both of the plan's fields", () => {
    expect(STOCK_PLAN_CHECKS).toEqual([
      {
        id: "pool-not-exceeded",
        severity: "error",
        description: "At the end of each day, a stock plan's grants have drawn no more shares than the plan has reserved.",
      },
    ]);
    expect(poolNotExceeded.reads({ object_type: "STOCK_PLAN", id: "plan-1", date: "2022-01-01" })).toEqual([
      { kind: "plan", id: "plan-1", field: "reserved" },
      { kind: "plan", id: "plan-1", field: "drawn" },
    ]);
  });

  it("passes a pool drawn exactly to its reserve, and fails one share over", () => {
    expect(run([grant("g-1", "100", "2022-01-01")]).result).toMatch(/appears valid\.$/);
    expect(poolFindings(run([grant("g-1", "100.0000000001", "2022-01-01")]).findings).map((finding) => finding.message)).toEqual([
      "As of 2022-01-01, stock plan plan-1 has 100.0000000001 shares drawn against 100 reserved: 0.0000000001 more than it has.",
    ]);
  });

  it("judges a day on its net: grants and a return on one day are held against the pool once", () => {
    // The two grants draw 120 shares before a same-day return credits 40.
    const context = run([
      grant("g-1", "60", "2022-01-01"),
      { id: "c-1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "opt-g-1", quantity: "60", reason_text: "Forfeited", date: "2022-02-01" },
      grant("g-2", "60", "2022-02-01"),
      { id: "rtp-1", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "opt-g-1", stock_plan_id: "plan-1", quantity: "40", reason_text: "Forfeited", date: "2022-02-01" },
    ]);

    expect(context.findings).toEqual([]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", reserved: "100", drawn: "80" }]);
  });

  it("reports an excess caused by an RSA and credits its shares on the day of return", () => {
    const context = validatePackage([
      grant("g-1", "80", "2022-01-01"),
      { id: "stock", object_type: "TX_STOCK_ISSUANCE", issuance_type: "RSA", security_id: "rsa", quantity: "40",
        date: "2022-02-01", stock_plan_id: PLAN.id, stakeholder_id: "sh-1", stock_class_id: "common", stock_legend_ids: [] },
      { id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: "rsa", quantity: "40", date: "2022-03-01" },
      { id: "return", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "rsa", stock_plan_id: PLAN.id,
        quantity: "40", date: "2022-04-01", reason_text: "Forfeited" },
    ], stakeholders, [{ id: "common" }], [PLAN]);

    expect(context.snapshots.map((day) => day.stockPlans[0].drawn)).toEqual(["80", "120", "120", "80"]);
    expect(context.findings).toMatchObject([{ check: "pool-not-exceeded", outcome: "failed", date: "2022-02-01", subject: plan(PLAN.id) }]);
  });

  it("reports an over-granted plan on the day it goes over, and again only when something writes to its pool", () => {
    const context = run([
      grant("g-1", "150", "2022-01-01"),
      // This transaction leaves the plan untouched.
      { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2022-02-01" },
      grant("g-2", "10", "2022-03-01"),
    ]);

    expect(poolFindings(context.findings).map((finding) => finding.message)).toEqual([
      "As of 2022-01-01, stock plan plan-1 has 150 shares drawn against 100 reserved: 50 more than it has.",
      "As of 2022-03-01, stock plan plan-1 has 160 shares drawn against 100 reserved: 60 more than it has.",
    ]);
    expect(poolFindings(context.findings).map((finding) => finding.date)).toEqual([
      "2022-01-01", "2022-03-01",
    ]);
  });

  it("passes again once a pool adjustment raises the reserve, or a return brings drawn back under", () => {
    const context = run([grant("g-1", "150", "2022-01-01"), adjustment("adj-1", "200", "2022-02-01"), grant("g-2", "10", "2022-03-01")]);

    expect(poolFindings(context.findings).map((finding) => finding.message)).toEqual([
      "As of 2022-01-01, stock plan plan-1 has 150 shares drawn against 100 reserved: 50 more than it has.",
    ]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error.");
  });

  it("holds each plan against its own reserve", () => {
    const other = { ...PLAN, id: "plan-2", initial_shares_reserved: "50" };
    const context = run([grant("g-1", "60", "2022-01-01"), grant("g-2", "60", "2022-01-01", { stock_plan_id: "plan-2" })], [PLAN, other]);

    expect(poolFindings(context.findings).map((finding) => finding.subject)).toEqual([plan("plan-2")]);
  });

  it("passes over a plan the package doesn't have, whose reserve isn't known", () => {
    // testPackage names a plan missing from the stock plan files. Its reserve is unknown (#234).
    const context = run([grant("g-1", "1000000", "2022-01-01")], []);

    expect(context.findings).toEqual([]);
    expect(context.result).toMatch(/appears valid\.$/);
  });
});

// Unreliable reserve and draw totals

describe("defects on the pool", () => {
  const ADJUSTMENT = subject("TX_STOCK_PLAN_POOL_ADJUSTMENT", "adj-bad");

  it("is declared per pool word: only the write that sets a figure outright clears it", () => {
    expect(POOL_WRITES).toEqual({
      draws: { field: "drawn", write: "adjusts" },
      carries: { field: "drawn", write: "adjusts" },
      carriesStock: { field: "drawn", write: "adjusts" },
      returns: { field: "drawn", write: "adjusts" },
      reserves: { field: "reserved", write: "sets" },
    });
  });

  it("blocks the pool check after a failed pool adjustment, pointing at the adjustment", () => {
    const context = run([grant("g-1", "50", "2022-01-01"), adjustment("adj-bad", "plenty", "2022-02-01")]);

    expect(poolFindings(context.findings)).toEqual([
      {
        severity: "error",
        outcome: "blocked",
        check: "pool-not-exceeded",
        message:
          "Not checked: it reads the shares reserved for stock plan plan-1, which can't be relied on because TX_STOCK_PLAN_POOL_ADJUSTMENT adj-bad failed.",
        subject: plan("plan-1"),
        date: "2022-02-01",
        roots: [ADJUSTMENT],
      },
    ]);
  });

  it("is cleared from reserved by a valid pool adjustment, so the check runs again from there", () => {
    const context = run([
      grant("g-1", "50", "2022-01-01"),
      adjustment("adj-bad", "plenty", "2022-02-01"),
      grant("g-2", "10", "2022-03-01"),
      adjustment("adj-good", "40", "2022-04-01"),
      grant("g-3", "5", "2022-05-01"),
    ]);

    // The bad reserve blocks checks on days with pool changes. A later valid adjustment replaces it.
    // The next check can report the excess directly.
    expect(poolFindings(context.findings).map((finding) => [finding.outcome, finding.message.slice(0, 16)])).toEqual([
      ["blocked", "Not checked: it "],
      ["blocked", "Not checked: it "],
      ["failed", "As of 2022-04-01"],
      ["failed", "As of 2022-05-01"],
    ]);
    expect(context.nodes.plan.get("plan-1")?.reserved).toEqual({
      value: "40",
      writer: subject("TX_STOCK_PLAN_POOL_ADJUSTMENT", "adj-good"),
      defects: [],
    });
    expect(context.snapshots.map((snapshot) => snapshot.stockPlans[0])).toEqual([
      { id: "plan-1", reserved: "100", drawn: "50" },
      { id: "plan-1", reserved: "100", drawn: "50", defects: { reserved: [ADJUSTMENT] } },
      { id: "plan-1", reserved: "100", drawn: "60", defects: { reserved: [ADJUSTMENT] } },
      { id: "plan-1", reserved: "40", drawn: "60" },
      { id: "plan-1", reserved: "40", drawn: "65" },
    ]);
  });

  it("is never cleared from drawn: a valid pool adjustment after a failed grant leaves the check blocked", () => {
    const BAD = subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-bad");
    const context = run([
      grant("g-bad", "50", "2022-01-01", { stakeholder_id: "nobody" }),
      grant("g-1", "10", "2022-02-01"),
      adjustment("adj-1", "500", "2022-03-01"),
    ]);

    // A new reserve cannot resolve the missing contribution of an earlier failed grant to drawn
    // shares.
    const pool = poolFindings(context.findings);
    expect(pool.map((finding) => finding.date)).toEqual([
      "2022-01-01", "2022-02-01", "2022-03-01",
    ]);
    expect(pool.map((finding) => finding.outcome)).toEqual(["blocked", "blocked", "blocked"]);
    for (const finding of pool) expect(finding).toMatchObject({ roots: [BAD] });
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", reserved: "500", drawn: "10", defects: { drawn: [BAD] } }]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error and 3 checks blocked by it.");
  });

  it("carries every root when both fields are marked", () => {
    const BAD = subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-bad");
    const context = run([grant("g-bad", "50", "2022-01-01", { stakeholder_id: "nobody" }), adjustment("adj-bad", "plenty", "2022-02-01")]);

    expect(poolFindings(context.findings).at(-1)).toMatchObject({ outcome: "blocked", roots: [ADJUSTMENT, BAD] });
  });
});
