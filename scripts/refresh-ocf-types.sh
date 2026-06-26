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
#   e.g. npm run ocf:refresh-types -- ~/code/Open-Cap-Format-OCF schema-toolkit-aggregates
#   (after the aggregates land:   ... -- ~/code/Open-Cap-Format-OCF main)
#
# It runs `npm install --ignore-scripts` and the type generator IN THE SCHEMA
# REPO, so only point it at a checkout you trust.
set -euo pipefail

FMT_DIR="${1:?usage: refresh-ocf-types.sh <Open-Cap-Format-OCF checkout> [ref]}"
REF="${2:-schema-toolkit-aggregates}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/types/vendor/ocf-types.d.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

(
  cd "$FMT_DIR"
  git fetch --quiet --all
  git checkout --quiet "$REF"
  npm install --ignore-scripts --no-audit --no-fund >/dev/null 2>&1
  npm run --silent schema:gen-types -- --out "$TMP" >/dev/null
)
SHA="$(git -C "$FMT_DIR" rev-parse --short HEAD)"

{
  cat <<EOF
// ============================================================================
// VENDORED — temporary transport for OCF types (#153; roadmap #145, Phase 2).
//
// Source  : Open-Cap-Table-Coalition/Open-Cap-Format-OCF
// Ref     : ${REF} (${SHA})
// Built by: npm run schema:gen-types   (regenerate: npm run ocf:refresh-types)
//
// DO NOT EDIT BY HAND. Stop-gap until these types ship as the
// \`@opencaptablecoalition/ocf-types\` package. Consumers already import the
// FINAL specifier via the tsconfig "paths" alias:
//   import type { AnyTransaction, ObjectTypeMap } from "@opencaptablecoalition/ocf-types";
//
// Replacement path (local to this file + the tsconfig alias):
//   1. PRs merge to main       -> npm run ocf:refresh-types -- <repo> main
//   2. Release tarball exists   -> npm i -D <tarball-url>; delete this file + alias
//   3. npm publish              -> npm i -D @opencaptablecoalition/ocf-types
// ============================================================================

EOF
  cat "$TMP"
} >"$DEST"

echo "Vendored types/vendor/ocf-types.d.ts from ${REF} (${SHA})"
