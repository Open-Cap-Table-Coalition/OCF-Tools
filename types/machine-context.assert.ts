/**
 * Compile-time assertions for the typed machine context (#155). No runtime —
 * this file is type-checked by `tsc` (the build) because it is not a `*.test.ts`
 * file, so a broken invariant fails the build.
 */
import type { OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { Snapshot } from "./snapshot";
import type {
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { Expect, Equal } from "./type-assert";

type _Stock = Expect<Equal<OcfMachineContext["stockIssuances"], OCFStockIssuance[]>>;
type _Convertible = Expect<
  Equal<OcfMachineContext["convertibleIssuances"], OCFConvertibleIssuance[]>
>;
type _Warrant = Expect<
  Equal<OcfMachineContext["warrantIssuances"], OCFWarrantIssuance[]>
>;
type _EquityComp = Expect<
  Equal<OcfMachineContext["equityCompensation"], OCFEquityCompensationIssuance[]>
>;
type _Snapshots = Expect<Equal<OcfMachineContext["snapshots"], Snapshot[]>>;
type _Result = Expect<Equal<OcfMachineContext["result"], string>>;
