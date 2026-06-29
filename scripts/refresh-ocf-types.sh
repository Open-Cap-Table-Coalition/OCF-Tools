#!/usr/bin/env bash
#
# Refresh the vendored OCF types from Open-Cap-Format-OCF.
#
# TEMPORARY tooling: the whole vendored-types transport (this script + the
# tsconfig `paths` alias + types/vendor/ocf-types.d.ts) goes away once
# @opencaptablecoalition/ocf-types is published to npm. Until then, regenerate
# with this after the schema repo's types change.
#
#   npm run ocf:refresh-types -- <path-to-Open-Cap-Format-OCF> [git-ref]
#   e.g. npm run ocf:refresh-types -- ~/code/Open-Cap-Format-OCF main
#
# It runs `npm install --ignore-scripts` and the type generator IN THE SCHEMA
# REPO, so only point it at a checkout you trust.
set -euo pipefail

FMT_DIR="${1:?usage: refresh-ocf-types.sh <Open-Cap-Format-OCF checkout> [ref]}"
REF="${2:-main}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/types/vendor/ocf-types.d.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

(
  cd "$FMT_DIR"
  git fetch --quiet --all
  git checkout --quiet "$REF"
  npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1
  # --experimental is a tri-state mode (none | compatibility | unstable); default is
  # 'compatibility'. Pin it explicitly so a future default change never silently swaps
  # the vendored shape. 'compatibility' keeps version dispatchers as union types (V1 | V2 | …)
  # — the back-compat behaviour. Never use 'unstable' here: it would collapse dispatchers
  # to a single pre-release shape, silently changing the public surface of this package.
  npm run --silent schema:gen-types -- --experimental compatibility --out "$TMP" >/dev/null
)
SHA="$(git -C "$FMT_DIR" rev-parse --short HEAD)"

{
  cat <<EOF
// ============================================================================
// VENDORED — temporary transport for OCF types (#153; roadmap #145, Phase 2).
//
// Source  : Open-Cap-Table-Coalition/Open-Cap-Format-OCF
// Ref     : ${REF} (${SHA})
// Built by: npm run schema:gen-types -- --experimental compatibility
//           (regenerate: npm run ocf:refresh-types)
//
// --experimental compatibility: keeps version dispatchers as V1 | V2 | … unions
// (back-compat behaviour). Pinned explicitly so a future default change never
// silently alters the vendored shape. See scripts/refresh-ocf-types.sh for detail.
//
// DO NOT EDIT BY HAND. Stop-gap until these types ship as the
// \`@opencaptablecoalition/ocf-types\` package. Consumers already import the
// FINAL specifier via the tsconfig "paths" alias:
//   import type { AnyTransaction, ObjectTypeMap } from "@opencaptablecoalition/ocf-types";
//
// Replacement path (local to this file + the tsconfig alias):
//   1. Snapshot tracks main    -> npm run ocf:refresh-types   (restamps the SHA)
//   2. Release tarball exists   -> npm i -D <tarball-url>; delete this file + alias
//   3. npm publish              -> npm i -D @opencaptablecoalition/ocf-types
// ============================================================================

EOF
  cat "$TMP"
} >"$DEST"

echo "Vendored types/vendor/ocf-types.d.ts from ${REF} (${SHA})"
