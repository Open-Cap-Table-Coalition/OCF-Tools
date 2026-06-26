/**
 * IO-boundary types for reading an arbitrary OCF package.
 *
 * The generated OCF types (`@opencaptablecoalition/ocf-types`) are a faithful
 * reflection of the JSON Schemas — which means `OCFManifestFile.ocf_version` is
 * pinned to a single literal (the schema's own version). A *validator* ingests
 * packages of any version, so we widen that one field here, at the read
 * boundary, rather than weakening the generated types for every consumer.
 *
 * Everything downstream keeps using the precise generated types; only the
 * parsed-from-disk input is typed through here.
 */
import type {
  OCFManifestFile,
  ObjectTypeMap,
} from "@opencaptablecoalition/ocf-types";

/** A manifest as it appears in an inbound package: any `ocf_version` string. */
export type InputManifest = Omit<OCFManifestFile, "ocf_version"> & {
  ocf_version: string;
};

/**
 * The concrete transaction type for a given `object_type` value — including the
 * legacy back-compat values, which resolve to their narrowed wrapper. Lets a
 * handler table key on `object_type` and receive the correctly-typed payload.
 */
export type TransactionFor<K extends keyof ObjectTypeMap> = ObjectTypeMap[K];

/**
 * Any transaction as it appears in an inbound package — the union of every
 * `TX_*` payload in `ObjectTypeMap`. Used at the read boundary where the parser
 * does not yet know which transaction kind each record is.
 */
export type OcfTransaction =
  ObjectTypeMap[Extract<keyof ObjectTypeMap, `TX_${string}`>];
