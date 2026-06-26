/**
 * Shared compile-time type-equality assertion helpers used by the `*.assert.ts`
 * files. Type-only — checked by `tsc` (the build), no runtime.
 */
export type Expect<T extends true> = T;
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
