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
const { renderCelPane, reverseCelAnchors } = await load("celPaneHtml.ts");
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

// FIX 1 (disc 160): an AMBIGUOUS-name case (name in duplicateScenarioNames) must NOT be anchored to the frozen
// same-name caseId — clicking it would mis-attribute to the frozen case. It renders with a "not selectable" marker.
check("an ambiguous-name case is NOT anchored/clickable even though caseIdByName has the frozen id", () => {
  const out = renderCelPane(
    result([sc("Dup", "fail")]),
    { Dup: "cFrozen" }, // the frozen member won caseIdByName, but the name is shared → unsafe to select
    { duplicateScenarioNames: new Set(["Dup"]) },
  );
  assert.ok(out.html.includes("Dup"), "the case still renders");
  assert.ok(!("cFrozen" in out.anchors), "NOT anchored to the frozen caseId");
  assert.deepEqual(out.reveals, {}, "no reveal payload → not cross-pane-selectable");
  assert.ok(!out.html.includes("data-reveal"), "no data-reveal on an ambiguous case block");
  assert.ok(out.html.includes("name shared; not selectable"), "marked as un-selectable");
  assert.match(out.html, /cel-case[^"]*cel-ambiguous/);
});

check("a NON-duplicate case is still anchored normally when duplicateScenarioNames is supplied", () => {
  const out = renderCelPane(result([sc("Solo", "pass")]), { Solo: "cS" }, { duplicateScenarioNames: new Set(["Other"]) });
  assert.ok(out.anchors.cS && Object.values(out.reveals).some((r) => r.caseId === "cS"), "unaffected case still selectable");
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

check("failure envelope (NO scenarios) → placeholder with the errors", () => {
  const out = renderCelPane(result([], false, ["CEL did not parse"]));
  assert.match(out.html, /class="placeholder"/);
  assert.ok(out.html.includes("CEL did not parse"));
  assert.deepEqual(out.anchors, {});
});

// #173 (disc 158 §"Cockpit robustness"): an envelope with success:false BUT non-empty scenarios (a sibling case errored)
// must still RENDER the cases — so the failing case stays selectable — with the graph-level errors shown as a BANNER, not
// suppressing every case. Else #173's case-select trigger can't reach the failed case.
check("success:false WITH cases → renders the cases + an error banner (not the all-suppressing placeholder)", () => {
  const out = renderCelPane(result([sc("Failing", "fail"), sc("Erroring", "error")], false, ["case Erroring threw"]), { Failing: "cF", Erroring: "cE" });
  assert.ok(out.html.includes("Failing") && out.html.includes("Erroring"), "both cases render");
  assert.ok(out.html.includes('class="cel-case'), "case blocks present");
  assert.ok(out.html.includes("case Erroring threw"), "the error rides a banner");
  assert.match(out.html, /fc-cel-banner/);
  assert.ok(out.anchors.cF && out.anchors.cF.segmentIds.length === 1, "the failing case is still a reveal anchor (selectable)");
});

check("per-case errors with an EMPTY result.errors → no banner, cases still render (the ⚠ badge tells the story)", () => {
  const out = renderCelPane(result([sc("a", "pass"), sc("b", "error")], false, []), { a: "1", b: "2" });
  assert.ok(!out.html.includes("fc-cel-banner"), "no banner when there's no graph-level error string");
  assert.ok(out.html.includes("⚠"), "the errored case still shows its badge");
  assert.ok(out.html.includes('class="cel-case'));
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

// --- C2c-2b reverse fact-highlighting ---

check("conceptToFactAnchors: a concept that is a fact in MULTIPLE cases accumulates all its anchors", () => {
  const key = ck("Pol", "Diabetes");
  const out = renderCelPane(
    result([
      sc("A", "pass", [conceptFact("dx", "Pol", "Diabetes")]),
      sc("B", "fail", [conceptFact("dx2", "Pol", "Diabetes")]),
    ]),
    { A: "cA", B: "cB" },
    { revealableConceptKeys: new Set([key]) },
  );
  assert.equal(out.conceptToFactAnchors[key].length, 2, "both cases' fact spans collected");
  assert.ok(out.conceptToFactAnchors[key].every((k) => k.startsWith("fact:")));
});

check("conceptToFactAnchors: only revealable concept-kind facts appear (activity/bare/non-revealable excluded)", () => {
  const out = renderCelPane(
    result([sc("A", "pass", [conceptFact("act", "Pol", "Approve", "activity"), "Patient", conceptFact("dx", "Pol", "Diabetes")])]),
    { A: "cA" },
    { revealableConceptKeys: new Set([ck("Pol", "Diabetes")]) }, // Approve/Patient not in the set / not concept
  );
  assert.deepEqual(Object.keys(out.conceptToFactAnchors), [ck("Pol", "Diabetes")]);
});

check("reverseCelAnchors: facts FIRST (scroll pinpoint), then case blocks; deduped; non-concept keys add nothing", () => {
  const c2fa = { [ck("Pol", "Diabetes")]: ["fact:g_cel0:f0", "fact:g_cel1:f0"] };
  const out = reverseCelAnchors([ck("Pol", "Diabetes"), ck("Pol", "Unmapped")], ["cA", "cB"], c2fa);
  assert.deepEqual(out, ["fact:g_cel0:f0", "fact:g_cel1:f0", "cA", "cB"]); // facts first, unmapped concept contributes none
});

check("reverseCelAnchors: dedupes a key appearing in both fact + case sets", () => {
  const out = reverseCelAnchors([ck("Pol", "X")], ["dup", "cB"], { [ck("Pol", "X")]: ["dup", "fact:g_cel0:f0"] });
  assert.deepEqual(out, ["dup", "fact:g_cel0:f0", "cB"]);
});

check("at-rest key (#163): showKeys + caseKeyNumbers → a key slot in the case block; off → none; un-frozen → none", () => {
  const on = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { caseKeyNumbers: { cA: [2, 5] }, showKeys: true });
  assert.ok(on.html.includes('<span class="corr-num">2,5</span>'), "case shows its sorted unit numbers");
  const off = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { caseKeyNumbers: { cA: [2, 5] }, showKeys: false });
  assert.ok(!off.html.includes("corr-key"), "showKeys off → no slot");
  const unfrozen = renderCelPane(result([sc("U", "pass")]), {}, { caseKeyNumbers: {}, showKeys: true });
  assert.ok(!unfrozen.html.includes("corr-key"), "un-frozen case (no caseId) → no key slot");
});

// --- #156 slice 4: Medical Validation worklist checkbox ---

// The cockpit path (worklist absent / enabled:false) must stay BYTE-IDENTICAL — the checkbox render is mode-gated.
check("worklist ABSENT → byte-identical to a no-worklist baseline (cockpit unchanged)", () => {
  const cases = result([sc("A", "pass", ["dx"], ["Approve"]), sc("Unfrozen", "fail")]);
  const ids = { A: "cA" };
  const base = renderCelPane(cases, ids);
  const disabled = renderCelPane(cases, ids, { worklist: { enabled: false, statesByCaseId: { cA: "reviewed" } } });
  assert.equal(disabled.html, base.html, "enabled:false html === baseline html");
  assert.ok(!base.html.includes("cel-check"), "no checkbox in the baseline");
  assert.equal(base.worklistActions, undefined, "no worklistActions field in cockpit mode");
  assert.equal(disabled.worklistActions, undefined, "enabled:false omits worklistActions too");
});

check("worklist enabled: a REVIEWABLE case → data-worklist-toggle + state class + a worklistActions entry → caseId", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(out.html, /class="cel-check cel-check-unreviewed"[^>]*data-worklist-toggle="[^"]+"/);
  const keys = Object.keys(out.worklistActions);
  assert.equal(keys.length, 1, "exactly one worklist action");
  assert.deepEqual(out.worklistActions[keys[0]], { caseId: "cA" }, "key resolves to the frozen caseId");
  // the toggle key is present in the html as the data attribute
  assert.ok(out.html.includes(`data-worklist-toggle="${keys[0]}"`));
});

// FIX 1 (impl review): the worklist toggle key must be STABLE (caseId-derived), NOT gen/prefix-scoped — so a click on a
// stale (pre-re-render) DOM still resolves to the caseId instead of being dropped. Independent of the gen-scoped reveal key.
check("worklist toggle key is STABLE (wl_<caseId>), prefix-independent — unlike the reveal key", () => {
  const mk = (prefix) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { revealPrefix: prefix, worklist: { enabled: true, statesByCaseId: {} } });
  const a = mk("g1_");
  const b = mk("g2_");
  assert.deepEqual(Object.keys(a.worklistActions), ["wl_cA"], "key derived from caseId, not the gen prefix");
  assert.deepEqual(Object.keys(b.worklistActions), ["wl_cA"], "same key across renders/gens (stable)");
  // the reveal (case-select) key DOES carry the prefix — the two key spaces are independent.
  assert.ok(Object.keys(a.reveals).some((k) => k.startsWith("g1_")) && Object.keys(b.reveals).some((k) => k.startsWith("g2_")));
});

// FIX 4 (impl review, a11y): the interactive checkbox is keyboard-operable + screen-reader-stateful.
check("worklist (a11y): interactive checkbox carries role + tabindex + aria-checked reflecting state", () => {
  const mk = (st) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: st } });
  assert.match(mk({}).html, /class="cel-check cel-check-unreviewed"[^>]*role="checkbox"[^>]*aria-checked="false"[^>]*tabindex="0"/);
  assert.match(mk({ cA: "pending" }).html, /aria-checked="mixed"/, "pending → aria-checked mixed");
  assert.match(mk({ cA: "reviewed" }).html, /aria-checked="true"/, "reviewed → aria-checked true");
  // a DISABLED checkbox: aria-disabled, NO tabindex (unreachable by keyboard)
  const dis = renderCelPane(result([sc("U", "pass")]), {}, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(dis.html, /cel-check-disabled"[^>]*aria-disabled="true"/);
  assert.ok(!/cel-check-disabled"[^>]*tabindex/.test(dis.html), "disabled checkbox has no tabindex");
});

check("worklist state glyphs: unreviewed / pending / reviewed map to the right class", () => {
  const mk = (st) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: st } });
  assert.match(mk({}).html, /cel-check-unreviewed/);
  assert.match(mk({ cA: "pending" }).html, /cel-check-pending/);
  assert.match(mk({ cA: "reviewed" }).html, /cel-check-reviewed/);
});

