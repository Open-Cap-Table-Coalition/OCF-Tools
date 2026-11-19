/** The build checks record identity and the value types of fields. */
import { readNodeField, withNodeField, type Field, type FieldKey, type FieldValue, type NodeBase, type NodeMaps } from "../ocf_validator/node";
import { isSecurityFamily, type SecurityNode } from "../ocf_validator/nodes";
import type { CollectionElement } from "../ocf_validator/ocfMachine";
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
