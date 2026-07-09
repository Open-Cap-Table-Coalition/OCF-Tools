import { describe, it, expect } from "vitest";
import { TX_DESCRIPTORS, type TxKey } from "../ocf_validator/ocfMachine";
import validators from "../ocf_validator/validators";
import type { GradedValidator } from "../types/validator";
import { baseContext, startSeeded, ev } from "./helpers";

// The transaction types declared on the graded convention with no checks yet:
// each stays a passthrough the machine receives and ignores, and the
// declaration replaces a stub validator that was never wired to the machine.
// TX_VESTING_START appears in the characterization fixture, so these locks
// also pin why that snapshot is unchanged by the declarations.
const DECLARATION_ONLY_KEYS = [
  "TX_PLAN_SECURITY_ACCEPTANCE",
  "TX_PLAN_SECURITY_CANCELLATION",
  "TX_PLAN_SECURITY_EXERCISE",
  "TX_PLAN_SECURITY_ISSUANCE",
  "TX_PLAN_SECURITY_RELEASE",
  "TX_PLAN_SECURITY_RETRACTION",
  "TX_PLAN_SECURITY_TRANSFER",
  "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
  "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT",
  "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  "TX_STOCK_PLAN_RETURN_TO_POOL",
  "TX_VESTING_ACCELERATION",
  "TX_VESTING_EVENT",
  "TX_VESTING_START",
] as const satisfies readonly TxKey[];

describe("declaration-only validators", () => {
  it.each(DECLARATION_ONLY_KEYS)("%s carries a graded validator that declares no checks", (key) => {
    const descriptor = TX_DESCRIPTORS[key] as {
      effect: string;
      validate?: GradedValidator<any>;
      legacyValidate?: unknown;
      checks?: readonly unknown[];
    };
    expect(descriptor.effect).toBe("passthrough");
    expect(typeof descriptor.validate).toBe("function");
    expect(descriptor.legacyValidate).toBeUndefined();
    expect(descriptor.checks).toEqual([]);
  });

  it.each(DECLARATION_ONLY_KEYS)("%s leaves capTable and every channel deep-equal", (key) => {
    const seeded = baseContext({
      stockIssuances: [{ id: "si", security_id: "s" }] as any,
      report: [{ marker: "pre-existing report" }],
      findings: [
        { severity: "error", check: "demo", message: "m", subject: { object_type: "TX_STOCK_ISSUANCE", id: "x" } },
      ],
      result: "PRESERVED",
    });
    const before = structuredClone(seeded);

    const actor = startSeeded(seeded);
    // security_id matches the seeded issuance, so a stray remove effect would show.
    actor.send(ev(key, { id: "t1", security_id: "s", date: "2020-01-01" }));

    const after = actor.getSnapshot();
    expect(after.value).toBe("capTable");
    expect(after.context).toEqual(before);
  });

  it("retires every legacy stub from the validators object", () => {
    const retired = [
      "valid_tx_plan_security_acceptance",
      "valid_tx_plan_security_cancellation",
      "valid_tx_plan_security_exercise",
      "valid_tx_plan_security_issuance",
      "valid_tx_plan_security_release",
      "valid_tx_plan_security_retraction",
      "valid_tx_plan_security_transfer",
      "valid_tx_stock_class_authorized_shares_adjustment",
      "valid_tx_stock_class_conversion_ratio_adjustment",
      "valid_tx_stock_plan_pool_adjustment",
      "valid_tx_stock_plan_return_to_pool",
      "valid_tx_vesting_acceleration",
      "valid_tx_vesting_event",
      "valid_tx_vesting_start",
    ];
    for (const name of retired) {
      expect(name in validators, name).toBe(false);
    }
  });
});
