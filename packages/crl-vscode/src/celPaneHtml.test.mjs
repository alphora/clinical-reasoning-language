// Unit tests for the CEL pane RENDERER (#156 C2c-1). vscode-free + crl types erase → esbuild-bundle-then-import.
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";

const { renderCelPane, reverseCelAnchors, formatNoteTimestamp, REVIEW_ORDER } = await load("celPaneHtml.ts");
const { REVIEW_STATES } = await load("medicalValidationStore.ts");
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

check("UX fix: the authored `-> outcome` suffix is stripped from the worklist case NAME (but the computed `→ produced` badge stays)", () => {
  const out = renderCelPane(result([sc("Contraindication present (guard fails) -> Unmet", "fail", [], ["Unmet"])]), { "Contraindication present (guard fails) -> Unmet": "cX" });
  assert.ok(out.html.includes("Contraindication present (guard fails)"), "the descriptive name shows");
  assert.ok(!/-&gt; Unmet<\/span>/.test(out.html) && !out.html.includes("-> Unmet"), "the authored '-> Unmet' name suffix is stripped");
  assert.ok(out.html.includes("→ Unmet"), "the SEPARATE computed produced badge (→ Unmet) is untouched");
});

check("a determination outcome renders as the human key, not the dotted `<category>.<key>` name", () => {
  const out = renderCelPane(
    result([sc("Pat B", "pass", ["dx"], ["certify.Met", "not-certify.Unmet EIU"])]),
    { "Pat B": "cB" },
  );
  assert.ok(out.html.includes("→ Met, Unmet EIU"), "the worklist row shows the keys only");
  assert.ok(!out.html.includes("certify."), "no `certify.` / `not-certify.` dotted prefix leaks into the worklist row");
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
  const disabled = renderCelPane(cases, ids, { worklist: { enabled: false, statesByCaseId: { cA: "pass" } } });
  assert.equal(disabled.html, base.html, "enabled:false html === baseline html");
  assert.ok(!base.html.includes("cel-review"), "no review dropdown in the baseline");
  assert.equal(base.worklistActions, undefined, "no worklistActions field in cockpit mode");
  assert.equal(disabled.worklistActions, undefined, "enabled:false omits worklistActions too");
});

check("worklist enabled: a REVIEWABLE case → a <select data-worklist-select> + state class + a worklistActions entry → caseId", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(out.html, /<select class="cel-review cel-review-unreviewed" data-worklist-select="[^"]+"/);
  // all four options render, with "To do" selected (the absent-state default)
  assert.match(out.html, /<option value="unreviewed" selected>To do<\/option>/);
  assert.match(out.html, /<option value="pending">Pending<\/option>/);
  assert.match(out.html, /<option value="pass">Pass<\/option>/);
  assert.match(out.html, /<option value="fail">Fail<\/option>/);
  const keys = Object.keys(out.worklistActions);
  assert.equal(keys.length, 1, "exactly one worklist action");
  assert.deepEqual(out.worklistActions[keys[0]], { caseId: "cA" }, "key resolves to the frozen caseId");
  assert.ok(out.html.includes(`data-worklist-select="${keys[0]}"`));
});

check("worklist policyLabel → a sticky header at the TOP; escaped; absent without a label / in cockpit", () => {
  const withLabel = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: {}, policyLabel: "MED201.014" } });
  assert.match(withLabel.html, /^<div class="cel-worklist-header"[^>]*>MED201\.014<\/div>/, "header pinned first");
  // XSS: the label is escaped
  const xss = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: {}, policyLabel: "<script>" } });
  assert.ok(xss.html.startsWith("<div class=\"cel-worklist-header\"") && xss.html.includes("&lt;script&gt;") && !xss.html.includes("<script>"));
  // no label → no header
  const noLabel = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.ok(!noLabel.html.includes("cel-worklist-header"));
  // cockpit mode ignores policyLabel entirely
  const cockpit = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: false, statesByCaseId: {}, policyLabel: "MED201.014" } });
  assert.ok(!cockpit.html.includes("cel-worklist-header") && !cockpit.html.includes("MED201.014"));
});

