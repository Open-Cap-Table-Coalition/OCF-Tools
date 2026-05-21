import { addPeriod } from "../dates";

describe("addPeriod", () => {
  describe("MONTHS", () => {
    it("adds whole months on a mid-month date", () => {
      expect(addPeriod("2025-01-01", 12, "MONTHS")).toBe("2026-01-01");
    });

    it("clamps Jan 31 + 1 month to Feb 28 in a non-leap year", () => {
      expect(addPeriod("2025-01-31", 1, "MONTHS")).toBe("2025-02-28");
    });

    it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
      expect(addPeriod("2024-01-31", 1, "MONTHS")).toBe("2024-02-29");
    });

    it("preserves the seed day across short months when computed from root start", () => {
      const start = "2025-01-31";
      expect(addPeriod(start, 1, "MONTHS")).toBe("2025-02-28");
      expect(addPeriod(start, 2, "MONTHS")).toBe("2025-03-31");
      expect(addPeriod(start, 3, "MONTHS")).toBe("2025-04-30");
      expect(addPeriod(start, 4, "MONTHS")).toBe("2025-05-31");
      expect(addPeriod(start, 5, "MONTHS")).toBe("2025-06-30");
      expect(addPeriod(start, 6, "MONTHS")).toBe("2025-07-31");
    });

    it("crosses year boundaries correctly", () => {
      expect(addPeriod("2025-11-15", 3, "MONTHS")).toBe("2026-02-15");
    });
  });

  describe("YEARS", () => {
    it("adds whole years", () => {
      expect(addPeriod("2025-01-01", 4, "YEARS")).toBe("2029-01-01");
    });

    it("clamps Feb 29 + 1 year to Feb 28", () => {
      expect(addPeriod("2024-02-29", 1, "YEARS")).toBe("2025-02-28");
    });
  });

  describe("DAYS", () => {
    it("adds 365 days across a non-leap year", () => {
      expect(addPeriod("2025-01-01", 365, "DAYS")).toBe("2026-01-01");
    });

    it("adds 366 days across a leap year", () => {
      expect(addPeriod("2024-01-01", 366, "DAYS")).toBe("2025-01-01");
    });

    it("adds 7 days", () => {
      expect(addPeriod("2025-03-01", 7, "DAYS")).toBe("2025-03-08");
    });
  });

  it("rejects malformed ISO input", () => {
    expect(() => addPeriod("2025/01/01", 1, "MONTHS")).toThrow();
  });
});
