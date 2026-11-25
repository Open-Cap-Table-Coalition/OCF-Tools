import * as path from "path";
import { describe, it, expect } from "vitest";
import { ocfValidator } from "../ocf_validator";
import { emptyNodes, applyTransaction, fieldAt, securityField, withUnrecognizedChange } from "../ocf_validator/nodes";
import { TX_DESCRIPTORS } from "../ocf_validator/validators";
import { collection, validatePackage } from "./helpers";

// A transaction whose object_type the validator does not recognize gets one error finding, and the
// run goes on. If it names a security, that security can no longer be relied on, because nothing
// says what the transaction did to it.

const subject = (object_type: string, id: string) => ({ object_type, id });
const notRecognized = (object_type: string, id: string) => ({
  severity: "error",
  outcome: "failed",
  check: "transaction-type-known",
  message: `The validator does not recognize object_type ${object_type}, so it did not check this transaction or apply any change it makes.`,
  subject: { object_type, id },
});

// In the unrecognizedTransactionType fixture, Ada holds founder stock, Grace holds a warrant and
// Emily holds an option. Two transactions have a type the validator does not recognize:
//   - amend-grace, a TX_WARRANT_AMENDMENT that lowers the warrant's exercise price. OCF defines no
//     such type. Grace accepts the warrant two weeks later.
//   - status-emily, a CE_STAKEHOLDER_STATUS that puts Emily on leave. OCF allows this change event in
//     a transactions file, and it names no security. Emily accepts her option a month later.

describe("a package with a warrant amendment and a stakeholder change event", () => {
  const context = ocfValidator(path.resolve(__dirname, "..", "testing_scripts", "unrecognizedTransactionType"));

  const AMENDMENT = subject("TX_WARRANT_AMENDMENT", "amend-grace");

  it("reports each unrecognized transaction once, and the acceptance that depends on the amended warrant", () => {
    expect(context.findings).toEqual([
      notRecognized("TX_WARRANT_AMENDMENT", "amend-grace"),
      {
        severity: "error", outcome: "blocked", check: "issuance-exists",
        subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "wa-grace" }, roots: [AMENDMENT],
        message: "Not checked: it reads the lifecycle of security warrant-grace, which can't be relied on because TX_WARRANT_AMENDMENT amend-grace failed.",
      },
      notRecognized("CE_STAKEHOLDER_STATUS", "status-emily"),
    ]);
  });

  it("finishes the run and counts the two transactions as errors", () => {
    expect(context.result).toBe(
      "The validation of the OCF package for Next Version Co is complete and found 2 errors and 1 check blocked by them.",
    );
  });

  it("takes a snapshot for every day, including the days after each unrecognized transaction", () => {
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2023-01-15", // Ada's founder stock
      "2023-02-01", // Grace's warrant
      "2023-03-01", // Emily's option
      "2023-06-15", // the warrant amendment
      "2023-07-01", // Grace's acceptance
      "2023-08-01", // Emily's leave of absence
      "2023-09-01", // Emily's acceptance
    ]);
  });

  it("keeps the warrant on the cap table and says, from the amendment on, that it can't be relied on", () => {
    const warrant = { date: "2023-02-01", custom_id: "W-1", stakeholder: "grace", purchase_price: { amount: "100.00", currency: "USD" } };
    const inDoubt = { ...warrant, defects: { lifecycle: [AMENDMENT], issuance: [AMENDMENT] } };

    expect(context.snapshots.map((snapshot) => [snapshot.date, snapshot.warrants])).toEqual([
      ["2023-01-15", []],
      ["2023-02-01", [warrant]],
      ["2023-03-01", [warrant]],
      ["2023-06-15", [inDoubt]],
      ["2023-07-01", [inDoubt]],
      ["2023-08-01", [inDoubt]],
      ["2023-09-01", [inDoubt]],
    ]);
    // The record keeps the issuance and its writer. Only the two fields' reliability changed.
    expect(context.nodes.security.get("warrant-grace")?.lifecycle).toEqual({
      value: "outstanding",
      writer: { object_type: "TX_WARRANT_ISSUANCE", id: "wi-grace" },
      defects: [AMENDMENT],
    });
  });

  it("leaves Ada's stock, Emily's option and the stock plan unmarked", () => {
    const last = context.snapshots.at(-1);

    expect(last?.stockIssuances).toEqual([{ date: "2023-01-15", custom_id: "CS-1", stakeholder: "ada", stock_class: "common", quantity: "4000000" }]);
    // The change event names Emily, not her option, so the acceptance after it was checked and passed.
    expect(last?.equityCompensation).toEqual([{ date: "2023-03-01", custom_id: "OPT-1", stakeholder: "emily", quantity: "20000" }]);
    expect(last?.stockPlans).toEqual([{ id: "plan-2023", reserved: "1000000", drawn: "20000" }]);
    expect(context.findings.filter((finding) => finding.subject.id === "eca-emily")).toEqual([]);
  });
});

