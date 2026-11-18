import { describe, it, expect } from "vitest";
import { lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type TxKey } from "../ocf_validator/ocfMachine";
import type { LifecycleWord } from "../types/validator";

// ---------------------------------------------------------------------------
// Lifecycle words
// ---------------------------------------------------------------------------

// Every descriptor declares what its transaction does to the lifecycle of the
// security it names: one of four words, on the charts of the families it
// lists (#233). Nothing reads the words while validating yet, so this oracle
// is what holds them: each transaction type's word and families, written out
// by hand from the table in #233, with no logic shared with the descriptors.
// The words a type can't disagree with its `effect` on are still listed, so
// the oracle reads as the whole table.

const STOCK = "stockIssuances";
const CONVERTIBLE = "convertibleIssuances";
const WARRANT = "warrantIssuances";
const EQUITY_COMPENSATION = "equityCompensation";

// The families whose securities can vest. A convertible's issuance carries no
// vesting terms.
const VESTS = [STOCK, WARRANT, EQUITY_COMPENSATION] as const;

const EXPECTED: Record<TxKey, [LifecycleWord, readonly CollectionKey[]]> = {
  // Stock
  TX_STOCK_ISSUANCE: ["issue", [STOCK]],
  TX_STOCK_ACCEPTANCE: ["stays", [STOCK]],
  TX_STOCK_RETRACTION: ["removes", [STOCK]],
  TX_STOCK_CANCELLATION: ["removes", [STOCK]],
  TX_STOCK_REPURCHASE: ["removes", [STOCK]],
  TX_STOCK_TRANSFER: ["removes", [STOCK]],
  TX_STOCK_CONVERSION: ["removes", [STOCK]],
  TX_STOCK_REISSUANCE: ["removes", [STOCK]],
  TX_STOCK_CONSOLIDATION: ["removes", [STOCK]],
  // Convertible
  TX_CONVERTIBLE_ISSUANCE: ["issue", [CONVERTIBLE]],
  TX_CONVERTIBLE_ACCEPTANCE: ["stays", [CONVERTIBLE]],
  TX_CONVERTIBLE_RETRACTION: ["removes", [CONVERTIBLE]],
  TX_CONVERTIBLE_CANCELLATION: ["removes", [CONVERTIBLE]],
  TX_CONVERTIBLE_TRANSFER: ["removes", [CONVERTIBLE]],
  TX_CONVERTIBLE_CONVERSION: ["removes", [CONVERTIBLE]],
  // Warrant. Its exercise removes it.
  TX_WARRANT_ISSUANCE: ["issue", [WARRANT]],
  TX_WARRANT_ACCEPTANCE: ["stays", [WARRANT]],
  TX_WARRANT_RETRACTION: ["removes", [WARRANT]],
  TX_WARRANT_CANCELLATION: ["removes", [WARRANT]],
  TX_WARRANT_TRANSFER: ["removes", [WARRANT]],
  TX_WARRANT_EXERCISE: ["removes", [WARRANT]],
  // Equity compensation. Its exercise and release carry a quantity and no
  // balance security, so the grant stays outstanding under the same id.
  TX_EQUITY_COMPENSATION_ISSUANCE: ["issue", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_ACCEPTANCE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_REPRICING: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_EXERCISE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_RELEASE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_RETRACTION: ["removes", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_CANCELLATION: ["removes", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_TRANSFER: ["removes", [EQUITY_COMPENSATION]],
  // The return to pool is the one transaction allowed only on a removed security.
  TX_STOCK_PLAN_RETURN_TO_POOL: ["after removal", [EQUITY_COMPENSATION]],
  // Equity compensation under its older names.
  TX_PLAN_SECURITY_ISSUANCE: ["issue", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_ACCEPTANCE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_EXERCISE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_RELEASE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_RETRACTION: ["removes", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_CANCELLATION: ["removes", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_TRANSFER: ["removes", [EQUITY_COMPENSATION]],
  // Vesting, on a security of any family that vests.
  TX_VESTING_START: ["stays", VESTS],
  TX_VESTING_EVENT: ["stays", VESTS],
  TX_VESTING_ACCELERATION: ["stays", VESTS],
  // These name no security, so they're on no family's chart.
  TX_STOCK_CLASS_SPLIT: ["stays", []],
  TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT: ["stays", []],
  TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT: ["stays", []],
  TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT: ["stays", []],
  TX_STOCK_PLAN_POOL_ADJUSTMENT: ["stays", []],
};

const KEYS = Object.keys(TX_DESCRIPTORS) as TxKey[];

describe("lifecycle words", () => {
  it("lists a word for exactly the transaction types the table holds", () => {
    expect(new Set(Object.keys(EXPECTED))).toEqual(new Set(KEYS));
  });

  it.each(KEYS)("%s declares the word and families the oracle expects", (key) => {
    const descriptor = TX_DESCRIPTORS[key];
    const [word, families] = EXPECTED[key];
    expect(descriptor.lifecycle).toBe(word);
    expect([...lifecycleFamilies(descriptor)]).toEqual([...families]);
  });

  it("gives an active descriptor the word its effect implies", () => {
    const implied = { append: "issue", none: "stays", remove: "removes" } as const;
    for (const key of KEYS) {
      const descriptor = TX_DESCRIPTORS[key];
      // The return to pool is the exception: it changes no security, and its
      // word is "after removal", which it has to state.
      if (key === "TX_STOCK_PLAN_RETURN_TO_POOL") {
        expect(descriptor).toMatchObject({ effect: "none", lifecycle: "after removal" });
      } else if (descriptor.effect !== "passthrough") {
        expect(descriptor.lifecycle).toBe(implied[descriptor.effect]);
      }
    }
  });

  it("names a family for every word on a transaction that carries a security", () => {
    // The types with no family are exactly the five that name no security.
    const noFamily = KEYS.filter((key) => lifecycleFamilies(TX_DESCRIPTORS[key]).length === 0);
    expect(new Set(noFamily)).toEqual(
      new Set([
        "TX_STOCK_CLASS_SPLIT",
        "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
        "TX_STOCK_CLASS_CONVERSION_RATIO_ADJUSTMENT",
        "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
        "TX_STOCK_PLAN_POOL_ADJUSTMENT",
      ]),
    );
  });
});
