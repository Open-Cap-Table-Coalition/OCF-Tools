import { describe, it, expect } from "vitest";
import { applyTransaction, emptyNodes, fieldAt, securityAt, securityField, securityRecords, withPlans, type NodeMap } from "../ocf_validator/nodes";
import { TX_DESCRIPTORS, type TxKey } from "../ocf_validator/ocfMachine";
import type { Subject } from "../types/finding";
import { toValidate, type CheckObject } from "../ocf_validator/validators/checkKit";
import { validateOcfPackage } from "../ocf_validator";
import { baseContext, runValidator, validatePackage } from "./helpers";

// Check how transactions change reserved and drawn shares, including failures that affect either
// total.

const subject = (object_type: string, id: string) => ({ object_type, id }) as Subject;

const PLAN = { id: "plan-1", object_type: "STOCK_PLAN", plan_name: "Plan", initial_shares_reserved: "1000" };
const stakeholders = [{ id: "sh-1" }];

const grant = (id: string, security_id: string, quantity: string, fields: Record<string, unknown> = {}) => ({
  id,
  object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
  security_id,
  stakeholder_id: "sh-1",
  stock_plan_id: "plan-1",
  quantity,
  date: "2022-01-01",
  ...fields,
});
const cancellation = (id: string, security_id: string, quantity: string, fields: Record<string, unknown> = {}) => ({
  id,
  object_type: "TX_EQUITY_COMPENSATION_CANCELLATION",
  security_id,
  quantity,
  reason_text: "Forfeited",
  date: "2022-02-01",
  ...fields,
});
const returnToPool = (id: string, security_id: string, quantity: string, fields: Record<string, unknown> = {}) => ({
  id,
  object_type: "TX_STOCK_PLAN_RETURN_TO_POOL",
  security_id,
  stock_plan_id: "plan-1",
  quantity,
  reason_text: "Forfeited",
  date: "2022-03-01",
  ...fields,
});
const adjustment = (id: string, shares_reserved: unknown, fields: Record<string, unknown> = {}) => ({
  id,
  object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  stock_plan_id: "plan-1",
  shares_reserved,
  date: "2022-04-01",
  ...fields,
});

/** Validate this plan with the supplied transactions. */
const run = (transactions: Record<string, unknown>[], plans: Record<string, unknown>[] = [PLAN]) =>
  validatePackage(transactions, stakeholders, [], plans);

/**
 * Check the findings on individual transactions here. stockPlanPool.test.ts checks findings on a
 * plan at the end of a day.
 */
const ofTransactions = (context: ReturnType<typeof run>) => context.findings.filter((finding) => finding.subject.object_type !== "STOCK_PLAN");

/** Compare each snapshot date with the plan's drawn shares. */
const drawnByDay = (context: ReturnType<typeof run>, plan = "plan-1") =>
  context.snapshots.map((snapshot) => [snapshot.date, snapshot.stockPlans.find((row) => row.id === plan)?.drawn]);

/** Exercise the reducer directly with known validation decisions. */
const reduce = (start: NodeMap, ...steps: [Record<string, any>, (readonly Subject[])?][]): NodeMap =>
  steps.reduce(
    (nodes, [transaction, roots]) =>
      applyTransaction(nodes, TX_DESCRIPTORS[transaction.object_type as TxKey], transaction as any, roots ? { ok: false, roots } : { ok: true }),
    start,
  );
const withPlan = () => withPlans(emptyNodes(), [PLAN]);

// Plan records

