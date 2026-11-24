import type { OcfTransaction } from "../types/ocf-input";
import type { LifecycleWord } from "../types/validator";
import { isTxKey, TX_DESCRIPTORS } from "./validators";
import { text } from "./validators/checkKit";

// OCF dates a transaction to the day, so a package does not say which of two same-day transactions
// came first. The validator works the order out from the securities each transaction names. For
// example, a transfer names the stock it removes in security_id and the stock it creates in
// resulting_security_ids, so it runs after the new stock's issuance and before anything that removes
// that stock. Transactions that share no security run in order of their IDs, so the result does not
// depend on how the file is arranged.

/**
 * The stages a security can pass through in one day, in the order they have to happen. A transaction
 * holds one stage on each security it names.
 */
export const STAGES = ["issues", "unrecognized", "retracts", "names", "stays", "removes", "after removal"] as const;
export type Stage = (typeof STAGES)[number];

/** The stage a transaction holds on the security in its own security_id or security_ids. */
const OWN_STAGE = {
  issue: "issues",
  stays: "stays",
  removes: "removes",
  "after removal": "after removal",
} as const satisfies Record<LifecycleWord, Stage>;

/**
 * Nothing says what a transaction of an unrecognized type did to the security it names. It runs
 * straight after the security's issuance, so that a record exists to mark, and before every other
 * transaction on the security that day, so that a check that reads the security is blocked.
 */
const UNRECOGNIZED = STAGES.indexOf("unrecognized");

/**
 * A retraction says its security was issued in error, so it runs before anything that relies on the
 * security. A transaction that names the security the same day runs after the retraction, and a
 * check that reads the security sees it retracted. OCF ends the name of every retraction type with
 * _RETRACTION.
 */
const RETRACTS = STAGES.indexOf("retracts");
const isRetraction = (type: string): boolean => type.endsWith("_RETRACTION");

/**
 * The "names" stage holds a transaction that names the security as its balance or result, because
 * the security exists only as an outcome of that transaction.
 */
const NAMES = STAGES.indexOf("names");

/** A transaction's ID as the package wrote it, or a readable form of a malformed one. */
const idOf = (transaction: OcfTransaction): string =>
  typeof transaction.id === "string" ? transaction.id : text`${transaction.id}`;

const present = (id: unknown): boolean => id !== undefined && id !== null;
const listOf = (ids: unknown): readonly unknown[] => (Array.isArray(ids) ? ids : []);

/**
 * List each security the transaction names with the stage it holds there. A transaction that names
 * one security twice, such as a cancellation whose balance is the security it cancels, keeps only
 * the stage of its own security.
 */
function stagesOf(transaction: OcfTransaction): Map<unknown, number> {
  const fields = transaction as unknown as Record<string, unknown>;
  const stages = new Map<unknown, number>();
  const hold = (security: unknown, stage: number) => {
    if (present(security) && !stages.has(security)) stages.set(security, stage);
  };

  const type: string = transaction.object_type;
  if (!isTxKey(type)) {
    hold(fields.security_id, UNRECOGNIZED);
    return stages;
  }
  const own = isRetraction(type) ? RETRACTS : STAGES.indexOf(OWN_STAGE[TX_DESCRIPTORS[type].lifecycle]);
  hold(fields.security_id, own);
  // A consolidation names the stock it replaces in security_ids.
  for (const security of listOf(fields.security_ids)) hold(security, own);
  hold(fields.balance_security_id, NAMES);
  hold(fields.resulting_security_id, NAMES);
  for (const security of listOf(fields.resulting_security_ids)) hold(security, NAMES);
  return stages;
}

/** One reason a transaction has to run before another: the stages they hold on a shared security. */
export type OrderLink = {
  readonly before: { readonly id: string; readonly stage: Stage };
  readonly after: { readonly id: string; readonly stage: Stage };
  readonly security: unknown;
};

/**
 * A transaction in its place in the run. `loop` is set when the transaction is one of several that
 * each have to run before the next, so that no order satisfies them all.
 */
export type Placed = { readonly transaction: OcfTransaction; readonly loop?: readonly OrderLink[] };

/** The day's transactions on one security, by stage, and the earliest stage not yet finished. */
type SecurityDay = { readonly ranks: number[][]; readonly left: number[]; current: number };

/**
 * Order one day's transactions. On each security, every transaction at an earlier stage runs before
 * any transaction at a later one. Among the transactions free to run, the lowest ID goes first, then
 * the lowest object_type. Two transactions with the same ID and type keep their input order.
 */
