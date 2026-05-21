import { allocate, floorSharesAt } from "../allocate";
import type { Allocation_Type } from "../../types";

describe("floorSharesAt", () => {
  it("floor(100000 × 3/10) = 30000", () => {
    expect(floorSharesAt(100_000, { numerator: 3, denominator: 10 })).toBe(
      30_000,
    );
  });

  it("floor(100 × 1/3) = 33", () => {
    expect(floorSharesAt(100, { numerator: 1, denominator: 3 })).toBe(33);
  });

  it("floor(100000 × 1/1) = 100000", () => {
    expect(floorSharesAt(100_000, { numerator: 1, denominator: 1 })).toBe(
      100_000,
    );
  });

  it("floor of zero is zero", () => {
    expect(floorSharesAt(100_000, { numerator: 0, denominator: 1 })).toBe(0);
  });
});

describe("allocate", () => {
  describe("CUMULATIVE_ROUND_DOWN", () => {
    it("returns floor(totalShares × cumulative) − vestedSoFar", () => {
      expect(
        allocate(
          "CUMULATIVE_ROUND_DOWN",
          100_000,
          { numerator: 1, denominator: 4 },
          0,
        ),
      ).toBe(25_000);
    });

    it("subtracts what's already been emitted (telescoping)", () => {
      // 100,000 × 13/48 = 27083 floored. Already emitted 25,000.
      expect(
        allocate(
          "CUMULATIVE_ROUND_DOWN",
          100_000,
          { numerator: 13, denominator: 48 },
          25_000,
        ),
      ).toBe(2_083);
    });

    it("emits totalShares − vestedSoFar when cumulative reaches 1/1", () => {
      expect(
        allocate(
          "CUMULATIVE_ROUND_DOWN",
          1_000,
          { numerator: 1, denominator: 1 },
          979,
        ),
      ).toBe(21);
    });

    it("emits 0 when the floor hasn't advanced (drift case)", () => {
      // 1 × 1/48 = 0.02… → floor = 0. No emission.
      expect(
        allocate(
          "CUMULATIVE_ROUND_DOWN",
          1,
          { numerator: 1, denominator: 48 },
          0,
        ),
      ).toBe(0);
    });
  });

  describe("unimplemented modes", () => {
    const modes: Exclude<Allocation_Type, "CUMULATIVE_ROUND_DOWN">[] = [
      "CUMULATIVE_ROUNDING",
      "FRONT_LOADED",
      "BACK_LOADED",
      "FRONT_LOADED_TO_SINGLE_TRANCHE",
      "BACK_LOADED_TO_SINGLE_TRANCHE",
      "FRACTIONAL",
    ];

    it.each(modes)("throws on %s", (mode) => {
      expect(() =>
        allocate(mode, 100, { numerator: 1, denominator: 4 }, 0),
      ).toThrow(/not yet implemented/);
    });
  });
});