describe("a stock plan's node", () => {
  it("starts with the plan's initial reserve, written by no transaction, and nothing drawn", () => {
    expect(withPlan().plan.get("plan-1")).toEqual({
      kind: "plan",
      id: "plan-1",
      reserved: { value: "1000", writer: undefined, defects: [] },
      drawn: { value: "0", writer: undefined, defects: [] },
    });
  });

  it("is there from the start of a run for every plan in the package, granted from or not", () => {
    const other = { ...PLAN, id: "plan-2", initial_shares_reserved: "250.5" };
    const context = run([grant("g-1", "opt-1", "100")], [PLAN, other]);

    expect(context.snapshots[0].stockPlans).toEqual([
      { id: "plan-1", reserved: "1000", drawn: "100" },
      { id: "plan-2", reserved: "250.5", drawn: "0" },
    ]);
  });

  it("is created for a plan a transaction names that the package doesn't have, with its reserve not known", () => {
    const context = run([grant("g-1", "opt-1", "100")], []);

    expect(context.findings).toEqual([]);
    expect(context.nodes.plan.get("plan-1")?.reserved).toEqual({ value: undefined, writer: undefined, defects: [] });
    expect(context.snapshots[0].stockPlans).toEqual([{ id: "plan-1", drawn: "100" }]);
  });

  it("has no reserve to start from when the plan's initial_shares_reserved isn't a number", () => {
    const nodes = withPlans(emptyNodes(), [{ ...PLAN, initial_shares_reserved: "lots" }, "not a plan", null]);

    expect([...nodes.plan.keys()]).toEqual(["plan-1"]);
    expect(nodes.plan.get("plan-1")?.reserved.value).toBeUndefined();
  });

  it("is shared with the map before by a transaction that doesn't touch its pool", () => {
    const before = reduce(withPlan(), [grant("g-1", "opt-1", "100")]);
    const after = reduce(before, [{ id: "a-1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "opt-1", date: "2022-01-02" }]);

    expect(after).toBe(before);
    // A grant without a plan leaves the plan map unchanged.
    const planless = reduce(before, [grant("g-2", "opt-2", "100", { stock_plan_id: undefined })]);
    expect(planless.plan).toBe(before.plan);
  });

  it("keeps plans in the order first seen, leaves earlier maps alone, and resumes from a clone", () => {
    const before = reduce(withPlan(), [grant("g-1", "opt-1", "100", { stock_plan_id: "plan-9" })], [grant("g-2", "opt-2", "5")]);
    const resumed = reduce(structuredClone(before), [grant("g-3", "opt-3", "1", { stock_plan_id: "plan-9" })]);

    expect([...resumed.plan.entries()].map(([id, plan]) => [id, plan.drawn.value])).toEqual([["plan-1", "5"], ["plan-9", "101"]]);
    expect(before.plan.get("plan-9")?.drawn.value).toBe("100");
    // Separate runs never share a plan map.
    expect(emptyNodes().plan).not.toBe(emptyNodes().plan);
    // A write that touches no plan keeps the map, even when it is empty.
    const none = emptyNodes();
    expect(reduce(none, [grant("g-4", "opt-4", "1", { stock_plan_id: undefined })]).plan).toBe(none.plan);
  });
});

// Shares drawn

describe("drawn", () => {
  it("counts each grant's quantity once, exactly, with the grant as its last writer", () => {
    const context = run([grant("g-1", "opt-1", "100.25"), grant("g-2", "opt-2", "0.1", { date: "2022-01-02" }), grant("g-3", "opt-3", "0.2", { date: "2022-01-03" })]);

    expect(drawnByDay(context)).toEqual([
      ["2022-01-01", "100.25"],
      ["2022-01-02", "100.35"],
      ["2022-01-03", "100.55"],
    ]);
    expect(context.nodes.plan.get("plan-1")?.drawn).toEqual({
      value: "100.55",
      writer: subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-3"),
      defects: [],
    });
    // Record which plan supplied each grant's shares.
    expect(securityAt(context.nodes, "equityCompensation", "opt-1")?.draw).toEqual({
      value: { plan: "plan-1", quantity: "100.25" },
      writer: subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-1"),
      defects: [],
    });
  });

  it("counts a grant under the older name TX_PLAN_SECURITY_ISSUANCE", () => {
    const context = run([grant("g-1", "opt-1", "100", { object_type: "TX_PLAN_SECURITY_ISSUANCE" })]);

    expect(drawnByDay(context)).toEqual([["2022-01-01", "100"]]);
  });

  it("leaves every pool alone for a grant with no stock_plan_id", () => {
    const context = run([grant("g-1", "opt-1", "100", { stock_plan_id: undefined })]);

    expect(context.snapshots[0].stockPlans).toEqual([{ id: "plan-1", reserved: "1000", drawn: "0" }]);
    expect(context.nodes.security.get("opt-1")).not.toHaveProperty("draw");
  });

  it("doesn't count a security_id a second time when it's issued again", () => {
    // Even an explicit reducer call cannot reassign an issued ID.
    const nodes = reduce(
      withPlan(),
      [grant("g-1", "opt-1", "100")],
      [cancellation("c-1", "opt-1", "100")],
      [grant("g-2", "opt-1", "100", { date: "2022-02-01" })],
    );

    expect(nodes.plan.get("plan-1")?.drawn.value).toBe("100");
  });

  it("stays where it is when a grant is exercised, cancelled, retracted, or transferred", () => {
    const context = run([
      grant("g-1", "opt-1", "100"),
      grant("g-2", "opt-2", "200"),
      grant("g-3", "opt-3", "300"),
      { id: "x-1", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "opt-1", quantity: "40", resulting_security_ids: [], date: "2022-02-01" },
      cancellation("c-1", "opt-1", "60", { date: "2022-02-02" }),
      { id: "r-1", object_type: "TX_EQUITY_COMPENSATION_RETRACTION", security_id: "opt-2", reason_text: "Mistake", date: "2022-02-03" },
      { id: "t-1", object_type: "TX_EQUITY_COMPENSATION_TRANSFER", security_id: "opt-3", quantity: "300", resulting_security_ids: [], date: "2022-02-04" },
    ]);

    expect(context.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(new Set(drawnByDay(context).map(([, drawn]) => drawn))).toEqual(new Set(["600"]));
  });

  it("drops only at a return to pool, by the quantity returned", () => {
    const context = run([grant("g-1", "opt-1", "100"), cancellation("c-1", "opt-1", "100"), returnToPool("rtp-1", "opt-1", "40")]);

    expect(drawnByDay(context)).toEqual([
      ["2022-01-01", "100"],
      ["2022-02-01", "100"],
      ["2022-03-01", "60"],
    ]);
    expect(context.nodes.plan.get("plan-1")?.drawn.writer).toEqual(subject("TX_STOCK_PLAN_RETURN_TO_POOL", "rtp-1"));
  });

  it("drops on the plan the return names, which needn't be the plan the grant came from", () => {
    const successor = { ...PLAN, id: "plan-2" };
    const context = run(
      [grant("g-1", "opt-1", "100"), cancellation("c-1", "opt-1", "100"), returnToPool("rtp-1", "opt-1", "100", { stock_plan_id: "plan-2" })],
      [PLAN, successor],
    );

    // A rollover can send shares to a different plan. The validator can currently produce a negative
    // drawn total there.
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([
      { id: "plan-1", reserved: "1000", drawn: "100" },
      { id: "plan-2", reserved: "1000", drawn: "-100" },
    ]);
  });
});

describe("accounting for returns and replacements", () => {
  const source = grant("source", "option", "100");
  const cancel = cancellation("cancel", "option", "40");
  const successor = { ...PLAN, id: "successor" };

  it("rejects a return larger than the partial cancellation and keeps the full allowance", () => {
    const context = run([source, cancel, returnToPool("excess", "option", "200"), returnToPool("valid", "option", "40", { date: "2022-03-02" })]);
    expect(ofTransactions(context)).toMatchObject([{ check: "quantity-returnable", subject: { id: "excess" }, outcome: "failed" }]);
    expect(drawnByDay(context).map(([, drawn]) => drawn)).toEqual(["100", "100", "100", "60"]);
  });

  it("shares one exact return allowance across dates, destinations, and transaction IDs", () => {
    const context = run([
      source, cancel, returnToPool("first", "option", "39.9999999999", { stock_plan_id: "successor" }),
      returnToPool("excess", "option", "0.0000000002", { date: "2022-03-02" }),
      returnToPool("last", "option", "0.0000000001", { date: "2022-03-03" }),
    ], [PLAN, successor]);
    expect(ofTransactions(context)).toMatchObject([{ check: "quantity-returnable", subject: { id: "excess" } }]);
    expect(context.snapshots.at(-1)?.stockPlans.map((plan) => plan.drawn)).toEqual(["99.9999999999", "-39.9999999999"]);
    expect(securityAt(context.nodes, "equityCompensation", "option")?.returnable?.value).toBe("0");
  });

  it.each([undefined, null, "", "  ", 42])("rejects a return and an adjustment with destination %j", (stock_plan_id) => {
    const context = run([source, cancel, returnToPool("return", "option", "40", { stock_plan_id }), adjustment("adjust", "25", { stock_plan_id })]);
    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([["return", "destination-plan"], ["adjust", "destination-plan"]]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: PLAN.id, reserved: "1000", drawn: "100" }]);
    expect(securityAt(context.nodes, "equityCompensation", "option")?.returnable?.value).toBe("40");
  });

  it.each([
    { stock_plan_id: "other", quantity: "70", date: "2022-02-01" },
    { stock_plan_id: PLAN.id, quantity: "600", date: "2022-02-01" },
    { stock_plan_id: PLAN.id, quantity: "70", date: "2022-01-15" },
    { stock_plan_id: PLAN.id, quantity: "70", date: "2022-03-01" },
  ])("keeps an unrelated grant's original draw (%j)", (fields) => {
    const context = run([grant("source", "option", "80"), grant("unrelated", "other-grant", fields.quantity, fields),
      cancellation("cancel", "option", "10", { balance_security_id: "other-grant" })]);
    expect(context.findings).toMatchObject([{ check: "plan-replacement", outcome: "failed", subject: { id: "cancel" } }]);
    expect(securityAt(context.nodes, "equityCompensation", "other-grant")?.draw).toMatchObject({
      value: { plan: fields.stock_plan_id, quantity: fields.quantity }, defects: [],
    });
    const total = fields.stock_plan_id !== PLAN.id ? "80" : fields.quantity === "600" ? "680" : "150";
    expect(context.nodes.plan.get(PLAN.id)?.drawn).toMatchObject({ value: total, defects: [] });
  });

  it("rejects a duplicate issuance on another plan without changing either draw", () => {
    const context = run([source, { ...source, id: "duplicate", stock_plan_id: successor.id, date: "2022-03-01" }], [PLAN, successor]);
    expect(context.findings).toMatchObject([{ check: "unique-security-id", subject: { id: "duplicate" } }]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([
      { id: PLAN.id, reserved: "1000", drawn: "100" },
      { id: successor.id, reserved: "1000", drawn: "0" },
    ]);
  });

  it("requires the balance quantity left after earlier exercises", () => {
    const exercise = { ...cancel, id: "exercise", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", date: "2022-01-15", quantity: "20", resulting_security_ids: [] };
    const context = run([source, exercise, { ...cancel, balance_security_id: "balance" },
      grant("balance", "balance", "40", { date: cancel.date }), returnToPool("return", "option", "40")]);
    expect(context.findings).toEqual([]);
    expect(context.snapshots.at(-1)?.stockPlans[0].drawn).toBe("60");
  });

  it("does not return shares that were transferred into a new grant", () => {
    const transfer = { ...cancel, object_type: "TX_EQUITY_COMPENSATION_TRANSFER", quantity: "100", resulting_security_ids: ["replacement"] };
    const context = run([source, transfer, grant("new", "replacement", "100", { date: cancel.date }), returnToPool("return", "option", "1")]);
    expect(ofTransactions(context)).toMatchObject([{ check: "quantity-returnable", outcome: "failed" }]);
    expect(context.snapshots.at(-1)?.stockPlans[0].drawn).toBe("100");
  });

  it("clears reserve failures on an absolute write and retains drawn failures", () => {
    const context = run([grant("bad", "bad", "x"), adjustment("bad-reserve", "-1"), adjustment("new-reserve", "200", { date: "2022-04-02" })]);
    expect(context.snapshots.at(-1)?.stockPlans[0]).toEqual({
      id: PLAN.id, reserved: "200", drawn: "0", defects: { drawn: [subject("TX_EQUITY_COMPENSATION_ISSUANCE", "bad")] },
    });
  });
});

// Balance and resulting grants

describe("a grant another transaction names as its balance or resulting security", () => {
  const partial = cancellation("c-1", "opt-1", "40", { balance_security_id: "opt-1-balance" });
  const balance = grant("g-balance", "opt-1-balance", "60", { date: "2022-02-01" });
  const CANCELLATION = subject("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1");

  it("adds nothing: a partial cancellation and its balance grant leave drawn where it was", () => {
    const context = run([grant("g-1", "opt-1", "100"), partial, balance]);

    expect(context.findings).toEqual([]);
    expect(drawnByDay(context)).toEqual([
      ["2022-01-01", "100"],
      ["2022-02-01", "100"],
    ]);
  });

  it("gives back what it drew when it's issued before the transaction that names it", () => {
    // The balance issuance runs before the same-day cancellation. Reverse its separate charge when
    // the cancellation names it.
    const drew = reduce(withPlan(), [grant("g-1", "opt-1", "100")], [balance]);
    expect(drew.plan.get("plan-1")?.drawn.value).toBe("160");

    const named = reduce(drew, [partial]);
    expect(named.plan.get("plan-1")?.drawn).toEqual({ value: "100", writer: CANCELLATION, defects: [] });
    expect(named.security.get("opt-1-balance")).toMatchObject({
      provenance: { value: CANCELLATION, writer: CANCELLATION, defects: [] },
      draw: { value: { plan: "plan-1", quantity: "0" }, writer: CANCELLATION, defects: [] },
    });
  });

  it("draws nothing when the transaction that names it comes first, and ends in the same place", () => {
    // Apply the source first to exercise the reducer with an issuance still to come.
    const named = reduce(withPlan(), [grant("g-1", "opt-1", "100")], [partial]);
    expect(named.security.get("opt-1-balance")).toEqual({
      kind: "security",
      id: "opt-1-balance",
      family: "equityCompensation",
      lifecycle: { value: undefined, writer: undefined, defects: [] },
      issuance: { value: undefined, writer: undefined, defects: [] },
      provenance: { value: CANCELLATION, writer: CANCELLATION, defects: [] },
    });
    expect(named.plan.get("plan-1")?.drawn.value).toBe("100");

    const issued = reduce(named, [balance]);
    expect(issued.plan.get("plan-1")?.drawn.value).toBe("100");
    expect(issued.security.get("opt-1-balance")).toMatchObject({
      lifecycle: { value: "outstanding" },
      issuance: { value: balance },
      provenance: { value: CANCELLATION },
    });
    expect(issued.security.get("opt-1-balance")).not.toHaveProperty("draw");
  });

  it("isn't outstanding, or shown, while it has been named and not yet issued", () => {
    // Both transaction names use the same priority in the public validator.
    const context = run([grant("g-1", "opt-1", "100"), partial, { ...balance, object_type: "TX_PLAN_SECURITY_ISSUANCE", custom_id: "BAL" }]);

    expect(context.findings).toEqual([]);
    expect(drawnByDay(context)).toEqual([
      ["2022-01-01", "100"],
      ["2022-02-01", "100"],
    ]);
    expect(context.snapshots.at(-1)?.equityCompensation).toEqual([{ date: "2022-02-01", custom_id: "BAL", stakeholder: "sh-1", quantity: "60" }]);
  });

  it("adds nothing as the resulting or balance grant of a transfer", () => {
    const transfer = {
      id: "t-1",
      object_type: "TX_EQUITY_COMPENSATION_TRANSFER",
      security_id: "opt-1",
      quantity: "70",
      resulting_security_ids: ["opt-new-a", "opt-new-b"],
      balance_security_id: "opt-1-balance",
      date: "2022-02-01",
    };
    const context = run([
      grant("g-1", "opt-1", "100"),
      transfer,
      grant("g-a", "opt-new-a", "50", { date: "2022-02-01" }),
      grant("g-b", "opt-new-b", "20", { date: "2022-02-01" }),
      grant("g-balance", "opt-1-balance", "30", { date: "2022-02-01" }),
    ]);

    expect(context.findings).toEqual([]);
    expect(drawnByDay(context)).toEqual([
      ["2022-01-01", "100"],
      ["2022-02-01", "100"],
    ]);
  });

  it("still counts when it's a grant of its own that nothing names", () => {
    const context = run([grant("g-1", "opt-1", "100"), cancellation("c-1", "opt-1", "40"), grant("g-2", "opt-2", "60", { date: "2022-02-01" })]);

    expect(drawnByDay(context).at(-1)).toEqual(["2022-02-01", "160"]);
  });

  // An exercise of more than the grant holds fails, so the later partial cancellation is blocked.
  const overdrawn = { id: "bad", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "opt-1", quantity: "101",
    resulting_security_ids: [], date: "2022-01-15" };
  const OVERDRAWN = subject(overdrawn.object_type, overdrawn.id);
  const TWO_PLANS = [PLAN, { ...PLAN, id: "plan-2" }];

  it.each([
    { plan: "plan-2", date: "2022-03-01", drawn: "60" },
    { plan: "plan-1", date: "2022-03-01", drawn: "160" },
  ])("draws on its own when a blocked cancellation named its ID for another plan or date (%j)", ({ plan, date, drawn }) => {
    const context = run([
      grant("g-1", "opt-1", "100"), overdrawn, partial,
      grant("g-other", "opt-1-balance", "60", { stock_plan_id: plan, date }),
    ], TWO_PLANS);

    expect(context.findings.find((finding) => finding.subject.id === "c-1")).toMatchObject({ outcome: "blocked", roots: [OVERDRAWN] });
    expect(context.findings.filter((finding) => finding.subject.id === "g-other")).toEqual([]);
    expect(context.nodes.plan.get(plan)?.drawn).toMatchObject({ value: drawn, defects: [] });
    const issued = securityAt(context.nodes, "equityCompensation", "opt-1-balance");
    expect(issued).toMatchObject({ provenance: { defects: [] }, draw: { value: { plan, quantity: "60" }, defects: [] } });
    expect(issued).not.toHaveProperty("pendingCarries");
  });

  it("keeps a failed source's roots on a later issuance with the plan and date the source expected", () => {
    const nodes = reduce(withPlan(), [grant("g-1", "opt-1", "100")], [partial, [OVERDRAWN]], [balance]);

    expect(nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "100", defects: [OVERDRAWN] });
    expect(nodes.security.get("opt-1-balance")).toMatchObject({ provenance: { defects: [OVERDRAWN] }, draw: { defects: [OVERDRAWN] } });
  });

  it("keeps failures recorded without a plan or date when a second failed source names the grant", () => {
    const named = reduce(withPlans(emptyNodes(), TWO_PLANS), [grant("g-1", "opt-1", "100")], [grant("g-2", "opt-2", "100", { stock_plan_id: "plan-2" })], [partial, [OVERDRAWN]]);
    // A saved record can hold failures with no note of what their source expected.
    const { pendingCarries: _dropped, ...unrecorded } = securityAt(named, "equityCompensation", "opt-1-balance")!;
    const saved: NodeMap = { security: new Map(named.security).set(unrecorded.id, unrecorded), plan: named.plan };
    const other = subject("TX_EQUITY_COMPENSATION_CANCELLATION", "c-2");
    const nodes = reduce(saved,
      [cancellation("c-2", "opt-2", "40", { balance_security_id: "opt-1-balance", date: "2022-03-01" }), [other]],
      [balance],
    );

    expect(nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "100", defects: [OVERDRAWN] });
  });

  it("leaves a later grant alone when the failed source is known to have no plan", () => {
    const nodes = reduce(withPlan(), [grant("g-1", "opt-1", "100", { stock_plan_id: undefined })], [partial, [OVERDRAWN]], [balance]);

    expect(nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "60", defects: [] });
    expect(nodes.security.get("opt-1-balance")).not.toHaveProperty("provenance");
  });

  it("checks a cancellation whose balance ID another plan's blocked cancellation also named", () => {
    const context = run([
      grant("g-1", "opt-1", "100"), grant("g-2", "opt-2", "100", { stock_plan_id: "plan-2" }), overdrawn, partial,
      grant("g-balance-2", "opt-1-balance", "60", { stock_plan_id: "plan-2", date: "2022-03-01" }),
      cancellation("c-2", "opt-2", "40", { balance_security_id: "opt-1-balance", date: "2022-03-01" }),
    ], TWO_PLANS);

    expect(context.findings.filter((finding) => finding.subject.id === "c-2")).toEqual([]);
    expect(context.nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [] });
  });

  it.each(["TX_EQUITY_COMPENSATION_RETRACTION", "TX_PLAN_SECURITY_CANCELLATION"])("carries the charge to a balance grant that %s removed the same day", (type) => {
    // The balance's removal runs before the cancellation that names it.
    const remove = { id: "remove", object_type: type, security_id: "opt-1-balance", quantity: "60", reason_text: "Mistake", date: "2022-02-01" };
    const context = run([grant("g-1", "opt-1", "100"), balance, remove, partial, returnToPool("rtp-1", "opt-1-balance", "60")]);

    expect(context.findings).toEqual([]);
    expect(drawnByDay(context)).toEqual([["2022-01-01", "100"], ["2022-02-01", "100"], ["2022-03-01", "40"]]);
    expect(securityAt(context.nodes, "equityCompensation", "opt-1-balance")).toMatchObject({
      lifecycle: { value: "removed", writer: subject(type, "remove") },
      provenance: { value: CANCELLATION },
      draw: { value: { quantity: "0" } },
    });
  });

  it("stays out of snapshots when a failed transaction acts on it before any issuance", () => {
    const acceptance = { id: "a-1", object_type: "TX_EQUITY_COMPENSATION_ACCEPTANCE", security_id: "opt-1-balance", date: "2022-02-02" };
    const context = run([grant("g-1", "opt-1", "100"), overdrawn, partial, acceptance]);

    expect(context.findings.filter((finding) => finding.subject.id === "a-1")).toMatchObject([{ check: "issuance-exists", outcome: "failed" }]);
    expect(context.snapshots.at(-1)?.equityCompensation).toHaveLength(1);
    expect(securityAt(context.nodes, "equityCompensation", "opt-1-balance")?.lifecycle).toEqual({ value: undefined, writer: undefined, defects: [] });
  });
});

