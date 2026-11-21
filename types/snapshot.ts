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
 * A snapshot lists the failed transactions that make a field unreliable. A failed issuance can leave
 * both the issuance and lifecycle unknown. A later failed transaction may affect only the lifecycle.
 */
export interface DefectMark {
  defects: { lifecycle?: Subject[]; issuance?: Subject[] };
}

/** A marked snapshot row may have missing values. */
export type SnapshotEntry<Row> = Row | (Partial<Row> & DefectMark);

export interface Snapshot {
  date: string;
  stockIssuances: SnapshotEntry<SnapshotStockIssuance>[];
  convertibles: SnapshotEntry<SnapshotConvertibleIssuance>[];
  warrants: SnapshotEntry<SnapshotWarrantIssuance>[];
  equityCompensation: SnapshotEntry<SnapshotEquityCompensation>[];
}
