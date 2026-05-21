import {
  assertValidVestingSchedule,
  assertValidVestingScheduleTemplate,
  validateVestingSchedule,
  validateVestingScheduleTemplate,
} from "../validate";
import type {
  VestingSchedule,
  VestingScheduleTemplate,
  VestingStatement,
} from "../../types/canonical/vesting";

const goodStatement: VestingStatement = {
  order: 1,
  occurrences: 48,
  period: 1,
  period_type: "MONTHS",
  cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
  percentage: { numerator: 1, denominator: 1 },
};

const goodTemplate: VestingScheduleTemplate = {
  id: "t1",
  statements: [goodStatement],
};

const goodSchedule: VestingSchedule = {
  template_id: "t1",
  start_date: "2025-01-01",
};

describe("validateVestingScheduleTemplate", () => {
  it("accepts a well-formed template", () => {
    const result = validateVestingScheduleTemplate(goodTemplate);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  describe("id", () => {
    it("rejects empty string", () => {
      const result = validateVestingScheduleTemplate({ ...goodTemplate, id: "" });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: "id",
        message: "must be a non-empty string",
      });
    });

    it("rejects non-string", () => {
      const result = validateVestingScheduleTemplate({
        ...goodTemplate,
        id: 123 as unknown as string,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("statements array", () => {
    it("rejects empty array", () => {
      const result = validateVestingScheduleTemplate({
        ...goodTemplate,
        statements: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: "statements",
        message: "must be a non-empty array",
      });
    });

    it("rejects non-array", () => {
      const result = validateVestingScheduleTemplate({
        ...goodTemplate,
        statements: "nope" as unknown as VestingStatement[],
      });
      expect(result.valid).toBe(false);
    });

    it("rejects duplicate orders", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          { ...goodStatement, order: 1 },
          { ...goodStatement, order: 1 },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        path: "statements",
        message: "duplicate order 1 at indices [0, 1]",
      });
    });

    it("accepts non-sequential but unique orders", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          { ...goodStatement, order: 5 },
          { ...goodStatement, order: 2 },
        ],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("statement.order", () => {
    it("rejects 0", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, order: 0 }],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].order",
        message: "must be an integer >= 1",
      });
    });

    it("rejects non-integer", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, order: 1.5 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("statement.occurrences", () => {
    it("rejects 0", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, occurrences: 0 }],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].occurrences",
        message: "must be an integer >= 1",
      });
    });

    it("rejects non-integer", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, occurrences: 1.5 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("statement.period", () => {
    it("accepts 0", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, cliff: undefined, period: 0 }],
      });
      expect(result.valid).toBe(true);
    });

    it("rejects negative", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, period: -1 }],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].period",
        message: "must be an integer >= 0",
      });
    });

    it("rejects non-integer", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, period: 1.5 }],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("statement.period_type", () => {
    it("rejects invalid enum value", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            period_type: "WEEKS" as unknown as VestingStatement["period_type"],
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].period_type",
        message: "must be one of DAYS, MONTHS, YEARS",
      });
    });

    it.each(["DAYS", "MONTHS", "YEARS"] as const)("accepts %s", (pt) => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [{ ...goodStatement, cliff: undefined, period_type: pt }],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("statement.percentage", () => {
    it("rejects non-integer numerator", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          { ...goodStatement, percentage: { numerator: 1.5, denominator: 2 } },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].percentage.numerator",
        message: "must be an integer",
      });
    });

    it("rejects denominator 0", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          { ...goodStatement, percentage: { numerator: 1, denominator: 0 } },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].percentage.denominator",
        message: "must be an integer >= 1",
      });
    });

    it("rejects negative denominator", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          { ...goodStatement, percentage: { numerator: 1, denominator: -2 } },
        ],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("statement.cliff", () => {
    it("rejects occurrence > occurrences", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            occurrences: 12,
            cliff: { occurrence: 13, percentage: { numerator: 1, denominator: 4 } },
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].cliff.occurrence",
        message:
          "must be <= statement.occurrences (got 13, occurrences=12)",
      });
    });

    it("rejects occurrence 0", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            cliff: { occurrence: 0, percentage: { numerator: 1, denominator: 4 } },
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].cliff.occurrence",
        message: "must be an integer >= 1",
      });
    });

    it("rejects bad percentage", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 0 } },
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].cliff.percentage.denominator",
        message: "must be an integer >= 1",
      });
    });
  });

  it("collects multiple errors at once", () => {
    const result = validateVestingScheduleTemplate({
      id: "",
      statements: [
        { ...goodStatement, order: 0, occurrences: 0 },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(2);
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        "id",
        "statements[0].order",
        "statements[0].occurrences",
      ]),
    );
  });

  it("error paths include array indices for nested statements", () => {
    const result = validateVestingScheduleTemplate({
      id: "t1",
      statements: [
        goodStatement,
        { ...goodStatement, order: 2, occurrences: 0 },
      ],
    });
    expect(result.errors).toContainEqual({
      path: "statements[1].occurrences",
      message: "must be an integer >= 1",
    });
  });
});

describe("validateVestingSchedule", () => {
  it("accepts a well-formed schedule", () => {
    expect(validateVestingSchedule(goodSchedule)).toEqual({
      valid: true,
      errors: [],
    });
  });

  describe("template_id", () => {
    it("rejects empty string", () => {
      const result = validateVestingSchedule({ ...goodSchedule, template_id: "" });
      expect(result.errors).toContainEqual({
        path: "template_id",
        message: "must be a non-empty string",
      });
    });
  });

  describe("start_date", () => {
    it("rejects non-ISO format", () => {
      const result = validateVestingSchedule({ ...goodSchedule, start_date: "2025/01/01" });
      expect(result.errors).toContainEqual({
        path: "start_date",
        message: "must be an ISO 8601 date string (YYYY-MM-DD)",
      });
    });

    it("rejects garbage", () => {
      const result = validateVestingSchedule({ ...goodSchedule, start_date: "not a date" });
      expect(result.valid).toBe(false);
    });
  });
});

describe("assertValidVestingScheduleTemplate", () => {
  it("does not throw on valid input", () => {
    expect(() => assertValidVestingScheduleTemplate(goodTemplate)).not.toThrow();
  });

  it("throws with concatenated messages on invalid input", () => {
    expect(() =>
      assertValidVestingScheduleTemplate({
        id: "",
        statements: [{ ...goodStatement, occurrences: 0 }],
      }),
    ).toThrow(/Invalid VestingScheduleTemplate/);
  });
});

describe("assertValidVestingSchedule", () => {
  it("does not throw on valid input", () => {
    expect(() => assertValidVestingSchedule(goodSchedule)).not.toThrow();
  });

  it("throws on invalid input", () => {
    expect(() =>
      assertValidVestingSchedule({ template_id: "", start_date: "bad" }),
    ).toThrow(/Invalid VestingSchedule/);
  });
});
