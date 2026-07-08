/**
 * Compile-time assertions for the per-transaction descriptors. No runtime — this
 * file is type-checked by `tsc` (the build) because it is not a `*.test.ts` file,
 * so a broken invariant fails the build.
 *
 * Covers:
 *  - the descriptors are exhaustive over every `TxKey` (dropping any key fails);
 *  - `appendToCollection` rejects a wrong-family payload;
 *  - an `append` descriptor rejects a collection whose family does not match the
 *    payload its `legacyValidate` checks;
 *  - the same family match holds for graded `validate` descriptors;
 *  - a `Check` literal requires `id`, `severity`, and `description`, and admits
 *    `implemented` only when absent or literally `false`;
 *  - every graded descriptor arm carries its declared `checks`, and a graded
 *    descriptor missing `checks` is not a `Descriptor`.
 */
import type {
  OCFWarrantIssuance,
  OCFConvertibleIssuance,
} from "@opencaptablecoalition/ocf-types";
import {
  appendToCollection,
  TX_DESCRIPTORS,
  type TxKey,
  type Descriptor,
} from "../ocf_validator/ocfMachine";
import type { Check, GradedValidator, OcfMachineContext } from "./validator";
import type { Expect, Equal } from "./type-assert";

// --- Declared check metadata ------------------------------------------------

// A well-formed check collection — one implemented check and one declared gap —
// reused by the graded descriptor examples below.
const _gradedChecks: readonly Check[] = [
  { id: "stakeholder-exists", severity: "error", description: "The referenced stakeholder exists in the package." },
  { id: "quantity-positive", severity: "warning", description: "The issued quantity is positive.", implemented: false },
];

// A graded validator whose payload family the none/remove arms ignore (they take
// GradedValidator<any>); declared, not defined, so this file stays runtime-free.
declare const gradedValidate: GradedValidator<any>;

// An implemented check omits `implemented`; each required field is present.
const _check: Check = {
  id: "stakeholder-exists",
  severity: "error",
  description: "The referenced stakeholder exists in the package.",
};

// A declared gap sets `implemented: false` — the only value the field admits.
const _checkGap: Check = {
  id: "stakeholder-exists",
  severity: "warning",
  description: "The referenced stakeholder exists in the package.",
  implemented: false,
};

// Dropping `id` (the one-field delta from `_check`) fails to compile.
// @ts-expect-error — a Check requires `id`.
const _checkNoId: Check = {
  severity: "error",
  description: "The referenced stakeholder exists in the package.",
};

// Dropping `severity` fails to compile.
// @ts-expect-error — a Check requires `severity`.
const _checkNoSeverity: Check = {
  id: "stakeholder-exists",
  description: "The referenced stakeholder exists in the package.",
};

// Dropping `description` fails to compile.
// @ts-expect-error — a Check requires `description`.
const _checkNoDescription: Check = {
  id: "stakeholder-exists",
  severity: "error",
};

// `implemented: true` is unrepresentable — the field is a gap marker, not a claim.
const _checkImplementedTrue: Check = {
  id: "stakeholder-exists",
  severity: "error",
  description: "The referenced stakeholder exists in the package.",
  // @ts-expect-error — `implemented` is `false` (a declared gap) or absent, never true.
  implemented: true,
};

// --- Exhaustiveness: the descriptors cover every TX key --------------------

// The descriptor keys are exactly `TxKey` — drop any key and this turns false.
type _Exhaustive = Expect<Equal<keyof typeof TX_DESCRIPTORS, TxKey>>;

// A map missing any key does not satisfy `Record<TxKey, …>`. Demonstrated by
// omitting all but one key from an annotated sample.
// @ts-expect-error — Record<TxKey, Descriptor> requires every TxKey to be present.
const _keyOmitted: Record<TxKey, Descriptor> = {
  TX_VESTING_START: { effect: "passthrough" },
};

// --- Wrong-family payload is a compile error -------------------------------

// The matching family compiles…
appendToCollection("warrantIssuances", [] as OCFWarrantIssuance[], {} as OCFWarrantIssuance);
// …but a warrant payload cannot be appended onto the convertible collection.
// @ts-expect-error — OCFWarrantIssuance is not assignable to the convertible family.
appendToCollection("convertibleIssuances", [] as OCFConvertibleIssuance[], {} as OCFWarrantIssuance);

// --- Wrong-family legacy append descriptor is a compile error ---------------
// (Deleted with the legacy convention when the last family migrates.)

// A legacy validator whose payload is a warrant issuance.
const warrantLegacyValidate = (
  _context: OcfMachineContext,
  _event: { data?: OCFWarrantIssuance },
  _isGuard: boolean,
): boolean => true;

// The warrant validator pairs with the warrant collection…
const _appendWarrant: Descriptor = { effect: "append", collection: "warrantIssuances", legacyValidate: warrantLegacyValidate };
// …but the same validator cannot type the convertible collection (differs only in family).
// @ts-expect-error — a warrant validator does not match the convertible collection's payload.
const _appendWrongFamily: Descriptor = { effect: "append", collection: "convertibleIssuances", legacyValidate: warrantLegacyValidate };

// --- Wrong-family graded append descriptor is a compile error ---------------

// A graded validator whose payload is a warrant issuance. Declared by type
// annotation, not defined, so this file stays runtime-free; only the
// compile-time shape matters to these checks.
declare const warrantValidate: GradedValidator<OCFWarrantIssuance>;

// The graded warrant validator pairs with the warrant collection…
const _appendGradedWarrant: Descriptor = { effect: "append", collection: "warrantIssuances", validate: warrantValidate, checks: _gradedChecks };
// …but the same graded validator cannot type the convertible collection. The
// checks array is well-formed, so the mismatched collection is the sole reason.
// @ts-expect-error — a graded warrant validator does not match the convertible collection's payload.
const _appendGradedWrongFamily: Descriptor = { effect: "append", collection: "convertibleIssuances", validate: warrantValidate, checks: _gradedChecks };

// --- Every graded arm carries its declared checks ---------------------------

// The none and remove graded arms are assignable to Descriptor with checks;
// together with `_appendGradedWarrant` above (which declares an `implemented:
// false` entry) this covers all three graded effects.
const _gradedNone: Descriptor = { effect: "none", validate: gradedValidate, checks: _gradedChecks };
const _gradedRemove: Descriptor = { effect: "remove", collection: "stockIssuances", validate: gradedValidate, checks: _gradedChecks };

// --- A graded descriptor missing checks is not a Descriptor -----------------

// The same none descriptor with an (empty, still valid) checks array is assignable…
const _gradedWithChecks: Descriptor = { effect: "none", validate: gradedValidate, checks: [] };
// …but dropping `checks` (the one-field delta) leaves it matching no arm.
// @ts-expect-error — a graded descriptor must declare `checks`.
const _gradedNoChecks: Descriptor = { effect: "none", validate: gradedValidate };
