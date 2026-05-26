import type { Vesting } from "../types";
import type {
  Fraction,
  OCFDate,
  VestingScheduleTemplate,
  VestingStatement,
} from "../types/canonical/vesting";
import { allocate } from "./allocate";
import { addPeriod } from "./dates";
import { fracAdd, fracMul, fracSub, ONE, ZERO } from "./fractions";
import {
  assertValidVestingRuntime,
  assertValidVestingScheduleTemplate,
} from "./validate";

/**
 * Per-grant runtime data supplied to the compiler alongside the static
 * VestingScheduleTemplate. Sources map to canonical transactions:
 *   - startDate   — from TX_CANONICAL_VESTING_START (one per security, optional
 *     if the template contains no DATE-anchored statements)
 *   - eventFirings — from TX_CANONICAL_VESTING_EVENT (zero or more per
 *     security). Each firing's event_id resolves the matching EVENT-anchored
 *     statement(s) on the template; multiple statements may match a single
 *     firing (one firing fans out). Optional realized_fraction scales the
 *     statement's contribution for partial payouts.
 *   - grantDate    — from TX_CANONICAL_EQUITY_COMPENSATION_ISSUANCE.date.
 *     When provided, events whose computed date falls before grantDate are
 *     held back and emitted as a single aggregated event on grantDate itself
 *     (implicit cliff at the grant date), modelling that vesting cannot
 *     legally occur before the grant existed.
 */
export interface VestingRuntime {
  startDate?: OCFDate;
  eventFirings?: Array<{
    event_id: string;
    date: OCFDate;
    realized_fraction?: Fraction;
  }>;
  grantDate?: OCFDate;
}

/**
 * Computes the per-event fraction of the total grant for each event in a
 * VestingStatement. Returns an array of length statement.occurrences where
 * fractions[i-1] is the share of grant that event i contributes — already
 * multiplied through by statement.percentage, so the values are fraction of
 * grant, not fraction of statement.
 *
 * Anchor-agnostic: the same fractional shape applies whether the statement
 * is DATE- or EVENT-anchored. For EVENT-anchored statements with a partial
 * realized_fraction, the caller multiplies each entry by that fraction at
 * the call site.
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
 * Raw event before integer-share materialization. Carries the per-event
 * fraction-of-grant plus enough metadata to sort the projection
 * chronologically with a deterministic tie-break.
 */
interface RawEvent {
  date: OCFDate;
  fractionOfGrant: Fraction;
  statementOrder: number;
  occurrence: number;
}

/**
 * Expands a single VestingStatement into raw events anchored at the runtime
 * data appropriate for its vesting_base.
 *
 * DATE-anchored: events are anchored at dateCursor; the cursor advances by
 * the full statement duration (occurrences × period). Statement N+1 then
 * starts where statement N ended, preserving the bespoke 5/15/40/40-style
 * chaining semantic ("statements chain implicitly by order").
 *
 * EVENT-anchored: events are anchored at the matching firing's date. If no
 * matching firing exists, the statement is skipped (returns null) — the
 * grant ends with that portion unvested, which is the correct canonical
 * semantic. If realized_fraction is present, each per-event fraction is
 * scaled by it (partial payout). The cursor is not advanced — EVENT
 * statements break free of the DATE cursor chain.
 */
const expandStatement = (
  statement: VestingStatement,
  runtime: VestingRuntime,
  dateCursor: OCFDate | undefined,
): { events: RawEvent[]; nextCursor: OCFDate | undefined } | null => {
  const fractions = perEventGrantFractions(statement);
  const events: RawEvent[] = [];

  if (statement.vesting_base.type === "DATE") {
    // Validator guarantees dateCursor is defined when any DATE statement exists.
    const anchor = dateCursor as OCFDate;
    for (let i = 1; i <= statement.occurrences; i++) {
      events.push({
        date: addPeriod(anchor, i * statement.period, statement.period_type),
        fractionOfGrant: fractions[i - 1],
        statementOrder: statement.order,
        occurrence: i,
      });
    }
    const nextCursor = addPeriod(
      anchor,
      statement.occurrences * statement.period,
      statement.period_type,
    );
    return { events, nextCursor };
  }

  // EVENT-anchored
  const eventId = statement.vesting_base.event_id;
  const firing = runtime.eventFirings?.find((f) => f.event_id === eventId);
  if (!firing) return null; // statement doesn't fire; events never produced

  const multiplier = firing.realized_fraction ?? ONE;
  for (let i = 1; i <= statement.occurrences; i++) {
    events.push({
      date: addPeriod(firing.date, i * statement.period, statement.period_type),
      fractionOfGrant: fracMul(fractions[i - 1], multiplier),
      statementOrder: statement.order,
      occurrence: i,
    });
  }
  return { events, nextCursor: dateCursor };
};