// Reserved shares

describe("reserved", () => {
  it("is set by a pool adjustment, which becomes its writer and leaves drawn alone", () => {
    const context = run([grant("g-1", "opt-1", "100"), adjustment("adj-1", "5000")]);

    expect(context.findings).toEqual([]);
    expect(context.snapshots.map((snapshot) => snapshot.stockPlans)).toEqual([
      [{ id: "plan-1", reserved: "1000", drawn: "100" }],
      [{ id: "plan-1", reserved: "5000", drawn: "100" }],
    ]);
    expect(context.nodes.plan.get("plan-1")?.reserved).toEqual({
      value: "5000",
      writer: subject("TX_STOCK_PLAN_POOL_ADJUSTMENT", "adj-1"),
      defects: [],
    });
  });

  it("becomes known for a plan the package doesn't have, once an adjustment sets it", () => {
    const context = run([grant("g-1", "opt-1", "100"), adjustment("adj-1", "5000")], []);

    expect(context.snapshots.map((snapshot) => snapshot.stockPlans)).toEqual([
      [{ id: "plan-1", drawn: "100" }],
      [{ id: "plan-1", reserved: "5000", drawn: "100" }],
    ]);
  });
});

// Failed plan changes

describe("a failed transaction's writes to the pool", () => {
  it.each(["TX_EQUITY_COMPENSATION_EXERCISE", "TX_PLAN_SECURITY_RELEASE"])("preserves the remaining quantity and failure roots after a failed %s", (type) => {
    const prior = { id: "prior", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "option", quantity: "25",
      resulting_security_ids: [], date: "2022-01-15" };
    const bad = { ...prior, id: "bad", object_type: type, quantity: "90", date: "2022-01-20" };
    const root = subject(type, "bad");
    const context = run([
      grant("issue", "option", "100"), prior, bad,
      grant("balance", "balance", "5", { date: "2022-02-01" }),
      cancellation("later", "option", "80", { balance_security_id: "balance" }),
    ]);

    expect(context.findings.filter((finding) => finding.outcome === "failed")).toMatchObject([
      { subject: root, check: "plan-source-quantity" },
    ]);
    const later = context.findings.filter((finding) => finding.subject.id === "later");
    for (const check of ["plan-source-quantity", "plan-replacement"]) {
      expect(later.find((finding) => finding.check === check)).toMatchObject({ outcome: "blocked", roots: [root] });
    }
    expect(securityAt(context.nodes, "equityCompensation", "option")).toMatchObject({
      remaining: { value: "75", writer: subject(prior.object_type, prior.id), defects: [root] },
      lifecycle: { value: "outstanding", defects: [root] },
    });
  });

  it("withholds a return from a marked security, including a return to another plan", () => {
    const bad = grant("g-bad", "opt-1", "100", { stakeholder_id: "nobody" });
    const BAD = subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-bad");
    const context = run([
      bad,
      cancellation("c-1", "opt-1", "100"),
      returnToPool("rtp-1", "opt-1", "100", { stock_plan_id: "plan-2" }),
    ], [PLAN, { ...PLAN, id: "plan-2" }]);

    expect(context.findings.find((finding) => finding.subject.id === "rtp-1")).toMatchObject({
      check: "security-removed", outcome: "blocked", roots: [BAD],
    });
    expect(context.nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "0", defects: [BAD] });
    expect(context.snapshots).toHaveLength(3);
  });

  it("rejects a return from an outstanding grant instead of crediting the pool", () => {
    const context = run([grant("g-1", "opt-1", "100"), returnToPool("rtp-1", "opt-1", "40")]);
    expect(context.findings.find((finding) => finding.subject.id === "rtp-1")).toMatchObject({
      check: "security-removed", outcome: "failed",
    });
    expect(context.nodes.plan.get("plan-1")?.drawn).toMatchObject({
      value: "100", defects: [subject("TX_STOCK_PLAN_RETURN_TO_POOL", "rtp-1")],
    });
  });

  it("accepts a same-day return after a cancellation under the older name", () => {
    const context = run([
      grant("g-1", "opt-1", "100"),
      cancellation("c-1", "opt-1", "100", { object_type: "TX_PLAN_SECURITY_CANCELLATION" }),
      returnToPool("rtp-1", "opt-1", "40", { date: "2022-02-01" }),
    ]);
    expect(context.findings).toEqual([]);
    expect(context.nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "60", defects: [] });
  });

  it("are withheld and marked for a grant to an unknown stakeholder, and a later valid grant still counts", () => {
    const bad = grant("g-bad", "opt-1", "200", { stakeholder_id: "nobody" });
    const context = run([bad, grant("g-good", "opt-2", "300", { date: "2022-01-02" })]);
    const BAD = subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-bad");

    expect(ofTransactions(context).map((finding) => [finding.subject.id, finding.check, finding.outcome])).toEqual([["g-bad", "stakeholder-exists", "failed"]]);
    expect(context.snapshots.map((snapshot) => snapshot.stockPlans)).toEqual([
      [{ id: "plan-1", reserved: "1000", drawn: "0", defects: { drawn: [BAD] } }],
      [{ id: "plan-1", reserved: "1000", drawn: "300", defects: { drawn: [BAD] } }],
    ]);
    // The valid grant updates drawn shares, but the earlier failure still affects the total.
    expect(context.nodes.plan.get("plan-1")?.drawn).toEqual({
      value: "300",
      writer: subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-good"),
      defects: [BAD],
    });
    // The reserve remains reliable.
    expect(context.nodes.plan.get("plan-1")?.reserved.defects).toEqual([]);
    expect(securityAt(context.nodes, "equityCompensation", "opt-1")?.draw).toEqual({ value: undefined, writer: undefined, defects: [BAD] });
  });

  it("are withheld for a grant from a plan whose quantity can't be counted", () => {
    const context = run([grant("g-1", "opt-1", "one hundred")]);

    expect(ofTransactions(context)).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "quantity-countable",
        message: "The transaction's quantity (one hundred) is not a number written the way OCF writes one.",
        subject: subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-1"),
      },
    ]);
    expect(context.snapshots[0].stockPlans).toEqual([
      { id: "plan-1", reserved: "1000", drawn: "0", defects: { drawn: [subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-1")] } },
    ]);
  });

  it("leave a grant from no plan alone, whatever its quantity", () => {
    const context = run([grant("g-1", "opt-1", "one hundred", { stock_plan_id: undefined }), grant("g-2", "opt-2", undefined as any, { stock_plan_id: undefined, date: "2022-01-02" })]);

    expect(context.findings).toEqual([]);
  });

  it.each([
    { quantity: "forty", message: "The transaction's quantity (forty) is not a number written the way OCF writes one." },
    { quantity: "-40", message: "The transaction's quantity (-40) is negative." },
    { quantity: undefined, message: "The transaction's quantity (undefined) is not a number written the way OCF writes one." },
  ])("are withheld and marked for a return to pool of $quantity, which leaves the security alone", ({ quantity, message }) => {
    const context = run([grant("g-1", "opt-1", "100"), cancellation("c-1", "opt-1", "100"), returnToPool("rtp-1", "opt-1", quantity as any)]);
    const RETURN = subject("TX_STOCK_PLAN_RETURN_TO_POOL", "rtp-1");

    expect(ofTransactions(context).map((finding) => [finding.check, finding.message])).toEqual([["quantity-countable", message]]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", reserved: "1000", drawn: "100", defects: { drawn: [RETURN] } }]);
    expect(context.nodes.security.get("opt-1")?.lifecycle.defects).toEqual([]);
  });

  it("are withheld and marked for a pool adjustment whose shares_reserved can't be counted", () => {
    const context = run([grant("g-1", "opt-1", "100"), adjustment("adj-1", "plenty")]);
    const ADJUSTMENT = subject("TX_STOCK_PLAN_POOL_ADJUSTMENT", "adj-1");

    expect(ofTransactions(context).map((finding) => [finding.check, finding.message])).toEqual([
      ["shares-reserved-countable", "The transaction's shares_reserved (plenty) is not a number written the way OCF writes one."],
    ]);
    // Retain the initial reserve and mark it unreliable. Drawn shares stay reliable.
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", reserved: "1000", drawn: "100", defects: { reserved: [ADJUSTMENT] } }]);
    expect(context.nodes.plan.get("plan-1")?.reserved).toEqual({ value: "1000", writer: undefined, defects: [ADJUSTMENT] });
  });

  it("mark the pool when a cancellation that fails names a balance grant that had drawn", () => {
    // Cancellation of the missing grant fails. Its balance grant already drew 60 shares, so the
    // failure makes that charge uncertain.
    const partial = cancellation("c-1", "opt-missing", "40", { balance_security_id: "opt-balance" });
    const context = run([grant("g-balance", "opt-balance", "60", { date: "2022-02-01" }), partial]);
    const CANCELLATION = subject("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1");

    expect(ofTransactions(context).map((finding) => [finding.subject.id, finding.check])).toEqual([["c-1", "issuance-exists"]]);
    expect(context.snapshots[0].stockPlans).toEqual([{ id: "plan-1", reserved: "1000", drawn: "60", defects: { drawn: [CANCELLATION] } }]);
    expect(context.nodes.security.get("opt-balance")).toMatchObject({
      provenance: { value: undefined, defects: [CANCELLATION] },
      draw: { value: { plan: "plan-1", quantity: "60" }, defects: [CANCELLATION] },
    });
  });

  it("leave whether a grant draws in doubt when the transaction that named it first had failed", () => {
    // The failed cancellation named the balance before issuance. Record that failure on the draw
    // because the validator cannot establish whether to charge the plan.
    const CANCELLATION = subject("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1");
    const partial = cancellation("c-1", "opt-1", "40", { balance_security_id: "opt-balance" });
    const nodes = reduce(withPlan(), [grant("g-1", "opt-1", "100")], [partial, [CANCELLATION]], [grant("g-balance", "opt-balance", "60", { date: "2022-02-01" })]);

    expect(nodes.plan.get("plan-1")?.drawn).toEqual({
      value: "100",
      writer: subject("TX_EQUITY_COMPENSATION_ISSUANCE", "g-1"),
      defects: [CANCELLATION],
    });
    // The balance grant itself remains outstanding.
    expect(nodes.security.get("opt-balance")).toMatchObject({ lifecycle: { value: "outstanding", defects: [] }, draw: { value: undefined, defects: [CANCELLATION] } });
  });
});

