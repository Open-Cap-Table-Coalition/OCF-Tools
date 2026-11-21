import { describe, it, expect } from "vitest";
import { applyTransaction, emptyNodes, outstanding, outstandingSecurity, securitiesIn, type NodeMap } from "../ocf_validator/nodes";
import { TX_DESCRIPTORS, type TxKey } from "../ocf_validator/ocfMachine";
import { collection, validatePackage } from "./helpers";

// Test security records directly and through a complete package run.

/** Apply each transaction using its descriptor, in the supplied order. */
const apply = (nodes: NodeMap, ...transactions: { object_type: string; id: string; security_id?: unknown }[]): NodeMap =>
  transactions.reduce((map, transaction) => applyTransaction(map, TX_DESCRIPTORS[transaction.object_type as TxKey], transaction), nodes);

const issuance = (id: string, security_id: string, object_type = "TX_WARRANT_ISSUANCE") => ({
  id,
  object_type,
  security_id,
  stakeholder_id: "sh-1",
  date: "2021-01-01",
});
const on = (object_type: string, id: string, security_id: string) => ({ id, object_type, security_id, date: "2021-06-01" });

describe("a security's node", () => {
  it("is written whole by its issuance: each field with its value, its writer, and no defects", () => {
    const grant = issuance("wi-1", "war-1");
    const nodes = apply(emptyNodes(), grant);

    const writer = { object_type: "TX_WARRANT_ISSUANCE", id: "wi-1" };
    expect(nodes.security.get("war-1")).toEqual({
      kind: "security",
      id: "war-1",
      family: "warrantIssuances",
      lifecycle: { value: "outstanding", writer, defects: [] },
      issuance: { value: grant, writer, defects: [] },
    });
  });

  it("stays in the map when it's removed, with its lifecycle saying so and the removal as that field's writer", () => {
    const grant = issuance("wi-1", "war-1");
    const issued = apply(emptyNodes(), grant);
    const removed = apply(issued, on("TX_WARRANT_CANCELLATION", "wc-1", "war-1"));

    const node = removed.security.get("war-1");
    expect(node?.lifecycle).toEqual({ value: "removed", writer: { object_type: "TX_WARRANT_CANCELLATION", id: "wc-1" }, defects: [] });
    // Cancellation changes the lifecycle and reuses the original issuance field.
    expect(node?.issuance).toBe(issued.security.get("war-1")?.issuance);
    expect(node?.issuance.writer).toEqual({ object_type: "TX_WARRANT_ISSUANCE", id: "wi-1" });

    // The map retains the removed security.
    expect(outstanding(removed, "warrantIssuances")).toEqual([]);
    expect(outstandingSecurity(removed, "warrantIssuances", "war-1")).toBeUndefined();
    expect(securitiesIn(removed, "warrantIssuances").map((security) => security.id)).toEqual(["war-1"]);
  });

  it("belongs to the family that issued it, and another family's transaction can't find or remove it", () => {
    const nodes = apply(emptyNodes(), issuance("wi-1", "sec-1"));

    expect(outstandingSecurity(nodes, "warrantIssuances", "sec-1")).toBeDefined();
    expect(outstandingSecurity(nodes, "convertibleIssuances", "sec-1")).toBeUndefined();
    // A convertible cancellation cannot remove a warrant with that ID.
    expect(apply(nodes, on("TX_CONVERTIBLE_CANCELLATION", "cc-1", "sec-1"))).toBe(nodes);
  });
});

describe("the reducer", () => {
  it("returns a new map and leaves the one it was given as it was", () => {
    const before = apply(emptyNodes(), issuance("wi-1", "war-1"), issuance("wi-2", "war-2"));
    const copy = structuredClone(before);

    const after = apply(before, on("TX_WARRANT_CANCELLATION", "wc-1", "war-1"));

    expect(after).not.toBe(before);
    expect(after.security).not.toBe(before.security);
    expect(before).toEqual(copy);
    expect(outstanding(before, "warrantIssuances")).toHaveLength(2);
    expect(outstanding(after, "warrantIssuances")).toHaveLength(1);
  });

  it("shares every node it didn't change with the map before", () => {
    const before = apply(emptyNodes(), issuance("wi-1", "war-1"), issuance("wi-2", "war-2"));
    const after = apply(before, on("TX_WARRANT_CANCELLATION", "wc-1", "war-1"));

    expect(after.security.get("war-2")).toBe(before.security.get("war-2"));
    expect(after.security.get("war-1")).not.toBe(before.security.get("war-1"));
  });

  it("returns the same map for a transaction that changes nothing", () => {
    const nodes = apply(emptyNodes(), issuance("wi-1", "war-1"));

    // Acceptance, vesting and removal of a missing security leave the records alone.
    expect(apply(nodes, on("TX_WARRANT_ACCEPTANCE", "wa-1", "war-1"))).toBe(nodes);
    expect(apply(nodes, on("TX_VESTING_EVENT", "ve-1", "war-1"))).toBe(nodes);
    expect(apply(nodes, on("TX_WARRANT_CANCELLATION", "wc-1", "nothing"))).toBe(nodes);
    // Preserve the transaction that first removed the security.
    const removed = apply(nodes, on("TX_WARRANT_CANCELLATION", "wc-1", "war-1"));
    expect(apply(removed, on("TX_WARRANT_TRANSFER", "wt-1", "war-1"))).toBe(removed);
  });

  it("gives the same map for the same transactions, every time", () => {
    const transactions = [issuance("wi-1", "war-1"), issuance("ci-1", "safe-1", "TX_CONVERTIBLE_ISSUANCE"), on("TX_WARRANT_EXERCISE", "we-1", "war-1")];

    expect(apply(emptyNodes(), ...transactions)).toEqual(apply(emptyNodes(), ...transactions));
  });
});