check("worklist policyLabel: header shows even with NO cases (empty worklist still names its policy)", () => {
  const empty = renderCelPane({ success: true, scenarios: [], errors: [] }, {}, { worklist: { enabled: true, statesByCaseId: {}, policyLabel: "RX501.105" } });
  assert.match(empty.html, /^<div class="cel-worklist-header"[^>]*>RX501\.105<\/div>/);
});

// FIX 1 (impl review): the worklist select key must be STABLE (caseId-derived), NOT gen/prefix-scoped — so a change on a
// stale (pre-re-render) DOM still resolves to the caseId instead of being dropped. Independent of the gen-scoped reveal key.
check("worklist select key is STABLE (wl_<caseId>), prefix-independent — unlike the reveal key", () => {
  const mk = (prefix) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { revealPrefix: prefix, worklist: { enabled: true, statesByCaseId: {} } });
  const a = mk("g1_");
  const b = mk("g2_");
  assert.deepEqual(Object.keys(a.worklistActions), ["wl_cA"], "key derived from caseId, not the gen prefix");
  assert.deepEqual(Object.keys(b.worklistActions), ["wl_cA"], "same key across renders/gens (stable)");
  // the reveal (case-select) key DOES carry the prefix — the two key spaces are independent.
  assert.ok(Object.keys(a.reveals).some((k) => k.startsWith("g1_")) && Object.keys(b.reveals).some((k) => k.startsWith("g2_")));
});

// a11y: a native <select> is inherently keyboard- + screen-reader-operable — the SELECTED option reflects state, and an
// aria-label names it. No hand-rolled role/tabindex/aria-checked.
check("worklist (a11y): the <select>'s SELECTED option + aria-label reflect the current verdict", () => {
  const mk = (st) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: st } });
  assert.match(mk({}).html, /<option value="unreviewed" selected>To do<\/option>/);
  assert.match(mk({}).html, /aria-label="Review state: To do"/);
  assert.match(mk({ cA: "pending" }).html, /<option value="pending" selected>Pending<\/option>/);
  assert.match(mk({ cA: "pass" }).html, /<option value="pass" selected>Pass<\/option>/);
  assert.match(mk({ cA: "pass" }).html, /aria-label="Review state: Pass"/);
  assert.match(mk({ cA: "fail" }).html, /<option value="fail" selected>Fail<\/option>/);
  // a DISABLED select: the `disabled` attribute, no data-worklist-select (unreachable / can't fire a change)
  const dis = renderCelPane(result([sc("U", "pass")]), {}, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(dis.html, /class="cel-review cel-review-disabled" disabled/);
  assert.ok(!/cel-review-disabled[^>]*data-worklist-select/.test(dis.html), "disabled select has no change key");
});

check("worklist state class: unreviewed / pending / pass / fail map to the right cel-review-* class", () => {
  const mk = (st) => renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: st } });
  assert.match(mk({}).html, /cel-review cel-review-unreviewed/);
  assert.match(mk({ cA: "pending" }).html, /cel-review cel-review-pending/);
  assert.match(mk({ cA: "pass" }).html, /cel-review cel-review-pass/);
  assert.match(mk({ cA: "fail" }).html, /cel-review cel-review-fail/);
});

check("worklist state is keyed by caseId, NOT display name", () => {
  // statesByCaseId carries the NAME "A" as a key (a trap) — it must NOT be picked up; the frozen caseId "cA" has no entry.
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: { A: "pass" } } });
  assert.match(out.html, /cel-review cel-review-unreviewed/, "name-keyed state ignored → the SELECT renders To do");
  // scope to the row SELECT (`cel-review cel-review-pass`), not the bare token — the #214 filter chips legitimately carry
  // `cel-filter-chip cel-review-pass` for the pass chip's color.
  assert.ok(!out.html.includes("cel-review cel-review-pass"), "the row select is NOT pass (name-keyed state ignored)");
});

