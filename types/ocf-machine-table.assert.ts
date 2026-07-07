/**
 * Compile-time assertions for the per-transaction descriptors. No runtime — this
 * file is type-checked by `tsc` (the build) because it is not a `*.test.ts` file,
 * so a broken invariant fails the build.
 *
 * Covers three guarantees:
 *  - the descriptors are exhaustive over every `TxKey` (dropping any key fails);
 *  - `appendToCollection` rejects a wrong-family payload;
 *  - an `append` descriptor rejects a collection whose family does not match the
 *    payload its validator checks.
 */
import type {
  OCFWarrantIssuance,
  OCFConvertibleIssuance,
} from "@opencaptablecoalition/ocf-types";
import {
  appendToCollection,
  TX_DESCRIPTORS,
  type OcfMachineContext,
  type TxKey,
  type Descriptor,
} from "../ocf_validator/ocfMachine";
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

// --- Wrong-family append descriptor is a compile error ---------------------

// A validator whose payload is a warrant issuance.
const warrantValidate = (
  _context: OcfMachineContext,
  _event: { data?: OCFWarrantIssuance },
  _isGuard: boolean,
): boolean => true;

// The warrant validator pairs with the warrant collection…
const _appendWarrant: Descriptor = { effect: "append", collection: "warrantIssuances", validate: warrantValidate };
// …but the same validator cannot type the convertible collection (differs only in family).
// @ts-expect-error — a warrant validator does not match the convertible collection's payload.
const _appendWrongFamily: Descriptor = { effect: "append", collection: "convertibleIssuances", validate: warrantValidate };
