/**
 * Compile-time assertions for the per-transaction descriptors. No runtime — this
 * file is type-checked by `tsc` (the build) because it is not a `*.test.ts` file,
 * so a broken invariant fails the build.
 *
 * Covers four guarantees:
 *  - the descriptors are exhaustive over every `TxKey` (dropping any key fails);
 *  - `appendToCollection` rejects a wrong-family payload;
 *  - an `append` descriptor rejects a collection whose family does not match the
 *    payload its `legacyValidate` checks;
 *  - the same family match holds for graded `validate` descriptors.
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
import type { GradedValidator, OcfMachineContext } from "./validator";
import type { Expect, Equal } from "./type-assert";

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
const _appendGradedWarrant: Descriptor = { effect: "append", collection: "warrantIssuances", validate: warrantValidate };
// …but the same graded validator cannot type the convertible collection.
// @ts-expect-error — a graded warrant validator does not match the convertible collection's payload.
const _appendGradedWrongFamily: Descriptor = { effect: "append", collection: "convertibleIssuances", validate: warrantValidate };
