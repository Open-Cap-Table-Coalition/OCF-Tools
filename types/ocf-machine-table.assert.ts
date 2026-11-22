/**
 * The build checks that every transaction has a descriptor, its validator accepts the correct
 * payload, and each effect has the required family and lifecycle fields.
 */
import type {
  OCFWarrantIssuance,
} from "@opencaptablecoalition/ocf-types";
import {
  TX_DESCRIPTORS,
  type VESTING_FAMILIES,
  type TxKey,
  type Descriptor,
  type DescriptorTable,
  type VestingFamily,
} from "../ocf_validator/ocfMachine";
import { defineValidator, underOlderName, type CheckObject } from "../ocf_validator/validators/checkKit";
import type { OLDER_NAMES } from "../ocf_validator/constants/constants";
import { familyChecksFor } from "../ocf_validator/validators/checks";
import type { TransactionFor } from "./ocf-input";
import type { Check, GradedValidator, LifecycleWord, OcfMachineContext } from "./validator";
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
  TX_VESTING_START: { effect: "passthrough", lifecycle: "stays", families: [] },
};

// --- Wrong-family legacy append descriptor is a compile error ---------------
// (Deleted with the legacy convention when the last family migrates.)

// A legacy validator whose payload is a warrant issuance.
const warrantLegacyValidate = (
  _context: OcfMachineContext,
  _event: { data?: OCFWarrantIssuance },
  _isGuard: boolean,
): boolean => true;

// The warrant validator pairs with the warrant collection…
const _appendWarrant: Descriptor = { effect: "append", lifecycle: "issue", collection: "warrantIssuances", legacyValidate: warrantLegacyValidate };
// …but the same validator cannot type the convertible collection (differs only in family).
// @ts-expect-error — a warrant validator does not match the convertible collection's payload.
const _appendWrongFamily: Descriptor = { effect: "append", lifecycle: "issue", collection: "convertibleIssuances", legacyValidate: warrantLegacyValidate };

// --- Wrong-family graded append descriptor is a compile error ---------------

// A graded validator whose payload is a warrant issuance. Declared by type
// annotation, not defined, so this file stays runtime-free; only the
// compile-time shape matters to these checks.
declare const warrantValidate: GradedValidator<OCFWarrantIssuance>;

// The graded warrant validator pairs with the warrant collection…
const _appendGradedWarrant: Descriptor = { effect: "append", lifecycle: "issue", collection: "warrantIssuances", validate: warrantValidate, checks: _gradedChecks };
// …but the same graded validator cannot type the convertible collection. The
// checks array is well-formed, so the mismatched collection is the sole reason.
// @ts-expect-error — a graded warrant validator does not match the convertible collection's payload.
const _appendGradedWrongFamily: Descriptor = { effect: "append", lifecycle: "issue", collection: "convertibleIssuances", validate: warrantValidate, checks: _gradedChecks };

// --- Every graded arm carries its declared checks ---------------------------

// The none and remove graded arms are assignable to Descriptor with checks;
// together with `_appendGradedWarrant` above (which declares an `implemented:
// false` entry) this covers all three graded effects.
const _gradedNone: Descriptor = { effect: "none", lifecycle: "stays", families: ["stockIssuances"], validate: gradedValidate, checks: _gradedChecks };
const _gradedRemove: Descriptor = { effect: "remove", lifecycle: "removes", collection: "stockIssuances", validate: gradedValidate, checks: _gradedChecks };

// --- A graded descriptor missing checks is not a Descriptor -----------------

// The same none descriptor with an (empty, still valid) checks array is assignable…
const _gradedWithChecks: Descriptor = { effect: "none", lifecycle: "stays", families: [], validate: gradedValidate, checks: [] };
// …but dropping `checks` (the one-field delta) leaves it matching no arm.
// @ts-expect-error — a graded descriptor must declare `checks`.
const _gradedNoChecks: Descriptor = { effect: "none", lifecycle: "stays", families: [], validate: gradedValidate };

// --- defineValidator: the spec shape ----------------------------------------

