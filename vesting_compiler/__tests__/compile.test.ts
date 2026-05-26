import { compileVesting, type VestingRuntime } from "../compile";
import type { VestingScheduleTemplate } from "../../types/canonical/vesting";

const sumAmounts = (events: { amount: string }[]): number =>
  events.reduce((acc, e) => acc + Number(e.amount), 0);

const DATE_BASE = { type: "DATE" as const };
const startJan2025: VestingRuntime = { startDate: "2025-01-01" };

describe("compileVesting — standard 4yr/1mo with 25% cliff", () => {
  const template: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        vesting_base: DATE_BASE,
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  it("emits 37 events: 1 cliff + 36 post-cliff", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events).toHaveLength(37);
  });

  it("first event is the cliff at month 12 vesting 25000", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "25000" });
  });

  it("last event lands at start + 48 months", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events[events.length - 1].date).toBe("2029-01-01");
  });

  it("sum equals totalShares exactly", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(sumAmounts(events)).toBe(100_000);
  });

  it("absorbs rounding drift with an awkward share count", () => {
    const events = compileVesting(template, 100, startJan2025);
    expect(sumAmounts(events)).toBe(100);
  });

  it("emits exactly one share at the final event when totalShares = 1", () => {
    const events = compileVesting(template, 1, startJan2025);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ date: "2029-01-01", amount: "1" });
  });
});

describe("compileVesting — non-standard 30% cliff", () => {
  const template: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        vesting_base: DATE_BASE,
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        cliff: {
          occurrence: 12,
          percentage: { numerator: 3, denominator: 10 },
        },
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  it("cliff event vests 30000 (30% of 100000)", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "30000" });
  });

  it("emits 37 events with sum equal to totalShares", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events).toHaveLength(37);
    expect(sumAmounts(events)).toBe(100_000);
  });
});

describe("compileVesting — bespoke 5/15/40/40 chained over 4 years", () => {
  const template: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        vesting_base: DATE_BASE,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 1, denominator: 20 },
      },
      {
        order: 2,
        vesting_base: DATE_BASE,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 3, denominator: 20 },
      },
      {
        order: 3,
        vesting_base: DATE_BASE,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 2, denominator: 5 },
      },
      {
        order: 4,
        vesting_base: DATE_BASE,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 2, denominator: 5 },
      },
    ],
  };

  // Regression for DATE statement chaining via dateCursor: each statement
  // anchors at the previous statement's end (not at runtime.startDate).
  it("emits 4 yearly events with chained dates and 5/15/40/40 split", () => {
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events).toEqual([
      { date: "2026-01-01", amount: "5000" },
      { date: "2027-01-01", amount: "15000" },
      { date: "2028-01-01", amount: "40000" },
      { date: "2029-01-01", amount: "40000" },
    ]);
  });
});

describe("compileVesting — additional DATE-anchored cases", () => {
  it("plain 4-year monthly with no cliff emits 48 events summing to totalShares", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 48,
          period: 1,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events).toHaveLength(48);
    expect(sumAmounts(events)).toBe(100_000);
    expect(events[0].date).toBe("2025-02-01");
    expect(events[events.length - 1].date).toBe("2029-01-01");
  });

  it("cliff at last occurrence (K == N) emits a single event", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 12,
          period: 1,
          period_type: "MONTHS",
          cliff: {
            occurrence: 12,
            percentage: { numerator: 1, denominator: 1 },
          },
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, startJan2025);
    expect(events).toEqual([{ date: "2026-01-01", amount: "100000" }]);
  });

  it("DAYS schedule produces correct ISO dates", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 4,
          period: 7,
          period_type: "DAYS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 400, startJan2025);
    expect(events.map((e) => e.date)).toEqual([
      "2025-01-08",
      "2025-01-15",
      "2025-01-22",
      "2025-01-29",
    ]);
    expect(sumAmounts(events)).toBe(400);
  });

  it("preserves seed day across short months for an end-of-month start", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 6,
          period: 1,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 600, { startDate: "2025-01-31" });
    expect(events.map((e) => e.date)).toEqual([
      "2025-02-28",
      "2025-03-31",
      "2025-04-30",
      "2025-05-31",
      "2025-06-30",
      "2025-07-31",
    ]);
  });

  it("sorts statements by order before processing", () => {
    const ordered: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
        {
          order: 2,
          vesting_base: DATE_BASE,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
      ],
    };
    const reversed: VestingScheduleTemplate = {
      id: "t1",
      statements: [ordered.statements[1], ordered.statements[0]],
    };
    expect(compileVesting(ordered, 100, startJan2025)).toEqual(
      compileVesting(reversed, 100, startJan2025),
    );
  });

  it("zero-percent statement emits no events but advances the cursor", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 0, denominator: 1 },
        },
        {
          order: 2,
          vesting_base: DATE_BASE,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100, startJan2025);
    expect(events).toEqual([{ date: "2027-01-01", amount: "100" }]);
  });

  it("throws when totalShares is not a non-negative integer", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    expect(() => compileVesting(template, -1, startJan2025)).toThrow();
    expect(() => compileVesting(template, 1.5, startJan2025)).toThrow();
  });
});

