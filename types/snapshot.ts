/**
 * The end-of-day snapshot element produced by `run_EOD` (ocf_validator/eod.ts)
 * and accumulated in `OcfMachineContext.snapshots`. This is a hand-written,
 * lossy projection of the cap-table state — there is no generated OCF type for
 * it. Field values are projected from the (currently untyped) issuance records.
 */

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
  availableToExercise: unknown;
}

export interface Snapshot {
  date: string;
  stockIssuances: SnapshotStockIssuance[];
  convertibles: SnapshotConvertibleIssuance[];
  warrants: SnapshotWarrantIssuance[];
  equityCompensation: SnapshotEquityCompensation[];
}
