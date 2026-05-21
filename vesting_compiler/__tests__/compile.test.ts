import { compileVesting } from "../compile";
import type {
  VestingSchedule,
  VestingScheduleTemplate,
} from "../../types/canonical/vesting";

const sumAmounts = (events: { amount: string }[]): number =>
  events.reduce((acc, e) => acc + Number(e.amount), 0);

const schedule: VestingSchedule = {
  template_id: "t1",
  start_date: "2025-01-01",
};

describe("compileVesting — standard 4yr/1mo with 25% cliff", () => {
  const template: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  it("emits 37 events: 1 cliff + 36 post-cliff", () => {
    const events = compileVesting(template, schedule, 100_000);
    expect(events).toHaveLength(37);
  });

  it("first event is the cliff at month 12 vesting 25000", () => {
    const events = compileVesting(template, schedule, 100_000);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "25000" });
  });

  it("last event lands at start + 48 months", () => {
    const events = compileVesting(template, schedule, 100_000);
    expect(events[events.length - 1].date).toBe("2029-01-01");
  });

  it("sum equals totalShares exactly", () => {
    const events = compileVesting(template, schedule, 100_000);
    expect(sumAmounts(events)).toBe(100_000);
  });

  it("absorbs rounding drift with an awkward share count", () => {
    const events = compileVesting(template, schedule, 100);
    expect(sumAmounts(events)).toBe(100);
  });

  it("emits exactly one share at the final event when totalShares = 1", () => {
    const events = compileVesting(template, schedule, 1);
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
    const events = compileVesting(template, schedule, 100_000);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "30000" });
  });

  it("emits 37 events with sum equal to totalShares", () => {
    const events = compileVesting(template, schedule, 100_000);
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
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 1, denominator: 20 },
      },
      {
        order: 2,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 3, denominator: 20 },
      },
      {
        order: 3,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 2, denominator: 5 },
      },
      {
        order: 4,
        occurrences: 1,
        period: 12,
        period_type: "MONTHS",
        percentage: { numerator: 2, denominator: 5 },
      },
    ],
  };

  it("emits 4 yearly events with chained dates and 5/15/40/40 split", () => {
    const events = compileVesting(template, schedule, 100_000);
    expect(events).toEqual([
      { date: "2026-01-01", amount: "5000" },
      { date: "2027-01-01", amount: "15000" },
      { date: "2028-01-01", amount: "40000" },
      { date: "2029-01-01", amount: "40000" },
    ]);
  });
});

describe("compileVesting — additional cases", () => {
  it("plain 4-year monthly with no cliff emits 48 events summing to totalShares", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          occurrences: 48,
          period: 1,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, schedule, 100_000);
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
    const events = compileVesting(template, schedule, 100_000);
    expect(events).toEqual([{ date: "2026-01-01", amount: "100000" }]);
  });

  it("DAYS schedule produces correct ISO dates", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          occurrences: 4,
          period: 7,
          period_type: "DAYS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, schedule, 400);
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
          occurrences: 6,
          period: 1,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(
      template,
      { template_id: "t1", start_date: "2025-01-31" },
      600,
    );
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
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 2 },
        },
        {
          order: 2,
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
    expect(compileVesting(ordered, schedule, 100)).toEqual(
      compileVesting(reversed, schedule, 100),
    );
  });

  it("zero-percent statement emits no events but advances the cursor", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 0, denominator: 1 },
        },
        {
          order: 2,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    const events = compileVesting(template, schedule, 100);
    expect(events).toEqual([{ date: "2027-01-01", amount: "100" }]);
  });

  it("throws when totalShares is not a non-negative integer", () => {
    const template: VestingScheduleTemplate = {
      id: "t1",
      statements: [
        {
          order: 1,
          occurrences: 1,
          period: 12,
          period_type: "MONTHS",
          percentage: { numerator: 1, denominator: 1 },
        },
      ],
    };
    expect(() => compileVesting(template, schedule, -1)).toThrow();
    expect(() => compileVesting(template, schedule, 1.5)).toThrow();
  });
});

