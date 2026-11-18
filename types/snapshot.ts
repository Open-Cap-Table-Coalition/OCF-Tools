/**
 * The end-of-day snapshot element produced by `run_EOD` (ocf_validator/eod.ts)
 * and accumulated in `OcfMachineContext.snapshots`. This is a hand-written,
 * lossy projection of the cap-table state — there is no generated OCF type for
 * it. Field values are projected from the (currently untyped) issuance records.
 */

import type { Subject } from "./finding";

export interface SnapshotStockIssuance {
  date: string;
  custom_id: string;
  stakeholder: string;
  stock_class: string;
  quantity: string;
}

export interface SnapshotConvertibleIssuance {
  date: string;
  custom_id: string;
  stakeholder: string;
  purchase_price: unknown;
}

export interface SnapshotWarrantIssuance {
  date: string;
  custom_id: string;
  stakeholder: string;
  purchase_price: unknown;
}

export interface SnapshotEquityCompensation {
  date: string;
  custom_id: string;
  stakeholder: string;
  quantity: string;
}

/**
 * The mark on a snapshot entry that can't be fully trusted (#231). The run no
 * longer stops at a failing transaction: it withholds what the transaction
 * would have written and marks it. `defects` says which of the security's
 * fields that happened to, and for each, the transactions whose failure is
 * behind it:
 *
 *  - `lifecycle`: whether the security is still outstanding is in doubt. A
 *    transaction that would have removed it, or otherwise acted on it,
 *    failed, so the entry shows the security as it stood before.
 *  - `issuance`:  the issuance itself failed, so nothing about the security
 *    is known. The entry has no other fields: it's there to say that
 *    something claims a place on the cap table that the validator can't
 *    vouch for.
 *
 * An entry without the mark is as trustworthy as it was when a failure
 * stopped the run.
 */
export interface DefectMark {
  defects: { lifecycle?: Subject[]; issuance?: Subject[] };
}

/**
 * A stock plan's pool at the end of a day: the shares it has `reserved` and
 * the shares its grants have `drawn`, as OCF Numerics. `reserved` is missing
 * for a plan the package's stock plan files don't have, until a pool
 * adjustment sets it.
 *
 * `defects` marks a number that can't be trusted, per field, with the
 * transactions whose failure is behind it. A marked number is the last one
 * that could be vouched for: what the failed transaction would have changed
 * it to was withheld.
 */
export interface SnapshotStockPlan {
  id: string;
  reserved?: string;
  drawn: string;
  defects?: { reserved?: Subject[]; drawn?: Subject[] };
}

/** A snapshot entry: a row as before, or a marked one, whose values may be missing. */
export type SnapshotEntry<Row> = Row | (Partial<Row> & DefectMark);

export interface Snapshot {
  date: string;
  stockIssuances: SnapshotEntry<SnapshotStockIssuance>[];
  convertibles: SnapshotEntry<SnapshotConvertibleIssuance>[];
  warrants: SnapshotEntry<SnapshotWarrantIssuance>[];
  equityCompensation: SnapshotEntry<SnapshotEquityCompensation>[];
  /** Every stock plan the package has or a transaction has named, in that order. */
  stockPlans: SnapshotStockPlan[];
}