// An effect-none spec without a collection compiles…
const _noneSpec = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", families: ["convertibleIssuances"], checks: [] });
// …but the same declaration plus a collection does not: a "none" transaction changes no collection.
// @ts-expect-error — an effect-none spec carries no collection.
const _noneSpecWithCollection = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", families: ["convertibleIssuances"], collection: "convertibleIssuances", checks: [] });

// --- defineValidator: each check must accept the transaction's payload ------

// Two stand-in checks, one reading security_id and one reading stakeholder_id.
// Only their types matter, so they're declared without bodies.
declare const readsSecurityId: CheckObject<{ security_id: string }>;
declare const readsStakeholderId: CheckObject<{ stakeholder_id: string }>;

// An acceptance carries a security_id, so a check reading one compiles…
const _payloadMatch = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", families: ["convertibleIssuances"], checks: [readsSecurityId] });
// …but an acceptance carries no stakeholder_id, so the issuance check does not.
// @ts-expect-error — the check reads a field the acceptance payload does not carry.
const _payloadMismatch = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", families: ["convertibleIssuances"], checks: [readsStakeholderId] });

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
const _warrantFamily = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: true, returnsToPool: false });
// …but an issuance the collection does not hold does not…
// @ts-expect-error — the warrant collection holds TX_WARRANT_ISSUANCE, not TX_CONVERTIBLE_ISSUANCE.
const _mismatchedIssuance = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_CONVERTIBLE_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: true, returnsToPool: false });
// …and neither does a mistyped acceptance key…
// @ts-expect-error — TX_WARRANT_ACCEPTENCE is not a transaction key.
const _mistypedAcceptance = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTENCE", vests: true, returnsToPool: false });
// …or a vests flag that contradicts the issuance type, which would let the
// no-other-transactions scan flag a warrant's own vesting records.
// @ts-expect-error — OCFWarrantIssuance has vesting_terms_id, so the warrant family vests.
const _wrongVests = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: false, returnsToPool: false });
// …or a returnsToPool flag that contradicts it, which would let the scan skip a
// return to pool on a security that can't come from a stock plan…
// @ts-expect-error — OCFWarrantIssuance has no stock_plan_id, so warrants don't return to a pool.
const _wrongPool = familyChecksFor({ name: "warrant", collection: "warrantIssuances", issuance: "TX_WARRANT_ISSUANCE", acceptance: "TX_WARRANT_ACCEPTANCE", vests: true, returnsToPool: true });
// …or a misspelled transaction type in leavesOutstanding, which would never
// match and so would exempt nothing.
// @ts-expect-error — TX_EQUITY_COMPENSATION_EXCERCISE is not a transaction key.
const _mistypedLeavesOutstanding = familyChecksFor({ name: "equity compensation", collection: "equityCompensation", issuance: "TX_EQUITY_COMPENSATION_ISSUANCE", acceptance: "TX_EQUITY_COMPENSATION_ACCEPTANCE", vests: true, returnsToPool: true, leavesOutstanding: ["TX_EQUITY_COMPENSATION_EXCERCISE"] });

// Lifecycle types

// Each transaction must declare a supported lifecycle change.
type _EveryDescriptorHasAWord = Expect<
  Equal<(typeof TX_DESCRIPTORS)[TxKey]["lifecycle"] extends LifecycleWord ? true : false, true>
>;

// A transaction without a validator must specify its lifecycle change.
const _passthroughWithWord: Descriptor = { effect: "passthrough", lifecycle: "after removal", families: ["equityCompensation"] };
// @ts-expect-error A passthrough descriptor needs a lifecycle value.
const _passthroughNoWord: Descriptor = { effect: "passthrough", families: ["equityCompensation"] };

// Removing a security ends its outstanding state.
const _removeRemoves: Descriptor = { effect: "remove", lifecycle: "removes", collection: "stockIssuances", validate: gradedValidate, checks: [] };
// @ts-expect-error A removal must declare the lifecycle value "removes".
const _removeStays: Descriptor = { effect: "remove", lifecycle: "stays", collection: "stockIssuances", validate: gradedValidate, checks: [] };

// The validator declaration supplies the effect used to derive the lifecycle.
type _NoneStays = Expect<Equal<(typeof _noneSpec)["lifecycle"], "stays">>;
type _AppendIssues = Expect<Equal<(typeof _defineAppendWarrant)["lifecycle"], "issue">>;
type _RemoveRemoves = Expect<Equal<(typeof _warrantRetraction)["lifecycle"], "removes">>;

