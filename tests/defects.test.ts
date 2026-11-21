import { afterEach, describe, it, expect, vi } from "vitest";
import { applyTransaction, emptyNodes, outstandingSecurity, securityField, type NodeMap } from "../ocf_validator/nodes";
import { completedResult, TX_DESCRIPTORS, verdictOf, type TxKey } from "../ocf_validator/ocfMachine";
import { defineValidator, toValidate, type CheckObject } from "../ocf_validator/validators/checkKit";
import type { Finding, Subject } from "../types/finding";
import { baseContext, collection, contextWith, validatePackage } from "./helpers";

// Check that failures preserve the last known values, block dependent checks and allow independent
// transactions to run.

const subject = (object_type: string, id: string) => ({ object_type, id }) as Subject;

const WARRANT_ISSUANCE = subject("TX_WARRANT_ISSUANCE", "wi-1");

const warrant = (fields: Record<string, unknown> = {}) => ({
  id: "wi-1",
  object_type: "TX_WARRANT_ISSUANCE",
  security_id: "war-1",
  stakeholder_id: "sh-1",
  date: "2021-01-01",
  ...fields,
});
const on = (object_type: string, id: string, date: string, fields: Record<string, unknown> = {}) => ({
  id,
  object_type,
  security_id: "war-1",
  date,
  ...fields,
});

/** Apply transactions with the supplied validation decisions. */
const reduce = (...steps: [Record<string, any>, (readonly Subject[])?][]): NodeMap =>
  steps.reduce(
    (nodes, [transaction, roots]) =>
      applyTransaction(nodes, TX_DESCRIPTORS[transaction.object_type as TxKey], transaction as any, roots ? { ok: false, roots } : { ok: true }),
    emptyNodes(),
  );

// Security records after a failed transaction

