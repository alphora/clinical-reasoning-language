import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

import * as mod from "../dist/catalog.js";
const { parseCatalog, narrativePlaceholders, buildSnippetBody, isDefinitionIsBody, compileNarrativeMatcher } =
  mod.default ?? mod;

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../../features/cql-pattern-mining/results/inference-pattern-catalog-draft.md");

const markdown = readFileSync(catalogPath, "utf-8");
const patterns = parseCatalog(markdown);

// Sanity: the catalog has ~45 patterns. Asserting a permissive lower bound.
assert.ok(patterns.length >= 30, `expected >=30 patterns, got ${patterns.length}`);

// Spot-check: every pattern row has all four fields populated and category text.
for (const p of patterns) {
  assert.ok(p.canonical.length > 0, `empty canonical in ${JSON.stringify(p)}`);
  assert.ok(p.narrative.length > 0, `empty narrative in ${JSON.stringify(p)}`);
  assert.ok(p.signature.length > 0, `empty signature in ${JSON.stringify(p)}`);
  assert.ok(p.cqlFunction.length > 0, `empty cqlFunction in ${JSON.stringify(p)}`);
  assert.ok(p.cqlFunction.startsWith("CRLPatterns."), `non-CRLPatterns cqlFunction: ${p.cqlFunction}`);
}

// Spot-check the well-known Has pattern.
const has = patterns.find((p) => p.canonical === "Has(X)");
assert.ok(has, "Has(X) pattern not found");
assert.equal(has.narrative, "has <X>");
assert.equal(has.signature, "Has(X: ConceptRef)");
assert.equal(has.cqlFunction, "CRLPatterns.Has");

// Spot-check the During pattern (two placeholders).
const during = patterns.find((p) => p.canonical === "During(event, period)");
assert.ok(during, "During(event, period) pattern not found");
assert.equal(during.narrative, "<event> during <period>");
assert.deepEqual(narrativePlaceholders(during.narrative), ["event", "period"]);

// Spot-check Without (escaped pipe inside the canonical signature).
const without = patterns.find((p) => p.canonical === "Without(kind, X)");
assert.ok(without, "Without(kind, X) pattern not found");
assert.ok(without.signature.includes("KindEnum"), "Without signature should include KindEnum");

// Spot-check placeholders parser on the catalog's bare-text shapes.
assert.deepEqual(narrativePlaceholders("has <X>"), ["X"]);
assert.deepEqual(narrativePlaceholders("<event> during <period>"), ["event", "period"]);
assert.deepEqual(narrativePlaceholders("no placeholders here"), []);

// --- buildSnippetBody: narrative → VS Code snippet body ---
assert.equal(buildSnippetBody("has <X>"), `has "\${1:X}"`);
assert.equal(
  buildSnippetBody("<event> during <period>"),
  `"\${1:event}" during "\${2:period}"`
);
assert.equal(buildSnippetBody("no placeholders here"), "no placeholders here");

// --- isDefinitionIsBody: cursor-context detection ---
assert.equal(isDefinitionIsBody("- definition is "), true);
assert.equal(isDefinitionIsBody("  - definition is "), true, "indented definition-is body should match");
assert.equal(isDefinitionIsBody("- definition is \"BMI Observations\" during"), true);
assert.equal(isDefinitionIsBody("concept \"X\":"), false, "concept header is NOT a definition-is body");
assert.equal(isDefinitionIsBody("- type is Observation."), false);
assert.equal(isDefinitionIsBody("- defined as"), false);

// --- compileNarrativeMatcher: regex generation for hover matching ---
const hasMatcher = compileNarrativeMatcher("has <X>");
assert.ok(hasMatcher.test(`has "Overweight"`), "matcher should accept a quoted concept ref");
assert.ok(!hasMatcher.test(`has Overweight`), "matcher should reject an unquoted ref");

const duringMatcher = compileNarrativeMatcher("<event> during <period>");
assert.ok(duringMatcher.test(`"BMI Obs" during "MP"`), "two-placeholder narrative should match");

const performedMatcher = compileNarrativeMatcher("<X> performed");
assert.ok(performedMatcher.test(`"Some Service Requests" performed`));
assert.ok(!performedMatcher.test(`"Some Service Requests" not performed`), "must require literal `performed`");

// Whitespace flexibility — collapse runs of whitespace to \s+ so authors can
// wrap or indent narrative tokens freely.
const onOrBeforeMatcher = compileNarrativeMatcher("<X> on or before <Y>");
assert.ok(onOrBeforeMatcher.test(`"A"   on   or   before   "B"`), "matcher should tolerate extra whitespace");

console.log(`catalog.test.mjs: ${patterns.length} patterns parsed; spot-checks + helper tests passed.`);
