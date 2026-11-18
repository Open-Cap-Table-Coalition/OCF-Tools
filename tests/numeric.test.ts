import { describe, it, expect } from "vitest";
import { add, exceeds, isNegative, isNumeric, subtract } from "../ocf_validator/numeric";

describe("OCF Numeric arithmetic", () => {
  it("recognises a Numeric and nothing else", () => {
    for (const value of ["0", "1000", "+5", "-5", "0.5", "12.0000000001"]) expect(isNumeric(value)).toBe(true);
    // Eleven decimal places, no digits before or after the point, an
    // exponent, a thousands separator, and values that aren't strings.
    for (const value of ["1.00000000001", ".5", "5.", "1e3", "1,000", "", " 1", "abc", 1000, null, undefined, {}, ["1"]]) {
      expect(isNumeric(value)).toBe(false);
    }
  });

  it("adds and subtracts exactly, where a JavaScript number wouldn't", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(subtract("0.3", "0.1")).toBe("0.2");
    // Beyond what a double can hold exactly.
    expect(add("9007199254740993", "1")).toBe("9007199254740994");
    expect(add("123456789012345678901234567890.0000000001", "0.0000000009")).toBe("123456789012345678901234567890.000000001");
  });

  it("writes its results without a sign on zero or trailing zeros", () => {
    expect(add("100.50", "0.50")).toBe("101");
    expect(subtract("100", "100.0")).toBe("0");
    expect(subtract("-5", "-5")).toBe("0");
    expect(add("+5", "2.500")).toBe("7.5");
  });

  it("goes below zero when more is subtracted than is there", () => {
    expect(subtract("40", "100")).toBe("-60");
    expect(subtract("0.25", "1")).toBe("-0.75");
    expect(isNegative("-0.75")).toBe(true);
    expect(isNegative("0")).toBe(false);
    expect(isNegative("-0.0")).toBe(false);
  });

  it("compares by value, not by how the number is written", () => {
    expect(exceeds("100.0000000001", "100")).toBe(true);
    expect(exceeds("100", "100.00")).toBe(false);
    expect(exceeds("9", "10")).toBe(false);
    expect(exceeds("10", "9")).toBe(true);
    expect(exceeds("-1", "-2")).toBe(true);
  });
});