// @ts-expect-error An effect of "none" requires a list of security families.
const _noneSpecNoFamilies = defineValidator({ transaction: "TX_CONVERTIBLE_ACCEPTANCE", effect: "none", checks: [] });

// The list of vesting families must match the issuance types that support vesting terms.
type _VestingFamilies = Expect<Equal<(typeof VESTING_FAMILIES)[number], VestingFamily>>;
type _ConvertiblesDontVest = Expect<Equal<Extract<VestingFamily, "convertibleIssuances">, never>>;

// Older transaction names

type OlderName = keyof typeof OLDER_NAMES;

// Each older name must have a payload that the corresponding current validator accepts.
type _OlderNamesCarryTheirTypesPayload = Expect<
  Equal<
    { [K in OlderName]: TransactionFor<K> extends TransactionFor<(typeof OLDER_NAMES)[K]> ? true : false }[OlderName],
    true
  >
>;

// Older names keep the current descriptor's effect and lifecycle.
type _OlderNamesShareEffect = Expect<
  Equal<
    { [K in OlderName]: Equal<(typeof TX_DESCRIPTORS)[K]["effect"], (typeof TX_DESCRIPTORS)[(typeof OLDER_NAMES)[K]]["effect"]> }[OlderName],
    true
  >
>;
type _OlderNamesShareWord = Expect<
  Equal<
    { [K in OlderName]: Equal<(typeof TX_DESCRIPTORS)[K]["lifecycle"], (typeof TX_DESCRIPTORS)[(typeof OLDER_NAMES)[K]]["lifecycle"]> }[OlderName],
    true
  >
>;

// The older plan security name accepts the equity compensation retraction validator.
const _equityCompensationRetraction = defineValidator({ transaction: "TX_EQUITY_COMPENSATION_RETRACTION", effect: "remove", collection: "equityCompensation", checks: [] });
const _underOlderName = underOlderName(_equityCompensationRetraction, "TX_PLAN_SECURITY_RETRACTION");
type _FiledUnderOlderName = Expect<Equal<(typeof _underOlderName)["transaction"], "TX_PLAN_SECURITY_RETRACTION">>;
// @ts-expect-error The warrant retraction payload differs from an equity compensation retraction.
const _underUnrelatedName = underOlderName(_equityCompensationRetraction, "TX_WARRANT_RETRACTION");

// Plan operations

// The descriptor accepts the supported plan operations.
const _draws = defineValidator({ transaction: "TX_EQUITY_COMPENSATION_ISSUANCE", effect: "append", collection: "equityCompensation", pool: "draws", checks: [] }) satisfies Descriptor;
// @ts-expect-error "spends" is not a supported pool operation.
const _spends = defineValidator({ transaction: "TX_EQUITY_COMPENSATION_ISSUANCE", effect: "append", collection: "equityCompensation", pool: "spends", checks: [] });

// Check the pool operation declared for each relevant transaction type.
type _GrantDraws = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_EQUITY_COMPENSATION_ISSUANCE"]["pool"], "draws">>;
type _OlderNameDraws = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_PLAN_SECURITY_ISSUANCE"]["pool"], "draws">>;
type _CancellationCarries = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_EQUITY_COMPENSATION_CANCELLATION"]["pool"], "carries">>;
type _TransferCarries = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_PLAN_SECURITY_TRANSFER"]["pool"], "carries">>;
type _ReturnReturns = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_STOCK_PLAN_RETURN_TO_POOL"]["pool"], "returns">>;
type _AdjustmentReserves = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_STOCK_PLAN_POOL_ADJUSTMENT"]["pool"], "reserves">>;

// An effect of "none" normally keeps a security outstanding. A return to pool explicitly requires a
// removed security.
type _ReturnIsAfterRemoval = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_STOCK_PLAN_RETURN_TO_POOL"]["lifecycle"], "after removal">>;
type _AdjustmentStays = Expect<Equal<(typeof TX_DESCRIPTORS)["TX_STOCK_PLAN_POOL_ADJUSTMENT"]["lifecycle"], "stays">>;