describe("stock issued from a plan", () => {
  const stock = {
    id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "sh-1",
    stock_class_id: "common", stock_plan_id: "plan-1", quantity: "50", stock_legend_ids: [], date: "2022-02-01",
  };
  const runStock = (transactions: Record<string, unknown>[]) => validatePackage(transactions, stakeholders, [{ id: "common" }], [PLAN]);

  it.each(["not a quantity", "-1"])("rejects a plan stock draw of %s before updating the pool", (quantity) => {
    const context = runStock([{ ...stock, quantity }]);
    expect(context.report.at(-1)).toMatchObject({ transaction_id: stock.id, plan_quantity_validity: false });
    expect(context.nodes.plan.get(PLAN.id)?.drawn.value).toBe("0");
  });

  it.each([
    { type: "TX_EQUITY_COMPENSATION_EXERCISE", issued: "2022-02-01" },
    { type: "TX_PLAN_SECURITY_RELEASE", issued: "2022-02-15" },
  ])("carries the original grant's charge to the stock resulting from $type", ({ type, issued }) => {
    const context = runStock([
      grant("g-1", "option", "100"),
      { ...stock, date: issued },
      { id: "deliver", object_type: type, security_id: "option", quantity: "50", date: "2022-02-01",
        settlement_date: issued, resulting_security_ids: ["stock-1"] },
    ]);
    expect(context.result).toMatch(/appears valid\.$/);
    expect(context.snapshots.map((s) => s.stockPlans[0].drawn)).toEqual(context.snapshots.map(() => "100"));
  });

  it.each([
    { date: "2022-02-10", quantity: "50" },
    { date: "2022-02-15", quantity: "500" },
  ])("preserves the draw of mismatched settlement stock (%j)", (fields) => {
    const context = runStock([
      grant("g-1", "option", "100"), { ...stock, ...fields },
      { id: "release", object_type: "TX_PLAN_SECURITY_RELEASE", security_id: "option", quantity: "50", date: "2022-02-01",
        settlement_date: "2022-02-15", resulting_security_ids: [stock.security_id] },
    ]);
    expect(context.findings).toMatchObject([{ check: "plan-replacement", outcome: "failed" }]);
    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)?.draw).toMatchObject({ value: { quantity: fields.quantity }, defects: [] });
  });

  it.each([
    { plan: "plan-2", date: "2022-02-15", drawn: "40", defects: false },
    { plan: "plan-1", date: "2022-02-16", drawn: "140", defects: false },
    { plan: "plan-1", date: "2022-02-15", drawn: "100", defects: true },
  ])("limits a blocked release's pending defect to matching settlement stock (%j)", ({ plan, date, drawn, defects }) => {
    const bad = { id: "bad", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "option",
      quantity: "101", date: "2022-01-15", resulting_security_ids: [] };
    const release = { id: "release", object_type: "TX_PLAN_SECURITY_RELEASE", security_id: "option",
      quantity: "40", date: "2022-02-01", settlement_date: "2022-02-15", resulting_security_ids: [stock.security_id] };
    const root = subject(bad.object_type, bad.id);
    const context = validatePackage([
      grant("g-1", "option", "100"), bad, release,
      { ...stock, stock_plan_id: plan, date, quantity: "40" },
    ], stakeholders, [{ id: "common" }], [PLAN, { ...PLAN, id: "plan-2" }]);

    expect(context.findings).toContainEqual(expect.objectContaining({
      subject: subject(release.object_type, release.id), check: "plan-source-quantity", outcome: "blocked", roots: [root],
    }));
    expect(context.nodes.plan.get(plan)?.drawn).toMatchObject({ value: drawn, defects: defects ? [root] : [] });
    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)?.carry?.defects).toEqual(defects ? [root] : []);
  });

  it("keeps the roots of separate pending stock references with their own plans", () => {
    const rootA = subject("TX_PLAN_SECURITY_RELEASE", "release-a");
    const rootB = subject("TX_PLAN_SECURITY_RELEASE", "release-b");
    const release = { object_type: "TX_PLAN_SECURITY_RELEASE", quantity: "40", date: "2022-02-01",
      settlement_date: "2022-02-15", resulting_security_ids: [stock.security_id] };
    const nodes = reduce(withPlans(emptyNodes(), [PLAN, { ...PLAN, id: "plan-2" }]),
      [grant("a", "option-a", "100")],
      [grant("b", "option-b", "100", { stock_plan_id: "plan-2" })],
      [{ ...release, id: "release-a", security_id: "option-a" }, [rootA]],
      [{ ...release, id: "release-b", security_id: "option-b" }, [rootB]],
      [{ ...stock, stock_plan_id: "plan-2", date: "2022-02-15", quantity: "40" }],
    );

    expect(nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [rootB] });
    expect(securityAt(nodes, "stockIssuances", stock.security_id)?.carry?.defects).toEqual([rootB]);
  });

  it("keeps a pending defect when the source plan is unknown and the settlement date matches", () => {
    const root = subject("TX_PLAN_SECURITY_RELEASE", "release");
    const release = { id: "release", object_type: "TX_PLAN_SECURITY_RELEASE", security_id: "missing",
      quantity: "40", date: "2022-02-01", settlement_date: "2022-02-15", resulting_security_ids: [stock.security_id] };
    const nodes = reduce(withPlan(), [release, [root]], [{ ...stock, date: "2022-02-15", quantity: "40" }]);

    expect(nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "0", defects: [root] });
  });

  it("recognizes a successful carry after an unrelated failed reference", () => {
    const root = subject("TX_PLAN_SECURITY_RELEASE", "release-a");
    const release = { object_type: "TX_PLAN_SECURITY_RELEASE", quantity: "40", date: "2022-02-01",
      settlement_date: "2022-02-15", resulting_security_ids: [stock.security_id] };
    const nodes = reduce(withPlans(emptyNodes(), [PLAN, { ...PLAN, id: "plan-2" }]),
      [grant("a", "option-a", "100")],
      [grant("b", "option-b", "100", { stock_plan_id: "plan-2" })],
      [{ ...release, id: "release-a", security_id: "option-a" }, [root]],
      [{ ...release, id: "release-b", security_id: "option-b" }],
      [{ ...stock, stock_plan_id: "plan-2", date: "2022-02-15", quantity: "40" }],
    );

    expect(nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [] });
    expect(securityAt(nodes, "stockIssuances", stock.security_id)?.carry?.defects).toEqual([]);
  });

  // Releases from two grants name the same stock. The first is blocked by an earlier failed exercise.
  const overdrawn = { id: "bad", object_type: "TX_EQUITY_COMPENSATION_EXERCISE", security_id: "option-a", quantity: "101",
    date: "2022-01-15", resulting_security_ids: [] };
  const OVERDRAWN = subject(overdrawn.object_type, overdrawn.id);
  const releaseOf = (id: string, security_id: string, date: string, settlement_date: string) => ({
    id, object_type: "TX_PLAN_SECURITY_RELEASE", security_id, quantity: "40", date, settlement_date, resulting_security_ids: [stock.security_id],
  });
  const blockedRelease = releaseOf("release-a", "option-a", "2022-02-01", "2022-02-15");
  const runTwoPlans = (transactions: Record<string, unknown>[]) =>
    validatePackage(transactions, stakeholders, [{ id: "common" }], [PLAN, { ...PLAN, id: "plan-2" }]);

  it.each(["2022-02-15", "2022-02-16"])("checks a release whose settlement stock another plan's blocked release also named (settles %s)", (settles) => {
    const context = runTwoPlans([
      grant("a", "option-a", "100"), grant("b", "option-b", "100", { stock_plan_id: "plan-2" }), overdrawn, blockedRelease,
      releaseOf("release-b", "option-b", "2022-02-02", settles),
      { ...stock, stock_plan_id: "plan-2", date: settles, quantity: "40" },
    ]);

    expect(context.findings.filter((finding) => finding.subject.id === "release-b")).toEqual([]);
    expect(context.nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [] });
    expect(securityAt(context.nodes, "equityCompensation", "option-b")?.remaining).toMatchObject({ value: "60", defects: [] });
    const settled = securityAt(context.nodes, "stockIssuances", stock.security_id);
    expect(settled?.carry).toMatchObject({ value: { plan: "plan-2", date: settles }, defects: [] });
    expect(settled).not.toHaveProperty("pendingCarries");
  });

  it("still blocks a release that could share its settlement stock with a blocked release", () => {
    const context = runTwoPlans([
      grant("a", "option-a", "100"), grant("b", "option-b", "100"), overdrawn, blockedRelease,
      releaseOf("release-b", "option-b", "2022-02-02", "2022-02-15"),
      { ...stock, date: "2022-02-15", quantity: "40" },
    ]);

    expect(context.findings.filter((finding) => finding.subject.id === "release-b")).toMatchObject([
      { check: "plan-replacement", outcome: "blocked", roots: [OVERDRAWN] },
    ]);
    expect(context.nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "200", defects: [OVERDRAWN] });
  });

  it.each([
    { when: "before the stock is issued", date: "2022-02-02", settles: "2022-02-15" },
    { when: "before the stock is issued, for another date", date: "2022-02-02", settles: "2022-02-16" },
    { when: "on the day the stock is issued", date: "2022-02-15", settles: "2022-02-15" },
  ])("carries to stock a valid release from another plan also named, $when", ({ date, settles }) => {
    // The first release is valid here. Its grant's plan differs from the stock's, so it carries nothing.
    const context = runTwoPlans([
      grant("a", "option-a", "100"), grant("b", "option-b", "100", { stock_plan_id: "plan-2" }), blockedRelease,
      releaseOf("release-b", "option-b", date, settles),
      { ...stock, stock_plan_id: "plan-2", date: settles, quantity: "40" },
    ]);

    expect(context.findings).toEqual([]);
    expect(context.nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [] });
    const settled = securityAt(context.nodes, "stockIssuances", stock.security_id);
    expect(settled?.carry).toEqual({ value: { plan: "plan-2", date: settles }, writer: subject("TX_PLAN_SECURITY_RELEASE", "release-b"), defects: [] });
    expect(settled).not.toHaveProperty("pendingCarries");
  });

  it("still rejects a second release from the same plan and date for stock already named", () => {
    const context = runTwoPlans([
      grant("a", "option-a", "100"), grant("b", "option-b", "100"), blockedRelease,
      releaseOf("release-b", "option-b", "2022-02-02", "2022-02-15"),
      { ...stock, date: "2022-02-15", quantity: "40" },
    ]);

    expect(context.findings).toMatchObject([{ subject: { id: "release-b" }, check: "plan-replacement", outcome: "failed" }]);
    expect(context.nodes.plan.get("plan-1")?.drawn.value).toBe("200");
  });

  it.each([
    { second: "a blocked release from the same plan", source: "option-b", first: [] as string[] },
    { second: "a release from a missing grant", source: "missing", first: [] as string[] },
    { second: "a blocked release, with another plan's release named first", source: "option-b", first: ["option-c"] },
  ])("keeps a draw reliable when $second names stock a valid release already holds", ({ source, first }) => {
    // The valid release expected this issuance and ran first, so a later failure cannot have held the stock.
    const failed = subject("TX_PLAN_SECURITY_RELEASE", "release-late");
    const nodes = reduce(withPlans(emptyNodes(), [PLAN, { ...PLAN, id: "plan-2" }]),
      [grant("a", "option-a", "100")], [grant("b", "option-b", "100")], [grant("c", "option-c", "100", { stock_plan_id: "plan-2" })],
      ...first.map((id): [Record<string, any>] => [releaseOf("release-first", id, "2022-02-01", "2022-02-15")]),
      [blockedRelease],
      [releaseOf("release-late", source, "2022-02-02", "2022-02-15"), [failed]],
      [{ ...stock, date: "2022-02-15", quantity: "40" }],
    );

    expect(nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "200", defects: [] });
    expect(securityAt(nodes, "stockIssuances", stock.security_id)?.carry).toEqual({
      value: { plan: "plan-1", date: "2022-02-15" }, writer: subject(blockedRelease.object_type, blockedRelease.id), defects: [],
    });
  });

  it("puts a draw in doubt when a failed source expected it, though another source named the stock first", () => {
    const failed = subject("TX_PLAN_SECURITY_RELEASE", "release-b");
    const nodes = reduce(withPlans(emptyNodes(), [PLAN, { ...PLAN, id: "plan-2" }]),
      [grant("a", "option-a", "100")],
      [grant("b", "option-b", "100", { stock_plan_id: "plan-2" })],
      [blockedRelease],
      [releaseOf("release-b", "option-b", "2022-02-02", "2022-02-15"), [failed]],
      [{ ...stock, stock_plan_id: "plan-2", date: "2022-02-15", quantity: "40" }],
    );

    expect(nodes.plan.get("plan-2")?.drawn).toMatchObject({ value: "100", defects: [failed] });
    expect(securityAt(nodes, "stockIssuances", stock.security_id)?.carry?.defects).toEqual([failed]);
  });

  it("ignores a failed release from a grant known to have no plan", () => {
    const removed = cancellation("cancel", "option-a", "100", { date: "2022-01-20" });
    const context = runTwoPlans([
      grant("a", "option-a", "100", { stock_plan_id: undefined }), removed, blockedRelease,
      { ...stock, date: "2022-02-15", quantity: "40" },
    ]);

    expect(context.findings).toMatchObject([{ subject: { id: "release-a" }, check: "issuance-exists", outcome: "failed" }]);
    expect(context.nodes.plan.get("plan-1")?.drawn).toMatchObject({ value: "40", defects: [] });
    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)).not.toHaveProperty("carry");
  });

  it("drops a blocked release's reference when the stock is issued without a plan", () => {
    const context = runTwoPlans([
      grant("a", "option-a", "100"), overdrawn, blockedRelease,
      { ...stock, stock_plan_id: undefined, date: "2022-02-15", quantity: "40" },
      grant("c", "option-c", "100", { stock_plan_id: undefined }),
      releaseOf("release-c", "option-c", "2022-03-01", "2022-03-01"),
    ]);

    expect(context.findings.filter((finding) => finding.subject.id === "release-c")).toEqual([]);
    const issued = securityAt(context.nodes, "stockIssuances", stock.security_id);
    expect(issued?.carry?.defects).toEqual([]);
    expect(issued).not.toHaveProperty("pendingCarries");
  });

  it.each([
    { how: "issued", roots: undefined },
    { how: "rejected at issuance", roots: [subject("TX_STOCK_ISSUANCE", "si-1")] },
  ])("lists stock named before it was $how in issuance order, also when resumed from a clone", ({ roots }) => {
    const between = { ...stock, id: "si-2", security_id: "stock-2", date: "2022-02-10" };
    const nodes = reduce(withPlan(),
      [grant("g-1", "option", "100")],
      [releaseOf("release", "option", "2022-02-01", "2022-02-15")],
      [between],
      [{ ...stock, date: "2022-02-15", quantity: "40" }, roots],
    );
    const order = (map: NodeMap) => [...securityRecords(map, "current")].map((node) => node.id);

    expect(order(nodes)).toEqual(["option", "stock-2", "stock-1"]);
    expect(order(structuredClone(nodes))).toEqual(order(nodes));
    expect([...nodes.security.keys()]).toEqual(order(nodes));
  });

  it("ignores an unidentified source's failed release when the claiming grant has no plan", () => {
    const context = runTwoPlans([
      releaseOf("release-lost", "missing", "2022-02-01", "2022-02-15"),
      grant("c", "option-c", "100", { stock_plan_id: undefined }),
      releaseOf("release-c", "option-c", "2022-02-02", "2022-02-15"),
    ]);

    expect(context.findings.filter((finding) => finding.subject.id === "release-c")).toEqual([]);
    expect(securityAt(context.nodes, "equityCompensation", "option-c")?.lifecycle.defects).toEqual([]);
  });

  it.each(["2022-02-10", "2022-02-20"])("checks another plan's release dated %s the same way before and after the stock is issued", (date) => {
    // The stock matches the blocked release, so its own draw stays in doubt.
    const context = runTwoPlans([
      grant("a", "option-a", "100"), grant("b", "option-b", "100", { stock_plan_id: "plan-2" }), overdrawn, blockedRelease,
      { ...stock, date: "2022-02-15", quantity: "40" },
      releaseOf("release-b", "option-b", date, date),
    ]);

    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)?.carry?.defects).toEqual([OVERDRAWN]);
    expect(context.findings.filter((finding) => finding.subject.id === "release-b")).toEqual([]);
    expect(securityAt(context.nodes, "equityCompensation", "option-b")?.remaining).toMatchObject({ value: "60", defects: [] });
  });

  it("looks ahead in the package as it stands for each run", () => {
    const late = { ...stock, date: "2022-02-20", quantity: "40" };
    const transactions: Record<string, unknown>[] = [grant("a", "option-a", "100"), releaseOf("release", "option-a", "2022-02-01", "2022-02-15"), late];
    const ocfPackage = {
      manifest: { issuer: { legal_name: "Test Co" } }, stakeholders, stockClasses: [{ id: "common" }], transactions,
      stockLegends: [], stockPlans: [PLAN], vestingTerms: [], valuations: [],
    } as unknown as Parameters<typeof validateOcfPackage>[0];

    expect(validateOcfPackage(ocfPackage).findings).toMatchObject([{ check: "plan-replacement", outcome: "failed" }]);
    // Correct the settlement stock's date in place and validate the same package again.
    transactions[transactions.indexOf(late)] = { ...late, date: "2022-02-15" };
    expect(validateOcfPackage(ocfPackage).findings).toEqual([]);
  });

  it.each([
    { secondPlan: "plan-1", sum: "100", expected: "100" },
    { secondPlan: "plan-1", sum: "101", expected: "201" },
    { secondPlan: "plan-2", sum: "100", expected: "150" },
  ])("carries only an exact same-plan stock consolidation (%j)", ({ secondPlan, sum, expected }) => {
    const second = { ...stock, id: "issue-b", security_id: "b", stock_plan_id: secondPlan };
    const output = { ...stock, id: "combined", security_id: "combined", date: "2022-03-01", quantity: sum };
    const context = runStock([stock, second, output, {
      id: "merge", object_type: "TX_STOCK_CONSOLIDATION", security_ids: [stock.security_id, second.security_id],
      resulting_security_id: output.security_id, date: output.date,
    }]);
    expect(context.result).toMatch(/appears valid/);
    expect(context.snapshots.at(-1)?.stockPlans[0].drawn).toBe(expected);
  });

  it("carries a consolidated output cancelled on its issuance date and later returned", () => {
    const second = { ...stock, id: "issue-b", security_id: "b" };
    const output = { ...stock, id: "combined", security_id: "combined", date: "2022-03-01", quantity: "100" };
    const merge = { id: "merge", object_type: "TX_STOCK_CONSOLIDATION", security_ids: [stock.security_id, second.security_id],
      resulting_security_id: output.security_id, date: output.date };
    const cancel = { id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: output.security_id, date: output.date, quantity: "100" };
    const context = runStock([stock, second, output, merge, cancel, returnToPool("return", output.security_id, "100", { date: "2022-03-02" })]);

    expect(context.result).toMatch(/appears valid/);
    expect(drawnByDay(context)).toEqual([[stock.date, "100"], [output.date, "100"], ["2022-03-02", "0"]]);
    for (const id of merge.security_ids) {
      expect(securityAt(context.nodes, "stockIssuances", id)?.consolidatedInto?.value).toBe(output.security_id);
    }
    expect(securityAt(context.nodes, "stockIssuances", output.security_id)).toMatchObject({
      lifecycle: { value: "removed", writer: subject(cancel.object_type, cancel.id) },
      draw: { value: { quantity: "0" } }, returnable: { value: "0" },
    });
  });

  it.each([
    ["TX_EQUITY_COMPENSATION_EXERCISE", "TX_STOCK_CANCELLATION", "50"],
    ["TX_PLAN_SECURITY_RELEASE", "TX_STOCK_REPURCHASE", "50"],
    ["TX_EQUITY_COMPENSATION_EXERCISE", "TX_STOCK_TRANSFER", "0"],
  ])("carries %s settlement stock removed by %s on the settlement date", (type, removal, allowance) => {
    const settle = { id: "settle", object_type: type, security_id: "option", quantity: stock.quantity, date: stock.date,
      settlement_date: stock.date, resulting_security_ids: [stock.security_id] };
    const transfer = removal === "TX_STOCK_TRANSFER";
    const replacements = transfer ? [{ ...stock, id: "recipient", security_id: "recipient" }] : [];
    const remove = { id: "remove", object_type: removal, security_id: stock.security_id, date: stock.date, quantity: stock.quantity,
      resulting_security_ids: replacements.map((issue) => issue.security_id) };
    const context = runStock([grant("g-1", "option", "100"), stock, ...replacements, settle, remove]);

    expect(context.result).toMatch(/appears valid/);
    expect(context.snapshots.at(-1)?.stockPlans[0].drawn).toBe("100");
    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)).toMatchObject({
      lifecycle: { value: "removed", writer: subject(removal, remove.id) },
      draw: { value: { quantity: "0" }, writer: subject(type, settle.id) },
      returnable: { value: allowance, writer: subject(removal, remove.id) },
    });
    expect(securityAt(context.nodes, "equityCompensation", "option")?.remaining?.value).toBe("50");
  });

  it("rejects settlement stock removed on a different date from issuance", () => {
    const issuance = grant("option", "option", "100");
    const remove = { id: "remove", object_type: "TX_STOCK_CANCELLATION", security_id: stock.security_id,
      date: "2022-02-02", quantity: stock.quantity };
    const settle = { id: "settle", object_type: "TX_EQUITY_COMPENSATION_RELEASE", security_id: "option",
      quantity: stock.quantity, date: "2022-02-03", settlement_date: stock.date, resulting_security_ids: [stock.security_id] };
    const context = runStock([issuance, stock, remove, settle]);

    expect(context.findings).toMatchObject([{ check: "plan-replacement", outcome: "failed", subject: { id: settle.id } }]);
    expect(context.nodes.plan.get(PLAN.id)?.drawn.value).toBe("150");
    expect(securityAt(context.nodes, "stockIssuances", stock.security_id)).toMatchObject({
      draw: { value: { quantity: "50" } }, returnable: { value: "50" },
    });
  });

  it("keeps an independent stock draw when cancellation names it outside the balance field", () => {
    const another = { ...stock, id: "second", security_id: "other", date: "2022-03-01" };
    const context = runStock([stock, another, {
      id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: stock.security_id, quantity: stock.quantity,
      date: another.date, resulting_security_ids: [another.security_id],
    }]);
    expect(context.snapshots.at(-1)?.stockPlans[0].drawn).toBe("100");
  });

  it("withholds a return from stock that is outstanding, planless, or unreliably removed", () => {
    const remove = { id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: stock.security_id, date: "2022-02-02" };
    const bad = subject(remove.object_type, remove.id);
    const data = returnToPool("return", stock.security_id, "50");
    const validate = (nodes: NodeMap) => runValidator(data.object_type, baseContext({ nodes }), data);
    const outstanding = reduce(withPlan(), [stock]);
    const planless = reduce(withPlan(), [{ ...stock, stock_plan_id: undefined }], [remove]);
    const uncertain = reduce(outstanding, [remove, [bad]]);
    for (const nodes of [outstanding, planless]) {
      expect(validate(nodes)).toMatchObject([{ check: "security-removed", outcome: "failed" }]);
    }
    expect(validate(uncertain)).toMatchObject([{ check: "security-removed", outcome: "blocked", roots: [bad] }]);
  });
});