// ── #214 verdict filter ──
check("#214 DRIFT GUARD: celPaneHtml's REVIEW_ORDER deep-equals the store's REVIEW_STATES (chips ↔ reset set can't desync)", () => {
  assert.deepEqual([...REVIEW_ORDER], [...REVIEW_STATES], "the chip list + the host's 'all-active' reset set MUST be identical");
});
check("#214 filter: the chip row renders 4 native <button aria-pressed> with counts; absent filter ⇒ all active", () => {
  const out = renderCelPane(result([sc("A", "pass"), sc("B", "fail")]), { A: "cA", B: "cB" }, { worklist: { enabled: true, statesByCaseId: { cA: "pass", cB: "fail" } } });
  assert.match(out.html, /<div class="cel-filter-chips"/, "the chip row renders");
  for (const st of ["unreviewed", "pending", "pass", "fail"])
    assert.match(out.html, new RegExp(`<button type="button" class="cel-filter-chip cel-review-${st} cel-filter-on" data-worklist-filter="${st}" aria-pressed="true"`), `${st} chip active when no filter`);
  assert.match(out.html, /data-worklist-filter="pass"[^>]*>Pass <span class="cel-filter-count">1<\/span>/, "pass count = 1");
  assert.match(out.html, /data-worklist-filter="fail"[^>]*>Fail <span class="cel-filter-count">1<\/span>/, "fail count = 1");
  assert.match(out.html, /data-worklist-filter="unreviewed"[^>]*title="Includes cases that are not reviewable"/, "the to-do chip notes it includes unreviewable cases");
});
check("#214 filter: {pass} shows ONLY pass rows (fail case skip-rendered, no anchor); the fail chip is aria-pressed=false", () => {
  const out = renderCelPane(result([sc("A", "pass"), sc("B", "fail")]), { A: "cA", B: "cB" }, { worklist: { enabled: true, statesByCaseId: { cA: "pass", cB: "fail" }, filter: new Set(["pass"]) } });
  assert.ok(out.anchors["cA"], "the pass case A is shown (anchor present)");
  assert.ok(!out.anchors["cB"], "the fail case B is filtered out (NO anchor registered for a hidden row)");
  assert.ok(/cel-name">A</.test(out.html) && !/cel-name">B</.test(out.html), "A visible, B hidden");
  assert.match(out.html, /data-worklist-filter="fail" aria-pressed="false"/, "the fail chip reads inactive");
});
check("#214 filter: ABSOLUTE row numbers stay stable — row 1 filtered out, row 2 still renders as '2.'", () => {
  const out = renderCelPane(result([sc("A", "pass"), sc("B", "fail")]), { A: "cA", B: "cB" }, { worklist: { enabled: true, statesByCaseId: { cA: "pass", cB: "fail" }, filter: new Set(["fail"]) } });
  assert.match(out.html, /cel-rownum">2\.</, "the surviving row keeps its ABSOLUTE scenario number (2.)");
  assert.ok(!/cel-rownum">1\.</.test(out.html), "row 1 (filtered) emits nothing");
});
check("#214 filter: empty filter (all off) → the 'no cases match' placeholder + the chips STAY interactive", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: true, statesByCaseId: { cA: "pass" }, filter: new Set() } });
  assert.match(out.html, /No cases match the verdict filter/, "the empty-filter placeholder");
  assert.match(out.html, /cel-filter-chips/, "the chips remain (else the user could never toggle one back on)");
  assert.ok(!out.anchors["cA"], "no rows rendered");
});
check("#214 filter: an unreviewable (unfrozen) case filters as to-do (shown only when 'unreviewed' active)", () => {
  const mk = (filter) => renderCelPane(result([sc("Unfrozen", "pass")]), {}, { worklist: { enabled: true, statesByCaseId: {}, filter } });
  assert.match(mk(new Set(["unreviewed"])).html, /cel-review-disabled/, "the unreviewable row shows when to-do is active");
  assert.ok(!/cel-review-disabled/.test(mk(new Set(["pass"])).html), "hidden when only pass active (it counts as to-do)");
});
check("#214 filter: cockpit (no worklist) render has NO chips — byte-unchanged", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" });
  assert.ok(!out.html.includes("cel-filter-chips"), "no chip row outside worklist mode");
});

