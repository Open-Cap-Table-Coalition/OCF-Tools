/** The build checks record identity and the value types of fields. */
import { readNodeField, withNodeField, type Field, type FieldKey, type FieldValue, type NodeBase, type NodeMaps } from "../ocf_validator/node";
import { fieldAt, planField, securityField, isSecurityFamily, type Draw, type NodeMap, type PlanNode, type SecurityNode } from "../ocf_validator/nodes";
import type { CollectionElement } from "../ocf_validator/ocfMachine";
import type { ReadField } from "../ocf_validator/validators/checkKit";
import type { Equal, Expect } from "./type-assert";

declare const warrant: SecurityNode<"warrantIssuances">;
declare const convertible: SecurityNode<"convertibleIssuances">;
declare const security: SecurityNode;

type _WarrantIssuance = Expect<Equal<typeof warrant.issuance, Field<CollectionElement["warrantIssuances"]>>>;
// @ts-expect-error — the family and issuance cannot name different families.
const wrongFamily: SecurityNode = { ...warrant, issuance: convertible.issuance };

if (isSecurityFamily(security, "warrantIssuances")) {
  const narrowed: SecurityNode<"warrantIssuances"> = security;
  type _Narrowed = Expect<Equal<typeof narrowed.issuance, typeof warrant.issuance>>;
}

// Common field helpers also work for a new record type.
type Example = NodeBase<"example", { amount: string; enabled: boolean; note?: string }>;
declare const example: Example;
type _Keys = Expect<Equal<FieldKey<Example>, "amount" | "enabled" | "note">>;
type _Value = Expect<Equal<FieldValue<Example, "enabled">, boolean>>;
type _Maps = Expect<Equal<NodeMaps<Example>["example"], ReadonlyMap<unknown, Example>>>;
const amount = readNodeField(example, "amount");
const note = readNodeField(example, "note");
type _Amount = Expect<Equal<typeof amount, Field<string>>>;
type _OptionalField = Expect<Equal<typeof note, Example["note"]>>;
withNodeField(example, "enabled", { value: true, writer: undefined, defects: [] });
// @ts-expect-error — a boolean cannot be written into a numeric string field.
withNodeField(example, "amount", { value: true, writer: undefined, defects: [] });
// @ts-expect-error — identity is not tracked state.
readNodeField(example, "id");
// @ts-expect-error — callers cannot invent a field.
withNodeField(example, "missing", amount);
// @ts-expect-error — writes preserve the family's issuance type.
withNodeField(warrant, "issuance", convertible.issuance);
// @ts-expect-error — an unknown family must be narrowed before replacing its issuance.
withNodeField(security, "issuance", convertible.issuance);
// @ts-expect-error — node identity remains readonly.
example.id = "different";

// Infer the value type even when the caller writes the field address as an object literal.
declare const nodes: NodeMap;
const issuance = fieldAt(nodes, securityField("warrantIssuances", "w", "issuance"));
type _RefIssuance = Expect<Equal<typeof issuance, Field<CollectionElement["warrantIssuances"]> | undefined>>;
const literal = fieldAt(nodes, { kind: "security", family: "warrantIssuances", id: "w", field: "issuance" });
type _LiteralIssuance = Expect<Equal<typeof literal, typeof issuance>>;
// @ts-expect-error — addresses cannot name identity as a state field.
securityField("warrantIssuances", "w", "id");
// @ts-expect-error — a caller cannot choose a value type independent of the address.
fieldAt<number>(nodes, securityField("warrantIssuances", "w", "issuance"));

// Only equity compensation records carry grant pool fields.
declare const grant: SecurityNode<"equityCompensation">;
const provenance = readNodeField(grant, "provenance");
const draw = fieldAt(nodes, securityField("equityCompensation", "g", "draw"));
type _Draw = Expect<Equal<typeof draw, Field<Draw | undefined> | undefined>>;
// @ts-expect-error — warrants do not have pool state.
readNodeField(warrant, "draw");
// @ts-expect-error — other families cannot address equity-compensation-only state.
securityField("warrantIssuances", "w", "provenance");
// @ts-expect-error — raw references have the same family restrictions.
fieldAt(nodes, { kind: "security", family: "warrantIssuances", id: "w", field: "draw" });
const reserve = fieldAt(nodes, planField("p", "reserved"));
type _Reserve = Expect<Equal<typeof reserve, Field<string> | undefined>>;
// @ts-expect-error — plans have no lifecycle.
planField("p", "lifecycle");
// @ts-expect-error — plan fields retain their value type.
withNodeField({} as PlanNode, "drawn", { value: false, writer: undefined, defects: [] });

declare const read: ReadField;
const readWarrant = read(securityField("warrantIssuances", "w", "issuance"));
if (readWarrant) {
  // @ts-expect-error — the issuance supplied to a check is read-only.
  readWarrant.id = "changed";
}
const readDraw = read(securityField("equityCompensation", "g", "draw"));
type _ReadDraw = Expect<Equal<typeof readDraw, Draw | undefined>>;
