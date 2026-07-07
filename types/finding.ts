import type { ObjectTypeMap } from "@opencaptablecoalition/ocf-types";

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  check: string;
  message: string;
  /**
   * The OCF object this finding is about — any object, not only a transaction.
   * `object_type` is keyed to the generated schema map, so an unknown type is a
   * compile error; `id` is that object's OCF id. A non-object-scoped check (e.g.
   * package/file-level) would widen `object_type` here — deliberately a conscious
   * change rather than a silently-bogus value.
   */
  subject: { object_type: keyof ObjectTypeMap; id: string };
}