describe("compileVesting — grant_date handling (DATE-anchored)", () => {
  const monthlyNoCliff: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        vesting_base: DATE_BASE,
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  const monthlyWithCliff: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        vesting_base: DATE_BASE,
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  it("grant_date before vesting_start has no effect", () => {
    const events = compileVesting(monthlyNoCliff, 4800, {
      startDate: "2025-01-01",
      grantDate: "2023-06-01",
    });
    expect(events).toHaveLength(48);
    expect(events[0].date).toBe("2025-02-01");
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date equal to a scheduled event date merges held amount into that event", () => {
    // schedule.start_date = 2025-01-01 monthly; grant_date = 2025-04-01 (= event #3)
    const events = compileVesting(monthlyNoCliff, 4800, {
      startDate: "2025-01-01",
      grantDate: "2025-04-01",
    });
    // events #1 (Feb) and #2 (Mar) held; event #3 emits own 100 + held 200 = 300
    expect(events).toHaveLength(46);
    expect(events[0]).toEqual({ date: "2025-04-01", amount: "300" });
    expect(events[1]).toEqual({ date: "2025-05-01", amount: "100" });
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date between scheduled events emits an off-rhythm event on grant_date", () => {
    // grant_date = 2025-03-15 falls between events #2 (Mar 1) and #3 (Apr 1)
    const events = compileVesting(monthlyNoCliff, 4800, {
      startDate: "2025-01-01",
      grantDate: "2025-03-15",
    });
    // events #1 (Feb) and #2 (Mar) held = 200; emit on grant_date itself
    // then event #3 (Apr) emits normally
    expect(events).toHaveLength(47);
    expect(events[0]).toEqual({ date: "2025-03-15", amount: "200" });
    expect(events[1]).toEqual({ date: "2025-04-01", amount: "100" });
    expect(events[events.length - 1].date).toBe("2029-01-01");
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date after explicit cliff absorbs cliff + intervening months", () => {
    const events = compileVesting(monthlyWithCliff, 4800, {
      startDate: "2023-01-01",
      grantDate: "2024-06-01",
    });
    // cliff at 2024-01-01 vests 1200 — held
    // months 13-16 (2024-02..05) each vest 100 — held, total 400
    // month 17 (2024-06-01) == grant_date: emit own 100 + held 1600 = 1700
    expect(events[0]).toEqual({ date: "2024-06-01", amount: "1700" });
    expect(events[1]).toEqual({ date: "2024-07-01", amount: "100" });
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date after the entire schedule emits the full grant on grant_date", () => {
    const events = compileVesting(monthlyNoCliff, 4800, {
      startDate: "2020-01-01",
      grantDate: "2030-01-01",
    });
    expect(events).toEqual([{ date: "2030-01-01", amount: "4800" }]);
  });

  it("grant_date on the rhythm with a cliff exactly at grant_date", () => {
    const events = compileVesting(monthlyWithCliff, 100_000, {
      startDate: "2025-01-01",
      grantDate: "2026-01-01",
    });
    // cliff date == grant_date — pending stays 0, cliff event emits normally
    expect(events).toHaveLength(37);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "25000" });
    expect(sumAmounts(events)).toBe(100_000);
  });

  it("preserves the held-back-pre-cliff filter under grant_date", () => {
    const events = compileVesting(monthlyWithCliff, 100_000, {
      startDate: "2025-01-01",
      grantDate: "2026-06-01",
    });
    const sum = sumAmounts(events);
    expect(sum).toBe(100_000);
    for (const e of events) {
      expect(e.date >= "2026-06-01").toBe(true);
    }
  });
});

