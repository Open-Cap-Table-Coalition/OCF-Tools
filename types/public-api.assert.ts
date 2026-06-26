/**
 * Compile-time assertions for the public API return shapes (#154). No runtime —
 * type-checked by `tsc` (the build) because it is not a `*.test.ts` file.
 *
 * Scope of what these pin: the *resolved* return type of each public entry point.
 * They are a regression guard against the return drifting to `any` — NOT a proof
 * that the type matches the real machine. For `ocfValidator` in particular the
 * value side is reached through an `as OcfMachineContext` cast (the machine config
 * is still `any`), so this assert cannot see past the cast; the genuine check lands
 * with #157 when the cast is removed. The internal `Snapshot`-typed callbacks in
 * `ocfSnapshot` are NOT pinned here (callback params don't affect a return type) —
 * those are a reviewer check.
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
