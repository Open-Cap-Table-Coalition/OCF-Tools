import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator, validateOcfPackage } from "../ocf_validator";
import { orderDay } from "../ocf_validator/sameDayOrder";
import { readOcfPackage } from "../read_ocf_package";
import type { OcfTransaction } from "../types/ocf-input";
import { validatePackage } from "./helpers";

// OCF dates a transaction to the day. The validator works out the order within a day from the
// securities each transaction names, and uses the transaction IDs where that leaves a choice. The
// place of a transaction in the file never matters.

const fixture = (...segments: string[]) => path.resolve(__dirname, "..", ...segments);
const VALID = (issuer: string) => `The validation of the OCF package for ${issuer} is complete and the package appears valid.`;

/** Shuffle a copy of the list. The same seed always gives the same arrangement. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const list = [...items];
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The order orderDay gives these transactions, as their IDs. */
const order = (...day: Record<string, unknown>[]) => orderDay(day as unknown as OcfTransaction[]).map((placed) => placed.transaction.id);

// In the sameDayOrder fixture, eight transactions are dated 2024-05-01, the day the Series A closes:
//   - Ada sells 200,000 of her 1,000,000 founder shares to Omar. The transfer names Omar's new stock
//     as its result and Ada's remaining 800,000 as its balance. Omar accepts his stock.
//   - Grace's SAFE converts into Series A Preferred.
//   - Emily exercises 4,000 of her 10,000 options.
// The file lists every transaction of that day before the issuance it depends on.

describe("the day a financing closes", () => {
  const dir = fixture("testing_scripts", "sameDayOrder");
  const context = ocfValidator(dir);

  it("is valid, although the file lists each transaction before the issuance it depends on", () => {
    expect(readOcfPackage(dir).transactions.slice(0, 4).map((tx) => tx.id)).toEqual([
      "accept-omar",
      "transfer-ada-to-omar",
      "issue-omar",
      "issue-ada-balance",
    ]);

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID("Closing Day Co"));
  });

  it("runs each issuance before the transaction that names its stock, and the acceptance last", () => {
    const closingDay = context.ocfPackageContent.transactions.filter((tx) => tx.date === "2024-05-01");

    expect(closingDay.map((tx) => tx.id)).toEqual([
      "issue-ada-balance", // nothing waits before an issuance, so the lowest ID goes first
      "issue-emily-exercise",
      "exercise-emily", // free to run once Emily's stock is issued
      "issue-grace-series-a",
      "convert-grace-safe",
      "issue-omar",
      "transfer-ada-to-omar", // waits for both the stock it results in and its balance
      "accept-omar", // waits for the transfer that names Omar's stock
    ]);
  });

  it("shows the cap table after the closing, with same-day stock listed in the order it was issued", () => {
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual(["2023-01-10", "2023-06-01", "2023-09-01", "2024-05-01"]);
    expect(context.snapshots.at(-1)).toEqual({
      date: "2024-05-01",
      stockIssuances: [
        { date: "2024-05-01", custom_id: "CS-2", stakeholder: "ada", stock_class: "common", quantity: "800000" },
        { date: "2024-05-01", custom_id: "CS-4", stakeholder: "emily", stock_class: "common", quantity: "4000" },
        { date: "2024-05-01", custom_id: "PA-1", stakeholder: "grace", stock_class: "series-a", quantity: "125000" },
        { date: "2024-05-01", custom_id: "CS-3", stakeholder: "omar", stock_class: "common", quantity: "200000" },
      ],
      // The SAFE converted. An exercise leaves the option listed at its issued quantity.
      convertibles: [],
      warrants: [],
      equityCompensation: [{ date: "2023-09-01", custom_id: "OPT-1", stakeholder: "emily", quantity: "10000" }],
      stockPlans: [{ id: "plan-2023", reserved: "1000000", drawn: "10000" }],
    });
  });
});

