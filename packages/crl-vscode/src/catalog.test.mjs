import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";

import * as mod from "@smile-digital-health/crl/language-services";
const {
  parseCatalog,
  narrativePlaceholders,
  buildSnippetBody,
  isDefinitionIsBody,
  compileNarrativeMatcher,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  PARAMETER_TYPES,
} = mod.default ?? mod;

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, "../../crl/src/cql-emitter/catalog/inference-pattern-catalog.md");

const markdown = readFileSync(catalogPath, "utf-8");
const patterns = parseCatalog(markdown);

// Sanity: the catalog has 40+ active patterns (deferred/unreachable rows stay
// commented out at source per #99). Asserting a permissive lower bound.
assert.ok(patterns.length >= 25, `expected >=25 patterns, got ${patterns.length}`);

// Regression for #109: an HTML comment inside a reference table (used to defer
// rows) must NOT terminate the table — active rows below a comment must still
// parse. Before the fix, the first `<!-- ... -->` line dropped every row under
// it; the four Contextualization patterns vanished from the shipped catalog.
{
  const header =
    "| Pattern | Narrative form | Canonical | CQL function |\n|---|---|---|---|";
  const row =
    "| `AsOf(anchor, X)` | `<X> as of <anchor>` | `AsOf(anchor: AnchorExpr, X: ConceptRef)` | `CRLCommon.AsOf` |";
  const commentedRow =
    "<!-- | `With(X, Y)` | `<X> with <Y>` | `With(X: ConceptRef, Y: ConceptRef)` | `CRLCommon.With` | -->";
  const md = `## Contextualization\n\n${header}\n<!-- #99 deferred -->\n${commentedRow}\n${row}\n`;
  const got = parseCatalog(md);
  assert.equal(got.length, 1, "active row after a comment should parse");
  assert.equal(got[0].canonical, "AsOf(anchor, X)");
  assert.ok(
    !got.some((p) => p.canonical.startsWith("With(")),
    "a commented-out row must NOT be parsed",
  );
}

// #109: the four Contextualization patterns must be present in the real catalog.
for (const name of ["AsOf", "ComponentOf", "NotDoneWithReason", "WasOrdered"]) {
  assert.ok(
    patterns.some((p) => p.canonical.startsWith(`${name}(`)),
    `Contextualization pattern ${name} missing from catalog (regression of #109)`,
  );
}

// Spot-check: every pattern row has all four fields populated and category text.
for (const p of patterns) {
  assert.ok(p.canonical.length > 0, `empty canonical in ${JSON.stringify(p)}`);
  assert.ok(p.narrative.length > 0, `empty narrative in ${JSON.stringify(p)}`);
  assert.ok(p.signature.length > 0, `empty signature in ${JSON.stringify(p)}`);
  assert.ok(p.cqlFunction.length > 0, `empty cqlFunction in ${JSON.stringify(p)}`);
  assert.ok(p.cqlFunction.startsWith("CRLCommon."), `non-CRLCommon cqlFunction: ${p.cqlFunction}`);
}

// Spot-check the well-known Has pattern.
const has = patterns.find((p) => p.canonical === "Has(X)");
assert.ok(has, "Has(X) pattern not found");
assert.equal(has.narrative, "has <X>");
assert.equal(has.signature, "Has(X: ConceptRef)");
assert.equal(has.cqlFunction, "CRLCommon.Has");

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

// --- v2.2 Todo 4: drift-guard tests for the static type mirrors ---
//
// The extension's catalog.ts hand-mirrors three allowlists that originate
// in the grammar's lexer rules. The grammar emits the same allowlists as
// generated JSON at build time. These tests assert EXACT equality so any
// future grammar addition immediately fails the extension build instead
// of silently drifting (the way "Patient" did between commit 16d0634 and
// this Todo).
const grammarTypesDir = resolve(here, "../../crl/src/grammar/generated/types");
const conceptTypesJson = JSON.parse(readFileSync(resolve(grammarTypesDir, "conceptTypes.json"), "utf-8"));
const conceptValueTypesJson = JSON.parse(readFileSync(resolve(grammarTypesDir, "conceptValueTypes.json"), "utf-8"));
const parameterTypesJson = JSON.parse(readFileSync(resolve(grammarTypesDir, "parameterTypes.json"), "utf-8"));

// Exact equality (order included) — the JSON sources are stable lexer-order
// outputs, and `PARAMETER_TYPES = [...CONCEPT_TYPES, ...CONCEPT_VALUETYPES]`
// produces a deterministic order. Sorting before comparison would miss
// ordering drift in the generated JSON.
assert.deepEqual(
  [...CONCEPT_TYPES],
  [...conceptTypesJson],
  "CONCEPT_TYPES must match src/grammar/generated/types/conceptTypes.json — keep the static mirror in sync",
);
assert.deepEqual(
  [...CONCEPT_VALUETYPES],
  [...conceptValueTypesJson],
  "CONCEPT_VALUETYPES must match src/grammar/generated/types/conceptValueTypes.json — keep the static mirror in sync",
);
assert.deepEqual(
  [...PARAMETER_TYPES],
  [...parameterTypesJson],
  "PARAMETER_TYPES must match src/grammar/generated/types/parameterTypes.json — keep the static mirror in sync",
);
// Symmetric assertion: the JSON itself must also not contain Practitioner
// while it remains the deliberate v2.2 deferral. If a future grammar change
// widens parameterTypes.json AND PARAMETER_TYPES together, both this and
// the static-mirror exclusion below need to update.
assert.equal(
  parameterTypesJson.includes("Practitioner"),
  false,
  "parameterTypes.json must not contain Practitioner — see Todo 4 R3-Δ13",
);

// Practitioner deferral lock: while Practitioner is NOT in the grammar
// allowlist (deliberate v2.2 deferral — the emitter's Practitioner branch
// is future-proofing), the extension must not surface it as a completion
// suggestion either. If Practitioner is added to parameterTypes.json this
// assertion must be updated AS PART OF that change.
assert.equal(
  PARAMETER_TYPES.includes("Practitioner"),
  false,
  "Practitioner deferral lock — see Todo 4 R3-Δ13 in .vibe-tools/discussions/040-*.md",
);
// Patient catch-up: was added to the grammar in commit 16d0634; this asserts
// the extension mirror picked it up so the type hover doesn't flag valid
// CRL as invalid and the completion menu offers it.
assert.equal(
  CONCEPT_TYPES.includes("Patient"),
  true,
  "Patient must be in CONCEPT_TYPES — grammar added it in commit 16d0634",
);

console.log(`catalog.test.mjs: ${patterns.length} patterns parsed; spot-checks + helper tests passed.`);
