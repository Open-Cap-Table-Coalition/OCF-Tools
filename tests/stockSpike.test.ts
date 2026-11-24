import { expect, it } from "vitest";
import { validatePackageWith } from "./helpers";
import { ocfValidator } from "../ocf_validator";

it("carries a stock failure to its dependent while an unrelated warrant still issues", () => {
  const stock = {
    object_type: "TX_STOCK_ISSUANCE", id: "stock", date: "2020-01-01", security_id: "s",
    stakeholder_id: "holder", stock_class_id: "class", stock_legend_ids: [], quantity: "10",
  };
  const accept = { object_type: "TX_STOCK_ACCEPTANCE", id: "accept", date: "2020-02-01", security_id: "s" };
  const root = { id: accept.id, object_type: accept.object_type };
  const context = validatePackageWith(ocfValidator)([
    stock, accept, { ...accept, id: "retry", date: "2020-03-01" },
    { object_type: "TX_WARRANT_ISSUANCE", id: "wi", date: "2020-04-01", stakeholder_id: "holder", security_id: "w" },
    { object_type: "TX_STOCK_RETRACTION", id: "retract", date: "2020-05-01", security_id: "s" },
  ], [{ id: "holder" }], [{ id: "class" }]);
  expect(context.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ subject: root, outcome: "failed", check: "no-retraction" }),
    expect.objectContaining({ subject: { id: "retry", object_type: accept.object_type }, outcome: "blocked", roots: [root] }),
  ]));
  expect(context.nodes.security.get("s")?.lifecycle.defects).toContainEqual(root);
  expect(context.nodes.security.get("w")?.lifecycle.value).toBe("outstanding");
  expect(context.snapshots.at(-1)?.date).toBe("2020-05-01");
});