describe("a package whose transactions are rearranged", () => {
  // acme_holdings_limited is the largest package on disk. markedSecurities, stockPlanPool and
  // unrecognizedTransactionType each report findings, so their order is compared too.
  it.each([
    ["testing_scripts", "sameDayOrder"],
    ["testing_scripts", "testPackage"],
    ["testing_scripts", "markedSecurities"],
    ["testing_scripts", "stockPlanPool"],
    ["testing_scripts", "unrecognizedTransactionType"],
    ["sample_ocf_folders", "acme_holdings_limited"],
  ])("%s/%s gives the same result, findings and snapshots in 20 arrangements", (...segments) => {
    const expected = validateOcfPackage(readOcfPackage(fixture(...segments)));

    for (let seed = 1; seed <= 20; seed++) {
      const rearranged = readOcfPackage(fixture(...segments));
      rearranged.transactions = shuffled(rearranged.transactions, seed);
      const context = validateOcfPackage(rearranged);

      expect(context.result).toBe(expected.result);
      expect(context.findings).toEqual(expected.findings);
      expect(context.snapshots).toEqual(expected.snapshots);
      // The run leaves the package's list in the order it used.
      expect(context.ocfPackageContent.transactions).toEqual(expected.ocfPackageContent.transactions);
    }
  });
});

describe("a transfer and the stock it creates, dated the same day", () => {
  const stakeholders = [{ id: "ada" }, { id: "omar" }];
  const classes = [{ id: "common" }];
  const stock = (id: string, security_id: string, stakeholder_id: string, quantity: string, date: string) => ({
    id, object_type: "TX_STOCK_ISSUANCE", security_id, stakeholder_id, stock_class_id: "common", stock_legend_ids: [], quantity, date,
  });
  const founderStock = stock("issue-ada-founder", "stock-ada", "ada", "1000", "2023-01-10");
  const omarStock = stock("issue-omar", "stock-omar", "omar", "1000", "2024-05-01");
  const transfer = { id: "transfer-ada-to-omar", object_type: "TX_STOCK_TRANSFER", security_id: "stock-ada", quantity: "1000", resulting_security_ids: ["stock-omar"], date: "2024-05-01" };

  it.each([
    { where: "before the transfer", file: [founderStock, omarStock, transfer] },
    { where: "after the transfer", file: [founderStock, transfer, omarStock] },
    { where: "first in the file", file: [omarStock, transfer, founderStock] },
  ])("is valid when the resulting issuance appears $where", ({ file }) => {
    const context = validatePackage(file, stakeholders, classes);

    expect(context.findings).toEqual([]);
    expect(context.result).toBe(VALID("Test Co"));
    expect(context.ocfPackageContent.transactions.map((tx) => tx.id)).toEqual(["issue-ada-founder", "issue-omar", "transfer-ada-to-omar"]);
    // Ada's stock is gone and Omar's is listed.
    expect(context.snapshots.at(-1)?.stockIssuances).toEqual([
      { date: "2024-05-01", custom_id: undefined, stakeholder: "omar", stock_class: "common", quantity: "1000" },
    ]);
  });

  it("runs the transfer before a cancellation of the stock it results in, whatever their IDs", () => {
    // "a-cancel-omar" sorts before "transfer-ada-to-omar", but the stock has to result from the
    // transfer before something else can remove it.
    const cancellation = { id: "a-cancel-omar", object_type: "TX_STOCK_CANCELLATION", security_id: "stock-omar", quantity: "1000", reason_text: "Rescinded", date: "2024-05-01" };
    const context = validatePackage([cancellation, transfer, omarStock, founderStock], stakeholders, classes);

    expect(context.findings).toEqual([]);
    expect(context.ocfPackageContent.transactions.map((tx) => tx.id)).toEqual(["issue-ada-founder", "issue-omar", "transfer-ada-to-omar", "a-cancel-omar"]);
    expect(context.snapshots.at(-1)?.stockIssuances).toEqual([]);
  });
});

