import { describe, it, expect } from "vitest";
import { lifecycleFamilies, TX_DESCRIPTORS, type CollectionKey, type TxKey } from "../ocf_validator/ocfMachine";
import type { LifecycleWord } from "../types/validator";

// Security lifecycle by transaction type

// List the expected change and families for each transaction independently of the production table.
// A wrong table entry should fail a test even if the chart faithfully uses it (#233).

const STOCK = "stockIssuances";
const CONVERTIBLE = "convertibleIssuances";
const WARRANT = "warrantIssuances";
const EQUITY_COMPENSATION = "equityCompensation";

// Convertible issuances have no vesting terms.
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
  // Exercising a warrant removes it.
  TX_WARRANT_ISSUANCE: ["issue", [WARRANT]],
  TX_WARRANT_ACCEPTANCE: ["stays", [WARRANT]],
  TX_WARRANT_RETRACTION: ["removes", [WARRANT]],
  TX_WARRANT_CANCELLATION: ["removes", [WARRANT]],
  TX_WARRANT_TRANSFER: ["removes", [WARRANT]],
  TX_WARRANT_EXERCISE: ["removes", [WARRANT]],
  // Exercises and releases can use part of a grant while the same grant stays outstanding.
  TX_EQUITY_COMPENSATION_ISSUANCE: ["issue", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_ACCEPTANCE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_REPRICING: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_EXERCISE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_RELEASE: ["stays", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_RETRACTION: ["removes", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_CANCELLATION: ["removes", [EQUITY_COMPENSATION]],
  TX_EQUITY_COMPENSATION_TRANSFER: ["removes", [EQUITY_COMPENSATION]],
  // Stock and equity compensation can both be issued from a stock plan.
  TX_STOCK_PLAN_RETURN_TO_POOL: ["after removal", [STOCK, EQUITY_COMPENSATION]],
  // Older names for equity compensation transactions
  TX_PLAN_SECURITY_ISSUANCE: ["issue", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_ACCEPTANCE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_EXERCISE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_RELEASE: ["stays", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_RETRACTION: ["removes", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_CANCELLATION: ["removes", [EQUITY_COMPENSATION]],
  TX_PLAN_SECURITY_TRANSFER: ["removes", [EQUITY_COMPENSATION]],
  // Vesting applies to each family that supports it.
  TX_VESTING_START: ["stays", VESTS],
  TX_VESTING_EVENT: ["stays", VESTS],
  TX_VESTING_ACCELERATION: ["stays", VESTS],
  // These transactions name no individual security.
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
      if (descriptor.effect !== "passthrough") expect(descriptor.lifecycle).toBe(implied[descriptor.effect]);
    }
  });

  it("names a family for every word on a transaction that carries a security", () => {
    // Only these five transaction types name no security.
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
