/**
 * Compile-time assertions for the graded findings model (#156). No runtime —
 * this file is type-checked by `tsc` (the build) because it is not a `*.test.ts`
 * file, so a broken invariant fails the build.
 */
import type { OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { Finding, Severity } from "./finding";
import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";
import type { Expect, Equal } from "./type-assert";

// Pin 1: the findings channel is typed as Finding[].
type _FindingsChannel = Expect<Equal<OcfMachineContext["findings"], Finding[]>>;

// Pin 2: Severity is exactly "error" | "warning" — no other string is assignable.
type _Severity = Expect<Equal<Severity, "error" | "warning">>;

// Pin 3: Finding has exactly these fields — catches drift if a field is added or renamed.
type _FindingKeys = Expect<
  Equal<keyof Finding, "severity" | "check" | "message" | "subject">
>;

// Pin 3b: the subject locator is { object_type, id }, with object_type keyed to
// the generated OCF schema map (any OCF object, not only transactions).
type _SubjectKeys = Expect<Equal<keyof Finding["subject"], "object_type" | "id">>;
type _SubjectObjectType = Expect<
  Equal<Finding["subject"]["object_type"], keyof ObjectTypeMap>
>;

// Pin 4: All fields are required — no field may be accidentally made optional.
type _FindingRequired = Expect<Equal<Finding, Required<Finding>>>;

// Pin 5a: Positive literal with severity "warning" and a transaction subject.
const _warningFinding: Finding = {
  severity: "warning",
  check: "EXAMPLE_CHECK",
  message: "Example warning message",
  subject: { object_type: "TX_STOCK_ISSUANCE", id: "tx_001" },
};

// Pin 5b: Positive literal with severity "error" and a NON-transaction subject
// (proves the subject locator generalizes beyond transactions).
const _errorFinding: Finding = {
  severity: "error",
  check: "EXAMPLE_CHECK",
  message: "Example error message",
  subject: { object_type: "STAKEHOLDER", id: "st_001" },
};

// Pin 5c: Negative — severity "info" must be rejected.
const _infoFinding: Finding = {
  // @ts-expect-error — "info" is not assignable to Severity ("error" | "warning")
  severity: "info",
  check: "EXAMPLE_CHECK",
  message: "Example info message",
  subject: { object_type: "TX_STOCK_ISSUANCE", id: "tx_003" },
};

// Pin 5d: Negative — a non-OCF object_type must be rejected (proves the
// keyof ObjectTypeMap tightening actually constrains the value).
const _badSubject: Finding = {
  severity: "error",
  check: "EXAMPLE_CHECK",
  message: "Example message",
  subject: {
    // @ts-expect-error — "NOT_A_REAL_OBJECT_TYPE" is not a key of ObjectTypeMap
    object_type: "NOT_A_REAL_OBJECT_TYPE",
    id: "x_001",
  },
};

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
void _acc;