export function orderDay(day: readonly OcfTransaction[]): Placed[] {
  if (day.length < 2) return day.map((transaction) => ({ transaction }));

  // A transaction's rank is its position by ID. Lower ranks run first when nothing else decides.
  const byId = day
    .map((transaction) => ({ transaction, id: idOf(transaction) }))
    .sort((a, b) => {
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      if (a.transaction.object_type === b.transaction.object_type) return 0;
      return a.transaction.object_type < b.transaction.object_type ? -1 : 1;
    });
  const stages = byId.map(({ transaction }) => [...stagesOf(transaction)]);

  const securities = new Map<unknown, SecurityDay>();
  stages.forEach((held, rank) => {
    for (const [security, stage] of held) {
      let entry = securities.get(security);
      if (!entry) securities.set(security, (entry = { ranks: STAGES.map(() => []), left: STAGES.map(() => 0), current: STAGES.length }));
      entry.ranks[stage].push(rank);
      entry.left[stage]++;
      entry.current = Math.min(entry.current, stage);
    }
  });

  // A transaction waits on each security where an earlier stage is unfinished.
  const waiting = stages.map((held) => held.filter(([security, stage]) => stage > securities.get(security)!.current).length);
  const done = byId.map(() => false);

  // Keep the ranks that are free to run in descending order, so the lowest is removed from the end.
  const free: number[] = [];
  const release = (rank: number) => {
    let low = 0;
    let high = free.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (free[middle] > rank) low = middle + 1;
      else high = middle;
    }
    free.splice(low, 0, rank);
  };
  for (let rank = byId.length - 1; rank >= 0; rank--) if (waiting[rank] === 0) free.push(rank);

  /** Finishing the last transaction at a security's current stage releases its next stage. */
  const finish = (rank: number) => {
    done[rank] = true;
    for (const [security, stage] of stages[rank]) {
      const entry = securities.get(security)!;
      entry.left[stage]--;
      if (stage !== entry.current || entry.left[stage] > 0) continue;
      do entry.current++;
      while (entry.current < STAGES.length && entry.left[entry.current] === 0);
      for (const next of entry.ranks[entry.current] ?? []) {
        if (!done[next] && --waiting[next] === 0) release(next);
      }
    }
  };

  /**
   * With nothing free to run, every remaining transaction waits on another. Follow one such chain
   * from the lowest remaining ID until it returns to a transaction already on it. That closed part
   * of the chain is a loop.
   */
  const findLoop = (): { ranks: number[]; links: OrderLink[] } => {
    const chain: { rank: number; blocker: number; link: OrderLink }[] = [];
    const position = new Map<number, number>();
    let rank = done.indexOf(false);
    while (!position.has(rank)) {
      position.set(rank, chain.length);
      const [security, stage] = stages[rank].find(([named, held]) => held > securities.get(named)!.current)!;
      const entry = securities.get(security)!;
      const blocker = entry.ranks[entry.current].find((earlier) => !done[earlier])!;
      const link: OrderLink = {
        before: { id: byId[blocker].id, stage: STAGES[entry.current] },
        after: { id: byId[rank].id, stage: STAGES[stage] },
        security,
      };
      chain.push({ rank, blocker, link });
      rank = blocker;
    }
    // List the links in the order the transactions would have to run, starting from the lowest ID.
    // The chain may have started outside the loop, so its first link does not decide the wording.
    const loop = chain.slice(position.get(rank)).reverse();
    const first = loop.reduce((lowest, step, index) => (step.blocker < loop[lowest].blocker ? index : lowest), 0);
    const inOrder = [...loop.slice(first), ...loop.slice(0, first)];
    return { ranks: loop.map((step) => step.rank).sort((a, b) => a - b), links: inOrder.map((step) => step.link) };
  };

  const placed: Placed[] = [];
  while (placed.length < byId.length) {
    if (free.length > 0) {
      const rank = free.pop()!;
      placed.push({ transaction: byId[rank].transaction });
      finish(rank);
      continue;
    }
    // Place the loop's transactions together, marked, and carry on with what waited on them. Mark
    // them all finished first, so that finishing one does not free another to run a second time.
    const { ranks, links } = findLoop();
    for (const rank of ranks) {
      placed.push({ transaction: byId[rank].transaction, loop: links });
      done[rank] = true;
    }
    for (const rank of ranks) finish(rank);
  }
  return placed;
}

/**
 * Order the whole run: days by date, and each day by orderDay. Dates compare as the strings they
 * are, the same way the history checks compare them.
 */
export function runOrder(transactions: readonly OcfTransaction[]): Placed[] {
  const days = new Map<string, OcfTransaction[]>();
  for (const transaction of transactions) {
    const day = days.get(transaction.date);
    if (day) day.push(transaction);
    else days.set(transaction.date, [transaction]);
  }
  return [...days.keys()].sort().flatMap((date) => orderDay(days.get(date)!));
}
