import type { Vesting } from "../types";
import type {
  Fraction,
  OCFDate,
  VestingSchedule,
  VestingScheduleTemplate,
  VestingStatement,
} from "../types/canonical/vesting";
import { allocate } from "./allocate";
import { addPeriod } from "./dates";
import { fracAdd, fracMul, fracSub, ONE, ZERO } from "./fractions";
import {
  assertValidVestingSchedule,
  assertValidVestingScheduleTemplate,
} from "./validate";

/**
 * Computes the per-event fraction of the total grant for each event in a
 * VestingStatement. Returns an array of length statement.occurrences where
 * fractions[i-1] is the share of grant that event i contributes — already
 * multiplied through by statement.percentage, so the values are fraction of
 * grant, not fraction of statement.
 *
 * Cliffless statements: every event vests statement.percentage / occurrenceCount.
 *
 * With a cliff at occurrence K: events 1..K-1 are ZERO (held back), event K
 * vests cliff.percentage × statement.percentage, and events K+1..N vest the
 * remaining (1 - cliff.percentage) × statement.percentage spread evenly.
 */
const perEventGrantFractions = (statement: VestingStatement): Fraction[] => {
  const occurrenceCount = statement.occurrences;
  const stmtFraction = statement.percentage;

  if (!statement.cliff) {
    const eventFraction = fracMul(stmtFraction, {
      numerator: 1,
      denominator: occurrenceCount,
    });
    return Array.from({ length: occurrenceCount }, () => eventFraction);
  }

  // cliff.percentage is the fraction OF THE STATEMENT, not of the grant — so
  // multiplying by stmtFraction gives the fraction of grant. This lets a cliff
  // compose cleanly regardless of how much of the grant the containing
  // statement covers.
  const cliffEvent = statement.cliff.occurrence;
  const cliffFractionOfStmt = statement.cliff.percentage;
  const cliffFractionOfGrant = fracMul(cliffFractionOfStmt, stmtFraction);
  const postCliffCount = occurrenceCount - cliffEvent;
  const remainingStmtFraction = fracMul(
    fracSub(ONE, cliffFractionOfStmt),
    stmtFraction,
  );
  const postCliffEventFraction =
    postCliffCount === 0
      ? ZERO
      : fracMul(remainingStmtFraction, {
          numerator: 1,
          denominator: postCliffCount,
        });

  return Array.from({ length: occurrenceCount }, (_, idx) => {
    const occurrence = idx + 1;
    // Pre-cliff installments emit ZERO, which the main loop's amount===0
    // filter skips so no event is produced for them.
    if (occurrence < cliffEvent) return ZERO;
    if (occurrence === cliffEvent) return cliffFractionOfGrant;
    return postCliffEventFraction;
  });
};

/**
 * Compiles a canonical VestingScheduleTemplate + VestingSchedule into an array
 * of OCF Vesting events ({ date, amount }) under CUMULATIVE_ROUND_DOWN allocation.
 *
 * Optional grantDate: when provided, events whose computed date falls before
 * grantDate are held back and emitted as a single aggregated event on grantDate
 * itself — an implicit cliff at the grant date. This models the common case of
 * vesting backdated to a hire date earlier than the grant approval. When
 * omitted, the schedule runs unconstrained from start_date.
 *
 * Day-of-month policy: assumes OCF's VESTING_START_DAY_OR_LAST_DAY_OF_MONTH —
 * each event preserves the start_date's day-of-month, clamping to the last day
 * in shorter months. The canonical spec does not currently carry a day_of_month
 * field, so other OCF VestingDayOfMonth values (fixed numeric days, *_OR_LAST_DAY
 * variants) are not supported.
 */
export const compileVesting = (
  template: VestingScheduleTemplate,
  schedule: VestingSchedule,
  totalShares: number,
  grantDate?: OCFDate,
): Vesting[] => {
  if (!Number.isInteger(totalShares) || totalShares < 0) {
    throw new Error(
      `totalShares must be a non-negative integer (got ${totalShares})`,
    );
  }
  assertValidVestingScheduleTemplate(template);
  assertValidVestingSchedule(schedule);

  const statements = [...template.statements].sort((a, b) => a.order - b.order);

  let cumulative: Fraction = ZERO;
  let vestedSoFar = 0;
  const events: Vesting[] = [];
  let cursor = schedule.start_date;
  // Pre-grant aggregator: amounts whose computed date is before grantDate are
  // held back and emitted on grantDate itself (implicit cliff at grant_date).
  let pendingPreGrant = 0;

  for (const statement of statements) {
    const fractions = perEventGrantFractions(statement);
    const occurrenceCount = statement.occurrences;

    for (let i = 1; i <= occurrenceCount; i++) {
      const fraction = fractions[i - 1];
      // Cumulative-round-down emission via the allocate module. Compute the
      // event's amount as a delta from what's been emitted before; per-event
      // amounts telescope to exactly totalShares because cumulative ends at
      // 1/1. Allocation mode is hardcoded — the canonical spec restricts
      // itself to CUMULATIVE_ROUND_DOWN. Plumb through from the template once
      // the spec carries allocation_type.
      cumulative = fracAdd(cumulative, fraction);
      const amount = allocate(
        "CUMULATIVE_ROUND_DOWN",
        totalShares,
        cumulative,
        vestedSoFar,
      );
      if (amount === 0) continue;
      vestedSoFar += amount;
      const date = addPeriod(
        cursor,
        i * statement.period,
        statement.period_type,
      );

      // Grant-date handling has three cases:
      //   (a) date <  grantDate — hold in pendingPreGrant, no event yet.
      //   (b) date == grantDate — merge held into this event; emit once.
      //   (c) date >  grantDate — flush held as a standalone event on
      //       grantDate (implicit cliff), then emit the current event.
      if (grantDate && date < grantDate) {
        pendingPreGrant += amount;
        continue;
      }
      if (pendingPreGrant > 0 && grantDate) {
        if (date === grantDate) {
          events.push({ date, amount: String(amount + pendingPreGrant) });
          pendingPreGrant = 0;
          continue;
        }
        events.push({ date: grantDate, amount: String(pendingPreGrant) });
        pendingPreGrant = 0;
      }
      events.push({ date, amount: String(amount) });
    }

    // Advance by the full statement duration regardless of how many events
    // emitted, so zero-percent and held-back statements still occupy time
    // on the schedule (required for chained-statement date arithmetic).
    cursor = addPeriod(
      cursor,
      occurrenceCount * statement.period,
      statement.period_type,
    );
  }

  // All scheduled events fell before grantDate; emit the aggregate on grantDate.
  if (pendingPreGrant > 0 && grantDate) {
    events.push({ date: grantDate, amount: String(pendingPreGrant) });
  }

  return events;
};
