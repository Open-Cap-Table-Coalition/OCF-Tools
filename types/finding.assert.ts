/**
 * Compile-time assertions for the graded findings model (#156) and its
 * outcome field (#227). No runtime — this file is type-checked by `tsc` (the
 * build), so a broken invariant fails the build.
 */
import type { OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { BlockedFinding, FailedFinding, Finding, Outcome, Severity, Subject } from "./finding";
import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";
import type { Expect, Equal } from "./type-assert";

// Pin 1: the findings channel is typed as Finding[].
type _FindingsChannel = Expect<Equal<OcfMachineContext["findings"], Finding[]>>;

// Pin 2: Severity is exactly "error" | "warning" — no other string is assignable.
type _Severity = Expect<Equal<Severity, "error" | "warning">>;

// Pin 2b: Outcome is exactly "failed" | "blocked", and it is a field of its
// own: neither value is a Severity, so a blocked check keeps its severity.
type _Outcome = Expect<Equal<Outcome, "failed" | "blocked">>;
type _OutcomeIsNotSeverity = Expect<Equal<Extract<Outcome, Severity>, never>>;
type _FindingOutcome = Expect<Equal<Finding["outcome"], Outcome>>;

// Pin 3: every finding has exactly these fields — catches drift if a field is
// added or renamed. A blocked finding has `roots` as well, and a failed one
// doesn't.
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

// Pin 3c: a blocked finding carries all its roots, each located as a subject is.
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

// Pin 5e: A blocked finding names its roots, and keeps a severity of its own:
// here a warning-level check that couldn't run.
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

// Pin 5f: Negative — a blocked finding must say what blocked it.
// @ts-expect-error — a blocked finding requires `roots`.
const _blockedNoRoots: Finding = {
  severity: "error",
  outcome: "blocked",
  check: "EXAMPLE_CHECK",
  message: "Example blocked message",
  subject: { object_type: "TX_WARRANT_ACCEPTANCE", id: "tx_004" },
};

// Pin 5g: Negative — a check that ran has no roots: it is one.
const _failedWithRoots: Finding = {
  severity: "error",
  outcome: "failed",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "TX_WARRANT_ISSUANCE", id: "tx_002" },
  // @ts-expect-error — only a blocked finding has `roots`.
  roots: [],
};

// Pin 5h: Negative — every finding states its outcome.
// @ts-expect-error — a finding requires `outcome`.
const _noOutcome: Finding = {
  severity: "error",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "TX_WARRANT_ISSUANCE", id: "tx_002" },
};

// Pin 5i: `outcome` narrows a finding, so `roots` is read only off a blocked one.
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
