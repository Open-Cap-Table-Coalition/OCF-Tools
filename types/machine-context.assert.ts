/**
 * Compile-time assertions for the typed machine context (#155) and its node
 * map (#228). No runtime — this file is type-checked by `tsc` (the build), so
 * a broken invariant fails the build.
 */
import type { LegacyContext, OcfMachineContext } from "../ocf_validator/ocfMachine";
import type { Field, NodeMap, PlanNode, SecurityNode, outstanding } from "../ocf_validator/nodes";
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

// The cap-table state is the node map, and the four issuance arrays it
// replaced are gone from the context.
type _Nodes = Expect<Equal<OcfMachineContext["nodes"], NodeMap>>;
type _NoIssuanceArrays = Expect<
  Equal<
    Extract<keyof OcfMachineContext, "stockIssuances" | "convertibleIssuances" | "warrantIssuances" | "equityCompensation">,
    never
  >
>;

// What each array held is still there to read, typed by family.
type Outstanding<C extends Parameters<typeof outstanding>[1]> = ReturnType<typeof outstanding<C>>;
type _Stock = Expect<Equal<Outstanding<"stockIssuances">, OCFStockIssuance[]>>;
type _Convertible = Expect<Equal<Outstanding<"convertibleIssuances">, OCFConvertibleIssuance[]>>;
type _Warrant = Expect<Equal<Outstanding<"warrantIssuances">, OCFWarrantIssuance[]>>;
type _EquityComp = Expect<Equal<Outstanding<"equityCompensation">, OCFEquityCompensationIssuance[]>>;

// Only a legacy validator's context still carries an array, and only stock's.
type _LegacyStock = Expect<Equal<LegacyContext["stockIssuances"], OCFStockIssuance[]>>;

// Every field of a node holds its value, its last writer, and its defects, and
// none of the three can be assigned to.
type _FieldKeys = Expect<Equal<keyof Field<unknown>, "value" | "writer" | "defects">>;
type _Lifecycle = Expect<Equal<SecurityNode["lifecycle"], Field<LifecycleState>>>;
type _Writer = Expect<Equal<Field<unknown>["writer"], Subject | undefined>>;
type _Defects = Expect<Equal<Field<unknown>["defects"], readonly Subject[]>>;
type _FieldIsReadonly = Expect<Equal<Field<string>, Readonly<Field<string>>>>;
type Shape<T> = { [P in keyof T]: T[P] };
type _NodeIsReadonly = Expect<Equal<Shape<SecurityNode>, Readonly<SecurityNode>>>;

// The map can be read but not written: a write goes through the reducer,
// which returns a new map.
type _MapIsReadonly = Expect<Equal<NodeMap["security"], ReadonlyMap<unknown, SecurityNode>>>;

// A stock plan's node holds its pool as two fields of the same kind, each an
// OCF Numeric, and plans are addressed apart from securities.
type _Plans = Expect<Equal<NodeMap["plan"], ReadonlyMap<unknown, PlanNode>>>;
type _Reserved = Expect<Equal<PlanNode["reserved"], Field<string>>>;
type _Drawn = Expect<Equal<PlanNode["drawn"], Field<string>>>;
type _PlanIsReadonly = Expect<Equal<Shape<PlanNode>, Readonly<PlanNode>>>;
declare const _nodes: NodeMap;
// @ts-expect-error — a ReadonlyMap has no `set`.
_nodes.security.set("sec-1", {} as SecurityNode);
// @ts-expect-error — the map's own fields are readonly too.
_nodes.security = new Map();

type _Snapshots = Expect<Equal<OcfMachineContext["snapshots"], Snapshot[]>>;
type _Result = Expect<Equal<OcfMachineContext["result"], string>>;
