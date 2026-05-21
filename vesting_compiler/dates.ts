import type { OCFDate, PeriodType } from "../types/canonical/vesting";

// Day-of-month behavior: this module implements only OCF's
// VESTING_START_DAY_OR_LAST_DAY_OF_MONTH policy — the target day is always the
// start date's day-of-month, clamped down in months that are shorter (e.g.,
// Jan 31 + 1mo → Feb 28). The canonical spec does not carry a day_of_month
// field today; if it ever adds one, addPeriod will need a new parameter and
// branches for fixed numeric days ("01"–"28") and the *_OR_LAST_DAY_OF_MONTH
// variants.

const MS_PER_DAY = 86_400_000;

// Capture-group form so parseISO can extract year/month/day via .exec().
// Consumers that only need the format check (e.g. validate.ts) can use
// .test() on the same pattern — capture groups don't affect boolean tests.
export const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseISO = (
  iso: OCFDate,
): { year: number; month: number; day: number } => {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) {
    throw new Error(`Invalid OCF date: ${iso}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

export const formatISO = (d: Date): OCFDate => d.toISOString().slice(0, 10);

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const addMonths = (start: OCFDate, months: number): OCFDate => {
  const { year, month, day } = parseISO(start);
  const monthIndex0 = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex0 / 12);
  const targetMonth = (((monthIndex0 % 12) + 12) % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatISO(new Date(Date.UTC(targetYear, targetMonth - 1, targetDay)));
};

const addDays = (start: OCFDate, days: number): OCFDate => {
  const { year, month, day } = parseISO(start);
  const base = Date.UTC(year, month - 1, day);
  return formatISO(new Date(base + days * MS_PER_DAY));
};

export const addPeriod = (
  start: OCFDate,
  units: number,
  periodType: PeriodType,
): OCFDate => {
  switch (periodType) {
    case "DAYS":
      return addDays(start, units);
    case "MONTHS":
      return addMonths(start, units);
    case "YEARS":
      return addMonths(start, units * 12);
  }
};
