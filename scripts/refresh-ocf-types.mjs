// Refresh the vendored OCF TypeScript types from the pinned schema-repo commit.
//
// Reads the `ocfSchema` pin from package.json, fetches the generated
// `types/ocf.ts` from the pinned 40-char commit SHA, prepends a provenance
// header, and writes it to `types/ocf.ts`. Pure Node ESM, no dependencies,
// uses global fetch (Node >= 18). Output is byte-idempotent for an unchanged
// pin (no timestamps).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const outputPath = resolve(repoRoot, "types/ocf.ts");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
const ocfSchema = pkg.ocfSchema;

if (!ocfSchema || typeof ocfSchema !== "object") {
  fail('Missing "ocfSchema" block in package.json (expected { repo, ref }).');
}

const { repo, ref } = ocfSchema;

if (typeof repo !== "string" || repo.length === 0) {
  fail('Invalid "ocfSchema.repo" in package.json (expected a non-empty string).');
}

if (typeof ref !== "string" || !/^[0-9a-f]{40}$/.test(ref)) {
  fail(
    `Invalid "ocfSchema.ref" in package.json: ${JSON.stringify(ref)}.\n` +
      "Expected a full 40-character lowercase-hex commit SHA (matching /^[0-9a-f]{40}$/)."
  );
}

const url = `https://raw.githubusercontent.com/${repo}/${ref}/types/ocf.ts`;

let response;
try {
  response = await fetch(url);
} catch (error) {
  fail(`Failed to fetch ${url}\n${error?.message ?? error}`);
}

if (!response.ok) {
  fail(
    `Failed to fetch types/ocf.ts: HTTP ${response.status} ${response.statusText}\n` +
      `URL: ${url}\n` +
      "Leaving any existing types/ocf.ts untouched."
  );
}

const upstream = await response.text();

const header =
  "// GENERATED FILE — DO NOT EDIT.\n" +
  `// Vendored from ${repo}@${ref}\n` +
  "// Refresh: npm run ocf:refresh-types\n";

await writeFile(outputPath, header + upstream);

console.log(`Wrote ${outputPath} from ${url}`);
