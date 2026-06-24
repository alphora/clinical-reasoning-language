// Unit tests for the CEL pane RENDERER (#156 C2c-1). vscode-free + crl types erase → esbuild-bundle-then-import.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({ entryPoints: [resolve(here, tsFile)], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
  return require(out);
}
const { renderCelPane } = await load("celPaneHtml.ts");
// Use the REAL nodeKey (the same fn celPaneHtml + crlStructure call) so the gate-key format is proven, not assumed.
const { nodeKey } = await import("@smile-digital-health/crl");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};
// facts: a string → a bare fact (no definedBy); an object → passed through (carries definedBy for fact-level tests).
const sc = (name, status, facts = [], produced = [], subject) => ({
  case: { name, subject, facts: facts.map((f) => (typeof f === "string" ? { name: f } : f)) },
  decision: null, status, expected: null,
  produced: produced.map((r) => ({ recommendation: r, actionKind: "recommend-activity" })),
  tree: [], diagnostics: [],
});
const result = (scenarios, ok = true, errors = []) => ({ schemaVersion: 1, success: ok, source: { celFilePath: "x.cel" }, caseCount: scenarios.length, passCount: 0, failCount: 0, errorCount: 0, scenarios, errors });
// The concept key celPaneHtml builds + the gate set is keyed by — the SAME nodeKey crlStructure's refKey uses, so this
// proves the byte-match (a peek resolves) rather than assuming a hand-rolled format.
const ck = (lib, name) => nodeKey({ lib, kind: "concept", name });
const conceptFact = (name, lib, decl, kind = "concept") => ({ name, conceptRef: decl, definedBy: { lib, name: decl, kind } });

check("a block per case: status badge + facts + produced + reveal", () => {
  const out = renderCelPane(result([sc("Pat A", "pass", ["dx"], ["Approve"])]), { "Pat A": "cA" });
  assert.match(out.html, /class="cel-case cel-pass"[^>]*data-reveal=/);
  assert.ok(out.html.includes("Pat A") && out.html.includes("facts: dx") && out.html.includes("→ Approve") && out.html.includes("✓"));
});

check("anchors keyed by frozen caseId; reveal key → caseId", () => {
  const out = renderCelPane(result([sc("A", "fail")]), { A: "cA" });
  assert.ok(out.anchors.cA && out.anchors.cA.segmentIds.length === 1);
  assert.deepEqual(Object.values(out.reveals), [{ caseId: "cA" }]);
});

check("a case with NO frozen id renders but is un-revealable (no anchor / no data-reveal)", () => {
  const out = renderCelPane(result([sc("Unfrozen", "pass")]), {}); // absent from caseIdByName
  assert.ok(out.html.includes("Unfrozen"));
  assert.deepEqual(out.anchors, {});
  assert.deepEqual(out.reveals, {});
  assert.ok(!out.html.includes("data-reveal"));
});

check("status badges: pass ✓ / fail ✗ / error ⚠", () => {
  const out = renderCelPane(result([sc("a", "pass"), sc("b", "fail"), sc("c", "error")]), { a: "1", b: "2", c: "3" });
  assert.ok(out.html.includes("✓") && out.html.includes("✗") && out.html.includes("⚠"));
});

check("XSS: names + facts escaped", () => {
  const out = renderCelPane(result([sc("<script>", "pass", ["<b>x</b>"])]), {});
  assert.ok(!out.html.includes("<script>") && !out.html.includes("<b>"));
  assert.ok(out.html.includes("&lt;script&gt;"));
});

check("failure envelope → placeholder with the errors", () => {
  const out = renderCelPane(result([], false, ["CEL did not parse"]));
  assert.match(out.html, /class="placeholder"/);
  assert.ok(out.html.includes("CEL did not parse"));
  assert.deepEqual(out.anchors, {});
});

check("empty (success, no scenarios) → 'No CEL cases.'", () => {
  assert.ok(renderCelPane(result([])).html.includes("No CEL cases"));
});

