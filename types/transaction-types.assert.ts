/**
 * Compile-time assertion that the same-day sort list in
 * `ocf_validator/constants/constants.ts` covers every transaction type. No
 * runtime — type-checked by `tsc` (the build) because it is not a `*.test.ts`
 * file, so a missing or stale entry fails the build.
 *
 * `Equal` is bidirectional: the build breaks if a `TxKey` is absent from the
 * list, or if the list holds an entry that is not a real `TxKey`. Sort *order*
 * stays hand-maintained — this pins *membership* only.
 */
import constants from "../ocf_validator/constants/constants";
import type { TxKey } from "../ocf_validator/ocfMachine";
import type { Expect, Equal } from "./type-assert";

// The list's members are exactly `TxKey` — add an OCF type without listing it,
// or leave a stale/typo'd entry, and this turns false.
type _CoversEveryTxKey = Expect<
  Equal<(typeof constants.transaction_types)[number], TxKey>
>;
