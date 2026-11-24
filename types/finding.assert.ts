/** The build checks the public finding types. */
import type { OcfMachineContext } from "./validator";
import type { BlockedFinding, FailedFinding, Finding, Outcome, Severity, Subject } from "./finding";
import type { DefectMark, SnapshotStockPlan } from "./snapshot";
import type { Expect, Equal } from "./type-assert";

// Pin 1: the findings channel is typed as Finding[].
type _FindingsChannel = Expect<Equal<OcfMachineContext["findings"], Finding[]>>;

// Pin 2: Severity is exactly "error" | "warning" — no other string is assignable.
type _Severity = Expect<Equal<Severity, "error" | "warning">>;

// Severity describes the problem. Outcome records whether the check failed or was blocked.
type _Outcome = Expect<Equal<Outcome, "failed" | "blocked">>;
type _OutcomeIsNotSeverity = Expect<Equal<Extract<Outcome, Severity>, never>>;
type _FindingOutcome = Expect<Equal<Finding["outcome"], Outcome>>;

// Check the fields on failed and blocked findings, including roots on blocked findings.
type _FindingKeys = Expect<
  Equal<keyof Finding, "severity" | "outcome" | "check" | "message" | "subject" | "date">
>;
type _FailedKeys = Expect<Equal<keyof FailedFinding, keyof Finding>>;
type _BlockedKeys = Expect<Equal<keyof BlockedFinding, keyof Finding | "roots">>;
type _FindingIsFailedOrBlocked = Expect<Equal<Finding, FailedFinding | BlockedFinding>>;

// The package can supply any string for object_type, including in blocked roots and snapshot defects.
type _SubjectKeys = Expect<Equal<keyof Finding["subject"], "object_type" | "id">>;
type _SubjectObjectType = Expect<Equal<Finding["subject"]["object_type"], string>>;
type _Roots = Expect<Equal<BlockedFinding["roots"], Subject[]>>;
type _SecurityDefects = Expect<Equal<DefectMark["defects"][keyof DefectMark["defects"]], Subject[] | undefined>>;
type PlanDefects = NonNullable<SnapshotStockPlan["defects"]>;
type _PlanDefects = Expect<Equal<PlanDefects[keyof PlanDefects], Subject[] | undefined>>;

// The date is optional because transaction findings omit it.
type _FailedRequired = Expect<Equal<Omit<FailedFinding, "date">, Required<Omit<FailedFinding, "date">>>>;
type _BlockedRequired = Expect<Equal<Omit<BlockedFinding, "date">, Required<Omit<BlockedFinding, "date">>>>;
type _AggregateDate = Expect<Equal<Finding["date"], string | undefined>>;

// Pin 5a: Positive literal with severity "warning" and a transaction subject.
const _warningFinding: Finding = {
  severity: "warning",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example warning message",
  subject: { object_type: "TX_STOCK_ISSUANCE", id: "tx_001" },
};

// Pin 5b: Positive literal with severity "error" and a NON-transaction subject
// (proves the subject locator generalizes beyond transactions).
const _errorFinding: Finding = {
  severity: "error",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "STAKEHOLDER", id: "st_001" },
};

// Pin 5c: Negative — severity "info" must be rejected.
const _infoFinding: Finding = {
  // @ts-expect-error — "info" is not assignable to Severity ("error" | "warning")
  severity: "info",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example info message",
  subject: { object_type: "TX_STOCK_ISSUANCE", id: "tx_003" },
};

// A blocked warning keeps warning severity and names the failures that blocked it.
const _blockedFinding: Finding = {
  severity: "warning",
  outcome: "blocked",
  check: "EXAMPLE_CHECK",
  message: "Example blocked message",
  subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "tx_004" },
  roots: [
    { object_type: "TX_WARRANT_ISSUANCE", id: "tx_002" },
    { object_type: "TX_WARRANT_TRANSFER", id: "tx_003" },
  ],
};

// @ts-expect-error A blocked finding must identify its roots.
const _blockedNoRoots: Finding = {
  severity: "error",
  outcome: "blocked",
  check: "EXAMPLE_CHECK",
  message: "Example blocked message",
  subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "tx_004" },
};

// A failed check reports its own problem.
const _failedWithRoots: Finding = {
  severity: "error",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "TX_WARRANT_ISSUANCE", id: "tx_002" },
  // @ts-expect-error Only blocked findings carry roots.
  roots: [],
};

// @ts-expect-error Every finding needs an outcome.
const _noOutcome: Finding = {
  severity: "error",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "TX_WARRANT_ISSUANCE", id: "tx_002" },
};

// Checking the outcome tells TypeScript when roots can be read.
const _rootsOf = (finding: Finding): Subject[] => (finding.outcome === "blocked" ? finding.roots : []);

// Pin 6: Accumulation guard — xstate-style append must type-check.
const _acc = (c: OcfMachineContext, f: Finding): Finding[] => [
  ...c.findings,
  f,
];

type _NoLegacyReport = Expect<Equal<Extract<keyof OcfMachineContext, "report" | "lastErrorFindings">, never>>;

// Silence unused-variable warnings from tsc.
void _warningFinding;
void _errorFinding;
void _infoFinding;
void _blockedFinding;
void _blockedNoRoots;
void _failedWithRoots;
void _noOutcome;
void _rootsOf;
void _acc;
