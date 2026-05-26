import {
  assertValidVestingRuntime,
  assertValidVestingScheduleTemplate,
  validateVestingRuntime,
  validateVestingScheduleTemplate,
} from "../validate";
import type { VestingRuntime } from "../compile";
import type {
  VestingScheduleTemplate,
  VestingStatement,
} from "../../types/canonical/vesting";

const DATE_BASE = { type: "DATE" as const };

const goodStatement: VestingStatement = {
  order: 1,
  vesting_base: DATE_BASE,
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

  describe("statement.vesting_base", () => {
    it("rejects missing vesting_base", () => {
      const { vesting_base, ...stmtWithoutBase } = goodStatement;
      void vesting_base;
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [stmtWithoutBase as unknown as VestingStatement],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].vesting_base",
        message: "is required and must be an object",
      });
    });

    it("rejects invalid type", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            vesting_base: { type: "RELATIVE" } as unknown as VestingStatement["vesting_base"],
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].vesting_base.type",
        message: 'must be "DATE" or "EVENT"',
      });
    });

    it("rejects EVENT without event_id", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            vesting_base: { type: "EVENT" } as unknown as VestingStatement["vesting_base"],
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].vesting_base.event_id",
        message: "must be a non-empty string",
      });
    });

    it("rejects EVENT with empty event_id", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            vesting_base: { type: "EVENT", event_id: "" },
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].vesting_base.event_id",
        message: "must be a non-empty string",
      });
    });

    it("rejects DATE with stray event_id", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            vesting_base: {
              type: "DATE",
              event_id: "stray",
            } as unknown as VestingStatement["vesting_base"],
          },
        ],
      });
      expect(result.errors).toContainEqual({
        path: "statements[0].vesting_base.event_id",
        message: 'must not be present on a vesting_base with type "DATE"',
      });
    });

    it("accepts well-formed EVENT base", () => {
      const result = validateVestingScheduleTemplate({
        id: "t1",
        statements: [
          {
            ...goodStatement,
            cliff: undefined,
            vesting_base: { type: "EVENT", event_id: "ipo" },
          },
        ],
      });
      expect(result.valid).toBe(true);
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

describe("validateVestingRuntime", () => {
  const eventTemplate: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        ...goodStatement,
        cliff: undefined,
        vesting_base: { type: "EVENT", event_id: "ipo" },
      },
    ],
  };

  it("accepts an empty runtime when template has only EVENT statements", () => {
    const result = validateVestingRuntime({}, eventTemplate);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("requires startDate when any DATE-anchored statement exists", () => {
    const result = validateVestingRuntime({}, goodTemplate);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: "startDate",
      message:
        "is required when the template contains any DATE-anchored statement",
    });
  });

  it("accepts a valid startDate for a DATE template", () => {
    const result = validateVestingRuntime(
      { startDate: "2025-01-01" },
      goodTemplate,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects non-ISO startDate", () => {
    const result = validateVestingRuntime(
      { startDate: "2025/01/01" },
      goodTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "startDate",
      message: "must be an ISO 8601 date string (YYYY-MM-DD)",
    });
  });

  it("rejects non-ISO grantDate", () => {
    const result = validateVestingRuntime(
      { startDate: "2025-01-01", grantDate: "nope" },
      goodTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "grantDate",
      message: "must be an ISO 8601 date string (YYYY-MM-DD)",
    });
  });

  it("rejects duplicate event_id in eventFirings", () => {
    const result = validateVestingRuntime(
      {
        eventFirings: [
          { event_id: "ipo", date: "2026-04-01" },
          { event_id: "ipo", date: "2026-05-01" },
        ],
      },
      eventTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "eventFirings",
      message: 'duplicate event_id "ipo" at indices [0, 1]',
    });
  });

  it("rejects event_id that doesn't match any EVENT statement", () => {
    const result = validateVestingRuntime(
      { eventFirings: [{ event_id: "stranger", date: "2026-04-01" }] },
      eventTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "eventFirings[0].event_id",
      message:
        '"stranger" does not match any EVENT-anchored statement in the template',
    });
  });

  it("rejects non-ISO firing date", () => {
    const result = validateVestingRuntime(
      { eventFirings: [{ event_id: "ipo", date: "not-a-date" }] },
      eventTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "eventFirings[0].date",
      message: "must be an ISO 8601 date string (YYYY-MM-DD)",
    });
  });

  it("rejects realized_fraction > 1", () => {
    const result = validateVestingRuntime(
      {
        eventFirings: [
          {
            event_id: "ipo",
            date: "2026-04-01",
            realized_fraction: { numerator: 3, denominator: 2 },
          },
        ],
      },
      eventTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "eventFirings[0].realized_fraction",
      message: "must be in the closed interval [0, 1]",
    });
  });

  it("rejects negative realized_fraction", () => {
    const result = validateVestingRuntime(
      {
        eventFirings: [
          {
            event_id: "ipo",
            date: "2026-04-01",
            realized_fraction: { numerator: -1, denominator: 2 },
          },
        ],
      },
      eventTemplate,
    );
    expect(result.errors).toContainEqual({
      path: "eventFirings[0].realized_fraction",
      message: "must be in the closed interval [0, 1]",
    });
  });

  it("accepts realized_fraction in [0, 1]", () => {
    const result = validateVestingRuntime(
      {
        eventFirings: [
          {
            event_id: "ipo",
            date: "2026-04-01",
            realized_fraction: { numerator: 3, denominator: 10 },
          },
        ],
      },
      eventTemplate,
    );
    expect(result.valid).toBe(true);
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

describe("assertValidVestingRuntime", () => {
  const goodRuntime: VestingRuntime = { startDate: "2025-01-01" };

  it("does not throw on valid input", () => {
    expect(() =>
      assertValidVestingRuntime(goodRuntime, goodTemplate),
    ).not.toThrow();
  });

  it("throws on invalid input", () => {
    expect(() => assertValidVestingRuntime({}, goodTemplate)).toThrow(
      /Invalid VestingRuntime/,
    );
  });
});