check("worklist: an UNFROZEN case → DISABLED select, NO data-worklist-select, the freeze tooltip", () => {
  const out = renderCelPane(result([sc("Unfrozen", "pass")]), {}, { worklist: { enabled: true, statesByCaseId: {} } });
  assert.match(out.html, /class="cel-review cel-review-disabled" disabled/);
  assert.ok(!out.html.includes("data-worklist-select"), "unfrozen case carries no change key");
  assert.ok(out.html.includes("freeze this case to review it"), "freeze tooltip present");
  assert.deepEqual(out.worklistActions, {}, "no action for an unfrozen case");
});

check("worklist: an AMBIGUOUS-name case → DISABLED select + 'not reviewable', no change key", () => {
  const out = renderCelPane(
    result([sc("Dup", "fail")]),
    { Dup: "cFrozen" },
    { duplicateScenarioNames: new Set(["Dup"]), worklist: { enabled: true, statesByCaseId: { cFrozen: "pass" } } },
  );
  assert.match(out.html, /class="cel-review cel-review-disabled" disabled/);
  assert.ok(!out.html.includes("data-worklist-select"), "ambiguous case is not settable");
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

// ── notes: glyph + drawer (#156 notes) ──────────────────────────────────────────
const NOTE = (id, text, created = 1700000000000, edited) => (edited !== undefined ? { id, text, created, edited } : { id, text, created });
const wl = (extra) => ({ enabled: true, statesByCaseId: {}, ...extra });

check("formatNoteTimestamp: deterministic UTC YYYY-MM-DD HH:MM (no locale/timezone flakiness)", () => {
  assert.equal(formatNoteTimestamp(Date.UTC(2026, 6, 2, 9, 5)), "2026-07-02 09:05 UTC"); // month is 0-based → 6 = July
});

check("notes glyph: reviewable case with notes → 💬 + count + data-notes-toggle; none → 🗨 outline", () => {
  const withNotes = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ notesByCaseId: { cA: [NOTE("n1", "x"), NOTE("n2", "y")] } }) });
  assert.match(withNotes.html, /class="cel-notes-glyph cel-notes-has"[^>]*data-notes-toggle="wl_cA"[^>]*>💬 2</);
  const none = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({}) });
  assert.match(none.html, /class="cel-notes-glyph"[^>]*data-notes-toggle="wl_cA"[^>]*>🗨</);
  assert.ok(!none.html.includes("cel-notes-has"));
  // placement: the glyph sits immediately after the verdict <select>, before the status badge + name
  assert.match(withNotes.html, /<\/select>\s*<span class="cel-notes-glyph[^"]*"[^>]*>[^<]*<\/span>\s*<span class="cel-status"/);
});
check("worklist rows are numbered 1-based in order (every row); cockpit has no numbers", () => {
  const wlOut = renderCelPane(result([sc("A", "pass"), sc("Unfrozen", "fail"), sc("C", "pass")]), { A: "cA", C: "cC" }, { worklist: wl({}) });
  assert.match(wlOut.html, /<span class="cel-rownum">1\.<\/span>/);
  assert.match(wlOut.html, /<span class="cel-rownum">2\.<\/span>/, "unfrozen row is still numbered");
  assert.match(wlOut.html, /<span class="cel-rownum">3\.<\/span>/);
  const cockpit = renderCelPane(result([sc("A", "pass")]), { A: "cA" });
  assert.ok(!cockpit.html.includes("cel-rownum"), "cockpit render is unnumbered (byte-identical to before)");
});
check("notes glyph: an UNFROZEN case gets NO glyph (no stable caseId to key the thread)", () => {
  const out = renderCelPane(result([sc("Unfrozen", "pass")]), {}, { worklist: wl({}) });
  assert.ok(!out.html.includes("cel-notes-glyph"), "unfrozen row has no notes glyph");
});
check("notes drawer: absent unless openNotesCaseId matches a case", () => {
  const closed = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ notesByCaseId: { cA: [NOTE("n1", "x")] } }) });
  assert.ok(!closed.html.includes("cel-notes-drawer"), "no drawer when nothing is open");
  const open = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ openNotesCaseId: "cA", notesByCaseId: { cA: [NOTE("n1", "x")] } }) });
  assert.match(open.html, /class="cel-notes-drawer" data-notes-drawer/);
});
check("notes drawer: renders the thread (text + timestamp) + Edit/Delete + an add row with Send", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ openNotesCaseId: "cA", notesByCaseId: { cA: [NOTE("n1", "first note", Date.UTC(2026, 0, 3, 8, 30))] } }) });
  assert.match(out.html, /<div class="cel-note-text">first note<\/div>/);
  assert.match(out.html, /2026-01-03 08:30 UTC/);
  assert.match(out.html, /data-note-edit="n1">Edit</);
  assert.match(out.html, /data-note-delete="n1">Delete</);
  assert.match(out.html, /data-note-add="wl_cA">Send</);
  assert.match(out.html, /data-note-draft="add:wl_cA"/);
});
check("notes drawer: an edited note shows the edited stamp", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ openNotesCaseId: "cA", notesByCaseId: { cA: [NOTE("n1", "t", Date.UTC(2026, 0, 1, 0, 0), Date.UTC(2026, 0, 2, 0, 0))] } }) });
  assert.match(out.html, /edited 2026-01-02 00:00 UTC/);
});
check("notes drawer: editingNoteId renders THAT note as a prefilled textarea + Save/Cancel (edit-in-place)", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ openNotesCaseId: "cA", editingNoteId: "n1", notesByCaseId: { cA: [NOTE("n1", "editable"), NOTE("n2", "plain")] } }) });
  assert.match(out.html, /class="cel-note cel-note-editing"[\s\S]*data-note-draft="edit:n1"[^>]*>editable<\/textarea>/);
  assert.match(out.html, /data-note-save="n1">Save</);
  assert.match(out.html, /data-note-cancel="1">Cancel</);
  assert.match(out.html, /<div class="cel-note-text">plain<\/div>/, "the OTHER note stays in read mode");
});
check("notes drawer: open with NO notes → 'No notes yet.' + the add row (glyph flips to outline)", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: wl({ openNotesCaseId: "cA" }) });
  assert.match(out.html, /class="cel-note-empty">No notes yet\./);
  assert.match(out.html, /data-note-add="wl_cA"/);
  assert.match(out.html, /class="cel-notes-glyph cel-notes-open"/, "glyph shows open (outline, no count)");
});
check("notes drawer XSS: note text, the edit-textarea prefill, and the case name are all escaped", () => {
  const out = renderCelPane(result([sc("<img src=x>", "pass")]), { "<img src=x>": "cA" }, { worklist: wl({ openNotesCaseId: "cA", editingNoteId: "n1", notesByCaseId: { cA: [NOTE("n1", "</textarea><script>alert(1)</script>")] } }) });
  assert.ok(out.html.includes("&lt;/textarea&gt;&lt;script&gt;"), "textarea prefill escaped (no breakout)");
  assert.ok(!out.html.includes("</textarea><script>"), "no raw script breakout");
  assert.ok(out.html.includes("Notes — &lt;img src=x&gt;"), "case name escaped in the drawer header");
});
check("notes: worklist ABSENT (cockpit) → no glyph, no drawer even if notes passed", () => {
  const out = renderCelPane(result([sc("A", "pass")]), { A: "cA" }, { worklist: { enabled: false, statesByCaseId: {}, openNotesCaseId: "cA", notesByCaseId: { cA: [NOTE("n1", "x")] } } });
  assert.ok(!out.html.includes("cel-notes-glyph") && !out.html.includes("cel-notes-drawer"), "cockpit render unaffected");
});

console.log(`\ncelPaneHtml.test: ${pass} checks passed`);
