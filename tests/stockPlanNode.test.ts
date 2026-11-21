import { describe, it, expect } from "vitest";
import { applyTransaction, emptyNodes, fieldAt, securityAt, securityField, withPlans, type NodeMap } from "../ocf_validator/nodes";
import { TX_DESCRIPTORS, type TxKey } from "../ocf_validator/ocfMachine";
import type { Subject } from "../types/finding";
import { toValidate, type CheckObject } from "../ocf_validator/validators/checkKit";
import { baseContext, runValidator, validatePackage } from "./helpers";

// Check how transactions change reserved and drawn shares. The plan stores each total separately so
// a failure affecting one can leave the other reliable.

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
    // The date check allows removal and reissuance on the same day.
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
    // The older issuance name sorts after a current-name cancellation. Remember the balance ID so
    // the later issuance can skip the charge.
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
    // Use the older name to exercise this order through the public validator.
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

    expect(context.findings.map((finding) => [finding.subject.id, finding.check, finding.outcome])).toEqual([["g-bad", "stakeholder-exists", "failed"]]);
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

    expect(context.findings).toEqual([
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

    expect(context.findings.map((finding) => [finding.check, finding.message])).toEqual([["quantity-countable", message]]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", reserved: "1000", drawn: "100", defects: { drawn: [RETURN] } }]);
    expect(context.nodes.security.get("opt-1")?.lifecycle.defects).toEqual([]);
  });

  it("are withheld and marked for a pool adjustment whose shares_reserved can't be counted", () => {
    const context = run([grant("g-1", "opt-1", "100"), adjustment("adj-1", "plenty")]);
    const ADJUSTMENT = subject("TX_STOCK_PLAN_POOL_ADJUSTMENT", "adj-1");

    expect(context.findings.map((finding) => [finding.check, finding.message])).toEqual([
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

    expect(context.findings.map((finding) => [finding.subject.id, finding.check])).toEqual([["c-1", "issuance-exists"]]);
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
      [grant("g-balance", "opt-balance", "60")],
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
