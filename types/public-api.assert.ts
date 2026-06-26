/**
 * Compile-time assertions for the public API return shapes. No runtime —
 * type-checked by `tsc` (the build) because it is not a `*.test.ts` file.
 *
 * These pin the *resolved* return type of each public entry point, guarding
 * against a return drifting to `any`. The machine is typed via `setup()`, so
 * `ocfValidator` returns `getSnapshot().context` with no cast and this assert
 * sees the machine's real context type end-to-end. The internal `Snapshot`-typed
 * callbacks in `ocfSnapshot` are not pinned here (callback params don't affect a
 * return type).
 */
import { readOcfPackage } from "../read_ocf_package";
import { ocfValidator } from "../ocf_validator";
import { ocfSnapshot } from "../ocf_snapshot";
import type { OcfPackageContent } from "../read_ocf_package";
import type { OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { Snapshot } from "./snapshot";
import type { Expect, Equal } from "./type-assert";

type _ReadOcfPackage = Expect<
  Equal<ReturnType<typeof readOcfPackage>, OcfPackageContent>
>;
type _OcfValidator = Expect<
  Equal<ReturnType<typeof ocfValidator>, OcfMachineContext>
>;
type _OcfSnapshot = Expect<
  Equal<ReturnType<typeof ocfSnapshot>, Snapshot | null>
>;