describe("a transaction whose writes are withheld", () => {
  it("creates its security's node when it's a failed issuance, marked, with nothing known", () => {
    const nodes = reduce([warrant(), [WARRANT_ISSUANCE]]);

    expect(nodes.security.get("war-1")).toEqual({
      kind: "security",
      id: "war-1",
      family: "warrantIssuances",
      lifecycle: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
      issuance: { value: undefined, writer: undefined, defects: [WARRANT_ISSUANCE] },
    });
  });

  it("leaves a security a failed removal names as it was, with its lifecycle marked and its issuance not", () => {
    const cancellation = on("TX_WARRANT_CANCELLATION", "wc-1", "2021-06-01");
    const issued = reduce([warrant()]);
    const nodes = applyTransaction(issued, TX_DESCRIPTORS.TX_WARRANT_CANCELLATION, cancellation as any, {
      ok: false,
      roots: [subject("TX_WARRANT_CANCELLATION", "wc-1")],
    });

    const node = nodes.security.get("war-1");
    // The security remains outstanding with its issuance as the last writer.
    expect(node?.lifecycle).toEqual({ value: "outstanding", writer: WARRANT_ISSUANCE, defects: [subject("TX_WARRANT_CANCELLATION", "wc-1")] });
    // The issuance field is still reliable.
    expect(node?.issuance).toBe(issued.security.get("war-1")?.issuance);
  });

  it("marks the lifecycle of a security a failed acceptance or vesting event names, though a valid one writes nothing", () => {
    const issued = reduce([warrant()]);
    for (const [type, id] of [["TX_WARRANT_ACCEPTANCE", "wa-1"], ["TX_VESTING_EVENT", "ve-1"]] as const) {
      const transaction = on(type, id, "2021-02-01");
      expect(applyTransaction(issued, TX_DESCRIPTORS[type], transaction as any)).toBe(issued);
      expect(
        applyTransaction(issued, TX_DESCRIPTORS[type], transaction as any, { ok: false, roots: [subject(type, id)] }).security.get("war-1")?.lifecycle.defects,
      ).toEqual([subject(type, id)]);
    }
  });

  it("marks nothing when the map holds no security of its family under that id", () => {
    const issued = reduce([warrant()]);
    const roots = [subject("TX_CONVERTIBLE_ACCEPTANCE", "ca-1")];

    // Neither transaction targets an existing security of the required family.
    expect(applyTransaction(issued, TX_DESCRIPTORS.TX_CONVERTIBLE_ACCEPTANCE, on("TX_CONVERTIBLE_ACCEPTANCE", "ca-1", "2021-02-01") as any, { ok: false, roots })).toBe(issued);
    expect(applyTransaction(issued, TX_DESCRIPTORS.TX_WARRANT_CANCELLATION, { ...on("TX_WARRANT_CANCELLATION", "wc-1", "2021-02-01"), security_id: "nothing" } as any, { ok: false, roots })).toBe(issued);
  });

  it("keeps the values of a security a failed second issuance would have replaced", () => {
    const again = warrant({ id: "wi-2", stakeholder_id: "sh-2" });
    const nodes = reduce([warrant()], [again, [subject("TX_WARRANT_ISSUANCE", "wi-2")]]);

    const node = nodes.security.get("war-1");
    expect(node?.issuance.value).toMatchObject({ id: "wi-1" });
    expect(node?.lifecycle.value).toBe("outstanding");
    expect(node?.lifecycle.defects).toEqual([subject("TX_WARRANT_ISSUANCE", "wi-2")]);
    expect(node?.issuance.defects).toEqual([subject("TX_WARRANT_ISSUANCE", "wi-2")]);
  });

  it("holds every root once, and never drops one", () => {
    const first = subject("TX_WARRANT_CANCELLATION", "wc-1");
    const second = subject("TX_WARRANT_TRANSFER", "wt-1");
    const nodes = reduce(
      [warrant()],
      [on("TX_WARRANT_CANCELLATION", "wc-1", "2021-02-01"), [first]],
      [on("TX_WARRANT_TRANSFER", "wt-1", "2021-03-01"), [first, second]],
      [on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-04-01"), [second]],
    );

    expect(nodes.security.get("war-1")?.lifecycle.defects).toEqual([first, second]);
  });

  it("is still marked after a valid transaction that writes the field", () => {
    // A later valid issuance and cancellation update the values and writers. Both retain the earlier
    // issuance failure.
    const again = warrant({ id: "wi-2", date: "2021-02-01" });
    const issuedAgain = reduce([warrant(), [WARRANT_ISSUANCE]], [again]);

    expect(issuedAgain.security.get("war-1")?.lifecycle).toEqual({
      value: "outstanding",
      writer: subject("TX_WARRANT_ISSUANCE", "wi-2"),
      defects: [WARRANT_ISSUANCE],
    });
    expect(issuedAgain.security.get("war-1")?.issuance).toEqual({ value: again, writer: subject("TX_WARRANT_ISSUANCE", "wi-2"), defects: [WARRANT_ISSUANCE] });

    const cancelled = applyTransaction(issuedAgain, TX_DESCRIPTORS.TX_WARRANT_CANCELLATION, on("TX_WARRANT_CANCELLATION", "wc-1", "2021-03-01") as any);
    expect(cancelled.security.get("war-1")?.lifecycle).toEqual({
      value: "removed",
      writer: subject("TX_WARRANT_CANCELLATION", "wc-1"),
      defects: [WARRANT_ISSUANCE],
    });
  });

  it("is still marked after a valid transaction that doesn't write the field", () => {
    const nodes = reduce([warrant(), [WARRANT_ISSUANCE]], [on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-02-01")]);

    expect(nodes.security.get("war-1")?.lifecycle.defects).toEqual([WARRANT_ISSUANCE]);
  });
});

// Fields required by a check

describe("a check that declares its reads", () => {
  const lifecycleOf = (data: { security_id: string }) => securityField("warrantIssuances", data.security_id, "lifecycle");

  const readsLifecycle = {
    id: "reads-lifecycle",
    severity: "warning",
    description: "Reads the security's lifecycle.",
    reads: (data) => [lifecycleOf(data)],
    run: (_context, data, read) => [`It is ${read(lifecycleOf(data))}.`],
  } satisfies CheckObject<{ security_id: string }>;

  const readsNothing = {
    id: "reads-nothing",
    severity: "error",
    description: "Reads only the transaction.",
    run: (_context, data) => [`It names ${data.security_id}.`],
  } satisfies CheckObject<{ security_id: string }>;

  const acceptance = on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-02-01");
  const ACCEPTANCE = subject("TX_WARRANT_ACCEPTANCE", "wa-1");
  const validate = toValidate([readsLifecycle, readsNothing]);

  it("runs on a field that can be trusted, and is handed its value", () => {
    const context = baseContext({ warrantIssuances: [warrant()] });

    expect(validate(context, acceptance).map((finding) => [finding.check, finding.outcome, finding.message])).toEqual([
      ["reads-lifecycle", "failed", "It is outstanding."],
      ["reads-nothing", "failed", "It names war-1."],
    ]);
  });

  it("runs on a security the map doesn't hold, and reads nothing there", () => {
    expect(validate(baseContext(), acceptance)[0].message).toBe("It is undefined.");
  });

  it("comes back blocked on a marked field, with the roots, while the transaction's other checks run", () => {
    const context = baseContext({ nodes: reduce([warrant(), [WARRANT_ISSUANCE]]) });

    expect(validate(context, acceptance)).toEqual([
      {
        // Blocking a warning preserves its severity.
        severity: "warning",
        outcome: "blocked",
        check: "reads-lifecycle",
        message: "Not checked: it reads the lifecycle of security war-1, which can't be relied on because TX_WARRANT_ISSUANCE wi-1 failed.",
        subject: ACCEPTANCE,
        roots: [WARRANT_ISSUANCE],
      },
      { severity: "error", outcome: "failed", check: "reads-nothing", message: "It names war-1.", subject: ACCEPTANCE },
    ]);
  });

  it("carries every root of a field marked more than once", () => {
    const cancellation = subject("TX_WARRANT_CANCELLATION", "wc-1");
    const transfer = subject("TX_WARRANT_TRANSFER", "wt-1");
    const context = baseContext({
      nodes: reduce(
        [warrant(), [WARRANT_ISSUANCE]],
        [on("TX_WARRANT_CANCELLATION", "wc-1", "2021-02-01"), [cancellation]],
        [on("TX_WARRANT_TRANSFER", "wt-1", "2021-03-01"), [transfer]],
      ),
    });

    const [blocked] = validate(context, acceptance);
    expect(blocked).toMatchObject({ outcome: "blocked", roots: [WARRANT_ISSUANCE, cancellation, transfer] });
    expect(blocked.message).toContain("because TX_WARRANT_ISSUANCE wi-1, TX_WARRANT_CANCELLATION wc-1, and TX_WARRANT_TRANSFER wt-1 failed.");
  });

  it("isn't blocked by defects on a field it doesn't read", () => {
    // The check only needs the lifecycle. Failures on either issuance field should leave it free to
    // run.
    const issued = reduce([warrant()]);
    const node = outstandingSecurity(issued, "warrantIssuances", "war-1")!;
    const nodes: NodeMap = {
      ...issued,
      security: new Map(issued.security).set("war-1", { ...node, issuance: { ...node.issuance, defects: [WARRANT_ISSUANCE] } }),
    };

    expect(validate(baseContext({ nodes }), acceptance)[0]).toMatchObject({ outcome: "failed", message: "It is outstanding." });
  });

  it("fails, as a check that threw, if it reads a field it didn't declare", () => {
    const readsUndeclared = {
      id: "reads-undeclared",
      severity: "warning",
      description: "Reads the issuance while declaring only the lifecycle.",
      reads: (data) => [lifecycleOf(data)],
      run: (_context, data, read) => [`${read(securityField("warrantIssuances", data.security_id, "issuance"))}`],
    } satisfies CheckObject<{ security_id: string }>;

    expect(toValidate([readsUndeclared])(baseContext({ warrantIssuances: [warrant()] }), acceptance)).toEqual([
      {
        severity: "error",
        outcome: "failed",
        check: "reads-undeclared",
        message: "The check threw Error: It read the issuance of security war-1, which it doesn't declare in its reads.",
        subject: ACCEPTANCE,
      },
    ]);
  });

  it("is given a context with no node map on it, so `read` is its only way in", () => {
    let seen: Record<string, unknown> = {};
    const looks = {
      id: "looks",
      severity: "error",
      description: "Looks at the context it's given.",
      run: (context) => {
        seen = context as Record<string, unknown>;
        return [];
      },
    } satisfies CheckObject;

    toValidate([looks])(baseContext({ warrantIssuances: [warrant()] }), acceptance);

    expect(seen).not.toHaveProperty("nodes");
    expect(seen).toHaveProperty("ocfPackageContent");
    expect(seen).toHaveProperty("removals");
  });

  it("holds for every check in the real table: none reads a field it didn't declare", () => {
    // Run each validator with and without an outstanding security. A read missing from its
    // declaration produces an exception finding.
    for (const [type, descriptor] of Object.entries(TX_DESCRIPTORS)) {
      if (!("validate" in descriptor)) continue;
      // A pool adjustment reads no security, so the test's starting security cannot affect it.
      const family = ("collection" in descriptor ? descriptor.collection : descriptor.families[0]) ?? "stockIssuances";
      const seeded = { id: "seed", object_type: "seed", security_id: "sec-1", stakeholder_id: "sh-1", date: "2020-01-01" };
      const data = { id: "tx-1", object_type: type, security_id: "sec-1", stakeholder_id: "sh-1", resulting_security_ids: ["stock-1"], date: "2021-01-01" };
      for (const context of [contextWith({ [family]: [seeded], stakeholders: [{ id: "sh-1" }] }), contextWith()]) {
        for (const finding of descriptor.validate(context, data as any)) {
          expect(finding.message).not.toContain("The check threw");
        }
      }
    }
  });
});

// How findings affect writes

describe("the verdict on a transaction's writes", () => {
  const TRANSFER = subject("TX_WARRANT_TRANSFER", "wt-1");
  const failed = (severity: Finding["severity"]): Finding => ({ severity, outcome: "failed", check: "c", message: "m", subject: TRANSFER });
  const blocked = (severity: Finding["severity"], ...roots: Subject[]): Finding => ({
    severity,
    outcome: "blocked",
    check: "c",
    message: "m",
    subject: TRANSFER,
    roots,
  });
  const CANCELLATION = subject("TX_WARRANT_CANCELLATION", "wc-1");

  it("applies them when nothing was found, or only warnings were", () => {
    expect(verdictOf(TRANSFER, [])).toEqual({ ok: true });
    expect(verdictOf(TRANSFER, [failed("warning")])).toEqual({ ok: true });
    // A blocked warning allows the writes.
    expect(verdictOf(TRANSFER, [blocked("warning", WARRANT_ISSUANCE)])).toEqual({ ok: true });
  });

  it("withholds them with the transaction as the root when one of its error checks failed", () => {
    expect(verdictOf(TRANSFER, [failed("warning"), failed("error")])).toEqual({ ok: false, roots: [TRANSFER] });
  });

  it("withholds them with the roots that blocked it when it was only blocked: it isn't a root itself", () => {
    expect(verdictOf(TRANSFER, [blocked("error", WARRANT_ISSUANCE, CANCELLATION)])).toEqual({
      ok: false,
      roots: [WARRANT_ISSUANCE, CANCELLATION],
    });
  });

  it("names both when it failed and was blocked, each root once", () => {
    expect(verdictOf(TRANSFER, [blocked("error", WARRANT_ISSUANCE), failed("error"), blocked("error", WARRANT_ISSUANCE, CANCELLATION)])).toEqual({
      ok: false,
      roots: [TRANSFER, WARRANT_ISSUANCE, CANCELLATION],
    });
  });
});

// Whole-package validation

const stakeholders = [{ id: "sh-1" }];
const outcomes = (findings: Finding[]) => findings.map((finding) => [finding.subject.id, finding.check, finding.outcome]);

describe("a failed issuance followed by transactions on its security", () => {
  it("blocks each of them at the check that reads the security, and reports one root", () => {
    const context = validatePackage(
      [
        warrant({ stakeholder_id: "nobody" }),
        on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-02-01"),
        on("TX_VESTING_EVENT", "ve-1", "2021-03-01"),
        on("TX_WARRANT_EXERCISE", "we-1", "2021-04-01", { resulting_security_ids: [] }),
      ],
      stakeholders,
    );

    expect(outcomes(context.findings)).toEqual([
      ["wi-1", "stakeholder-exists", "failed"],
      ["wa-1", "issuance-exists", "blocked"],
      ["ve-1", "no-earlier-removal", "blocked"],
      ["we-1", "issuance-exists", "blocked"],
      // Checks that only need the package or transaction can still run.
      ["we-1", "resulting-security-named", "failed"],
      // The stakeholder comparison also reads the security record.
      ["we-1", "resulting-stock-stakeholder", "blocked"],
    ]);
    for (const finding of context.findings) {
      if (finding.outcome === "blocked") expect(finding.roots).toEqual([WARRANT_ISSUANCE]);
    }
    expect(context.result).toBe(
      "The validation of the OCF package for Test Co is complete and found 1 error and 4 checks blocked by it, with 1 warning.",
    );
  });
});

describe("a transfer from a marked security", () => {
  it("is blocked, and passes the defects on to what it writes without becoming a root", () => {
    // The failed issuance blocks the transfer's issuance check. Carry that original failure onto the
    // fields the transfer would change.
    const context = validatePackage(
      [
        warrant({ stakeholder_id: "nobody" }),
        on("TX_WARRANT_TRANSFER", "wt-1", "2021-02-01", { resulting_security_ids: [] }),
        on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-03-01"),
      ],
      stakeholders,
    );

    expect(outcomes(context.findings)).toEqual([
      ["wi-1", "stakeholder-exists", "failed"],
      ["wt-1", "issuance-exists", "blocked"],
      ["wa-1", "issuance-exists", "blocked"],
    ]);
    // The acceptance should identify the original failed issuance as the cause.
    expect(context.findings[2]).toMatchObject({ roots: [WARRANT_ISSUANCE] });
    expect(context.nodes.security.get("war-1")?.lifecycle.defects).toEqual([WARRANT_ISSUANCE]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error and 2 checks blocked by it.");
  });
});

describe("a failed removal", () => {
  it("leaves its security outstanding and marked, and blocks what follows on it, pointing at the removal", () => {
    // The conversion names a stock issuance missing from the package.
    const context = validatePackage(
      [
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", custom_id: "SAFE-1", date: "2021-01-01" },
        { id: "cv-1", object_type: "TX_CONVERTIBLE_CONVERSION", security_id: "safe-1", resulting_security_ids: ["none"], date: "2021-02-01" },
        { id: "ca-1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "safe-1", date: "2021-03-01" },
      ],
      stakeholders,
    );
    const conversion = subject("TX_CONVERTIBLE_CONVERSION", "cv-1");

    expect(outcomes(context.findings)).toEqual([
      ["cv-1", "resulting-stock-exists", "failed"],
      ["ca-1", "issuance-exists", "blocked"],
    ]);
    expect(context.findings[1]).toMatchObject({ roots: [conversion] });
    // The failed conversion leaves the SAFE in subsequent snapshots with an unreliable lifecycle.
    expect(collection(context, "convertibleIssuances").map((issuance) => issuance.id)).toEqual(["ci-1"]);
    expect(context.snapshots.map((snapshot) => snapshot.convertibles)).toEqual([
      [{ date: "2021-01-01", custom_id: "SAFE-1", stakeholder: "sh-1" }],
      [{ date: "2021-01-01", custom_id: "SAFE-1", stakeholder: "sh-1", defects: { lifecycle: [conversion] } }],
      [{ date: "2021-01-01", custom_id: "SAFE-1", stakeholder: "sh-1", defects: { lifecycle: [conversion] } }],
    ]);
  });
});

describe("an unrelated security", () => {
  it("validates to the end, and its entries carry no mark", () => {
    const context = validatePackage(
      [
        warrant({ stakeholder_id: "nobody" }),
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", custom_id: "SAFE-1", date: "2021-02-01" },
        { id: "ca-1", object_type: "TX_CONVERTIBLE_ACCEPTANCE", security_id: "safe-1", date: "2021-03-01" },
        { id: "cc-1", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "safe-1", date: "2021-04-01" },
      ],
      stakeholders,
    );

    expect(outcomes(context.findings)).toEqual([["wi-1", "stakeholder-exists", "failed"]]);
    expect(context.snapshots.map((snapshot) => snapshot.convertibles)).toEqual([
      [],
      [{ date: "2021-02-01", custom_id: "SAFE-1", stakeholder: "sh-1" }],
      [{ date: "2021-02-01", custom_id: "SAFE-1", stakeholder: "sh-1" }],
      [],
    ]);
    expect(context.result).toBe("The validation of the OCF package for Test Co is complete and found 1 error.");
  });
});

describe("a passthrough transaction on a removed security", () => {
  it("is reported and the run goes on, with nothing to mark on a security that isn't of its families", () => {
    // Convertibles have no vesting terms, so this vesting event has no applicable security to mark.
    const context = validatePackage(
      [
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", date: "2021-01-01" },
        { id: "cc-1", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "safe-1", date: "2021-02-01" },
        { id: "ve-1", object_type: "TX_VESTING_EVENT", security_id: "safe-1", date: "2021-03-01" },
        { id: "ci-2", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-2", stakeholder_id: "sh-1", date: "2021-04-01" },
      ],
      stakeholders,
    );

    expect(outcomes(context.findings)).toEqual([["ve-1", "no-earlier-removal", "failed"]]);
    expect(context.nodes.security.get("safe-1")?.lifecycle.defects).toEqual([]);
    expect(collection(context, "convertibleIssuances").map((issuance) => issuance.id)).toEqual(["ci-2"]);
  });
});

describe("a stock failure", () => {
  it("still stops the run, after the findings recorded before it", () => {
    // Validation continues after the warrant failure and stops at the invalid legacy stock issuance
    // (#229).
    const context = validatePackage(
      [
        warrant({ stakeholder_id: "nobody" }),
        { id: "si-1", object_type: "TX_STOCK_ISSUANCE", security_id: "stock-1", stakeholder_id: "nobody", stock_class_id: "sc-1", stock_legend_ids: [], date: "2021-02-01" },
        { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "nobody", date: "2021-03-01" },
      ],
      stakeholders,
      [{ id: "sc-1" }],
    );

    expect(outcomes(context.findings)).toEqual([["wi-1", "stakeholder-exists", "failed"]]);
    expect(context.result).toMatch(/^The validation of the OCF package for Test Co failed on si-1: /);
    expect(context.snapshots.map((snapshot) => snapshot.date)).toEqual(["2021-01-01"]);
  });
});

// Result of a completed run

describe("result counts root errors, blocked checks, and warnings apart", () => {
  const finding = (severity: Finding["severity"], outcome: Finding["outcome"]): Finding =>
    outcome === "blocked"
      ? { severity, outcome, check: "c", message: "m", subject: WARRANT_ISSUANCE, roots: [WARRANT_ISSUANCE] }
      : { severity, outcome, check: "c", message: "m", subject: WARRANT_ISSUANCE };
  const resultOf = (...findings: Finding[]) => completedResult(baseContext({ findings }));
  const PREFIX = "The validation of the OCF package for Test Co is complete and";

  it.each([
    { findings: [], result: "the package appears valid." },
    { findings: [finding("warning", "failed")], result: "the package appears valid, with 1 warning." },
    { findings: [finding("error", "failed")], result: "found 1 error." },
    { findings: [finding("error", "failed"), finding("error", "failed")], result: "found 2 errors." },
    { findings: [finding("error", "failed"), finding("error", "blocked")], result: "found 1 error and 1 check blocked by it." },
    {
      findings: [finding("error", "failed"), finding("error", "blocked"), finding("warning", "blocked")],
      result: "found 1 error and 2 checks blocked by it.",
    },
    {
      findings: [finding("error", "failed"), finding("error", "failed"), finding("error", "blocked"), finding("warning", "failed"), finding("warning", "failed")],
      result: "found 2 errors and 1 check blocked by them, with 2 warnings.",
    },
  ])("$result", ({ findings, result }) => {
    expect(resultOf(...findings)).toBe(`${PREFIX} ${result}`);
  });
});

// Number of validator calls

describe("a graded validator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs once for its transaction, valid or not", () => {
    const validate = vi.spyOn(TX_DESCRIPTORS.TX_WARRANT_ISSUANCE, "validate");

    validatePackage([warrant(), warrant({ id: "wi-2", security_id: "war-2", stakeholder_id: "nobody", date: "2021-02-01" })], stakeholders);

    expect(validate).toHaveBeenCalledTimes(2);
  });

  it("built by defineValidator declares its reads on the checks it was given", () => {
    const check = {
      id: "reads-lifecycle",
      severity: "error",
      description: "Reads the security's lifecycle.",
      reads: (data) => [securityField("warrantIssuances", data.security_id, "lifecycle")],
      run: () => [],
    } satisfies CheckObject<{ security_id: string }>;
    const { validate } = defineValidator({ transaction: "TX_WARRANT_ACCEPTANCE", effect: "none", families: ["warrantIssuances"], checks: [check] });

    const context = baseContext({ nodes: reduce([warrant(), [WARRANT_ISSUANCE]]) });
    expect(validate(context, on("TX_WARRANT_ACCEPTANCE", "wa-1", "2021-02-01") as any)).toMatchObject([{ outcome: "blocked", roots: [WARRANT_ISSUANCE] }]);
  });
});
