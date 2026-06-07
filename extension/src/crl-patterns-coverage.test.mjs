// Catalog ↔ CRLCommon.cql coverage check. Reads the catalog markdown,
// parses out every `CRLCommon.X` reference, then scans src/cql-emitter/catalog/CRLCommon.cql
// for a `define function "X"(...)` for each. Fails on missing functions so
// catalog additions can't drift ahead of the library.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

import * as mod from "../dist/catalog.js";
const { parseCatalog } = mod.default ?? mod;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const catalogPath = resolve(repoRoot, "src/cql-emitter/catalog/inference-pattern-catalog-draft.md");
const libraryPath = resolve(repoRoot, "src/cql-emitter/catalog/CRLCommon.cql");

const patterns = parseCatalog(readFileSync(catalogPath, "utf-8"));
// 28 after the v2.5.0 #99-sync (7 unreachable patterns commented out at source).
// Threshold is permissive — fail if the catalog gets gutted further.
assert.ok(patterns.length >= 25, `expected >=25 catalog patterns, got ${patterns.length}`);

const library = readFileSync(libraryPath, "utf-8");
// Match `define function "Name"(...)` — captures the name. Multiple
// overloads per name are fine; we just need at least one signature.
const definedFns = new Set();
const fnRe = /define\s+function\s+"([^"]+)"\s*\(/g;
let m;
while ((m = fnRe.exec(library)) !== null) {
  definedFns.add(m[1]);
}

// Every catalog row points at `CRLCommon.<Name>`; extract <Name> and
// confirm it's defined.
const missing = [];
for (const p of patterns) {
  const expected = p.cqlFunction.replace(/^CRLCommon\./, "");
  if (!definedFns.has(expected)) {
    missing.push(`${expected} (catalog row: ${p.canonical}, ${p.cqlFunction})`);
  }
}

if (missing.length > 0) {
  console.error("Missing CRLCommon.cql functions:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(
  `crl-patterns-coverage.test.mjs: ${patterns.length} catalog patterns, ` +
    `${definedFns.size} library function names — full coverage.`
);