check("revealPrefix namespaces ids + keys (case reveals)", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { revealPrefix: "7:" });
  assert.ok(Object.keys(out.reveals).every((k) => k.startsWith("7:")));
  assert.ok(out.anchors.cA.scrollTo.startsWith("7:"));
});

// --- C2c-2 fact-level reveal ---

check("a revealable qualified-concept fact → clickable span + fact: anchor + {conceptKey,factAnchorKey} reveal", () => {
  const key = ck("Pol", "Diabetes");
  const out = renderCelPane(result([sc("A", "pass", [conceptFact("dx", "Pol", "Diabetes")])]), { A: "cA" }, { revealableConceptKeys: new Set([key]) });
  assert.match(out.html, /class="cel-fact"[^>]*data-reveal="fact:[^"]*"/);
  const factKeys = Object.keys(out.anchors).filter((k) => k.startsWith("fact:"));
  assert.equal(factKeys.length, 1, "exactly one fact anchor");
  assert.deepEqual(out.reveals[factKeys[0]], { conceptKey: key, factAnchorKey: factKeys[0] });
});

check("a concept fact NOT in the revealable set → plain text (no fact span / no anchor), still displayed", () => {
  const out = renderCelPane(result([sc("A", "pass", [conceptFact("dx", "Pol", "Diabetes")])]), { A: "cA" }, { revealableConceptKeys: new Set() });
  assert.ok(!out.html.includes('class="cel-fact"'));
  assert.ok(!Object.keys(out.anchors).some((k) => k.startsWith("fact:")));
  assert.ok(out.html.includes("dx"));
});

check("kind guard: an ACTIVITY-target fact is never clickable, even if its name key is revealable", () => {
  const key = ck("Pol", "Approve");
  const out = renderCelPane(result([sc("A", "pass", [conceptFact("act", "Pol", "Approve", "activity")])]), { A: "cA" }, { revealableConceptKeys: new Set([key]) });
  assert.ok(!out.html.includes('class="cel-fact"'));
});

check("a bare fact (no definedBy / FHIR type) is never clickable", () => {
  const out = renderCelPane(result([sc("A", "pass", ["Patient"])]), { A: "cA" }, { revealableConceptKeys: new Set([ck("Pol", "Patient")]) });
  assert.ok(!out.html.includes('class="cel-fact"'));
});

check("fact span nests INSIDE the case block + uses a colon-namespaced key distinct from the case key", () => {
  const key = ck("Pol", "Diabetes");
  const out = renderCelPane(result([sc("A", "pass", [conceptFact("dx", "Pol", "Diabetes")])]), { A: "cA" }, { revealableConceptKeys: new Set([key]) });
  assert.match(out.html, /class="cel-case[^"]*"[^>]*>[\s\S]*class="cel-fact"/); // nesting → closest() inner wins
  const caseKeys = Object.keys(out.reveals).filter((k) => !k.startsWith("fact:"));
  const factKeys = Object.keys(out.reveals).filter((k) => k.startsWith("fact:"));
  assert.equal(caseKeys.length, 1);
  assert.equal(factKeys.length, 1);
  assert.ok(factKeys[0].includes(":"));
});

check("fact peek works in an UN-FROZEN case (concept correspondence is case-independent)", () => {
  const key = ck("Pol", "Diabetes");
  const out = renderCelPane(result([sc("Unfrozen", "pass", [conceptFact("dx", "Pol", "Diabetes")])]), {}, { revealableConceptKeys: new Set([key]) });
  assert.ok(out.html.includes('class="cel-fact"'), "fact still clickable without a frozen case id");
  assert.ok(Object.keys(out.anchors).some((k) => k.startsWith("fact:")));
  assert.ok(!Object.keys(out.anchors).some((k) => !k.startsWith("fact:")), "no case anchor for an un-frozen case");
});

console.log(`\ncelPaneHtml.test: ${pass} checks passed`);