/**
 * Compiles a canonical VestingScheduleTemplate plus per-grant runtime data
 * into an array of OCF Vesting events ({ date, amount }) under
 * CUMULATIVE_ROUND_DOWN allocation.
 *
 * The template is the static spec (statements with vesting_base anchors and
 * fractional structure). The runtime carries per-grant resolution: the start
 * date for DATE-anchored statements, firings for EVENT-anchored statements,
 * and an optional grant date that acts as an implicit cliff for any event
 * computed to land before it.
 *
 * Output events are sorted chronologically (tie-break: statement.order, then
 * occurrence). For pure-DATE templates with statements chaining by order,
 * the chronological order matches statement order naturally. For hybrid
 * templates (DATE + EVENT statements), the output reflects a real timeline
 * with statements interleaved by their actual event dates.
 *
 * EVENT statements with no matching firing in runtime are silently skipped:
 * the corresponding portion of the grant never vests. The validator ensures
 * runtime.eventFirings only references event_ids that exist in the template,
 * so a "missing firing" reflects a real "event hasn't fired yet" state, not
 * a data error.
 *
 * Day-of-month policy: assumes OCF's VESTING_START_DAY_OR_LAST_DAY_OF_MONTH —
 * each event preserves the anchor date's day-of-month, clamping to the last
 * day in shorter months. The canonical spec does not currently carry a
 * day_of_month field, so other OCF VestingDayOfMonth values (fixed numeric
 * days, *_OR_LAST_DAY variants) are not supported.
 */
export const compileVesting = (
  template: VestingScheduleTemplate,
  totalShares: number,
  runtime: VestingRuntime,
): Vesting[] => {
  if (!Number.isInteger(totalShares) || totalShares < 0) {
    throw new Error(
      `totalShares must be a non-negative integer (got ${totalShares})`,
    );
  }
  assertValidVestingScheduleTemplate(template);
  assertValidVestingRuntime(runtime, template);

  // Step 1: expand each statement into raw events. DATE statements chain
  // through dateCursor; EVENT statements anchor absolutely at their firing.
  const statements = [...template.statements].sort((a, b) => a.order - b.order);
  let dateCursor: OCFDate | undefined = runtime.startDate;
  const rawEvents: RawEvent[] = [];
  for (const statement of statements) {
    const result = expandStatement(statement, runtime, dateCursor);
    if (!result) continue; // EVENT statement with no matching firing
    rawEvents.push(...result.events);
    dateCursor = result.nextCursor;
  }

  // Step 2: sort chronologically. Tie-break on (statementOrder, occurrence)
  // so two events on the same date have deterministic, spec-traceable order.
  rawEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.statementOrder !== b.statementOrder)
      return a.statementOrder - b.statementOrder;
    return a.occurrence - b.occurrence;
  });

  // Step 3: cumulative-round-down emission with grant-date implicit cliff.
  // The cumulative fraction accumulates across all events (single running
  // total). amount = floor(totalShares × cumulative) − vestedSoFar, which
  // telescopes to sum exactly to totalShares when all EVENT statements fire
  // (or less if some never fire, as intended).
  let cumulative: Fraction = ZERO;
  let vestedSoFar = 0;
  const events: Vesting[] = [];
  // Pre-grant aggregator: amounts whose computed date is before grantDate are
  // held back and emitted on grantDate itself (implicit cliff at grant_date).
  let pendingPreGrant = 0;

  for (const raw of rawEvents) {
    cumulative = fracAdd(cumulative, raw.fractionOfGrant);
    const amount = allocate(
      "CUMULATIVE_ROUND_DOWN",
      totalShares,
      cumulative,
      vestedSoFar,
    );
    if (amount === 0) continue;
    vestedSoFar += amount;

    // Grant-date handling has three cases:
    //   (a) date <  grantDate — hold in pendingPreGrant, no event yet.
    //   (b) date == grantDate — merge held into this event; emit once.
    //   (c) date >  grantDate — flush held as a standalone event on
    //       grantDate (implicit cliff), then emit the current event.
    if (runtime.grantDate && raw.date < runtime.grantDate) {
      pendingPreGrant += amount;
      continue;
    }
    if (pendingPreGrant > 0 && runtime.grantDate) {
      if (raw.date === runtime.grantDate) {
        events.push({ date: raw.date, amount: String(amount + pendingPreGrant) });
        pendingPreGrant = 0;
        continue;
      }
      events.push({ date: runtime.grantDate, amount: String(pendingPreGrant) });
      pendingPreGrant = 0;
    }
    events.push({ date: raw.date, amount: String(amount) });
  }

  // All scheduled events fell before grantDate; emit the aggregate on grantDate.
  if (pendingPreGrant > 0 && runtime.grantDate) {
    events.push({ date: runtime.grantDate, amount: String(pendingPreGrant) });
  }

  return events;
};
