/**
 * Compile-time assertions for the per-transaction descriptors. No runtime — this
 * file is type-checked by `tsc` (the build), so a broken invariant fails the
 * build.
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
 *    descriptor missing `checks` is not a `Descriptor`;
 *  - `defineValidator` rejects a collection on a "none" declaration, a check
 *    that reads a field the transaction doesn't have, and (through
 *    `Descriptor`) an "append" to another family's collection;
 *  - a check can't modify the transaction it's given;
 *  - a descriptor listed under another transaction's key is rejected, and the
 *    real table is checked against `DescriptorTable` directly;
 *  - `familyChecksFor` rejects an issuance type that doesn't match the
 *    collection, a misspelled acceptance type, and a `vests` flag that
 *    contradicts whether the issuance type has vesting terms.
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
  type DescriptorTable,
} from "../ocf_validator/ocfMachine";
import { defineValidator, type CheckObject } from "../ocf_validator/validators/checkKit";
import { familyChecksFor } from "../ocf_validator/validators/checks";
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

// --- defineValidator: the spec shape ----------------------------------------

// An effect-none spec without a collection compiles…
const _noneSpec = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", checks: [] });
// …but the same declaration plus a collection does not: a "none" transaction changes no collection.
// @ts-expect-error — an effect-none spec carries no collection.
const _noneSpecWithCollection = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", collection: "convertibleIssuances", checks: [] });

// --- defineValidator: each check must accept the transaction's payload ------

// Two stand-in checks, one reading security_id and one reading stakeholder_id.
// Only their types matter, so they're declared without bodies.
declare const readsSecurityId: CheckObject<{ security_id: string }>;
declare const readsStakeholderId: CheckObject<{ stakeholder_id: string }>;

// An acceptance carries a security_id, so a check reading one compiles…
const _payloadMatch = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", checks: [readsSecurityId] });
// …but an acceptance carries no stakeholder_id, so the issuance check does not.
// @ts-expect-error — the check reads a field the acceptance payload does not carry.
const _payloadMismatch = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", checks: [readsStakeholderId] });

// --- defineValidator: wrong-family append -----------------------------------

// A warrant issuance appended to the warrant collection is a Descriptor…
const _defineAppendWarrant = defineValidator({ transaction: "TX_WARRANT_ISSUANCE", effect: "append", collection: "warrantIssuances", checks: [] }) satisfies Descriptor;
// …but the same declaration naming the convertible collection is not.
// @ts-expect-error — a warrant issuance cannot append to the convertible collection.
const _defineAppendWrongFamily = defineValidator({ transaction: "TX_WARRANT_ISSUANCE", effect: "append", collection: "convertibleIssuances", checks: [] }) satisfies Descriptor;

// --- A check body cannot mutate its payload ---------------------------------

// Reading the payload compiles…
const _readingCheck = {
  id: "issuance-exists",
  severity: "error",
  description: "The referenced issuance exists.",
  run: (_context, data) => [data.security_id],
} satisfies CheckObject<{ security_id: string }>;
// …but changing it does not: `run` gets the transaction read-only.
const _mutatingCheck = {
  id: "issuance-exists",
  severity: "error",
  description: "The referenced issuance exists.",
  run: (_context, data) => {
    // @ts-expect-error — a check's payload is read-only.
    data.security_id = "changed";
    return [];
  },
} satisfies CheckObject<{ security_id: string }>;

// --- A descriptor is filed under its own transaction's key -------------------

const _warrantRetraction = defineValidator({ transaction: "TX_WARRANT_RETRACTION", effect: "remove", collection: "warrantIssuances", checks: [] });

// Filed under its own key, the descriptor fits the table…
const _filedUnderOwnKey = { TX_WARRANT_RETRACTION: _warrantRetraction } satisfies Partial<DescriptorTable>;
// …but listed under the convertible retraction's key it does not. Nothing else
// would catch this: "remove" descriptors aren't checked against their collection.
// @ts-expect-error — the descriptor names TX_WARRANT_RETRACTION, not TX_CONVERTIBLE_RETRACTION.
const _filedUnderOtherKey = { TX_CONVERTIBLE_RETRACTION: _warrantRetraction } satisfies Partial<DescriptorTable>;

// Check the real table here too, not only in ocfMachine.ts, so loosening the
// type check there can't quietly turn off the key check.
const _realTable: DescriptorTable = TX_DESCRIPTORS;

// --- familyChecksFor: family vocabulary --------------------------------------

// A consistent family compiles…
const _warrantFamily = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: true });
// …but an issuance the collection does not hold does not…
// @ts-expect-error — the warrant collection holds TX_WARRANT_ISSUANCE, not TX_CONVERTIBLE_ISSUANCE.
const _mismatchedIssuance = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_CONVERTIBLE_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: true });
// …and neither does a mistyped acceptance key…
// @ts-expect-error — TX_WARRANT_ACCEPTENCE is not a transaction key.
const _mistypedAcceptance = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTENCE", vests: true });
// …or a vests flag that contradicts the issuance type, which would let the
// no-other-transactions scan flag a warrant's own vesting records.
// @ts-expect-error — OCFWarrantIssuance has vesting_terms_id, so the warrant family vests.
const _wrongVests = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: false });