describe("the order of one day's transactions", () => {
  const DAY = "2024-05-01";
  const on = (object_type: string, id: string, security_id: string, fields: Record<string, unknown> = {}) => ({ id, object_type, security_id, date: DAY, ...fields });

  it("takes one security through its day: issued, named as a result, changed, removed, returned to the pool", () => {
    const day = [
      on("TX_STOCK_PLAN_RETURN_TO_POOL", "a-return", "option-2", { stock_plan_id: "plan", quantity: "60" }),
      on("TX_EQUITY_COMPENSATION_CANCELLATION", "b-cancel-balance", "option-2", { quantity: "60" }),
      on("TX_EQUITY_COMPENSATION_ACCEPTANCE", "c-accept-balance", "option-2"),
      on("TX_EQUITY_COMPENSATION_CANCELLATION", "d-cancel-original", "option-1", { quantity: "40", balance_security_id: "option-2" }),
      on("TX_EQUITY_COMPENSATION_ISSUANCE", "e-issue-balance", "option-2"),
    ];

    // The IDs run the other way, so only what each transaction does to option-2 decides this.
    expect(order(...day)).toEqual(["e-issue-balance", "d-cancel-original", "c-accept-balance", "b-cancel-balance", "a-return"]);
  });

  it("runs a retraction straight after the issuance it voids, before a transaction that names the security", () => {
    expect(order(
      on("TX_STOCK_TRANSFER", "a-transfer", "stock-1", { resulting_security_ids: ["stock-2"] }),
      on("TX_STOCK_RETRACTION", "b-retract", "stock-2"),
      on("TX_STOCK_ISSUANCE", "c-issue", "stock-2"),
    )).toEqual(["c-issue", "b-retract", "a-transfer"]);
  });

  it("runs vesting before a removal of the same security, and an exercise before a cancellation of what is left", () => {
    expect(order(
      on("TX_WARRANT_CANCELLATION", "a-cancel", "warrant-1"),
      on("TX_VESTING_EVENT", "b-vest", "warrant-1"),
    )).toEqual(["b-vest", "a-cancel"]);
    expect(order(
      on("TX_EQUITY_COMPENSATION_CANCELLATION", "a-cancel", "option-1"),
      on("TX_PLAN_SECURITY_EXERCISE", "b-exercise", "option-1", { resulting_security_ids: [] }),
    )).toEqual(["b-exercise", "a-cancel"]);
  });

  it("runs a consolidation after the issuance of its result and after transactions that leave its stock outstanding", () => {
    // The consolidation has the lowest ID, so it runs third only because of what it names: stock-3
    // as its result, and stock-2 as stock it replaces.
    expect(order(
      on("TX_STOCK_ACCEPTANCE", "d-accept-result", "stock-3"),
      { id: "a-consolidate", object_type: "TX_STOCK_CONSOLIDATION", security_ids: ["stock-1", "stock-2"], resulting_security_id: "stock-3", date: DAY },
      on("TX_STOCK_ACCEPTANCE", "z-accept-replaced", "stock-2"),
      on("TX_STOCK_ISSUANCE", "c-issue-result", "stock-3"),
    )).toEqual(["c-issue-result", "z-accept-replaced", "a-consolidate", "d-accept-result"]);
  });

  it("orders transactions that share no security by ID, and transactions that name no security at all", () => {
    expect(order(
      on("TX_WARRANT_ISSUANCE", "wi-2", "warrant-2"),
      { id: "split-1", object_type: "TX_STOCK_CLASS_SPLIT", stock_class_id: "common", date: DAY },
      on("TX_CONVERTIBLE_ISSUANCE", "ci-1", "safe-1"),
      { id: "pool-1", object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT", stock_plan_id: "plan", shares_reserved: "100", date: DAY },
    )).toEqual(["ci-1", "pool-1", "split-1", "wi-2"]);
  });

  it("orders two transactions at the same stage of one security by ID", () => {
    // Both remove option-1, and neither names another security, so only their IDs decide.
    expect(order(
      on("TX_EQUITY_COMPENSATION_TRANSFER", "b-transfer", "option-1", { resulting_security_ids: [] }),
      on("TX_EQUITY_COMPENSATION_CANCELLATION", "a-cancel", "option-1"),
    )).toEqual(["a-cancel", "b-transfer"]);
  });

  it("applies the lower ID of two transfers of one option, whichever the file lists first", () => {
    // Emily's option is transferred twice on one day by mistake. Only one transfer can be applied.
    const grant = { id: "grant-emily", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "option-emily", custom_id: "OPT-1", stakeholder_id: "emily", quantity: "100", date: "2023-01-01" };
    const transfer = (id: string) => on("TX_EQUITY_COMPENSATION_TRANSFER", id, "option-emily", { quantity: "100", resulting_security_ids: [] });
    const second = {
      severity: "error", outcome: "failed", check: "issuance-exists",
      subject: { object_type: "TX_EQUITY_COMPENSATION_TRANSFER", id: "transfer-2" },
      message: "The equity compensation issuance referenced by security_id option-emily (dated 2023-01-01) is not outstanding as of this transaction's date.",
    };

    for (const file of [[grant, transfer("transfer-1"), transfer("transfer-2")], [transfer("transfer-2"), transfer("transfer-1"), grant]]) {
      const context = validatePackage(file, [{ id: "emily" }]);

      expect(context.findings).toEqual([second]);
      expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error.");
      // The first transfer removed the option, so the day's snapshot no longer lists it.
      expect(context.snapshots.map((snapshot) => [snapshot.date, snapshot.equityCompensation.length])).toEqual([["2023-01-01", 1], [DAY, 0]]);
    }
  });

  it("orders two transactions with the same ID by object_type, and compares an ID that is not a string by its text", () => {
    expect(orderDay([
      on("TX_WARRANT_ISSUANCE", "same", "warrant-1"),
      on("TX_CONVERTIBLE_ISSUANCE", "same", "safe-1"),
    ] as unknown as OcfTransaction[]).map((placed) => placed.transaction.object_type)).toEqual(["TX_CONVERTIBLE_ISSUANCE", "TX_WARRANT_ISSUANCE"]);

    const malformed = JSON.parse('{ "toString": null }');
    expect(order(
      on("TX_WARRANT_ISSUANCE", "z-last", "warrant-1"),
      { ...on("TX_WARRANT_ISSUANCE", "", "warrant-2"), id: malformed },
      { ...on("TX_WARRANT_ISSUANCE", "", "warrant-3"), id: 7 },
    )).toEqual([7, "z-last", malformed]);
  });

  it("runs an unrecognized transaction after the issuance of the security it names and before every other transaction on it that day", () => {
    expect(order(
      on("TX_WARRANT_ACCEPTANCE", "a-accept", "warrant-1"),
      on("TX_WARRANT_RETRACTION", "b-retract", "warrant-1"),
      on("TX_WARRANT_AMENDMENT", "c-amend", "warrant-1"),
      on("TX_WARRANT_ISSUANCE", "d-issue", "warrant-1"),
    )).toEqual(["d-issue", "c-amend", "b-retract", "a-accept"]);
    // A transfer with a lower ID that names the stock as its result waits for it too.
    expect(order(
      on("TX_STOCK_TRANSFER", "a-transfer", "stock-1", { resulting_security_ids: ["stock-2"] }),
      on("TX_STOCK_AMENDMENT", "b-amend", "stock-2"),
      on("TX_STOCK_ISSUANCE", "c-issue", "stock-2"),
    )).toEqual(["c-issue", "b-amend", "a-transfer"]);

    // The acceptance dated the same day is therefore blocked, and no longer passes unseen.
    const context = validatePackage([
      on("TX_WARRANT_ACCEPTANCE", "a-accept", "warrant-1"),
      on("TX_WARRANT_AMENDMENT", "b-amend", "warrant-1"),
      on("TX_WARRANT_ISSUANCE", "c-issue", "warrant-1", { stakeholder_id: "grace" }),
    ], [{ id: "grace" }]);
    expect(context.findings.map((f) => [f.subject.id, f.check, f.outcome])).toEqual([
      ["b-amend", "transaction-type-known", "failed"],
      ["a-accept", "issuance-exists", "blocked"],
    ]);
  });

  // Each random day mixes issuances, acceptances, retractions, cancellations with and without a
  // balance, and transactions of an unrecognized type, over four securities. The table below says
  // which stage each holds, written out separately from the code under test.
  it("places every transaction of 2,000 random days exactly once, in stage order, however the day is arranged", () => {
    const STAGE: Record<string, number> = {
      TX_STOCK_ISSUANCE: 0, TX_STOCK_AMENDMENT: 1, TX_STOCK_RETRACTION: 2, TX_STOCK_ACCEPTANCE: 4, TX_STOCK_CANCELLATION: 5,
    };
    const NAMED_AS_BALANCE = 3;
    // Cancellations are drawn three times as often, because only they can form a loop here.
    const types = [...Object.keys(STAGE), "TX_STOCK_CANCELLATION", "TX_STOCK_CANCELLATION"];
    let state = 42;
    const pick = (count: number) => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return Math.floor((state / 4294967296) * count);
    };
    let loops = 0;

    for (let round = 0; round < 2000; round++) {
      const day = Array.from({ length: 2 + pick(9) }, (_, index) => {
        const object_type = types[pick(types.length)];
        const balance = object_type === "TX_STOCK_CANCELLATION" && pick(4) > 0 ? { balance_security_id: `stock-${pick(4)}` } : {};
        return { id: `tx-${pick(1000)}-${index}`, object_type, security_id: `stock-${pick(4)}`, date: DAY, ...balance };
      }) as unknown as OcfTransaction[];
      const placed = orderDay(day);

      // Nothing is dropped and nothing runs twice.
      expect(placed.map((entry) => entry.transaction.id).sort()).toEqual(day.map((tx) => tx.id).sort());

      // Among the transactions outside a loop, an earlier stage on a security always runs first.
      const reached = new Map<unknown, number>();
      for (const { transaction, loop } of placed) {
        if (loop) {
          loops++;
          continue;
        }
        const tx = transaction as unknown as { object_type: string; security_id: string; balance_security_id?: string };
        const held = new Map<unknown, number>([[tx.security_id, STAGE[tx.object_type]]]);
        if (tx.balance_security_id !== undefined && !held.has(tx.balance_security_id)) held.set(tx.balance_security_id, NAMED_AS_BALANCE);
        for (const [security, stage] of held) {
          expect(stage).toBeGreaterThanOrEqual(reached.get(security) ?? 0);
          reached.set(security, stage);
        }
      }

      // The arrangement of the day does not change the outcome.
      const rearranged = orderDay(shuffled(day, round + 1));
      expect(rearranged.map((entry) => [entry.transaction.id, entry.loop])).toEqual(placed.map((entry) => [entry.transaction.id, entry.loop]));
    }
    // The random days include loops, so the rule above was tested around them.
    expect(loops).toBeGreaterThan(100);
  });
});

