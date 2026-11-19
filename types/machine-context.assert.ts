/** The build checks the public context and its security records. */
import type { LegacyContext, OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { Field, NodeMap, SecurityNode, outstanding } from "../ocf_validator/nodes";
import type { LifecycleState } from "../ocf_validator/lifecycle";
import type { Subject } from "./finding";
import type { Snapshot } from "./snapshot";
import type {
  OCFStockIssuance,
  OCFConvertibleIssuance,
  OCFWarrantIssuance,
  OCFEquityCompensationIssuance,
} from "@opencaptablecoalition/ocf-types";
import type { Expect, Equal } from "./type-assert";

// The context exposes the security map in place of the original four arrays.
type _Nodes = Expect<Equal<OcfMachineContext["nodes"], NodeMap>>;
type _NoIssuanceArrays = Expect<
  Equal<
    Extract<keyof OcfMachineContext, "stockIssuances" | "convertibleIssuances" | "warrantIssuances" | "equityCompensation">,
    never
  >
>;

// Reading a family's issuances preserves its payload type.
type Outstanding<C extends Parameters<typeof outstanding>[1]> = ReturnType<typeof outstanding<C>>;
type _Stock = Expect<Equal<Outstanding<"stockIssuances">, OCFStockIssuance[]>>;
type _Convertible = Expect<Equal<Outstanding<"convertibleIssuances">, OCFConvertibleIssuance[]>>;
type _Warrant = Expect<Equal<Outstanding<"warrantIssuances">, OCFWarrantIssuance[]>>;
type _EquityComp = Expect<Equal<Outstanding<"equityCompensation">, OCFEquityCompensationIssuance[]>>;

// Legacy stock validators still receive the stock issuance array.
type _LegacyStock = Expect<Equal<LegacyContext["stockIssuances"], OCFStockIssuance[]>>;

// A caller can read a field's value, writer and failures. Only the reducer updates them.
type _FieldKeys = Expect<Equal<keyof Field<unknown>, "value" | "writer" | "defects">>;
type _Lifecycle = Expect<Equal<SecurityNode["lifecycle"], Field<LifecycleState>>>;
type _Writer = Expect<Equal<Field<unknown>["writer"], Subject | undefined>>;
type _Defects = Expect<Equal<Field<unknown>["defects"], readonly Subject[]>>;
type _FieldIsReadonly = Expect<Equal<Field<string>, Readonly<Field<string>>>>;
type Shape<T> = { [P in keyof T]: T[P] };
type _NodeIsReadonly = Expect<Equal<Shape<SecurityNode>, Readonly<SecurityNode>>>;

// Updating a record requires a new map.
type _MapIsReadonly = Expect<Equal<NodeMap["security"], ReadonlyMap<unknown, SecurityNode>>>;
declare const _nodes: NodeMap;
// @ts-expect-error — a ReadonlyMap has no `set`.
_nodes.security.set("sec-1", {} as SecurityNode);
// @ts-expect-error — the map's own fields are readonly too.
_nodes.security = new Map();

type _Snapshots = Expect<Equal<OcfMachineContext["snapshots"], Snapshot[]>>;
type _Result = Expect<Equal<OcfMachineContext["result"], string>>;
