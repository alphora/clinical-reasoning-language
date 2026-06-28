// Unit tests for the QUESTIONNAIRE pane RENDERER (#177 slice 3). Like questionnaireModel.test.mjs we write a tiny
// CRL+CEL project to a temp dir, run `renderScenario` in-process to get a REAL `ScenarioViewModel`, then assert the
// `renderQuestionnairePane` HTML projection (questions/answers/outcome/terminal-message + the placeholder + data-q
// anchors). esbuild bundles the extension TS to CJS (vscode-free). Design authority:
// .vibe-tools/discussions/163-questionnaire-panel-design.md ("Pane registration surface" / "Selection-scoped render").
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCelImports, renderScenario } from "@smile-digital-health/crl";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({ entryPoints: [resolve(here, tsFile)], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
  return require(out);
}

const { renderQuestionnairePane, QUESTIONNAIRE_STYLE, shouldRerenderQuestionnaire } = await load("questionnairePaneHtml.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// Write a CRL+CEL project to a fresh temp dir and render the named case → its ScenarioViewModel + decision lib.
function renderCase(files, celName, caseName) {
  const root = mkdtempSync(join(tmpdir(), "qph-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "qph-fixture", version: "1.0.0", private: true }));
  for (const [name, contents] of Object.entries(files)) {
    const full = join(root, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  const result = renderScenario(resolveCelImports(join(root, celName)), { case: caseName });
  assert.ok(result.scenarios.length > 0, `render produced a scenario (errors: ${JSON.stringify(result.errors)})`);
  const sv = result.scenarios.find((s) => s.case.name === caseName) ?? result.scenarios[0];
  assert.ok(sv, `case "${caseName}" rendered`);
  return { sv, rootLib: sv.decision?.libraryName };
}

const booleanResolver = () => ["boolean"];

// ── 0. placeholder when no focused case ──
check("no focused case (undefined sv) → 'Select a scenario' placeholder, empty anchors/reveals", () => {
  const r = renderQuestionnairePane(undefined, booleanResolver, undefined, { revealPrefix: "g1_" });
  assert.match(r.html, /placeholder/);
  assert.match(r.html, /Select a scenario/i);
  assert.deepEqual(r.anchors, {});
  assert.deepEqual(r.reveals, {});
});

// ── 1. PASS path: a fall-through (false X "no" then Y "yes") → ordered questions, answers highlighted, outcome ──
check("PASS fall-through → ordered 'Is X? No' + 'Is Y? Yes', answer highlighted, outcome = the produced activity", () => {
  const crl = `# N
library "FallThrough".
concept "X":
- type is Condition.
- code is \`x\`.
concept "Y":
- type is Condition.
- code is \`y\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "FallThrough":
first:
- when "X" then recommend activity "Deny".
- when "Y" then recommend activity "Approve".`;
  const cel = `# C
library "FallCases".
covers "FallThrough".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fY":
- code is "http://example.org|y".
- date is "2026-01-01".
- defined by "Y".
case "X absent, Y holds → Approve":
- subject is "Pat".
- fact is "fY".
- result is "FallThrough" is "Approve".`;
  const { sv, rootLib } = renderCase({ "n.crl": crl, "n.cel": cel }, "n.cel", "X absent, Y holds → Approve");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  // Two questions, in order, each "Is <concept>?".
  const items = [...r.html.matchAll(/<li class="q-item"[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(items.length, 2, "two questions");
  assert.match(items[0], /Is <span class="q-concept">X<\/span>\?/, "first question is Is X?");
  assert.match(items[1], /Is <span class="q-concept">Y<\/span>\?/, "second question is Is Y?");
  // X answered No → the "No" option is the q-opt-answer; Y answered Yes → the "Yes" option is.
  assert.match(items[0], /<span class="q-opt q-opt-answer">No<\/span>/, "X's answer No is highlighted");
  assert.match(items[0], /<span class="q-opt">Yes<\/span>/, "X's Yes shown un-highlighted");
  assert.match(items[1], /<span class="q-opt q-opt-answer">Yes<\/span>/, "Y's answer Yes is highlighted");
  // Outcome line names the produced activity.
  assert.match(r.html, /class="q-outcome"[^>]*>.*Approve/s, "outcome names Approve");
});

// ── 2. data-q anchors: one per question, keyed by the runtime nodeId; anchors map keyed by nodeId → the <li> id ──
check("data-q anchors: each <li> carries data-q=<nodeId>; anchors keyed by nodeId → the generated <li> id", () => {
  const crl = `# P
library "Nest".
concept "A":
- type is Condition.
- code is \`a\`.
concept "B":
- type is Condition.
- code is \`b\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Nest":
- when "A" then:
  - when "B" then recommend activity "Approve".
  end.`;
  const cel = `# C
library "NestCases".
covers "Nest".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
fact "fB":
- code is "http://example.org|b".
- date is "2026-01-01".
- defined by "B".
case "both hold":
- subject is "Pat".
- fact is "fA".
- fact is "fB".
- result is "Nest" is "Approve".`;
  const { sv, rootLib } = renderCase({ "p.crl": crl, "p.cel": cel }, "p.cel", "both hold");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g7_" });
  const dataQs = [...r.html.matchAll(/data-q="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(dataQs.length, 2, "one data-q per question");
  // Every data-q nodeId is a key in anchors, and its anchor id matches the <li> id (the gen-prefixed counter).
  for (const nodeId of dataQs) {
    const a = r.anchors[nodeId];
    assert.ok(a, `anchor for nodeId ${nodeId}`);
    assert.match(a.scrollTo, /^g7_q\d+$/, "anchor id is a gen-prefixed counter");
    assert.deepEqual(a.segmentIds, [a.scrollTo]);
    assert.ok(r.html.includes(`id="${a.scrollTo}" data-q="${nodeId}"`), "the <li> id matches the anchor id");
  }
  assert.deepEqual(Object.keys(r.anchors).sort(), [...dataQs].sort(), "anchors keyed exactly by the question nodeIds");
  assert.deepEqual(r.reveals, {}, "no engine reveals (read-only pane)");
});

// ── 3. non-boolean question → a value-type label, options still Yes/No ──
check("non-boolean concept → a subtle value-type label rendered; options still Yes/No", () => {
  const crl = `# Q
library "Quant".
concept "A":
- type is Observation.
- value type is Quantity.
- code is \`a\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Quant":
- when "A" then recommend activity "Approve".`;
  const cel = `# C
library "QuantCases".
covers "Quant".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fA":
- code is "http://example.org|a".
- date is "2026-01-01".
- defined by "A".
case "a holds":
- subject is "Pat".
- fact is "fA".
- result is "Quant" is "Approve".`;
  const { sv, rootLib } = renderCase({ "q.crl": crl, "q.cel": cel }, "q.cel", "a holds");
  // The shell would build resolveValueTypes off conceptByKey; here a stub returns Quantity for A.
  const r = renderQuestionnairePane(sv, () => ["Quantity"], rootLib, { revealPrefix: "g1_" });
  assert.match(r.html, /<span class="q-type"[^>]*>Quantity<\/span>/, "value-type label shown for the non-boolean question");
  assert.match(r.html, /<span class="q-opt[^"]*">Yes<\/span>/, "Yes option still present");
  assert.match(r.html, /<span class="q-opt[^"]*">No<\/span>/, "No option still present");
});

// ── 4. blocked terminal: no otherwise, only when false → 'Blocked (no determination)' message, no outcome line ──
check("blocked terminal (no production, no guard) → blocked message, no q-outcome", () => {
  const crl = `# B2
library "Gap".
concept "Dx":
- type is Condition.
- code is \`dx\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Gap":
- when "Dx" then recommend activity "Approve".`;
  const cel = `# C
library "GapCases".
covers "Gap".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
case "Dx absent → nothing produced":
- subject is "Pat".
- result is "Gap" is "Approve".`;
  const { sv, rootLib } = renderCase({ "b2.crl": crl, "b2.cel": cel }, "b2.cel", "Dx absent → nothing produced");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  assert.match(r.html, /Blocked \(no determination\)/, "blocked message");
  assert.ok(!/class="q-outcome"/.test(r.html), "no outcome line when blocked");
  // The false Dx when is still rendered as a 'no' question above the blocked message.
  assert.match(r.html, /Is <span class="q-concept">Dx<\/span>\?/, "the false Dx when is on the path");
});

// ── 5. blocked-guard terminal → the guard question is the last item + a blocked note ──
check("blocked-guard → the guard concept is the last question + a blocked note", () => {
  const crl = `# B
library "Block".
concept "Dx":
- type is Condition.
- code is \`dx\`.
concept "Contra":
- type is Condition.
- code is \`contra\`.
activity "Med":
- request CPGMedicationRequest.
- with \`m\`.
activity "Med2":
- request CPGMedicationRequest.
- with \`m2\`.
decision "Block":
- when "Dx" then:
  any:
  - recommend activity "Med" unless "Contra".
  - recommend activity "Med2" unless "Contra".
  end.`;
  const cel = `# C
library "BlockCases".
covers "Block".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fDx":
- code is "http://example.org|dx".
- date is "2026-01-01".
- defined by "Dx".
fact "fContra":
- code is "http://example.org|contra".
- date is "2026-01-01".
- defined by "Contra".
case "whole menu guarded out → blocked":
- subject is "Pat".
- fact is "fDx".
- fact is "fContra".
- result is "Block" is "Med".`;
  const { sv, rootLib } = renderCase({ "b.crl": crl, "b.cel": cel }, "b.cel", "whole menu guarded out → blocked");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  const items = [...r.html.matchAll(/<li class="q-item"[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
  assert.ok(items.length >= 2, "Dx then the guard terminal");
  assert.match(items[items.length - 1], /Is <span class="q-concept">Contra<\/span>\?/, "the last question is the guard Contra");
  assert.match(r.html, /Blocked \(no determination\)/, "a blocked note accompanies the guard terminal");
});

// ── 6. error terminal → 'unavailable' message, no questions ──
check("error terminal → 'unavailable' message, no questions", () => {
  const crlA = `# A
library "A".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Main":
- when "P" then:
  - use decision "B"."Sub".
  end.`;
  const crlB = `# B
library "B".
concept "P":
- type is Condition.
- code is \`p\`.
decision "Sub":
- when "P" then:
  - use decision "A"."Main".
  end.`;
  const cel = `# C
library "CycCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fPa":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "P".
fact "fPb":
- code is "http://example.org|p".
- date is "2026-01-01".
- defined by "B"."P".
case "cycle":
- subject is "Pat".
- fact is "fPa".
- fact is "fPb".
- result is "Main" is "Sub".`;
  const { sv, rootLib } = renderCase({ "a.crl": crlA, "b.crl": crlB, "c.cel": cel }, "c.cel", "cycle");
  assert.equal(sv.status, "error", "the delegation cycle yields status error");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  assert.match(r.html, /unavailable/i, "an unavailable message is shown");
  assert.ok(!/<li class="q-item"/.test(r.html), "no questions on an error");
});

// ── 7. CSP discipline: no inline style= / <style> in the payload; QUESTIONNAIRE_STYLE carries var() + fallbacks ──
check("CSP: no inline style=/<style> in the payload; QUESTIONNAIRE_STYLE uses var(--vscode-*, fallback) pairs", () => {
  const r = renderQuestionnairePane(undefined, booleanResolver, undefined);
  assert.ok(!/<style/.test(r.html), "no <style> element");
  assert.ok(!/ style=/.test(r.html), "no inline style= attribute");
  assert.ok(/var\(--vscode-[\w-]+,(#|rgba)/.test(QUESTIONNAIRE_STYLE), "QUESTIONNAIRE_STYLE uses var() + fallbacks");
  assert.ok(/\.q-item\.this-node\{/.test(QUESTIONNAIRE_STYLE), "the slice-4 .this-node self-highlight class is declared");
});

// ── #177 slice 4: the .this-node marker is NON-OUTLINE (a bar/wash) so it coexists with .q-opt-answer + any future .current ──
check("slice 4: .q-item.this-node is NON-OUTLINE (box-shadow bar / background), coexisting with .q-opt-answer's find-match fill", () => {
  const rule = QUESTIONNAIRE_STYLE.match(/\.q-item\.this-node\{([^}]*)\}/);
  assert.ok(rule, ".q-item.this-node rule present");
  assert.ok(!/outline/.test(rule[1]), "this-node does NOT use outline (won't fight a row .current outline)");
  assert.match(rule[1], /box-shadow:|background/, "this-node marks via a box-shadow bar and/or background wash");
  // .q-opt-answer (the case's answer highlight) is on a DIFFERENT element (the option span), so the two never collide; sanity-lock it exists.
  assert.ok(/\.q-opt-answer\{/.test(QUESTIONNAIRE_STYLE), "the case-answer highlight class still exists");
});

// ── #177 slice 4: renderQuestionnairePane returns the ordered question nodeIds (the host's focused-question key) ──
check("slice 4: questionNodeIds is the ordered question runtime nodeIds, matching the data-q attrs and the anchors keys", () => {
  const crl = `# N
library "FallThrough".
concept "X":
- type is Condition.
- code is \`x\`.
concept "Y":
- type is Condition.
- code is \`y\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`no\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "FallThrough":
first:
- when "X" then recommend activity "Deny".
- when "Y" then recommend activity "Approve".`;
  const cel = `# C
library "FallCases".
covers "FallThrough".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fY":
- code is "http://example.org|y".
- date is "2026-01-01".
- defined by "Y".
case "X absent, Y holds → Approve":
- subject is "Pat".
- fact is "fY".
- result is "FallThrough" is "Approve".`;
  const { sv, rootLib } = renderCase({ "n.crl": crl, "n.cel": cel }, "n.cel", "X absent, Y holds → Approve");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  const dataQs = [...r.html.matchAll(/data-q="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(r.questionNodeIds, dataQs, "questionNodeIds is in display order, 1:1 with the rendered data-q attrs");
  // The host resolves the FOCUSED question as questionNodeIds[currentQuestionIndex]; index 0 (the slice-4 scope) →
  // question[0]'s nodeId, whose anchor (keyed by nodeId) yields the <li> segment the marker targets.
  const focused = r.questionNodeIds[0];
  assert.ok(r.anchors[focused], "question[0]'s nodeId has an anchor (the marker's questionnaire-pane segment)");
  assert.deepEqual(r.anchors[focused].segmentIds, [r.anchors[focused].scrollTo], "the focused li id is the segment to mark");
});

check("slice 4: no focused case → questionNodeIds is empty (driveThisNode clears all panes)", () => {
  const r = renderQuestionnairePane(undefined, booleanResolver, undefined);
  assert.deepEqual(r.questionNodeIds, [], "no case → no question nodeIds");
});

// ── 8. XSS: a malicious concept/case name is escaped ──
check("XSS: a malicious concept name is escaped in the question", () => {
  const crl = `# E
library "Evil".
concept "X<script>":
- type is Condition.
- code is \`x\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Evil":
- when "X<script>" then recommend activity "Approve".`;
  const cel = `# C
library "EvilCases".
covers "Evil".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fX":
- code is "http://example.org|x".
- date is "2026-01-01".
- defined by "X<script>".
case "x holds":
- subject is "Pat".
- fact is "fX".
- result is "Evil" is "Approve".`;
  const { sv, rootLib } = renderCase({ "e.crl": crl, "e.cel": cel }, "e.cel", "x holds");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  assert.ok(!/<script>/.test(r.html), "no raw <script>");
  assert.match(r.html, /&lt;script&gt;/, "the concept name is escaped");
});

// ── FIX 4: cross-library expanded use-decision whose sub `when` shares a concept NAME with the root lib → every
//      question nodeId (the data-q attr + the anchors key) must be UNIQUE across frames (caller-inlined runtime ids). ──
check("cross-lib use-decision (same-name sub when) → every question nodeId/data-q is UNIQUE (no anchor overwrite)", () => {
  const crlA = `# A
library "A".
concept "RA":
- type is Condition.
- code is \`ra\`.
concept "Shared":
- type is Condition.
- code is \`shared-a\`.
decision "Root":
- when "RA" then:
  - use decision "B"."Sub".
  end.`;
  const crlB = `# B
library "B".
concept "Shared":
- type is Condition.
- code is \`shared-b\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`ok\`.
decision "Sub":
- when "Shared" then recommend activity "Approve".`;
  const cel = `# C
library "XCases".
covers "A".
fact "Pat":
- name is "Pat".
- birth date is "1970-01-01".
- defined by "Patient".
fact "fRA":
- code is "http://example.org|ra".
- date is "2026-01-01".
- defined by "RA".
fact "fSharedB":
- code is "http://example.org|shared-b".
- date is "2026-01-01".
- defined by "B"."Shared".
case "cross-lib delegated":
- subject is "Pat".
- fact is "fRA".
- fact is "fSharedB".
- result is "Root" is "Approve".`;
  const { sv, rootLib } = renderCase({ "a.crl": crlA, "b.crl": crlB, "x.cel": cel }, "x.cel", "cross-lib delegated");
  const r = renderQuestionnairePane(sv, booleanResolver, rootLib, { revealPrefix: "g1_" });
  const dataQs = [...r.html.matchAll(/data-q="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(dataQs.length, 2, "RA (root frame) + Shared (sub frame) → two questions");
  assert.equal(new Set(dataQs).size, dataQs.length, "every question nodeId is UNIQUE across frames (no collision)");
  // The anchors map is keyed by nodeId, so a collision would silently MERGE two questions to one entry — assert 1:1.
  assert.equal(Object.keys(r.anchors).length, dataQs.length, "one anchor per question (no nodeId overwrite)");
  assert.deepEqual(Object.keys(r.anchors).sort(), [...dataQs].sort(), "anchors keyed exactly by the (unique) nodeIds");
});

// ── FIX 2: the pure selection-scoped re-render predicate (the cockpit's untested hook lives here as a tested helper) ──
check("shouldRerenderQuestionnaire: locks same-selection-no-op / case-change-render / cockpit-inert / closed-pane", () => {
  const f = shouldRerenderQuestionnaire;
  assert.equal(f({ prevCaseId: "c1", nextCaseId: "c1", mode: "medical-validation", paneOpen: true }), false, "same caseId → no re-render (no index reset on a redispatch)");
  assert.equal(f({ prevCaseId: "c1", nextCaseId: "c2", mode: "medical-validation", paneOpen: true }), true, "a real case change → re-render");
  assert.equal(f({ prevCaseId: undefined, nextCaseId: "c1", mode: "medical-validation", paneOpen: true }), true, "first selection (undefined → c1) → re-render");
  assert.equal(f({ prevCaseId: "c1", nextCaseId: undefined, mode: "medical-validation", paneOpen: true }), true, "cleared selection (c1 → undefined) → re-render to placeholder");
  assert.equal(f({ prevCaseId: "c1", nextCaseId: "c2", mode: "cockpit", paneOpen: true }), false, "cockpit mode is inert");
  assert.equal(f({ prevCaseId: "c1", nextCaseId: "c2", mode: "medical-validation", paneOpen: false }), false, "pane closed → no re-render");
});

console.log(`\nquestionnairePaneHtml.test.mjs: ${pass} checks passed.`);