check("worklist state is keyed by caseId, NOT display name", () => {
  // statesByCaseId carries the NAME "A" as a key (a trap) — it must NOT be picked up; the frozen caseId "cA" has no entry.
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: { A: "reviewed" } } });
  assert.match(out.html, /cel-check-unreviewed/, "name-keyed state ignored → renders unreviewed");
  assert.ok(!out.html.includes("cel-check-reviewed"));
});

check("worklist: an UNFROZEN case → DISABLED checkbox, NO data-worklist-toggle, the freeze tooltip", () => {
  const out = renderCelPane(result([sc("Unfrozen", "pass")]), {}, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(out.html, /class="cel-check cel-check-disabled"/);
  assert.ok(!out.html.includes("data-worklist-toggle"), "unfrozen case carries no toggle key");
  assert.ok(out.html.includes("freeze this case to review it"), "freeze tooltip present");
  assert.deepEqual(out.worklistActions, {}, "no action for an unfrozen case");
});

check("worklist: an AMBIGUOUS-name case → DISABLED checkbox + 'not reviewable', no toggle key", () => {
  const out = renderCelPane(
    result([sc("Dup", "fail")]),
    { Dup: "cFrozen" },
    { duplicateScenarioNames: new Set(["Dup"]), worklist: { enabled: true, statesByCaseId: { cFrozen: "reviewed" } } },
  );
  assert.match(out.html, /class="cel-check cel-check-disabled"/);
  assert.ok(!out.html.includes("data-worklist-toggle"), "ambiguous case is not toggleable");
  assert.ok(out.html.includes("name shared; not reviewable"), "ambiguous tooltip present");
  assert.deepEqual(out.worklistActions, {}, "no action for an ambiguous case");
  // honesty: it must NOT be silently hidden — the case still renders + still shows the name-shared marker
  assert.ok(out.html.includes("Dup"));
});

check("worklist: a mix → reviewable keyed in worklistActions, unfrozen/ambiguous excluded", () => {
  const out = renderCelPane(
    result([sc("Good", "pass"), sc("Unfrozen", "pass"), sc("Dup", "fail")]),
    { Good: "cG", Dup: "cD" },
    { duplicateScenarioNames: new Set(["Dup"]), worklist: { enabled: true, statesByCaseId: {} } },
  );
  const caseIds = Object.values(out.worklistActions).map((a) => a.caseId);
  assert.deepEqual(caseIds, ["cG"], "only the frozen, non-ambiguous case is a worklist action");
});

console.log(`\ncelPaneHtml.test: ${pass} checks passed`);
