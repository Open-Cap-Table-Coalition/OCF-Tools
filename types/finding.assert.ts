/** The build checks the public finding types. */
import type { OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { BlockedFinding, FailedFinding, Finding, Outcome, Severity, Subject } from "./finding";
import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";
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
  Equal<keyof Finding, "severity" | "outcome" | "check" | "message" | "subject">
>;
type _FailedKeys = Expect<Equal<keyof FailedFinding, keyof Finding>>;
type _BlockedKeys = Expect<Equal<keyof BlockedFinding, keyof Finding | "roots">>;
type _FindingIsFailedOrBlocked = Expect<Equal<Finding, FailedFinding | BlockedFinding>>;

// Pin 3b: the subject locator is { object_type, id }, with object_type keyed to
// the generated OCF schema map (any OCF object, not only transactions).
type _SubjectKeys = Expect<Equal<keyof Finding["subject"], "object_type" | "id">>;
type _SubjectObjectType = Expect<
  Equal<Finding["subject"]["object_type"], keyof ObjectTypeMap>
>;

// Each root identifies a transaction by type and ID.
type _Roots = Expect<Equal<BlockedFinding["roots"], Subject[]>>;

// Pin 4: All fields are required — no field may be accidentally made optional.
type _FailedRequired = Expect<Equal<FailedFinding, Required<FailedFinding>>>;
type _BlockedRequired = Expect<Equal<BlockedFinding, Required<BlockedFinding>>>;

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

// Pin 5d: Negative — a non-OCF object_type must be rejected (proves the
// keyof ObjectTypeMap tightening actually constrains the value).
const _badSubject: Finding = {
  severity: "error",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example message",
  subject: {
    // @ts-expect-error — "NOT_A_REAL_OBJECT_TYPE" is not a key of ObjectTypeMap
    object_type: "NOT_A_REAL_OBJECT_TYPE",
    id: "x_001",
  },
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

// Optional: pin that report's declared type is left untouched.
type _Report = Expect<Equal<OcfMachineContext["report"], any[]>>;

// Silence unused-variable warnings from tsc.
void _warningFinding;
void _errorFinding;
void _infoFinding;
void _badSubject;
void _blockedFinding;
void _blockedNoRoots;
void _failedWithRoots;
void _noOutcome;
void _rootsOf;
void _acc;