describe("compileVesting — EVENT-anchored statements", () => {
  it("single-event instantaneous vest of full grant", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      eventFirings: [{ event_id: "ipo", date: "2026-04-01" }],
    });
    expect(events).toEqual([{ date: "2026-04-01", amount: "100000" }]);
  });

  it("partial firing with realized_fraction scales the vested amount", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "milestone" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      eventFirings: [
        {
          event_id: "milestone",
          date: "2026-04-01",
          realized_fraction: { numerator: 3, denominator: 10 },
        },
      ],
    });
    expect(events).toEqual([{ date: "2026-04-01", amount: "30000" }]);
  });

  it("post-event monthly schedule (occurrences > 1) vests from firing date", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 12,
          period: 1,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 1200, {
      eventFirings: [{ event_id: "ipo", date: "2026-04-01" }],
    });
    expect(events).toHaveLength(12);
    expect(events[0].date).toBe("2026-05-01");
    expect(events[events.length - 1].date).toBe("2027-04-01");
    expect(sumAmounts(events)).toBe(1200);
  });

  it("two statements referencing the same event_id both fire on a single firing", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 4 },
        },
        {
          order: 2,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 3, denominator: 4 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      eventFirings: [{ event_id: "ipo", date: "2026-04-01" }],
    });
    // Two events both on 2026-04-01; tie-break by statement.order.
    expect(events).toEqual([
      { date: "2026-04-01", amount: "25000" },
      { date: "2026-04-01", amount: "75000" },
    ]);
  });

  it("EVENT statement with no matching firing is silently skipped", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, { eventFirings: [] });
    expect(events).toEqual([]);
  });

  it("all EVENT statements unfired emits zero events with no error", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
        {
          order: 2,
          vesting_base: { type: "EVENT", event_id: "acquisition" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {});
    expect(events).toEqual([]);
  });
});

describe("compileVesting — hybrid DATE + EVENT templates", () => {
  it("DATE statement chains through; EVENT statement adds a chronological event", () => {
    // 90% on a 4yr/1mo schedule starting 2025-01-01; 10% bonus on "ipo" event.
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: DATE_BASE,
          occurrences: 48,
          period: 1,
          period_type: "MONTHS",
          cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
          percentage: { numerator: 9, denominator: 10 },
        },
        {
          order: 2,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 10 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      startDate: "2025-01-01",
      eventFirings: [{ event_id: "ipo", date: "2027-06-15" }],
    });
    expect(sumAmounts(events)).toBe(100_000);
    // Cliff fires at 2026-01-01 (90% × 25% = 22500)
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "22500" });
    // The IPO bonus appears chronologically interleaved with the monthly events.
    const ipoEvent = events.find((e) => e.date === "2027-06-15");
    expect(ipoEvent).toBeDefined();
    expect(ipoEvent!.amount).toBe("10000");
    // Output is in chronological order.
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });

  it("EVENT firing before grant_date is aggregated onto grant_date", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "early" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
        {
          order: 2,
          vesting_base: { type: "EVENT", event_id: "late" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      eventFirings: [
        { event_id: "early", date: "2025-03-01" },
        { event_id: "late", date: "2025-09-01" },
      ],
      grantDate: "2025-06-01",
    });
    // "early" fires 2025-03-01 (before grant) → 50000 held → emitted on grant_date
    // "late" fires 2025-09-01 (after grant) → emitted normally
    expect(events).toEqual([
      { date: "2025-06-01", amount: "50000" },
      { date: "2025-09-01", amount: "50000" },
    ]);
  });

  it("EVENT firing on grant_date emits normally without held-back aggregation", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          vesting_base: { type: "EVENT", event_id: "ipo" },
          occurrences: 1,
          period: 0,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, 100_000, {
      eventFirings: [{ event_id: "ipo", date: "2026-04-01" }],
      grantDate: "2026-04-01",
    });
    // Date == grantDate, but pending was 0, so this just emits normally.
    expect(events).toEqual([{ date: "2026-04-01", amount: "100000" }]);
  });
});