// A check can depend on a field specific to one security family.
describe("equity compensation field reads", () => {
  it.each(["provenance", "draw"] as const)("blocks a check that reads marked %s", (field) => {
    const failed = subject("TX_EQUITY_COMPENSATION_CANCELLATION", "c-1");
    const nodes = reduce(withPlan(),
      [grant("g-1", "opt-1", "100")],
      [grant("g-balance", "opt-balance", "60", { date: "2022-02-01" })],
      [cancellation("c-1", "opt-1", "40", { balance_security_id: "opt-balance" }), [failed]],
    );
    const ref = securityField("equityCompensation", "opt-balance", field);
    let ran = false;
    const check = {
      id: "reads-grant-state", severity: "error", description: "Reads the grant's pool state.",
      reads: () => [ref],
      run: (_context, _data, read) => { ran = true; read(ref); return []; },
    } satisfies CheckObject;

    expect(fieldAt(nodes, ref)?.defects).toEqual([failed]);
    expect(toValidate([check])(baseContext({ nodes }), grant("next", "next", "1"))).toMatchObject([
      { check: "reads-grant-state", outcome: "blocked", roots: [failed] },
    ]);
    expect(ran).toBe(false);
  });

  it("returns undefined for optional state that has not been written", () => {
    const nodes = reduce(withPlan(), [grant("g-1", "opt-1", "100")]);
    expect(fieldAt(nodes, securityField("equityCompensation", "opt-1", "provenance"))).toBeUndefined();
  });
});