describe("compileVesting — grant_date handling", () => {
  const monthlyNoCliff: VestingScheduleTemplate = {
    id: "t1",
    statements: [
      {
        order: 1,
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
        occurrences: 48,
        period: 1,
        period_type: "MONTHS",
        cliff: { occurrence: 12, percentage: { numerator: 1, denominator: 4 } },
        percentage: { numerator: 1, denominator: 1 },
      },
    ],
  };

  it("grant_date before vesting_start has no effect", () => {
    const events = compileVesting(monthlyNoCliff, schedule, 4800, "2023-06-01");
    expect(events).toHaveLength(48);
    expect(events[0].date).toBe("2025-02-01");
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date equal to a scheduled event date merges held amount into that event", () => {
    // schedule.start_date = 2025-01-01 monthly; grant_date = 2025-04-01 (= event #3)
    const events = compileVesting(monthlyNoCliff, schedule, 4800, "2025-04-01");
    // events #1 (Feb) and #2 (Mar) held; event #3 emits own 100 + held 200 = 300
    expect(events).toHaveLength(46);
    expect(events[0]).toEqual({ date: "2025-04-01", amount: "300" });
    expect(events[1]).toEqual({ date: "2025-05-01", amount: "100" });
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date between scheduled events emits an off-rhythm event on grant_date", () => {
    // grant_date = 2025-03-15 falls between events #2 (Mar 1) and #3 (Apr 1)
    const events = compileVesting(monthlyNoCliff, schedule, 4800, "2025-03-15");
    // events #1 (Feb) and #2 (Mar) held = 200; emit on grant_date itself
    // then event #3 (Apr) emits normally
    expect(events).toHaveLength(47);
    expect(events[0]).toEqual({ date: "2025-03-15", amount: "200" });
    expect(events[1]).toEqual({ date: "2025-04-01", amount: "100" });
    expect(events[events.length - 1].date).toBe("2029-01-01");
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date after explicit cliff absorbs cliff + intervening months", () => {
    // vesting_start = 2023-01-01; cliff at month 12 = 2024-01-01 vesting 25%
    // grant_date = 2024-06-01 — after the cliff
    const earlierStart = { template_id: "t1", start_date: "2023-01-01" };
    const events = compileVesting(
      monthlyWithCliff,
      earlierStart,
      4800,
      "2024-06-01",
    );
    // cliff at 2024-01-01 vests 1200 — held
    // months 13-16 (2024-02..05) each vest 100 — held, total 400
    // month 17 (2024-06-01) == grant_date: emit own 100 + held 1600 = 1700
    expect(events[0]).toEqual({ date: "2024-06-01", amount: "1700" });
    expect(events[1]).toEqual({ date: "2024-07-01", amount: "100" });
    expect(sumAmounts(events)).toBe(4800);
  });

  it("grant_date after the entire schedule emits the full grant on grant_date", () => {
    const earlyStart = { template_id: "t1", start_date: "2020-01-01" };
    const events = compileVesting(
      monthlyNoCliff,
      earlyStart,
      4800,
      "2030-01-01",
    );
    expect(events).toEqual([{ date: "2030-01-01", amount: "4800" }]);
  });

  it("grant_date on the rhythm with a cliff exactly at grant_date", () => {
    // vesting_start = 2025-01-01; cliff at month 12 = 2026-01-01 vesting 25%
    // grant_date = 2026-01-01 — exactly on the cliff date
    const events = compileVesting(
      monthlyWithCliff,
      schedule,
      100_000,
      "2026-01-01",
    );
    // cliff date == grant_date — pending stays 0, cliff event emits normally
    expect(events).toHaveLength(37);
    expect(events[0]).toEqual({ date: "2026-01-01", amount: "25000" });
    expect(sumAmounts(events)).toBe(100_000);
  });

  it("preserves the held-back-pre-cliff filter under grant_date", () => {
    // Pre-cliff months have share=0/1; they should still be skipped at amount===0,
    // never entering the pre-grant accumulator.
    const events = compileVesting(
      monthlyWithCliff,
      schedule,
      100_000,
      "2026-06-01",
    );
    // Pre-cliff months 1..11 contribute nothing.
    // Cliff month 12 (2026-01-01) vests 25000, held by grant_date.
    // Months 13..17 each vest ~1/48 * 100000 floor-rounded.
    // Month 18 (2026-06-01) == grant_date — merges held into this event.
    const sum = sumAmounts(events);
    expect(sum).toBe(100_000);
    // No event should land before 2026-06-01
    for (const e of events) {
      expect(e.date >= "2026-06-01").toBe(true);
    }
  });
});