// Shorter histories for the rules around the marking.

const stakeholders = [{ id: "grace" }];
const warrant = { id: "wi-1", object_type: "TX_WARRANT_ISSUANCE", security_id: "war-1", stakeholder_id: "grace", date: "2023-02-01" };
const amendment = { id: "amend-1", object_type: "TX_WARRANT_AMENDMENT", security_id: "war-1", date: "2023-06-15" };
const acceptance = { id: "wa-1", object_type: "TX_WARRANT_ACCEPTANCE", security_id: "war-1", date: "2023-07-01" };
const AMENDED = subject("TX_WARRANT_AMENDMENT", "amend-1");

describe("the security an unrecognized transaction names", () => {
  it("is marked on the day it is issued, because the unrecognized transaction runs after that day's issuance", () => {
    // The amendment comes first in the file and has the same date as the issuance.
    const context = validatePackage([{ ...amendment, date: warrant.date }, warrant, acceptance], stakeholders);

    expect(context.snapshots[0].warrants).toEqual([
      { date: "2023-02-01", custom_id: undefined, stakeholder: "grace", purchase_price: undefined, defects: { lifecycle: [AMENDED], issuance: [AMENDED] } },
    ]);
    expect(context.findings.map((f) => [f.subject.id, f.check, f.outcome])).toEqual([
      ["amend-1", "transaction-type-known", "failed"],
      ["wa-1", "issuance-exists", "blocked"],
    ]);
  });

  it("is marked even when it was already removed", () => {
    const cancellation = { id: "wc-1", object_type: "TX_WARRANT_CANCELLATION", security_id: "war-1", date: "2023-04-01" };
    const context = validatePackage([warrant, cancellation, amendment], stakeholders);

    expect(context.nodes.security.get("war-1")?.lifecycle).toEqual({
      value: "removed",
      writer: { object_type: "TX_WARRANT_CANCELLATION", id: "wc-1" },
      defects: [AMENDED],
    });
    // A removed warrant stays off the cap table.
    expect(context.snapshots.at(-1)?.warrants).toEqual([]);
  });

  it("is the one in security_id: a security or stock plan named in another field is not marked", () => {
    // The made-up amendment also names a second warrant as its result and a stock plan.
    const other = { ...warrant, id: "wi-2", security_id: "war-2" };
    const grant = { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "opt-1", stakeholder_id: "grace", stock_plan_id: "plan-1", quantity: "100", date: "2023-02-01" };
    const context = validatePackage(
      [warrant, other, grant, { ...amendment, resulting_security_ids: ["war-2"], balance_security_id: "war-2", stock_plan_id: "plan-1" }],
      stakeholders,
    );

    expect(context.nodes.security.get("war-1")?.lifecycle.defects).toEqual([AMENDED]);
    expect(context.nodes.security.get("war-2")?.lifecycle.defects).toEqual([]);
    expect(context.nodes.security.get("war-2")?.issuance.defects).toEqual([]);
    expect(context.snapshots.at(-1)?.stockPlans).toEqual([{ id: "plan-1", drawn: "100" }]);
  });

  it("has nothing to mark when no issuance in the package uses that security ID", () => {
    // The acceptance reports the missing issuance itself, as a second error.
    const context = validatePackage([amendment, acceptance], stakeholders);

    expect(context.nodes.security.has("war-1")).toBe(false);
    expect(context.findings).toEqual([
      notRecognized("TX_WARRANT_AMENDMENT", "amend-1"),
      {
        severity: "error", outcome: "failed", check: "issuance-exists",
        subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "wa-1" },
        message: "No warrant issuance with security_id war-1 appears in the package.",
      },
    ]);
  });

  it.each([undefined, null])("leaves a warrant with security_id %s alone when a change names no security", (security_id) => {
    const change = { object_type: "CE_STAKEHOLDER_STATUS", id: "status", date: amendment.date, security_id };
    const context = validatePackage([{ ...warrant, security_id }, change, { ...acceptance, security_id }], stakeholders);

    expect(context.findings).toEqual([notRecognized(change.object_type, change.id)]);
    expect(context.snapshots.at(-1)?.warrants).toEqual(context.snapshots[0].warrants);
    expect(context.snapshots[0].warrants).toHaveLength(1);
  });

  it("blocks a different family's issuance check even when only the warrant has a record", () => {
    const convertible = { ...acceptance, object_type: "TX_CONVERTIBLE_ACCEPTANCE" };
    const other = { ...convertible, id: "other", security_id: "unissued" };
    const context = validatePackage([warrant, amendment, convertible, other], stakeholders);

    expect(context.findings).toMatchObject([
      { subject: AMENDED, check: "transaction-type-known", outcome: "failed" },
      { subject: { id: convertible.id }, check: "issuance-exists", outcome: "blocked", roots: [AMENDED] },
      { subject: { id: other.id }, check: "issuance-exists", outcome: "failed" },
    ]);
    expect(context.snapshots.at(-1)?.convertibles).toEqual([]);
    const nodes = structuredClone(context.nodes);
    for (const family of ["stockIssuances", "convertibleIssuances", "equityCompensation"] as const) {
      for (const field of ["issuance", "lifecycle"] as const) {
        expect(fieldAt(nodes, securityField(family, warrant.security_id, field))).toEqual({
          value: undefined, writer: undefined, defects: [AMENDED],
        });
      }
    }
  });

  it("marks the warrant and convertible when both issuances were withheld for the same security ID", () => {
    const convertible = { ...warrant, object_type: "TX_CONVERTIBLE_ISSUANCE", id: "ci-1", date: "2023-03-01" };
    const context = validatePackage([
      { ...warrant, stakeholder_id: "missing" }, convertible, amendment, acceptance,
      { ...acceptance, object_type: "TX_CONVERTIBLE_ACCEPTANCE", id: "ca-1" },
    ], stakeholders);

    const roots = [subject(warrant.object_type, warrant.id), AMENDED];
    for (const id of [acceptance.id, "ca-1"]) {
      expect(context.findings.filter((finding) => finding.subject.id === id)).toMatchObject([
        { check: "issuance-exists", outcome: "blocked", roots },
      ]);
    }
    expect(context.snapshots.at(-1)?.warrants).toEqual([{ defects: { lifecycle: roots, issuance: roots } }]);
    expect(context.nodes.security.get(warrant.security_id)?.withheldByFamily?.convertibleIssuances?.issuance.defects).toEqual(roots);
  });

  it("is left alone while another transaction has only named it", () => {
    // A cancelled option names its balance before the balance is issued. That record has no
    // lifecycle yet, and marking it would list it in snapshots before any issuance.
    const grant = { id: "eci-1", object_type: "TX_EQUITY_COMPENSATION_ISSUANCE", security_id: "opt-1", stakeholder_id: "grace", stock_plan_id: "plan-1", quantity: "100", date: "2023-01-01" };
    const cancel = { id: "ecc-1", object_type: "TX_EQUITY_COMPENSATION_CANCELLATION", security_id: "opt-1", balance_security_id: "opt-2", quantity: "40", date: "2023-03-01" };
    const named = [grant, cancel].reduce(
      (nodes, transaction) => applyTransaction(nodes, TX_DESCRIPTORS[transaction.object_type as "TX_EQUITY_COMPENSATION_ISSUANCE"], transaction),
      emptyNodes(),
    );
    expect(named.security.get("opt-2")?.lifecycle.value).toBeUndefined();

    expect(withUnrecognizedChange(named, "opt-2", AMENDED)).toBe(named);
  });

  it("also fails a later removal's no-other-transactions check, which counts every type it does not exempt", () => {
    const stock = { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "grace", stock_class_id: "common", stock_legend_ids: [], quantity: "50000", date: "2023-09-01" };
    const exercise = { id: "we-1", object_type: "TX_WARRANT_EXERCISE", security_id: "war-1", trigger_id: "t-1", resulting_security_ids: ["stock-1"], date: "2023-09-01" };
    const context = validatePackage([warrant, amendment, stock, exercise], stakeholders, [{ id: "common" }]);

    expect(context.findings.filter((f) => f.subject.id === "we-1").map((f) => [f.check, f.outcome, f.message])).toEqual([
      ["issuance-exists", "blocked", "Not checked: it reads the lifecycle of security war-1, which can't be relied on because TX_WARRANT_AMENDMENT amend-1 failed."],
      ["no-other-transactions", "failed", "Another transaction (amend-1) references the transaction's security_id."],
      ["resulting-stock-stakeholder", "blocked", "Not checked: it reads the lifecycle of security war-1, which can't be relied on because TX_WARRANT_AMENDMENT amend-1 failed."],
    ]);
    // The exercise is withheld, so the warrant is still listed.
    expect(collection(context, "warrantIssuances").map((issuance) => issuance.id)).toEqual(["wi-1"]);
  });
});

describe("an object_type that is not a transaction type at all", () => {
  // The run sends its own events to the same machine that receives transactions. A package value
  // that matches one of their names is reported like any other unrecognized type.
  it.each(["START", "RUN_EOD", "RUN_END", "UNRECOGNIZED", "*", "constructor", "__proto__"])("reports %s and finishes the run", (object_type) => {
    const context = validatePackage([warrant, { ...amendment, object_type }, acceptance], stakeholders);

    expect(context.findings.map((f) => [f.subject.object_type, f.subject.id, f.check, f.outcome])).toEqual([
      [object_type, "amend-1", "transaction-type-known", "failed"],
      ["TX_WARRANT_ACCEPTANCE", "wa-1", "issuance-exists", "blocked"],
    ]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error and 1 check blocked by it.");
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual(["2023-02-01", "2023-06-15", "2023-07-01"]);
  });
});
