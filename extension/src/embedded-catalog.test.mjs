// Verifies that the embedded dist/catalog.json (generated at build time) is
// well-formed and matches what the parser would produce against the live
// catalog markdown. Catches a stale dist after a catalog edit.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

import * as catalogMod from "../dist/catalog.js";
const { parseCatalog } = catalogMod.default ?? catalogMod;

const here = dirname(fileURLToPath(import.meta.url));
const catalogMdPath = resolve(here, "../../features/cql-pattern-mining/results/inference-pattern-catalog-draft.md");
const catalogJsonPath = resolve(here, "../dist/catalog.json");

const embedded = JSON.parse(readFileSync(catalogJsonPath, "utf-8"));
const fresh = parseCatalog(readFileSync(catalogMdPath, "utf-8"));

assert.ok(Array.isArray(embedded), "dist/catalog.json must be an array");
assert.equal(
  embedded.length,
  fresh.length,
  `dist/catalog.json has ${embedded.length} patterns but the parser produces ${fresh.length} — rebuild the extension`
);
assert.deepEqual(embedded, fresh, "dist/catalog.json content drifted from the parser output — rebuild");

console.log(`embedded-catalog.test.mjs: dist/catalog.json embeds ${embedded.length} patterns, matches parser output.`);