// Ada and Omar swap their certificates. The package records the swap as two transfers that each name
// the other's existing stock as their result, so each transfer would have to run before the other.

describe("transactions that each have to run before the other", () => {
  const stakeholders = [{ id: "ada" }, { id: "omar" }, { id: "grace" }];
  const stock = (id: string, security_id: string, stakeholder_id: string, date = "2023-01-10") => ({
    id, object_type: "TX_STOCK_ISSUANCE", security_id, custom_id: security_id.toUpperCase(), stakeholder_id, stock_class_id: "common", stock_legend_ids: [], quantity: "1000", date,
  });
  const swap = (id: string, from: string, to: string) => ({
    id, object_type: "TX_STOCK_TRANSFER", security_id: from, quantity: "1000", resulting_security_ids: [to], date: "2024-05-01",
  });
  const history = [
    stock("issue-ada", "cs-1", "ada"),
    stock("issue-omar", "cs-2", "omar"),
    swap("swap-ada-to-omar", "cs-1", "cs-2"),
    swap("swap-omar-to-ada", "cs-2", "cs-1"),
    // Dated the same day as the swap, and unrelated to it.
    { id: "warrant-grace", object_type: "TX_WARRANT_ISSUANCE", security_id: "w-1", custom_id: "W-1", stakeholder_id: "grace", purchase_price: { amount: "100.00", currency: "USD" }, date: "2024-05-01" },
    // A month later, Ada accepts the certificate the first transfer was meant to remove.
    { id: "accept-ada", object_type: "TX_STOCK_ACCEPTANCE", security_id: "cs-1", date: "2024-06-01" },
  ];
  const context = validatePackage(history, stakeholders, [{ id: "common" }]);

  const FIRST = { object_type: "TX_STOCK_TRANSFER", id: "swap-ada-to-omar" };
  const SECOND = { object_type: "TX_STOCK_TRANSFER", id: "swap-omar-to-ada" };
  const loop =
    "No order works for the transactions dated 2024-05-01: " +
    "swap-ada-to-omar (names cs-2 as its balance or result) has to run before swap-omar-to-ada (removes cs-2); " +
    "swap-omar-to-ada (names cs-1 as its balance or result) has to run before swap-ada-to-omar (removes cs-1). " +
    "The validator did not check or apply them.";

  it("reports the loop once on each transaction in it, as an error of its own", () => {
    expect(context.findings.slice(0, 2)).toEqual([
      { severity: "error", outcome: "failed", check: "same-day-order", subject: FIRST, message: loop },
      { severity: "error", outcome: "failed", check: "same-day-order", subject: SECOND, message: loop },
    ]);
  });

  it("blocks the later acceptance, which points at the transfer that left its stock in doubt", () => {
    expect(context.findings.slice(2)).toEqual([
      {
        severity: "error", outcome: "blocked", check: "issuance-exists",
        subject: { object_type: "TX_STOCK_ACCEPTANCE", id: "accept-ada" }, roots: [FIRST],
        message: "Not checked: it reads the lifecycle of security cs-1, which can't be relied on because TX_STOCK_TRANSFER swap-ada-to-omar failed.",
      },
    ]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 2 errors and 1 check blocked by them.");
  });

  it("applies neither transfer, marks both certificates and still issues the unrelated warrant that day", () => {
    const certificate = (custom_id: string, stakeholder: string, root: typeof FIRST) => ({
      date: "2023-01-10", custom_id, stakeholder, stock_class: "common", quantity: "1000", defects: { lifecycle: [root] },
    });

    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual(["2023-01-10", "2024-05-01", "2024-06-01"]);
    expect(context.snapshots[1].stockIssuances).toEqual([certificate("CS-1", "ada", FIRST), certificate("CS-2", "omar", SECOND)]);
    expect(context.snapshots[1].warrants).toEqual([
      { date: "2024-05-01", custom_id: "W-1", stakeholder: "grace", purchase_price: { amount: "100.00", currency: "USD" } },
    ]);
  });

  it("gives the same findings whichever transfer the file lists first", () => {
    const reversed = validatePackage([...history].reverse(), stakeholders, [{ id: "common" }]);

    expect(reversed.findings).toEqual(context.findings);
    expect(reversed.snapshots).toEqual(context.snapshots);
  });

  it("marks only the transactions in the loop, and runs each one that waited on them once, afterwards", () => {
    const day = [
      swap("b-swap", "cs-1", "cs-2"),
      swap("c-swap", "cs-2", "cs-1"),
      // Both wait for the transfers, because a return applies after the removal of its stock. One
      // has a lower ID than the transfers and one a higher ID.
      { id: "a-return", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "cs-1", stock_plan_id: "plan", quantity: "1000", date: "2024-05-01" },
      { id: "z-return", object_type: "TX_STOCK_PLAN_RETURN_TO_POOL", security_id: "cs-2", stock_plan_id: "plan", quantity: "1000", date: "2024-05-01" },
      // Shares no security with the loop.
      { id: "d-warrant", object_type: "TX_WARRANT_ISSUANCE", security_id: "w-1", date: "2024-05-01" },
    ] as unknown as OcfTransaction[];

    expect(orderDay(day).map((placed) => [placed.transaction.id, placed.loop !== undefined])).toEqual([
      ["d-warrant", false],
      ["b-swap", true],
      ["c-swap", true],
      ["a-return", false],
      ["z-return", false],
    ]);
  });

  it("checks an acceptance dated the day of the loop once, after the loop, and blocks it", () => {
    // "zz-accept-ada" sorts after both transfers.
    const sameDay = validatePackage(
      [...history.slice(0, 4), { id: "zz-accept-ada", object_type: "TX_STOCK_ACCEPTANCE", security_id: "cs-1", date: "2024-05-01" }],
      stakeholders,
      [{ id: "common" }],
    );

    expect(sameDay.ocfPackageContent.transactions.map((tx) => tx.id)).toEqual(["issue-ada", "issue-omar", "swap-ada-to-omar", "swap-omar-to-ada", "zz-accept-ada"]);
    expect(sameDay.findings.map((f) => [f.subject.id, f.check, f.outcome])).toEqual([
      ["swap-ada-to-omar", "same-day-order", "failed"],
      ["swap-omar-to-ada", "same-day-order", "failed"],
      ["zz-accept-ada", "issuance-exists", "blocked"],
    ]);
  });

  it("words the loop the same way whatever else is dated that day", () => {
    // "aa-accept-ada" has the lowest ID of the day and waits on the loop without being part of it.
    const withWaiter = validatePackage(
      [...history, { id: "aa-accept-ada", object_type: "TX_STOCK_ACCEPTANCE", security_id: "cs-1", date: "2024-05-01" }],
      stakeholders,
      [{ id: "common" }],
    );

    expect(withWaiter.findings.filter((f) => f.check === "same-day-order").map((f) => f.message)).toEqual([loop, loop]);
  });

  it("reports two separate loops on one day separately, and places each transaction once", () => {
    const day = [
      swap("a-swap", "cs-1", "cs-2"),
      swap("b-swap", "cs-2", "cs-1"),
      swap("c-swap", "cs-3", "cs-4"),
      swap("d-swap", "cs-4", "cs-3"),
    ] as unknown as OcfTransaction[];
    const placed = orderDay(day);

    expect(placed.map((entry) => entry.transaction.id)).toEqual(["a-swap", "b-swap", "c-swap", "d-swap"]);
    expect(placed.map((entry) => entry.loop?.map((link) => link.security))).toEqual([
      ["cs-2", "cs-1"],
      ["cs-2", "cs-1"],
      ["cs-4", "cs-3"],
      ["cs-4", "cs-3"],
    ]);
  });

  it("gives the same findings and snapshots in 20 arrangements of the file", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rearranged = validatePackage(shuffled(history, seed), stakeholders, [{ id: "common" }]);

      expect(rearranged.findings).toEqual(context.findings);
      expect(rearranged.snapshots).toEqual(context.snapshots);
    }
  });

  it("names every link of a loop of three", () => {
    const day = [swap("a", "cs-1", "cs-2"), swap("b", "cs-2", "cs-3"), swap("c", "cs-3", "cs-1")] as unknown as OcfTransaction[];
    const placed = orderDay(day);

    expect(placed.map((entry) => entry.transaction.id)).toEqual(["a", "b", "c"]);
    expect(placed[0].loop?.map((link) => [link.before.id, link.after.id, link.security])).toEqual([
      ["a", "b", "cs-2"],
      ["b", "c", "cs-3"],
      ["c", "a", "cs-1"],
    ]);
    expect(placed[1].loop).toBe(placed[0].loop);
    expect(placed[2].loop).toBe(placed[0].loop);
  });

  it("does not treat a transaction that names its own security as its balance as a loop", () => {
    const cancellation = { id: "cancel", object_type: "TX_STOCK_CANCELLATION", security_id: "cs-1", balance_security_id: "cs-1", quantity: "400", date: "2024-05-01" };
    const acceptance = { id: "accept", object_type: "TX_STOCK_ACCEPTANCE", security_id: "cs-1", date: "2024-05-01" };

    expect(orderDay([cancellation, acceptance] as unknown as OcfTransaction[])).toEqual([{ transaction: acceptance }, { transaction: cancellation }]);
  });
});
