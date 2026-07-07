/**
 * Compile-time assertions for the data-driven transaction table. No runtime —
 * this file is type-checked by `tsc` (the build) because it is not a `*.test.ts`
 * file, so a broken invariant fails the build.
 *
 * Covers two guarantees:
 *  - the table is exhaustive over every `TxKey` (dropping any key fails);
 *  - pairing a collection with a non-matching-family payload is a compile error.
 */
import type {
  OCFWarrantIssuance,
  OCFConvertibleIssuance,
} from "@opencaptablecoalition/ocf-types";
import {
  appendToCollection,
  type TxKey,
  type TxRow,
  type TxTable,
} from "../ocf_validator/ocfMachine";
import type { Expect, Equal } from "./type-assert";

// --- Exhaustiveness: the table covers every TX key -------------------------

// The table's keys are exactly `TxKey` — drop any key and this turns false.
type _Exhaustive = Expect<Equal<keyof TxTable, TxKey>>;

// A table missing any key does not satisfy `Record<TxKey, …>`. Demonstrated by
// omitting all but one key from an annotated sample.
// @ts-expect-error — Record<TxKey, TxRow> requires every TxKey to be present.
const _keyOmitted: Record<TxKey, TxRow> = {
  TX_VESTING_START: { op: "passthrough" },
};

// --- Wrong-family payload is a compile error -------------------------------

// The matching family compiles…
appendToCollection("warrantIssuances", [] as OCFWarrantIssuance[], {} as OCFWarrantIssuance);
// …but a warrant payload cannot be appended onto the convertible collection.
// @ts-expect-error — OCFWarrantIssuance is not assignable to the convertible family.
appendToCollection("convertibleIssuances", [] as OCFConvertibleIssuance[], {} as OCFWarrantIssuance);