describe("the order of the map", () => {
  it("lists a family's outstanding securities in the order they were issued", () => {
    const first = issuance("wi-1", "war-1");
    const convertible = issuance("ci-1", "safe-1", "TX_CONVERTIBLE_ISSUANCE");
    const second = issuance("wi-2", "war-2");
    const nodes = apply(emptyNodes(), first, convertible, second);

    expect(outstanding(nodes, "warrantIssuances")).toEqual([first, second]);
    expect(outstanding(nodes, "convertibleIssuances")).toEqual([convertible]);
    expect(outstanding(nodes, "stockIssuances")).toEqual([]);
  });

  it("puts a security_id issued again after its removal where the newer issuance belongs", () => {
    // Reissuance puts the record at the end of the issuance order.
    const again = { ...issuance("wi-3", "war-1"), date: "2021-06-01" };
    const second = issuance("wi-2", "war-2");
    const nodes = apply(emptyNodes(), issuance("wi-1", "war-1"), second, on("TX_WARRANT_CANCELLATION", "wc-1", "war-1"), again);

    expect(outstanding(nodes, "warrantIssuances")).toEqual([second, again]);
  });

  it("holds one node per security_id, so a second issuance of an outstanding one replaces the first", () => {
    // A second outstanding issuance replaces the first record. The old arrays retained both. Only
    // the chart currently rejects the duplicate.
    const again = { ...issuance("wi-2", "war-1"), stakeholder_id: "sh-2" };
    const nodes = apply(emptyNodes(), issuance("wi-1", "war-1"), again);

    expect(outstanding(nodes, "warrantIssuances")).toEqual([again]);
    expect(nodes.security.size).toBe(1);
  });
});

describe("a run's node map", () => {
  const grant = { id: "ci-1", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-1", stakeholder_id: "sh-1", custom_id: "SAFE-1", date: "2021-01-01" };
  const kept = { id: "ci-2", object_type: "TX_CONVERTIBLE_ISSUANCE", security_id: "safe-2", stakeholder_id: "sh-1", custom_id: "SAFE-2", date: "2021-01-01" };
  const cancellation = { id: "cc-1", object_type: "TX_CONVERTIBLE_CANCELLATION", security_id: "safe-1", date: "2021-06-01" };

  it("keeps a cancelled security, removed by its cancellation, and shows only what's outstanding in each day's snapshot", () => {
    const context = validatePackage([grant, kept, cancellation], [{ id: "sh-1" }]);

    expect([...context.nodes.security.keys()]).toEqual(["safe-1", "safe-2"]);
    expect(context.nodes.security.get("safe-1")?.lifecycle).toEqual({
      value: "removed",
      writer: { object_type: "TX_CONVERTIBLE_CANCELLATION", id: "cc-1" },
      defects: [],
    });
    expect(collection(context, "convertibleIssuances")).toEqual([kept]);

    expect(context.snapshots.map((snapshot) => [snapshot.date, snapshot.convertibles.map((row) => row.custom_id)])).toEqual([
      ["2021-01-01", ["SAFE-1", "SAFE-2"]],
      ["2021-06-01", ["SAFE-2"]],
    ]);
  });

  it("starts each run from an empty map of its own", () => {
    const first = validatePackage([grant], [{ id: "sh-1" }]);
    const second = validatePackage([kept], [{ id: "sh-1" }]);

    expect([...first.nodes.security.keys()]).toEqual(["safe-1"]);
    expect([...second.nodes.security.keys()]).toEqual(["safe-2"]);
  });
});
