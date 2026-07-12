// String-level regression tests for the cockpit/MV webview SCRIPT BODY (#156 slice 5, FIX 2 from the gpt55 impl review).
// The slice's CENTRAL invariant — the Medical Validation done/error overlay SURVIVES selection changes — was previously
// only comment/code-protected. Here we lock it against the exported COCKPIT_WEBVIEW_SCRIPT string.
//
// correspondenceCockpit.ts imports `vscode` (unavailable under plain node), so — unlike the other vscode-free renderers —
// we esbuild-bundle it with a tiny plugin that resolves `vscode` to an EMPTY stub. The module's top level only runs imports
// + const/function definitions (no side effects), so the stub suffices to evaluate COCKPIT_WEBVIEW_SCRIPT (a pure string).
import { build } from "esbuild";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// The cockpit SHELL source text — for the HOST-side lifecycle wiring that lives outside the bundled webview SCRIPT string
// (the ack-drive of the marker is host code, not in COCKPIT_WEBVIEW_SCRIPT). A coarse but load-bearing source-grep lock.
const COCKPIT_SRC = readFileSync(resolve(here, "correspondenceCockpit.ts"), "utf8");
const ENGINE_SRC = readFileSync(resolve(here, "correspondenceEngine.ts"), "utf8");

// esbuild plugin: resolve `vscode` to an empty CJS module (the cockpit never touches vscode at import time).
const stubVscode = {
  name: "stub-vscode",
  setup(b) {
    b.onResolve({ filter: /^vscode$/ }, () => ({ path: "vscode", namespace: "stub" }));
    // Only ONE top-level vscode access exists (ORDERED_COLUMNS reads vscode.ViewColumn.*); stub just that enum. Everything
    // else under vscode.* is inside functions never called here, so an otherwise-empty module evaluates fine.
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "module.exports = { ViewColumn: { One: 1, Two: 2, Three: 3, Four: 4, Active: -1 } };",
      loader: "js",
    }));
  },
};

async function loadCockpit() {
  const out = resolve(tmpdir(), `crl-cockpit-script-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, "correspondenceCockpit.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
    plugins: [stubVscode],
  });
  return require(out);
}

const { COCKPIT_WEBVIEW_SCRIPT: SCRIPT, leafMarkBuckets, leafBucketsFromQuestionnaire, resolveProducedLeafKeys, shouldWidenFilterForSelection, caseIdsForNodeThroughLit } = await loadCockpit();

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// Helper: extract a single message handler body `else if(m.type==='<type>'){...}` (or the leading `if(...)` for render).
// The script is one big concatenation; each handler is delimited by the next `else if(m.type===` / `}});`.
function handlerBody(type) {
  const re = new RegExp(`(?:else )?if\\(m\\.type==='${type}'\\)\\{`);
  const m = SCRIPT.match(re);
  assert.ok(m, `handler for ${type} exists`);
  const start = m.index + m[0].length;
  // Walk braces from the opening { to its match.
  let depth = 1, i = start;
  for (; i < SCRIPT.length && depth > 0; i++) {
    if (SCRIPT[i] === "{") depth++;
    else if (SCRIPT[i] === "}") depth--;
  }
  return SCRIPT.slice(start, i - 1);
}

// Extract the root 'click' listener body (brace-matched) — the delegated handler where the note controls live.
function handlerClick() {
  const marker = "root.addEventListener('click',(e)=>{";
  const start = SCRIPT.indexOf(marker);
  assert.ok(start > -1, "root click listener exists");
  let depth = 1, i = start + marker.length;
  for (; i < SCRIPT.length && depth > 0; i++) {
    if (SCRIPT[i] === "{") depth++;
    else if (SCRIPT[i] === "}") depth--;
  }
  return SCRIPT.slice(start + marker.length, i - 1);
}

// disc 179: the shell-local `PANES` array (correspondenceCockpit.ts) is a SILENT-FAILURE list — a bare `Pane[]`, NOT
// compiler-forced to be exhaustive. Omitting a pane (as happened for `worklist` in the split) leaves that pane un-rendered
// with no error. Lock it to the engine's `Pane` union so the two can't drift.
check("DRIFT GUARD: the shell PANES list contains every engine `Pane` union member", () => {
  const uni = ENGINE_SRC.match(/export type Pane =([^;]+);/);
  assert.ok(uni, "engine Pane union found");
  const enginePanes = [...uni[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(enginePanes.length >= 6 && enginePanes.includes("worklist"), `parsed engine panes: ${enginePanes}`);
  const shell = COCKPIT_SRC.match(/const PANES: Pane\[\] = \[([^\]]+)\]/);
  assert.ok(shell, "shell PANES array found");
  const shellPanes = [...shell[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  for (const p of enginePanes) assert.ok(shellPanes.includes(p), `shell PANES is missing engine pane "${p}" (silent-render bug)`);
});

check("sanity: the review-overlay handlers + clrRO exist in the extracted script", () => {
  assert.match(SCRIPT, /const clrRO=\(\)=>\{/, "clrRO is defined");
  assert.match(SCRIPT, /if\(m\.type==='markReviewOverlay'\)/, "markReviewOverlay handler");
  assert.match(SCRIPT, /if\(m\.type==='clearReviewOverlay'\)/, "clearReviewOverlay handler");
});

// ── THE survives-selection invariant (FIX 2a) ──
check("SURVIVES-SELECTION: the highlight handler does NOT call clrRO (selection never clears the review overlay)", () => {
  const body = handlerBody("highlight");
  assert.ok(/clrFC\(\)/.test(body), "highlight DOES clear the failed-criterion channel (sanity — clrFC present)");
  assert.ok(!/clrRO\(\)/.test(body), "highlight MUST NOT call clrRO — the review overlay survives a new selection");
  assert.ok(!/review-pass|review-fail|review-pending|error-node|leaf-allpass/.test(body), "highlight MUST NOT touch the review classes at all");
});

check("SURVIVES-SELECTION: the clearHighlight handler does NOT call clrRO (clearing the selection keeps the review overlay)", () => {
  const body = handlerBody("clearHighlight");
  assert.ok(/clrFC\(\)/.test(body), "clearHighlight DOES clear the failed-criterion channel (sanity)");
  assert.ok(!/clrRO\(\)/.test(body), "clearHighlight MUST NOT call clrRO — review overlay survives a selection clear");
  assert.ok(!/review-pass|review-fail|review-pending|error-node|leaf-allpass/.test(body), "clearHighlight MUST NOT touch the review classes");
});

check("SURVIVES-SELECTION: clrFC strips ONLY the failed-criterion classes, never the review classes", () => {
  const m = SCRIPT.match(/const clrFC=\(\)=>\{[^}]*\}[^;]*\};/);
  assert.ok(m, "clrFC body");
  assert.ok(!/review-pass|review-fail|review-pending|error-node|leaf-allpass/.test(m[0]), "clrFC never removes the review classes");
});

check("the failed-criterion handlers (markFailedCriteria/clearFailedCriteria) do NOT touch the review classes either", () => {
  for (const type of ["markFailedCriteria", "clearFailedCriteria"]) {
    const body = handlerBody(type);
    assert.ok(!/clrRO\(\)|review-pass|review-fail|review-pending|error-node|leaf-allpass/.test(body), `${type} MUST NOT touch the review overlay (independent channel)`);
  }
});

// ── #210 verdict painting: disjoint per-color sets + error-over-pass ──
check("VERDICT-PAINTING: markReviewOverlay applies ONE class per disjoint verdict set (pass/fail/pending), error-over-pass", () => {
  const body = handlerBody("markReviewOverlay");
  assert.ok(/clrRO\(\)/.test(body), "mark clears the prior overlay first (clear-then-set)");
  assert.ok(/const errSet=new Set\(m\.error\|\|\[\]\)/.test(body), "builds the error id set");
  assert.ok(/errSet[\s\S]*add\('error-node'\)/.test(body), "error ids → .error-node");
  // error-over-pass: in the pass loop, ids present in errSet are skipped (continue) BEFORE adding review-pass.
  assert.ok(/errSet\.has\(id\)\)continue;[\s\S]*add\('review-pass'\)/.test(body), "pass loop skips ids in errSet (error-over-pass)");
  // fail + pending are painted unconditionally from their own (disjoint) sets — no cross-set skipping needed.
  assert.ok(/m\.fail\|\|\[\][\s\S]*add\('review-fail'\)/.test(body), "fail ids → .review-fail");
  assert.ok(/m\.pending\|\|\[\][\s\S]*add\('review-pending'\)/.test(body), "pending ids → .review-pending");
  // #210 all-pass ✓ badge: the 5th set toggles .leaf-allpass; clrRO strips it (gen-guarded clear-then-set like the rest).
  assert.ok(/m\.allPassLeaves\|\|\[\][\s\S]*add\('leaf-allpass'\)/.test(body), "allPassLeaves ids → .leaf-allpass");
  assert.ok(/const clrRO=\(\)=>\{[^}]*leaf-allpass/.test(SCRIPT), "clrRO strips .leaf-allpass too (no stale badge after a verdict change)");
});

check("#210 recolor: the worklist verdict dropdown (.cel-review-*) uses the SAME tokens the tree paint locks to (no drift)", () => {
  // The operator's ask: the tree verdict paint MATCHES the dropdown colors. flowPaneHtml.test.mjs locks the TREE fills to
  // these tokens; here we lock the DROPDOWN side to the same named tokens, so a drift on EITHER side fails a test.
  assert.match(COCKPIT_SRC, /\.cel-review-pass\{color:var\(--vscode-testing-iconPassed/, "dropdown pass = testing-iconPassed (matches the tree's review-pass)");
  assert.match(COCKPIT_SRC, /\.cel-review-fail\{color:var\(--vscode-testing-iconFailed/, "dropdown fail = testing-iconFailed (matches the tree's review-fail)");
  assert.match(COCKPIT_SRC, /\.cel-review-pending\{color:var\(--vscode-charts-yellow/, "dropdown pending = charts-yellow (matches the tree's review-pending)");
});

check("GEN-GUARD: markReviewOverlay drops a mark aimed at a superseded render (m.gen!==gen → return)", () => {
  const body = handlerBody("markReviewOverlay");
  assert.ok(/if\(m\.gen!==gen\)return;/.test(body), "mark is gen-guarded like the other channels");
});

// ── #177 slice 4: the "this node" marker channel + its SURVIVES-REVEAL invariant ──
check("sanity: the this-node handlers + clrTN exist in the extracted script", () => {
  assert.match(SCRIPT, /const clrTN=\(\)=>\{/, "clrTN is defined");
  assert.match(SCRIPT, /if\(m\.type==='markThisNode'\)/, "markThisNode handler");
  assert.match(SCRIPT, /if\(m\.type==='clearThisNode'\)/, "clearThisNode handler");
});

check("SURVIVES-REVEAL: clrTN is called ONLY by mark/clearThisNode, NEVER by highlight/clearHighlight (the marker survives a cockpit reveal)", () => {
  // The central slice-4 invariant (mirrors the slice-5 .done-node survives-selection test): the marker tracks the focused
  // QUESTION, not the selection, so the selection channel must not touch it. Assert the two selection handlers never call
  // clrTN nor touch .this-node, and that the ONLY clrTN call sites are the two this-node handlers.
  for (const type of ["highlight", "clearHighlight"]) {
    const body = handlerBody(type);
    assert.ok(!/clrTN\(\)/.test(body), `${type} MUST NOT call clrTN — the this-node marker survives a reveal`);
    assert.ok(!/this-node/.test(body), `${type} MUST NOT touch the .this-node class at all`);
  }
  // The failed-criterion + review-overlay handlers must not touch it either (independent channels).
  for (const type of ["markFailedCriteria", "clearFailedCriteria", "markReviewOverlay", "clearReviewOverlay"]) {
    const body = handlerBody(type);
    assert.ok(!/clrTN\(\)|this-node/.test(body), `${type} MUST NOT touch the this-node marker (independent channel)`);
  }
  // Exactly two clrTN() call sites, both inside the this-node handlers (clear-then-mark + the explicit clear).
  const callSites = (SCRIPT.match(/clrTN\(\)/g) || []).length;
  assert.equal(callSites, 2, "clrTN is called exactly twice — once in markThisNode (clear-then-set), once in clearThisNode");
  assert.ok(/clrFC\(\)/.test(handlerBody("markThisNode")) === false, "markThisNode does not touch the failed-criterion channel");
});

check("the this-node marker clears ONLY the .this-node class, never the selection/failed-criterion/review classes", () => {
  const m = SCRIPT.match(/const clrTN=\(\)=>\{[^}]*\};/);
  assert.ok(m, "clrTN body");
  assert.ok(!/current|failed-criterion|review-pass|review-fail|review-pending|error-node|leaf-allpass/.test(m[0]), "clrTN strips only .this-node");
});

check("GEN-GUARD: markThisNode drops a mark aimed at a superseded render (m.gen!==gen → return); clearThisNode is ungated", () => {
  const mark = handlerBody("markThisNode");
  assert.ok(/if\(m\.gen!==gen\)return;/.test(mark), "markThisNode is gen-guarded like the other channels");
  assert.ok(/clrTN\(\);/.test(mark), "markThisNode clears the prior marker first (clear-then-set)");
  assert.ok(/add\('this-node'\)/.test(mark), "markThisNode adds .this-node for each segment id");
  const clear = handlerBody("clearThisNode");
  assert.ok(!/m\.gen!==gen/.test(clear), "clearThisNode is ungated (a class-strip is always safe)");
});

// ── #177 slice 4 FIX 3(b): the HOST ack-drive lifecycle (the pane-ack re-drive is the survives-reveal GUARANTEE) ──
check("HOST: the pane-ack (`ready`) handler drives the marker (driveThisNode), and the marker is NEVER cleared by the selection path", () => {
  // The marker's correctness rests on a re-drive when a marker-bearing pane re-renders (its `ready` ack). Assert the host
  // source wires driveThisNode into the ack handler AND does NOT wire any marker-clear into the selection-reveal path
  // (highlight/clearHighlight/clearAllHighlights), the host counterpart to the script-string survives-reveal lock above.
  // The `ready`/ack handler is the `msg.type === "ready"` block; it must reference driveThisNode for the marker-bearing panes.
  assert.ok(/msg\.type === "ready"/.test(COCKPIT_SRC), "the ack handler exists");
  assert.ok(
    /pane === "tree" \|\| pane === "crl" \|\| pane === "source" \|\| pane === "questionnaire"\)\s*\{\s*driveThisNode\(\);/.test(COCKPIT_SRC),
    "the ack handler re-drives driveThisNode for the marker-bearing panes (the survives-reveal guarantee)",
  );
  // driveThisNode/clearAllThisNode must NOT be wired into the selection-reveal helpers (host survives-reveal invariant).
  for (const fn of ["clearHighlight", "clearAllHighlights", "highlightRows"]) {
    // crude: the helper bodies must not call driveThisNode/clearAllThisNode. We check they aren't adjacent in those defs.
    const m = COCKPIT_SRC.match(new RegExp(`function ${fn}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`));
    if (m) assert.ok(!/driveThisNode\(|clearAllThisNode\(/.test(m[1]), `${fn} must not drive/clear the this-node marker (survives a reveal)`);
  }
});

// ── #177 slice 5: the questionnaire prev/next sub-nav round-trip (webview→host→index→re-render+re-drive) ──
check("WEBVIEW: a [data-qnav] click posts {type:'questionNav', dir}, guarded on the button NOT being disabled", () => {
  // The questionnaire nav renders INTO #root, so it shares the root click delegation. Assert the script intercepts a
  // [data-qnav] button (before the [data-reveal] fall-through), guards on .disabled, and posts the opaque direction.
  assert.match(SCRIPT, /closest\('\[data-qnav\]'\)/, "the root click handler matches [data-qnav]");
  assert.match(
    SCRIPT,
    /if\(qn\)\{[^}]*if\(!qn\.disabled\)v\.postMessage\(\{type:'questionNav',dir:qn\.getAttribute\('data-qnav'\)\}\)/,
    "a [data-qnav] click posts {type:'questionNav', dir} only when the button is NOT disabled",
  );
  // It must be intercepted BEFORE the generic [data-reveal] post (the questionnaire is read-only — its buttons never select).
  const qnavIdx = SCRIPT.indexOf("data-qnav");
  const revealIdx = SCRIPT.indexOf("v.postMessage({type:'reveal'");
  assert.ok(qnavIdx !== -1 && revealIdx !== -1 && qnavIdx < revealIdx, "the data-qnav handler precedes the [data-reveal] post");
});

check("HOST: the questionNav handler moves currentQuestionIndex (via navigateQuestion → nextQuestionIndex) then re-renders + re-drives the marker", () => {
  // The host message handler routes a guarded questionNav (dir prev|next) to navigateQuestion.
  assert.ok(
    /msg\.type === "questionNav" && \(msg\.dir === "prev" \|\| msg\.dir === "next"\)/.test(COCKPIT_SRC),
    "the host handler guards questionNav on a prev|next dir",
  );
  assert.ok(/navigateQuestion\(msg\.dir\)/.test(COCKPIT_SRC), "questionNav routes to navigateQuestion(dir)");
  // navigateQuestion: clamp the index via nextQuestionIndex over the CURRENT questionNodeIds.length, set
  // currentQuestionIndex, re-render the questionnaire pane, then re-drive the this-node marker.
  const m = COCKPIT_SRC.match(/function navigateQuestion\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "navigateQuestion is defined");
  const body = m[1];
  assert.ok(/nextQuestionIndex\(currentQuestionIndex, dir, questionNodeIds\.length\)/.test(body), "clamps via nextQuestionIndex over the current questionNodeIds.length");
  assert.ok(/currentQuestionIndex = moved/.test(body), "sets currentQuestionIndex to the clamped next index");
  assert.ok(/renderPane\("questionnaire"\)/.test(body), "re-renders the questionnaire pane (refreshes X-of-Y + disabled states)");
  assert.ok(/driveThisNode\(\)/.test(body), "re-drives the this-node marker for the now-focused question");
  // Order: render BEFORE drive (the slice-3/4 case-select ordering — render bumps gen, then the marker re-paints).
  assert.ok(body.indexOf('renderPane("questionnaire")') < body.indexOf("driveThisNode()"), "renders before driving the marker");
  // The pane render passes the host index so the chrome reflects the move.
  assert.ok(/currentIndex: currentQuestionIndex/.test(COCKPIT_SRC), "renderQuestionnairePane is passed the host currentQuestionIndex");
});

check("HOST FIX 1: the questionnaire render-capture clamps currentQuestionIndex into range (a same-case rebuild that SHRINKS the questionnaire can't strand the cursor past the end)", () => {
  // A same-case .crl/.cel edit that drops questions leaves currentQuestionIndex stale (the case-select reset only fires on
  // a case CHANGE). driveThisNode reads the RAW questionNodeIds[currentQuestionIndex], so the index must be clamped at the
  // single point questionNodeIds is reassigned (the renderPane("questionnaire") arm) — right after the capture. Grep-lock
  // that the clamp exists, references questionNodeIds.length, and sits AFTER the questionNodeIds assignment.
  assert.ok(
    /currentQuestionIndex = questionNodeIds\.length \? Math\.min\(currentQuestionIndex, questionNodeIds\.length - 1\) : 0;/.test(COCKPIT_SRC),
    "the render-capture clamps currentQuestionIndex against questionNodeIds.length (Math.min, 0 when empty)",
  );
  const assignIdx = COCKPIT_SRC.indexOf("questionNodeIds = r.questionNodeIds");
  const clampIdx = COCKPIT_SRC.indexOf("currentQuestionIndex = questionNodeIds.length ? Math.min");
  assert.ok(assignIdx !== -1 && clampIdx !== -1 && assignIdx < clampIdx, "the clamp runs AFTER questionNodeIds is reassigned (clamps against THIS render's list)");
});

// ── disc 164: the produced-path DIVERTER channel (.diverter) — SELECTION-COUPLED (clears on reveal, like .failed-criterion;
//    UNLIKE the survives-reveal marker/review channels), its own independent class, gen-guarded clear-then-set ──
check("sanity: the diverter handlers + clrDV exist in the extracted script", () => {
  assert.match(SCRIPT, /const clrDV=\(\)=>\{/, "clrDV is defined");
  assert.match(SCRIPT, /if\(m\.type==='markDiverters'\)/, "markDiverters handler");
  assert.match(SCRIPT, /if\(m\.type==='clearDiverters'\)/, "clearDiverters handler");
});

check("SELECTION-COUPLED: clrDV IS called by BOTH highlight and clearHighlight (the diverter overlay clears on a reveal, like .failed-criterion)", () => {
  for (const type of ["highlight", "clearHighlight"]) {
    const body = handlerBody(type);
    assert.ok(/clrDV\(\)/.test(body), `${type} clears the diverter channel (selection-coupled — the same-click markDiverters re-applies post-dispatch)`);
  }
});

check("clrDV strips ONLY the .diverter class, never the other channels", () => {
  const m = SCRIPT.match(/const clrDV=\(\)=>\{[^}]*\};/);
  assert.ok(m, "clrDV body");
  assert.ok(!/current|failed-criterion|review-pass|review-fail|review-pending|error-node|leaf-allpass|this-node/.test(m[0]), "clrDV strips only .diverter");
});

check("GEN-GUARD: markDiverters drops a mark aimed at a superseded render (clear-then-set); clearDiverters is ungated", () => {
  const mark = handlerBody("markDiverters");
  assert.ok(/if\(m\.gen!==gen\)return;/.test(mark), "markDiverters is gen-guarded like the other channels");
  assert.ok(/clrDV\(\);/.test(mark), "markDiverters clears the prior overlay first (clear-then-set)");
  assert.ok(/add\('diverter'\)/.test(mark), "markDiverters adds .diverter for each segment id");
  const clear = handlerBody("clearDiverters");
  assert.ok(!/m\.gen!==gen/.test(clear), "clearDiverters is ungated (a class-strip is always safe)");
});

check("the diverter handlers touch ONLY the .diverter class (independent of every other overlay)", () => {
  for (const type of ["markDiverters", "clearDiverters"]) {
    const body = handlerBody(type);
    assert.ok(!/current|failed-criterion|review-pass|review-fail|review-pending|error-node|leaf-allpass|this-node/.test(body), `${type} touches only .diverter`);
  }
});

check("HOST: driveDiverters is MV-only, fired-path-authority-driven, and wired post-dispatch + on the pane ack", () => {
  // Post-dispatch: alongside the failed-criterion peek (same selection-coupled timing/ordering invariant).
  assert.ok(/driveFailedCriteriaPeek\(\);[\s\S]{0,700}?driveDiverters\(\);/.test(COCKPIT_SRC), "driveDiverters runs post-dispatch right after the failed-criterion peek");
  // Pane-ack: the diverter overlay re-drives when a marker-bearing pane re-renders (its `ready` ack), like driveThisNode.
  assert.ok(
    /pane === "tree" \|\| pane === "crl" \|\| pane === "source" \|\| pane === "questionnaire"\)\s*\{\s*driveThisNode\(\);[\s\S]*?driveDiverters\(\);/.test(COCKPIT_SRC),
    "the ack handler re-drives driveDiverters for the rebuilt panes (alongside driveThisNode)",
  );
  const m = COCKPIT_SRC.match(/function driveDiverters\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "driveDiverters is defined");
  const body = m[1];
  assert.ok(/mode !== "medical-validation"[\s\S]*?clearAllDiverters\(\)/.test(body), "MV-only — clears the overlay in cockpit mode");
  assert.ok(/status === "error"[\s\S]*?clearAllDiverters\(\)/.test(body), "clears for an errored case (no fired path)");
  assert.ok(/diverterIds\.length === 0[\s\S]*?clearAllDiverters\(\)/.test(body), "clears when there are zero diverters (no stale overlay)");
  assert.ok(/producedPathDiverterIds\(q\)/.test(body), "diverters via producedPathDiverterIds (the gated fired-path authority — the q.outcome gate keeps blocked terminals from lighting)");
  assert.ok(/resolveThisNode\(/.test(body), "re-roots each diverter via the marker's runtime-id→nodeKey+units join");
});

check("disc 164: the diverter overlay is OFF by default, config-backed (crl.cockpit.showDetails), and gated in driveDiverters", () => {
  assert.ok(/let showDetails = false;/.test(COCKPIT_SRC), "showDetails defaults to false (overlay OFF by default)");
  assert.ok(/get<boolean>\("showDetails"\) \?\? false/.test(COCKPIT_SRC), "reads the persisted crl.cockpit.showDetails (default false)");
  assert.ok(/\.update\("showDetails", next\)/.test(COCKPIT_SRC), "the toggle persists showDetails to config");
  assert.ok(/affectsConfiguration\("crl\.cockpit\.showDetails"\)/.test(COCKPIT_SRC), "a settings.json edit re-drives live (config listener)");
  const m = COCKPIT_SRC.match(/function driveDiverters\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m && /mode !== "medical-validation" \|\| !showDetails/.test(m[1]), "driveDiverters clears unless MV mode AND showDetails is on");
});

check("disc 164: the diverter on/off toggle round-trips (webview [data-diverter-toggle] → host applyShowDetails), MV-only chrome", () => {
  // Webview: a tree-chrome [data-diverter-toggle] click posts {type:'diverterToggle', on}.
  assert.match(SCRIPT, /closest\('\[data-diverter-toggle\]'\)/, "the chrome click handler matches [data-diverter-toggle]");
  assert.match(SCRIPT, /v\.postMessage\(\{type:'diverterToggle',on:dv\.getAttribute\('data-diverter-toggle'\)\}\)/, "posts {type:'diverterToggle', on}");
  // Host: routes a guarded diverterToggle to applyShowDetails(on === "1").
  assert.ok(/msg\.type === "diverterToggle" && \(msg\.on === "1" \|\| msg\.on === "0"\)/.test(COCKPIT_SRC), "host guards diverterToggle on a 1|0 flag");
  assert.ok(/applyShowDetails\(msg\.on === "1"\)/.test(COCKPIT_SRC), "routes to applyShowDetails(on)");
  // Chrome: the toggle is rendered ONLY in medical-validation mode (diverters never paint in cockpit).
  assert.ok(
    /mode === "medical-validation"\s*\?\s*`<div class="fc-toggle"[\s\S]*?data-diverter-toggle/.test(COCKPIT_SRC),
    "the Diverters toggle renders only in medical-validation mode",
  );
});

check("#218 legend: buildTreeChromeHtml appends flowLegendChrome(mode) AFTER the banner (MV-gating lives in the exported helper)", () => {
  assert.ok(/return progress \+ toggle \+ diverterToggle \+ banner \+ flowLegendChrome\(mode\);/.test(COCKPIT_SRC), "chrome ends with the legend, after the ⚠ gap banner");
  assert.ok(/import \{[^}]*flowLegendChrome[^}]*\} from "\.\/flowPaneHtml"/.test(COCKPIT_SRC), "flowLegendChrome imported from flowPaneHtml (co-located with FLOW_STYLE + the shared TOK_* consts)");
});

// ── #156 notes: the drawer control delegation + draft preserve/restore ──
check("notes controls post their messages (toggle/close/add/editStart/editSave/editCancel/delete)", () => {
  assert.match(SCRIPT, /type:'notesToggle',key:/, "glyph → notesToggle{key}");
  assert.match(SCRIPT, /type:'notesClose'/, "close → notesClose");
  assert.match(SCRIPT, /type:'noteAdd',key:[^}]*value:/, "Send → noteAdd{key,value}");
  assert.match(SCRIPT, /type:'noteEditStart',noteId:/, "Edit → noteEditStart{noteId}");
  assert.match(SCRIPT, /type:'noteEditSave',noteId:[^}]*value:/, "Save → noteEditSave{noteId,value}");
  assert.match(SCRIPT, /type:'noteEditCancel'/, "Cancel → noteEditCancel");
  assert.match(SCRIPT, /type:'noteDelete',noteId:/, "Delete → noteDelete{noteId}");
});

check("notes controls are intercepted BEFORE [data-reveal] (the glyph sits in a reveal target → must not select the case)", () => {
  const clickBody = handlerClick();
  const iNotes = clickBody.indexOf("data-notes-toggle");
  const iReveal = clickBody.indexOf("data-reveal");
  assert.ok(iNotes > -1 && iReveal > -1 && iNotes < iReveal, "the notes-toggle guard precedes the reveal fallthrough");
  // every note control stops propagation (blocks the case-select) — count the stopPropagation on the note branch
  assert.ok(/data-notes-toggle[\s\S]*?stopPropagation/.test(clickBody), "notes-toggle stops propagation");
  assert.ok(/data-note-draft[\s\S]*?stopPropagation/.test(clickBody), "a click on the textarea stops propagation (no reveal)");
});

check("Send/Save read the textarea SCOPED to the clicked control's container (not a global querySelector)", () => {
  const clickBody = handlerClick();
  assert.ok(/data-note-add[\s\S]*?closest\('\.cel-note-add'\)[\s\S]*?querySelector\('\[data-note-draft\]'\)/.test(clickBody), "add reads its own .cel-note-add textarea");
  assert.ok(/data-note-save[\s\S]*?closest\('\.cel-note-editing'\)[\s\S]*?querySelector\('\[data-note-draft\]'\)/.test(clickBody), "save reads its own .cel-note-editing textarea");
  assert.ok(/type:'noteAdd'[\s\S]*?ta\.value=''/.test(clickBody), "the add textarea is CLEARED after posting (so a sent note doesn't restore)");
});

check("render handler PRESERVES note drafts across the innerHTML swap (snapshot [data-note-draft], restore after)", () => {
  const body = handlerBody("render");
  assert.ok(/querySelectorAll\('textarea\[data-note-draft\]'\)/.test(body), "snapshots the draft textareas");
  const iSnap = body.indexOf("_d[k]=ta.value");
  const iSwap = body.indexOf("root.innerHTML=m.html");
  const iRestore = body.indexOf("ta.value=_d[k]");
  assert.ok(iSnap > -1 && iSwap > -1 && iRestore > -1, "snapshot + swap + restore all present");
  assert.ok(iSnap < iSwap && iSwap < iRestore, "order: snapshot BEFORE the swap, restore AFTER");
});

// ── #187 Todo 5: the per-case leaf VERDICT channel + its SURVIVES-REVEAL invariant ──
check("sanity: the leaf-verdict handlers + clrLeaf exist in the extracted script", () => {
  assert.match(SCRIPT, /const clrLeaf=\(\)=>\{/, "clrLeaf is defined");
  assert.match(SCRIPT, /if\(m\.type==='markLeaves'\)/, "markLeaves handler");
  assert.match(SCRIPT, /if\(m\.type==='clearLeaves'\)/, "clearLeaves handler");
});

check("SURVIVES-REVEAL: clrLeaf is called ONLY by mark/clearLeaves, NEVER by the selection channel (leaf answers survive a cockpit reveal)", () => {
  // The leaf verdict is per-CASE truth (like the review fills/.this-node), so the selection channel must not touch it.
  for (const type of ["highlight", "clearHighlight"]) {
    const body = handlerBody(type);
    assert.ok(!/clrLeaf\(\)/.test(body), `${type} MUST NOT call clrLeaf — the leaf verdict survives a reveal`);
    assert.ok(!/flow-leaf-yes|flow-leaf-no/.test(body), `${type} MUST NOT touch the leaf-verdict classes at all`);
  }
  // The other independent channels must not touch it either.
  for (const type of ["markFailedCriteria", "clearFailedCriteria", "markReviewOverlay", "markThisNode", "markDiverters"]) {
    const body = handlerBody(type);
    assert.ok(!/clrLeaf\(\)|flow-leaf-yes|flow-leaf-no/.test(body), `${type} MUST NOT touch the leaf-verdict channel (independent)`);
  }
  // Exactly two clrLeaf() call sites, both inside the leaf handlers (clear-then-mark + the explicit clear).
  const callSites = (SCRIPT.match(/clrLeaf\(\)/g) || []).length;
  assert.equal(callSites, 2, "clrLeaf is called exactly twice — markLeaves (clear-then-set) + clearLeaves");
});

check("clrLeaf strips ONLY the leaf-verdict classes, never the selection/review/marker classes", () => {
  const m = SCRIPT.match(/const clrLeaf=\(\)=>\{[\s\S]*?\};/);
  assert.ok(m, "clrLeaf body");
  assert.ok(!/current|failed-criterion|review-pass|review-fail|review-pending|error-node|leaf-allpass|this-node|diverter/.test(m[0]), "clrLeaf strips only .flow-leaf-yes/.flow-leaf-no");
});

check("CLEAR-THEN-SET + GEN-GUARD + MUTUAL EXCLUSION: markLeaves clears both classes first, is gen-guarded, and yes/no are exclusive per leaf", () => {
  const body = handlerBody("markLeaves");
  assert.ok(/if\(m\.gen!==gen\)return;/.test(body), "markLeaves is gen-guarded (drops a mark for a superseded render)");
  // clrLeaf() BEFORE any add — the load-bearing fix (a stale `yes` under a case that doesn't answer the leaf must clear).
  const iClr = body.indexOf("clrLeaf()");
  const iYes = body.indexOf("flow-leaf-yes");
  assert.ok(iClr > -1 && iYes > -1 && iClr < iYes, "clrLeaf() runs BEFORE adding any leaf class (clear-then-set)");
  assert.ok(/m\.yesIds\|\|\[\][\s\S]*add\('flow-leaf-yes'\)/.test(body), "yesIds → .flow-leaf-yes");
  assert.ok(/m\.noIds\|\|\[\][\s\S]*add\('flow-leaf-no'\)/.test(body), "noIds → .flow-leaf-no");
  const clear = handlerBody("clearLeaves");
  assert.ok(!/m\.gen!==gen/.test(clear), "clearLeaves is ungated (a class-strip is always safe)");
});

check("HOST: driveLeafMarks re-drives on tree-ack + rebuild, and is NEVER wired into the selection-reveal helpers", () => {
  // The tree-only leaf overlay's survives-reveal guarantee = a re-drive when the tree re-renders (ack) + on rebuild.
  assert.ok(/if \(pane === "tree"\) \{[\s\S]*?driveLeafMarks\(\);[\s\S]*?\}/.test(COCKPIT_SRC), "the tree-ack (`ready`) handler re-drives driveLeafMarks");
  // rebuild tail re-drives all persistent tree channels including driveLeafMarks.
  assert.ok(/driveDoneOverlay\(\);[\s\S]*?driveLeafMarks\(\);/.test(COCKPIT_SRC), "the rebuild tail re-drives driveLeafMarks");
  // Must NOT be wired into the selection-reveal helpers (host survives-reveal invariant).
  for (const fn of ["clearHighlight", "clearAllHighlights", "highlightRows"]) {
    const m = COCKPIT_SRC.match(new RegExp(`function ${fn}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`));
    if (m) assert.ok(!/driveLeafMarks\(/.test(m[1]), `${fn} must not drive the leaf-verdict channel (survives a reveal)`);
  }
});

check("HOST: driveLeafMarks is FOCUSED-CASE-coupled via focusedScenario (clears with the case, like this-node/diverters — NOT the all-cases done overlay)", () => {
  // gpt55 impl review: the intended lifecycle is per-focused-case (a leaf verdict is THIS case's answers), so on a non-cel
  // selection it MUST clear — exactly like driveThisNode/driveDiverters, which read the same focusedScenario(). Lock that
  // driveLeafMarks resolves the case via focusedScenario() (so it clears when there is no focused case) and does NOT walk
  // all cases like driveDoneOverlay (scenarioByCaseId.keys()).
  const body = COCKPIT_SRC.match(/function driveLeafMarks\(\): void \{([\s\S]*?)\n  \}/);
  assert.ok(body, "driveLeafMarks body found");
  assert.ok(/focusedScenario\(\)/.test(body[1]), "driveLeafMarks resolves the case via focusedScenario (focused-case-coupled)");
  assert.ok(!/scenarioByCaseId\.keys\(\)/.test(body[1]), "driveLeafMarks does NOT iterate all cases (it is per-focused-case, not the done overlay)");
  // The empty/errored-case arm posts an EMPTY gen-stamped markLeaves (steady-state clear-effect), NOT an ungated clearLeaves.
  assert.ok(/markLeaves\(tree, \[\], \[\]\)/.test(body[1]), "no/errored focused case → an EMPTY gen-stamped mark (gen-ordered, mirrors driveDoneOverlay FIX 1)");
});

// ── #187 Todo 5: the PURE leaf-verdict bucketing (the on-path gate + absent-is-unknown rule, in isolation) ──
check("BUCKETING: leafMarkBuckets gates on the on-path composite + maps conceptTruth to yes/no; off-path + absent get NO mark", () => {
  const tk = (lib, name) => JSON.stringify([lib, name]);
  const leafConcepts = {
    "leaf::w:On|c:yes": { lib: "Pol", name: "Yes", topWhenKey: "w:On" }, // on-path + satisfied → yes
    "leaf::w:On|c:no": { lib: "Pol", name: "No", topWhenKey: "w:On" }, //  on-path + false     → no
    "leaf::w:On|c:unk": { lib: "Pol", name: "Unk", topWhenKey: "w:On" }, // on-path + ABSENT    → neither (unknown)
    "leaf::w:Off|c:yes": { lib: "Pol", name: "Yes", topWhenKey: "w:Off" }, // OFF-path (same concept, satisfied) → neither
  };
  const satisfiedWhenKeys = new Set(["w:On"]); // w:Off is NOT on the fired-satisfied path
  const truthByKey = new Map([[tk("Pol", "Yes"), true], [tk("Pol", "No"), false]]); // "Unk" absent
  const { yesKeys, noKeys } = leafMarkBuckets(leafConcepts, satisfiedWhenKeys, truthByKey);
  assert.deepEqual(yesKeys, ["leaf::w:On|c:yes"], "only the on-path satisfied leaf is yes (the off-path 'Yes' is NOT lit — parity)");
  assert.deepEqual(noKeys, ["leaf::w:On|c:no"], "the on-path false leaf is no");
  // absent concept ('Unk') and the off-path leaf appear in NEITHER bucket.
  assert.ok(!yesKeys.concat(noKeys).some((k) => k.includes("c:unk") || k === "leaf::w:Off|c:yes"), "unknown + off-path leaves get NO mark");
});

// ── #210 Slice 1b: the shared leaf bucketing over a QUESTIONNAIRE + injected resolveKey (driveLeafMarks + driveDoneOverlay share it) ──
check("BUCKETING: leafBucketsFromQuestionnaire resolves when-evaluated/yes rows → satisfiedWhens, then buckets", () => {
  const questions = [
    { rowKind: "when-evaluated", answer: "yes", nodeId: "rt:on" }, //   → w:On (satisfied composite)
    { rowKind: "when-evaluated", answer: "no", nodeId: "rt:off" }, //   answer !== yes → w:Off NOT satisfied
    { rowKind: "when-preempted", answer: "yes", nodeId: "rt:pre" }, //  wrong rowKind → skipped
    { rowKind: "when-evaluated", answer: "yes", nodeId: "rt:dangle" }, // resolveKey → undefined → skipped
  ];
  const resolveKey = (id) => ({ "rt:on": "w:On", "rt:off": "w:Off", "rt:pre": "w:Pre", "rt:dangle": undefined })[id];
  const leafConcepts = {
    "leaf::w:On|c:yes": { lib: "Pol", name: "Yes", topWhenKey: "w:On" },
    "leaf::w:On|c:no": { lib: "Pol", name: "No", topWhenKey: "w:On" },
    "leaf::w:Off|c:y": { lib: "Pol", name: "OffYes", topWhenKey: "w:Off" }, // its composite was answer:no → off-path
  };
  const conceptTruth = [
    { libraryName: "Pol", name: "Yes", satisfied: true },
    { libraryName: "Pol", name: "No", satisfied: false },
    { libraryName: "Pol", name: "OffYes", satisfied: true },
  ];
  const { yesKeys, noKeys } = leafBucketsFromQuestionnaire(questions, resolveKey, conceptTruth, leafConcepts);
  assert.deepEqual(yesKeys, ["leaf::w:On|c:yes"], "only the satisfied on-path leaf under w:On is yes");
  assert.deepEqual(noKeys, ["leaf::w:On|c:no"], "the false on-path leaf is no");
  assert.ok(!yesKeys.concat(noKeys).includes("leaf::w:Off|c:y"), "w:Off's leaf is off-path (its row was answer:no) → no mark");
});
check("BUCKETING: leafBucketsFromQuestionnaire — empty questions / undefined conceptTruth → empty buckets (no crash)", () => {
  const leafConcepts = { "leaf::w:On|c:x": { lib: "Pol", name: "X", topWhenKey: "w:On" } };
  assert.deepEqual(leafBucketsFromQuestionnaire([], () => "w:On", undefined, leafConcepts), { yesKeys: [], noKeys: [] }, "no rows → nothing satisfied → empty");
  const oneYes = [{ rowKind: "when-evaluated", answer: "yes", nodeId: "n" }];
  assert.deepEqual(leafBucketsFromQuestionnaire(oneYes, () => "w:On", undefined, leafConcepts), { yesKeys: [], noKeys: [] }, "satisfied when but undefined truth → unknown → empty");
});

// ── #210: the pure produced→leaf composition (the badge/paint EXECUTION reach), with an injected resolveKey ──
check("resolveProducedLeafKeys: produced actions → their disposition-leaf nodeKeys; non-leaf/unresolved dropped; deduped", () => {
  const leaves = new Set(["a:R1", "a:R2"]);
  // resolveKey stub: rt:1→a:R1 (leaf), rt:2→a:R2 (leaf), rt:use→d:Sub (NOT a leaf — a use-decision), rt:dangle→undefined.
  const resolveKey = (id) => ({ "rt:1": "a:R1", "rt:2": "a:R2", "rt:use": "d:Sub", "rt:dangle": undefined })[id];
  const got = resolveProducedLeafKeys(
    [{ nodeId: "rt:1" }, { nodeId: "rt:use" }, { nodeId: "rt:dangle" }, { nodeId: "rt:2" }, { nodeId: "rt:1" }],
    resolveKey,
    leaves,
  );
  assert.deepEqual(got, ["a:R1", "a:R2"], "only the produced actions that resolve to a DISPOSITION LEAF, deduped");
  assert.ok(!got.includes("d:Sub"), "a produced action resolving to a non-leaf (use-decision) is dropped");
});
check("resolveProducedLeafKeys: no produced actions → empty (a blocked/errored case reaches no leaf)", () => {
  assert.deepEqual(resolveProducedLeafKeys([], () => "a:R1", new Set(["a:R1"])), []);
});

// ── #210 Slice 1b: HOST-side wiring source-grep locks (driveDoneOverlay + the memo routing live outside the webview SCRIPT) ──
check("Slice 1b/#210/#217: driveDoneOverlay reviewed-only painting, delegating to the SHARED litNodeKeysForCase reach", () => {
  // reviewed-only painting input: unreviewed cases can't vote.
  assert.ok(/buildReviewPerCase\(\s*Object\.keys\(reviewByCaseId\)/.test(COCKPIT_SRC), "buildReviewPerCase is fed Object.keys(reviewByCaseId), not scenarioByCaseId.keys()");
  // #217: the per-case lit reach moved into the shared litNodeKeysForCase (used by BOTH paint here and the right-click resolver).
  assert.ok(/litNodeKeysForCase\(caseId, scenarioByCaseId\.get\(caseId\), m, dispositionLeafKeys, tree\.leafConcepts\)/.test(COCKPIT_SRC), "the paint callback delegates to the shared litNodeKeysForCase");
  assert.ok(!/const producedByCaseId = new Map/.test(COCKPIT_SRC) && !/producedByCaseId\.(get|set)\(/.test(COCKPIT_SRC), "the overlay-local producedByCaseId map is gone — litNodeKeysForCase recomputes produced (no overlay-run coupling)");
  // the shared reach shape (interior ∪ produced ∪ yes) is asserted in the #217 litNodeKeysForCase check.
  // the fold's isLeaf is unchanged.
  assert.ok(/deriveReviewOverlay\(reviewByCaseId, perCase, \(k\) => dispositionLeafKeys\.has\(k\)\)/.test(COCKPIT_SRC), "the leaf-aware fold call is unchanged");
});
check("#210 all-pass badge: reach is EXECUTION (collectProducedActions), over the FULL scenario list, ambiguous → unreviewed → suppress", () => {
  // the sound reach — produced disposition, NOT the crlAnchors reveal heuristic.
  assert.ok(/function producedDispositionLeafKeys\([^)]*\)/.test(COCKPIT_SRC), "a producedDispositionLeafKeys helper exists");
  assert.ok(/collectProducedActions\(sv\.tree\)/.test(COCKPIT_SRC), "reach walks the PRODUCED actions of the scenario tree (execution), not crlAnchors");
  // iterate the FULL frozen list (scenarioByCaseId drops ambiguous); ambiguous/duplicate-name → unreviewed → suppress.
  assert.ok(/for \(const sc of scenarios\?\.scenarios \?\? \[\]\)/.test(COCKPIT_SRC), "iterate the FULL scenarios.scenarios (not scenarioByCaseId, which drops ambiguous)");
  assert.ok(/duplicateScenarioNames\.has\(sc\.case\.name\) \? undefined : caseIdByName\[sc\.case\.name\]/.test(COCKPIT_SRC), "ambiguous duplicate-name case → no caseId");
  assert.ok(/\?\? "unreviewed"/.test(COCKPIT_SRC), "an ambiguous/absent verdict defaults to unreviewed (suppresses the badge)");
  assert.ok(/deriveAllPassLeaves\(badgeEntries\)/.test(COCKPIT_SRC), "the all-pass fold decides the badge set");
  assert.ok(/allPassLeaves: segmentsFor\(tree, \[\.\.\.allPassLeaves\]\)\.segmentIds/.test(COCKPIT_SRC), "allPassLeaves posted as the 5th markReviewOverlay set");
});
check("Slice 1b: questionnaireFor routes the FOCUSED case to the memo, a NON-focused case to buildQuestionnaireRaw (no memo poisoning)", () => {
  const m = COCKPIT_SRC.match(/function questionnaireFor\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "questionnaireFor body");
  assert.ok(/state\.selection\.caseId === caseId/.test(m[1]), "gated on the FOCUSED selection's caseId");
  assert.ok(/\? buildFocusedQuestionnaire\(sv\) : buildQuestionnaireRaw\(sv\)/.test(m[1]), "focused → memo; non-focused → raw build (never poisons the focused memo slot)");
});

// ── #214 worklist verdict filter — HOST wiring source-locks (the handler/reset/auto-widen live outside the webview SCRIPT) ──
check("#214 filter: toggleWorklistFilter validates via isReviewState, toggles, CLEARS the drawer, re-renders, re-drives selection", () => {
  const m = COCKPIT_SRC.match(/function toggleWorklistFilter\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "toggleWorklistFilter body");
  assert.ok(/!isReviewState\(state_\)/.test(m[1]), "validates the posted state against isReviewState (untrusted webview string)");
  assert.ok(/worklistFilter\.has\(state_\)\) worklistFilter\.delete\(state_\)[\s\S]*worklistFilter\.add\(state_\)/.test(m[1]), "toggles membership (delete if present, else add)");
  // clears the drawer ONLY when the open case just became hidden (its verdict left the filter) — else the draft survives.
  assert.ok(/if \(openNotesCaseId !== undefined && !worklistFilter\.has\(reviewByCaseId\[openNotesCaseId\][\s\S]*openNotesCaseId = undefined/.test(m[1]), "clears the drawer only if the open case is now filtered out (draft-preserving otherwise)");
  assert.ok(/renderPane\("worklist"\)/.test(m[1]), "re-renders the worklist");
  assert.ok(/if \(state\.selection\) dispatch\(\{ type: "select"/.test(m[1]), "re-drives the selection (like setWorklist, NOT toggleNotes) so a surviving row re-highlights");
});
check("#214 filter: routed from a worklistFilterToggle message; reset to all-shown in BOTH MV resets", () => {
  assert.ok(/msg\.type === "worklistFilterToggle"[\s\S]*toggleWorklistFilter\(msg\.state\)/.test(COCKPIT_SRC), "worklistFilterToggle → toggleWorklistFilter(msg.state)");
  assert.equal((COCKPIT_SRC.match(/worklistFilter = new Set\(REVIEW_STATES\)/g) || []).length, 2, "worklistFilter reset to all-shown in resetToEmpty + loadReviewSidecar (so policy A's filter can't hide policy B)");
});
check("#214 filter: shouldWidenFilterForSelection (pure) — a NEW filtered case widens; same-case / not-filtered / no-case do NOT", () => {
  const F = new Set(["fail"]); // only fail shown
  assert.equal(shouldWidenFilterForSelection("cX", "cY", "pass", F), true, "a NEW case (cY≠cX) whose verdict is hidden → widen");
  assert.equal(shouldWidenFilterForSelection("cY", "cY", "pass", F), false, "SAME case re-dispatch → NO widen (won't undo a deliberate filter-off)");
  assert.equal(shouldWidenFilterForSelection("cX", "cY", "fail", F), false, "a NEW case whose verdict is already shown → no widen");
  assert.equal(shouldWidenFilterForSelection("cX", undefined, "pass", F), false, "no primary-cel case → no widen");
});
check("#214 filter: dispatch widens via shouldWidenFilterForSelection + re-renders the worklist BEFORE the applyReveal loop", () => {
  assert.ok(/shouldWidenFilterForSelection\(prevCaseId, nextCid, v, worklistFilter\)[\s\S]*worklistFilter\.add\(v\);[\s\S]*renderPane\("worklist"\)/.test(COCKPIT_SRC), "the widen uses the pure predicate + re-renders");
  // CRITICAL ordering: the widen re-render must precede the reveal effects (else the reveal hits the pre-widen anchors).
  assert.ok(COCKPIT_SRC.indexOf('renderPane("worklist"); // re-render with the widened filter') < COCKPIT_SRC.indexOf("for (const e of effects) applyReveal(e);"), "the widen renderPane precedes applyReveal in dispatch");
});
check("#214 filter: the webview chip click posts worklistFilterToggle{state}, BEFORE the [data-reveal] branch (controls first)", () => {
  assert.ok(/type:'worklistFilterToggle',state:wf\.getAttribute\('data-worklist-filter'\)/.test(SCRIPT), "a chip click posts worklistFilterToggle{state}");
  assert.ok(SCRIPT.indexOf("worklistFilterToggle") < SCRIPT.indexOf("[data-reveal]"), "the chip handler precedes [data-reveal]");
});

// ── #216 sub-question left-click → dynamic on-path case selection (host wiring; the resolution lives in the cockpit closure) ──
check("#216 sub-question: the reveal handler routes a sub-question hit to selectSubQuestionCases, NOT mapHitToPrimary", () => {
  assert.ok(/if \(isSubQuestionHit\(hit\)\) \{[\s\S]*selectSubQuestionCases\(hit\.subQuestionLeafKey/.test(COCKPIT_SRC), "isSubQuestionHit → selectSubQuestionCases");
  // it must be diverted BEFORE the generic mapHitToPrimary select (the leaf key is not a unit/nodeKey/caseId).
  assert.ok(COCKPIT_SRC.indexOf("isSubQuestionHit(hit)") < COCKPIT_SRC.indexOf("selectInPrimary(mapHitToPrimary(hit, p"), "the sub-question branch precedes the generic mapHitToPrimary select");
});
check("#216 sub-question: selectSubQuestionCases builds per-case yes-leaf entries (errored → []), delegates to the shared membership core, selects", () => {
  const m = COCKPIT_SRC.match(/function selectSubQuestionCases\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "selectSubQuestionCases body");
  assert.ok(/scenarioByCaseId\]\.map\(\(\[caseId, sv\]\)/.test(m[1]), "maps the frozen scenarios to entries");
  assert.ok(/keys: sv\.status === "error" \? \[\] : leafBucketsFromQuestionnaire\(questionnaireFor\(caseId, sv\)\.questions[\s\S]*\.yesKeys/.test(m[1]), "per-case keys = the on-path yes-leaves (errored → empty)");
  assert.ok(/caseIdsForNodeThroughLit\(leafKey, entries\)/.test(m[1]), "delegates the on-path filter to the shared, unit-tested membership core");
  assert.ok(/mapHitToPrimary\(\{ caseId \}, p, m\)[\s\S]*selectInPrimary\(ids, p\)/.test(m[1]), "maps each case → the CURRENT primary's ids, then selects (multi → the quick-pick)");
});
check("#216/#217 caseIdsForNodeThroughLit (PURE): keeps cases whose per-case keyset contains THIS key; dedupes; entry order; no status filter", () => {
  const KEY = "leaf::w:B|1|c:L1"; // the clicked operand's on-path key
  const OTHER = "leaf::w:B|0|c:L1"; // same concept, a DIFFERENT operand path (must not match)
  const entries = [
    { caseId: "cOn", keys: [KEY, "leaf::w:A|0|c:X"] }, // contains the key → keep
    { caseId: "cWhenOff", keys: [] }, // errored/off-path → empty keyset (caller pre-filtered) → drop
    { caseId: "cLeafFalse", keys: ["leaf::w:A|0|c:X"] }, // key absent → drop
    { caseId: "cOtherPath", keys: [OTHER] }, // same concept, other operand path → drop
    { caseId: "cOn2", keys: [KEY, KEY] }, // contains it (twice) → kept ONCE (dedupe within a case)
  ];
  assert.deepEqual(caseIdsForNodeThroughLit(KEY, entries), ["cOn", "cOn2"], "only the two matching cases, in entry-iteration order, each once");
  assert.deepEqual(caseIdsForNodeThroughLit("leaf::nobody", entries), [], "a key no case holds → empty");
});

// ── #217 right-click a flow node → per-case verdict quick-pick (webview gate + host wiring; collapse to one execution reach) ──
check("#217 webview: a contextmenu listener gates MV (live data-mode) + .flow-svg (tree only) + .flow-row[data-reveal], posts nodeVerdictMenu", () => {
  assert.ok(/addEventListener\('contextmenu',\(e\)=>\{/.test(SCRIPT), "contextmenu listener present");
  assert.ok(/contextmenu'[\s\S]*document\.body\.dataset\.mode!=='medical-validation'\)return/.test(SCRIPT), "MV-only via the LIVE data-mode signal (else native menu preserved)");
  assert.ok(/contextmenu'[\s\S]*closest\('\.flow-svg'\)\)\)return/.test(SCRIPT), "flow/tree pane ONLY (else the shared script would suppress the native menu in other panes)");
  assert.ok(/contextmenu'[\s\S]*closest\('\.flow-row\[data-reveal\]'\)/.test(SCRIPT), "a rendered structure node (guard tabs are .flow-guard-tab, excluded)");
  assert.ok(/contextmenu'[\s\S]*e\.preventDefault\(\);e\.stopPropagation\(\);v\.postMessage\(\{type:'nodeVerdictMenu',key:g\.getAttribute\('data-reveal'\)\}\)/.test(SCRIPT), "suppresses the native menu + posts the OPAQUE render key");
});
check("#217 webview: the render handler stamps the LIVE mode onto document.body.dataset.mode each render", () => {
  assert.ok(/if\(m\.mode\)document\.body\.dataset\.mode=m\.mode/.test(SCRIPT), "render carries + stamps mode (a static body stamp would go stale across a retarget)");
});
check("#217 host: nodeVerdictMenu is routed, normalizes the hit to a SEMANTIC key, resolves via the shared reach, never uses the raw reveal key", () => {
  assert.ok(/msg\.type === "nodeVerdictMenu"[\s\S]*nodeMenu\(msg\.key\)/.test(COCKPIT_SRC), "routed from the nodeVerdictMenu message → the combined nodeMenu (#203 Slice B)");
  const m = COCKPIT_SRC.match(/async function nodeVerdictMenu\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "nodeVerdictMenu body");
  assert.ok(/tree\?\.reveals\[revealKey\]/.test(m[1]), "looks the opaque reveal key up in the tree reveals (never passes it raw to the resolver)");
  assert.ok(/isSubQuestionHit\(hit\)[\s\S]*hit\.subQuestionLeafKey[\s\S]*"nodeKey" in hit[\s\S]*hit\.nodeKey/.test(m[1]), "normalizes {subQuestionLeafKey}/{nodeKey} → the semantic key");
  assert.ok(/litNodeKeysForCase\(caseId, sv[\s\S]*caseIdsForNodeThroughLit\(semanticKey, entries\)/.test(m[1]), "resolves cases via the SHARED lit reach + the pure membership core over scenarioByCaseId");
  assert.ok(/setStatusBarMessage/.test(m[1]), "every no-op exit emits a transient status note (the native menu is already suppressed — no silent dead click)");
});
check("#217 host: litNodeKeysForCase is the SHARED reach — driveDoneOverlay paints with it, and it routes through questionnaireFor (NOT buildFocusedQuestionnaire)", () => {
  const m = COCKPIT_SRC.match(/function litNodeKeysForCase\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "litNodeKeysForCase body");
  assert.ok(/questionnaireFor\(caseId, sv\)/.test(m[1]), "routes through questionnaireFor (guards the focused/raw split)");
  assert.ok(!/buildFocusedQuestionnaire/.test(m[1]), "must NOT call buildFocusedQuestionnaire (its memo poisons on a non-focused sv the resolver passes)");
  assert.ok(/crlAnchorsForUnits\(unitsForCase\(caseId, m\), m\)\.filter\([\s\S]*producedDispositionLeafKeys\(sv, dispositionLeafKeys\)/.test(m[1]), "interior (minus disposition leaves) ∪ produced — recomputes produced (no overlay-local map)");
  assert.ok(/litNodeKeysForCase\(caseId, scenarioByCaseId\.get\(caseId\), m, dispositionLeafKeys, tree\.leafConcepts\)/.test(COCKPIT_SRC), "driveDoneOverlay's paint callback uses the SAME shared reach");
});
check("#217 host: applyVerdict is the shared persist tail (validates + returns boolean + aborts on save-fail), used by BOTH setWorklist and the quick-pick", () => {
  const m = COCKPIT_SRC.match(/function applyVerdict\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "applyVerdict body");
  assert.ok(/isReviewState\(value\)\) return false/.test(m[1]), "validates the value (trusted-input)");
  assert.ok(/persistMv\(next, notesByCaseId\)\) return false/.test(m[1]), "aborts (returns false) on a persist failure — never paints an unpersisted verdict");
  assert.ok(/if \(state\.selection\) dispatch\(\{ type: "select"[\s\S]*else renderTreeChrome\(\)[\s\S]*driveDoneOverlay\(\)/.test(m[1]), "keeps the double-chrome guard + repaints the overlay");
  assert.ok(/function setWorklist\([\s\S]*applyVerdict\(action\.caseId, value\)/.test(COCKPIT_SRC), "setWorklist delegates to the shared applyVerdict");
});
check("#217 host: the verdict pick is stale-guarded (indexVersion + sidecar + scenarioByCaseId), every stale exit notes, multi-case re-enters", () => {
  const m = COCKPIT_SRC.match(/async function pickVerdictLoop\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "pickVerdictLoop body");
  assert.ok(/indexVersion !== ver \|\| mvSidecarPath !== sidecar \|\| mode !== "medical-validation"/.test(m[1]), "stale guard = model version + sidecar + mode");
  assert.ok(/stale\(\) \|\| !scenarioByCaseId\.has\(caseId\)\) return staleNote\(\)/.test(m[1]), "verdict pick revalidates the case + notes on stale (no silent dead click)");
  assert.ok(/for \(;;\) \{\s*if \(stale\(\)\) return staleNote\(\)/.test(m[1]), "the multi-case loop-top stale exit ALSO notes (not a silent return)");
  assert.ok(/stale\(\) \|\| !scenarioByCaseId\.has\(pick\.caseId\)\) return staleNote\(\)[\s\S]*await pickVerdict\(pick\.caseId\)/.test(m[1]), "revalidates immediately after the case-list pick, BEFORE opening the verdict picker");
  assert.ok(/caseIds\.length === 1\) return pickVerdict/.test(m[1]), "single case → straight to the verdict pick");
  // an Esc/cancel (`if (!pick) return;`) is a DELIBERATE dismissal — it must NOT emit a note (only stale exits do).
  assert.ok(/if \(!pick\) return; \/\/ Esc/.test(m[1]), "an Esc cancel returns without a note");
});

// ── #219 same-pane click must NOT scroll the pane you clicked in (respect the user's viewport) ──
check("#219 host: a click sets scrollSuppressPane to the origin pane around the selection dispatch, cleared in finally", () => {
  assert.ok(/scrollSuppressPane = pane;\s*try \{/.test(COCKPIT_SRC), "the reveal handler marks the origin pane before dispatching the selection");
  assert.ok(/\} finally \{\s*scrollSuppressPane = undefined;\s*\}/.test(COCKPIT_SRC), "and clears it in finally (the flag is live only for the synchronous dispatch)");
});
check("#219 host: postReveal suppresses scroll for the origin pane; highlightRows omits scrollTo when suppressed", () => {
  assert.ok(/const noScroll = pane === scrollSuppressPane;/.test(COCKPIT_SRC), "postReveal computes noScroll = pane is the click origin");
  // every highlightRows call in postReveal threads noScroll (cross-pane targets still scroll; the origin pane does not).
  assert.ok(!/highlightRows\(v, crlAnchorsForUnits\(unitsForCase\(target\.id, m\), m\)\);/.test(COCKPIT_SRC), "the case→tree highlight passes noScroll (no bare call left)");
  assert.ok(/highlightRows\(v, crlAnchorsForUnits\(unitsForCase\(target\.id, m\), m\), noScroll\)/.test(COCKPIT_SRC), "case→tree/crl highlight threads noScroll");
  assert.ok(/scrollTo: suppressScroll \? undefined : scrollTo, segmentIds/.test(COCKPIT_SRC), "highlightRows omits scrollTo when suppressScroll (paints .current, no scroll)");
});
check("#219 host: the OTHER scroll path — markFailedCriteria — is ALSO suppressed for the origin pane (it runs in the same dispatch)", () => {
  assert.ok(/markFailedCriteria\(tree, blockerKeys, preemptKeys, scrollSuppressPane === "tree"\)/.test(COCKPIT_SRC), "the failed-criteria overlay suppresses scroll for the origin tree pane");
  assert.ok(/markFailedCriteria\(crl, blockerKeys, preemptKeys, scrollSuppressPane === "crl"\)/.test(COCKPIT_SRC), "…and for crl origin");
  assert.ok(/markFailedCriteria\(src, unitsOf\(blockerKeys\), unitsOf\(preemptKeys\), scrollSuppressPane === "source"\)/.test(COCKPIT_SRC), "…and for source origin");
  // the mark poster omits scrollTo when suppressed (mirrors highlightRows).
  assert.ok(/type: "markFailedCriteria", gen: v\.gen, scrollTo: suppressScroll \? undefined : scrollTo/.test(COCKPIT_SRC), "markFailedCriteria omits scrollTo when suppressed");
});
check("#219 host: a multi-case click threads the origin through pickThenSelect and re-arms it around the DEFERRED dispatch", () => {
  assert.ok(/pickThenSelect\([\s\S]*?\(id\) => selOf\(primary, id\),\s*origin,\s*\)/.test(COCKPIT_SRC), "selectInPrimary passes the click origin into pickThenSelect");
  const m = COCKPIT_SRC.match(/function pickThenSelect[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "pickThenSelect body");
  assert.ok(/scrollSuppressPane = origin;\s*try \{\s*dispatch\(\{ type: "select"[\s\S]*\} finally \{\s*scrollSuppressPane = undefined;/.test(m[1]), "re-arms the origin flag around the deferred dispatch (so the post-pick selection holds the viewport)");
});
check("#219 webview: BOTH scroll handlers (highlight + markFailedCriteria) scroll ONLY when scrollTo is present", () => {
  assert.equal((SCRIPT.match(/if\(m\.scrollTo\)\{const t=document\.getElementById\(m\.scrollTo\);if\(t\)t\.scrollIntoView\(\{block:'center'\}\);\}/g) || []).length, 2, "both scroll paths are guarded on m.scrollTo (a suppressed reveal paints without scrolling)");
});

// ── #203 Todo 4b Slice A: per-node flag badges ──
check("#203 Slice A webview: the flagBadges handler clears `.has-flag` off flaggableGids then sets it on gids, gen-gated", () => {
  assert.match(SCRIPT, /m\.type==='flagBadges'\)\{if\(m\.gen!==gen\)return;/);
  assert.match(SCRIPT, /m\.flaggableGids\|\|\[\]\)\)\{const el=document\.getElementById\(id\);if\(el\)el\.classList\.remove\('has-flag'\)/);
  assert.match(SCRIPT, /m\.gids\|\|\[\]\)\)\{const el=document\.getElementById\(id\);if\(el\)el\.classList\.add\('has-flag'\)/);
});
check("#203 webview: the flagBadges handler ALSO drives the start-node count badge (⚑ N / ✓ / ⚠) + .has-startflag", () => {
  assert.match(SCRIPT, /var sg=m\.startNodeGid\?document\.getElementById\(m\.startNodeGid\):null;/);
  assert.match(SCRIPT, /m\.flagError\?'⚠':\(m\.open>0\?'⚑ '\+m\.open:\(m\.resolved>0\?'✓':''\)\)/); // chrome-mirror label
  assert.match(SCRIPT, /if\(st\)st\.textContent=label;sg\.classList\.toggle\('has-startflag',label!==''\)/); // set text + toggle visibility
});
check("#203 Slice A webview: a ⚑ badge click is intercepted BEFORE [data-reveal] and opens the flag list (mvFlags)", () => {
  assert.match(SCRIPT, /closest\('\[data-mv-flag-badge\]'\)/);
  // the badge intercept + return must precede the data-reveal routing (controls-first)
  const badgeAt = SCRIPT.indexOf("data-mv-flag-badge");
  const revealAt = SCRIPT.indexOf("closest('[data-reveal]')");
  assert.ok(badgeAt > 0 && badgeAt < revealAt, "badge intercept comes before the data-reveal click routing");
  assert.match(SCRIPT, /closest\('\[data-mv-flag-badge\]'\);.*postMessage\(\{type:'mvFlags'\}\);return;/s);
});
check("#203 host: driveFlagBadges — per-node ⚑ by (lib,name)/anchors + the START-NODE COUNT badge (chrome mirror, catch-all); open-only", () => {
  assert.match(COCKPIT_SRC, /function driveFlagBadges\(\)/);
  assert.match(COCKPIT_SRC, /flagsList\.filter\(\(f\) => f\.status !== "resolved"\)/); // open-only (matches the gate)
  assert.match(COCKPIT_SRC, /o\.name === f\.targetName && o\.lib === f\.libraryName/); // (lib,name), no name-only wildcard
  assert.match(COCKPIT_SRC, /crlStructure\.find\(\(s\) => s\.decision === f\.targetName && s\.lib === f\.libraryName\)/); // decision by (lib,name)
  // the start-node COUNT badge replaces the old orphans→⚑ path: post the total open/resolved counts + the start gid
  assert.doesNotMatch(COCKPIT_SRC, /orphans > 0 && crlStructure\.length > 0/); // the Slice-A orphan→⚑ path is GONE (one implementation)
  assert.match(COCKPIT_SRC, /startNodeGid: tree\.startNodeGid, open: open\.length, resolved: resolvedCount, flagError: flagLoadError/);
});
check("#203 Slice A host: loadFlags runs BEFORE the panes render in rebuild (the gate + badges were stale after-render)", () => {
  const load = COCKPIT_SRC.indexOf("(re)parse the policy `.crl` review flags BEFORE the panes render");
  const render = COCKPIT_SRC.indexOf("for (const pane of PANES) renderPane(pane);");
  assert.ok(load > 0 && render > 0 && load < render, "loadFlags precedes the renderPane loop");
});
check("#203 Slice A host: driveFlagBadges is re-driven on tree ack + rebuild + the write-back (survives the innerHTML swap)", () => {
  // tree-ack re-drive (alongside driveDoneOverlay), rebuild, and both writeFlagStatus refresh paths
  assert.ok((COCKPIT_SRC.match(/driveFlagBadges\(\)/g) || []).length >= 4, "driveFlagBadges wired at ≥4 sites");
});
check("#203 Slice A host: the tree render captures conceptOccurrences + flaggableGids atomically with the anchors", () => {
  assert.match(COCKPIT_SRC, /v\.conceptOccurrences = r\.conceptOccurrences;/);
  assert.match(COCKPIT_SRC, /v\.flaggableGids = r\.flaggableGids;/);
});

// ── #203 Todo 4b Slice B: create-flag ──
check("#203 Slice B + GAP 3: nodeMenu offers verdict + one 'Add flag on <target>' per choice; no choices → verdict only", () => {
  const m = COCKPIT_SRC.match(/async function nodeMenu\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "nodeMenu body");
  assert.match(m[1], /const choices = flagTargetChoices\(hit\)/);
  assert.match(m[1], /if \(choices\.length === 0\) return nodeVerdictMenu\(revealKey\)/); // not flaggable → verdict only
  assert.match(m[1], /Set case verdict/);
  assert.match(m[1], /choices\.map\(\(c\) =>/); // one menu item per target choice
  assert.match(m[1], /Add flag on \$\{c\.label\}/); // labeled per choice
  assert.match(m[1], /const ver = indexVersion/); // ver/cel captured BEFORE the menu
  assert.match(m[1], /openFlagDrawer\(\{ target: pick\.choice \}\)/); // #211: opens the drawer on the RESOLVED target
});
check("#203 GAP 3: flagTargetChoices — decision root → object-decision; a `when` → concept (object) + this condition (occurrence); a leaf → this recommendation", () => {
  const m = COCKPIT_SRC.match(/function flagTargetChoices\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "flagTargetChoices body");
  assert.match(m[1], /crlStructure\.find\(\(s\) => s\.nodeKey === nodeKey\)/); // decision root = object-decision only
  assert.match(m[1], /tree\.conceptOccurrences\.find\(\(o\) => o\.gid === gid\)/); // when → the concept (object)
  assert.match(m[1], /occurrenceByNodeKey\(dec, nodeKey\)/); // leaf/condition → the occurrence
  assert.match(m[1], /key: occurrenceKeyValue\(occ\)/); // occurrence target carries the <nodeId>~<signature> key
  // #211: the occurrence carries a SHORT header label (no verbose signature) + the full label (signature) as the tooltip
  assert.match(m[1], /const short = occ\.isLeaf \? "this recommendation" : "this condition"/);
  assert.match(m[1], /label: `\$\{short\} \(\$\{occ\.signature\}\)`, shortLabel: short/);
});
check("#203 GAP 3: driveFlagBadges routes a KEYED decision flag to ONE node via resolveOccurrence, BEFORE the decision-root path; per-flag unplaced count", () => {
  const m = COCKPIT_SRC.match(/function driveFlagBadges\(\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "driveFlagBadges body");
  assert.match(m[1], /if \(f\.key && isOccurrenceKey\(f\.key\)\) \{[\s\S]*?resolveOccurrence\(dec, f\.key\)/); // occurrence branch, guarded against non-occurrence keys
  assert.match(m[1], /res\.placed \? tree\.anchors\[res\.ref\.nodeKey\]\?\.scrollTo : undefined/); // placed → the ONE node's gid
  assert.match(m[1], /if \(matched\.length === 0 && f\.scope === "decision" && f\.key && isOccurrenceKey\(f\.key\)\) unplaced\+\+/); // ONLY a genuine occurrence flag counts as moved/removed
  assert.match(m[1], /open: open\.length, resolved: resolvedCount, flagError: flagLoadError, unplaced/); // posts the unplaced count
});
check("#203 Slice B: findDeclaration re-parses src/crl (live-buffer via crlText), matching (name, lib) in the declaring library", () => {
  const m = COCKPIT_SRC.match(/function findDeclaration\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "findDeclaration body");
  assert.match(m[1], /readdirSync\(join\(src, "crl"\)\)/);
  assert.match(m[1], /crlText\(filePath\)/); // live-buffer-aware
  assert.match(m[1], /parsed\.result\.library\?\.name !== lib/); // match the declaring library
  assert.match(m[1], /declLine: decl\.location\.start\.line/);
});
check("#211: nodeMenu opens the drawer on the RESOLVED target (Option A) — openFlagDrawer, not a native gist chain", () => {
  const m = COCKPIT_SRC.match(/async function nodeMenu\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "nodeMenu body");
  assert.match(m[1], /openFlagDrawer\(\{ target: pick\.choice \}\)/); // the ONE seam; the webview never names a target
  assert.doesNotMatch(m[1], /addFlagAtNode/); // the old scratch-editor chain is gone
});
check("#211: openFlagDrawer is a STANDALONE seam — MV-only, captures ver/cel, posts the drawer", () => {
  const m = COCKPIT_SRC.match(/function openFlagDrawer\(prefill[^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "openFlagDrawer body");
  assert.match(m[1], /mode !== "medical-validation"\) return/); // MV-only
  assert.match(m[1], /flagDraft = \{ \.\.\.prefill, cel: currentCel \}/); // capture the POLICY identity for the commit guard (not indexVersion)
  assert.match(m[1], /postFlagDrawer\(\)/);
});
check("#211: commitFlagDraft — in-flight guard + DRY-RUN before any POST; identity keyed on currentCel/mode (NOT indexVersion)", () => {
  const m = COCKPIT_SRC.match(/async function commitFlagDraft\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "commitFlagDraft body");
  assert.match(m[1], /if \(flagCommitting\) return/); // a rapid second Insert must not double-POST / race the write
  assert.match(m[1], /const \{ target, cel \} = draft/); // TARGET is host-captured, never from the webview payload
  assert.match(m[1], /delete fields\.ref;\s*\n\s*delete fields\.key;/); // reserved keys stripped (tamper defense)
  assert.match(m[1], /if \(summary === ""\) return flagNote/); // title required
  assert.match(m[1], /\/\[\\r\\n\]\/\.test\(summary\)/); // lean gist must be ONE line
  assert.match(m[1], /hasForbiddenGistChars\(summary\)/); // shared sanitization
  // identity is currentCel/mode — a same-policy rebuild (indexVersion bump) must NOT discard the draft (both reviewers)
  assert.match(m[1], /if \(currentCel !== cel \|\| mode !== "medical-validation"\)[\s\S]*?flagNote\("policy changed/);
  assert.doesNotMatch(m[1], /indexVersion !== ver/); // the buggy guard is gone
  // the DRY-RUN (no ref) precedes the issue creation in the source
  const dryIdx = m[1].indexOf("const dry = createFlag(");
  const repoIdx = m[1].indexOf("githubRepoForFile(");
  assert.ok(dryIdx > 0 && repoIdx > 0 && dryIdx < repoIdx, "createFlag dry-run precedes the repo resolve / POST");
  assert.match(m[1], /if \(!dry\.ok\) return flagNote/); // abort with NO issue created; drawer stays open
});
check("#211: commitFlagDraft — trust+github gated, pre-POST recheck, LOCK+try/finally, issueNote folded into ONE honest note", () => {
  const m = COCKPIT_SRC.match(/async function commitFlagDraft\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.match(m[1], /flagCommitting = true;[\s\S]*?try \{/); // lock past the dry-run boundary, then the wrapped body
  assert.match(m[1], /\} finally \{\s*\n\s*flagCommitting = false;/); // released for a later retry
  assert.match(m[1], /if \(!vscode\.workspace\.isTrusted\)/); // trust gate
  assert.match(m[1], /githubRepoForFile\(vscode\.Uri\.file\(decl\.filePath\)\)/); // pure repo resolve (no persist)
  // a retarget during the async repo-resolve/auth aborts BEFORE any POST (no orphan issue for a policy the user left)
  const repoAt = m[1].indexOf("githubRepoForFile(");
  const rechecks = (m[1].match(/currentCel !== cel \|\| mode !== "medical-validation"/g) || []).length;
  assert.ok(rechecks >= 3, "pre-write guard + at least two pre-POST rechecks");
  assert.match(m[1], /ref = `#\$\{await createGithubIssue\(/); // ref from the created number
  // 401 Bad credentials (a stale cached token) → force a FRESH session + retry ONCE, rather than dead-ending
  assert.match(m[1], /e1 instanceof IssueCreateError && e1\.status === 401/);
  assert.match(m[1], /const fresh = await githubToken\(true\)/);
  assert.match(m[1], /catch \(e\)[\s\S]*?issue not created — \$\{e\.message\}/); // outer catch surfaces the RAW github message
  assert.match(m[1], /const withRef = ref \? \{ \.\.\.fields, ref \} : fields/);
  assert.match(m[1], /made\.insertLine >= doc2\.lineCount/); // EOF-safe on the captured file
  assert.match(m[1], /issue \$\{ref\} created but the flag couldn't be written/); // honest post-POST failure (never silent)
  assert.match(m[1], /if \(ref\) \{\s*\n\s*flagNote\(`issue \$\{ref\} created; flag added/); // success → status-bar note
  assert.match(m[1], /reportNoIssue\(`Flag added on [\s\S]*?issueNote \?\? "no issue link"\)/); // no issue → a LOUD, persistent warning with the reason
  assert.match(m[1], /issue not created — \$\{e\.message\}/); // the RAW GitHub error is surfaced (e.g. a 403 scope message)
  assert.match(m[1], /if \(currentCel === cel && mode === "medical-validation"\) \{[\s\S]*?loadFlags\(\)/); // refresh only if policy unchanged
  assert.ok(repoAt > 0, "repo resolve present");
});
check("#211: reportNoIssue is a LOUD, actionable warning — Manage Trust / Sign in to GitHub (clears the no-nag latch)", () => {
  const m = COCKPIT_SRC.match(/function reportNoIssue\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "reportNoIssue body");
  assert.match(m[1], /showWarningMessage\(msg, "Manage Workspace Trust"\)[\s\S]*?workbench\.trust\.manage/); // trust → one-click fix
  assert.match(m[1], /showWarningMessage\(msg, "Sign in to GitHub"\)/); // not-signed-in → a re-auth action
  assert.match(m[1], /githubAuthDeclined = false;[\s\S]*?getSession\("github", \["repo"\], \{ createIfNone: true \}\)/); // the action clears the latch + re-prompts
  assert.match(m[1], /showWarningMessage\(msg\);/); // other reasons (github error / no origin) → the raw message
});
check("#211: the drawer lives in a DEDICATED #flagDrawer region the render handler never wipes (survives a rebuild)", () => {
  assert.match(COCKPIT_SRC, /<div id="flagDrawer"><\/div>/); // shell region (sibling of #root)
  // the render swap clears #root + #fcChrome but NOT #flagDrawer
  const render = SCRIPT.slice(SCRIPT.indexOf("if(m.type==='render')"), SCRIPT.indexOf("v.postMessage({type:'ready'"));
  assert.ok(!/fld\.innerHTML/.test(render), "the render handler must NOT touch #flagDrawer");
  assert.match(SCRIPT, /else if\(m\.type==='flagDrawer'\)\{fld\.innerHTML=m\.html;if\(m\.html\)aff\(\);\}/); // its own channel + field-toggle
  // only the SELECTED tag's field group shows — a `.flag-fieldgroup` display rule must NOT beat the `[hidden]` attribute
  assert.match(COCKPIT_SRC, /\.flag-fieldgroup\[hidden\]\{display:none\}/);
});
check("#211 webview: Insert collects the tag + summary + stub + the VISIBLE tag's fields; Cancel/Close drop the draft", () => {
  assert.match(SCRIPT, /data-flag-close.*data-flag-cancel/); // close/cancel → flagDraftCancel
  assert.match(SCRIPT, /v\.postMessage\(\{type:'flagDraftCancel'\}\)/);
  assert.match(SCRIPT, /for\(const g of fld\.querySelectorAll\('\[data-flag-field-for\]'\)\)\{if\(g\.getAttribute\('data-flag-field-for'\)===tg\)\{grp=g;break;\}\}/); // collect the SELECTED group by iterating (no selector interpolation)
  assert.match(SCRIPT, /v\.postMessage\(\{type:'flagDraftInsert',tag:tg,summary:[^,]+,stub:[^,]+,fields:fields\}\)/);
  assert.match(SCRIPT, /const aff=\(\)=>\{[\s\S]*?g\.getAttribute\('data-flag-field-for'\)!==tg/); // client-side field-group toggle
});
check("#211: the message router wires flagDraftInsert → commitFlagDraft and flagDraftCancel → closeFlagDrawer", () => {
  assert.match(COCKPIT_SRC, /msg\.type === "flagDraftInsert"[\s\S]*?commitFlagDraft\(\{ tag: msg\.tag, summary: msg\.summary, stub: msg\.stub, fields: msg\.fields \}\)/);
  assert.match(COCKPIT_SRC, /msg\.type === "flagDraftCancel"[\s\S]*?closeFlagDrawer\(\)/);
});

// ── #203 Todo 4b Slice C: issue link-out ──
check("#203 Slice C: resolveIssueBase prefers the USER (global) value; a workspace value is trust-gated", () => {
  const m = COCKPIT_SRC.match(/function resolveIssueBase\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "resolveIssueBase body");
  assert.match(m[1], /inspect<string>\("issueBaseUrl"\)/);
  assert.match(m[1], /sanitizeIssueBase\(info\?\.globalValue\)/); // user value first
  assert.match(m[1], /if \(!vscode\.workspace\.isTrusted\) return undefined/); // repo value needs trust
  assert.match(m[1], /sanitizeIssueBase\(info\?\.workspaceValue\)/);
});
check("#203 Slice C: flagActionMenu offers Open-issue only for a numeric ref; a discoverable config item when trusted+no-base; re-resolve+guard at click", () => {
  const m = COCKPIT_SRC.match(/async function flagActionMenu\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "flagActionMenu body");
  assert.match(m[1], /const issueNo = issueRefOf\(flag\.fields\.get\("ref"\)\)/); // numeric-only guard
  // MENU BUILD is READ-ONLY (resolveIssueBase, config-only — never detects/writes on menu-open); a trusted+no-config
  // node offers "from git origin" (the click detects), else the manual-setting item.
  assert.match(m[1], /buildIssueUrl\(resolveIssueBase\(\), issueNo\)/); // configured base → open item
  assert.match(m[1], /isTrusted && flag\.filePath\) actions\.push\(\{ label: `↗ Open issue #\$\{issueNo\} \(from git origin\)`/); // detect-on-click item
  assert.match(m[1], /vscode\.workspace\.isTrusted\) actions\.push\(\{ label: `⚙ Set crl\.issueBaseUrl/); // discoverable config item
  // open path: identity guard, then RESOLVE-OR-DETECT at click (config wins; else auto-detect+persist from the flag's repo)
  assert.match(m[1], /if \(pick\.act === "issue"\)/);
  assert.match(m[1], /indexVersion !== ver \|\| currentCel !== cel \|\| mode !== "medical-validation"\) return "continue"/);
  assert.match(m[1], /const fileUri = flag\.filePath \? vscode\.Uri\.file\(flag\.filePath\) : undefined/); // keyed off the FLAG's .crl (nested/submodule)
  assert.match(m[1], /buildIssueUrl\(await resolveOrDetectIssueBase\(fileUri\), issueNo\)/); // config-first, else detect
  assert.match(m[1], /await vscode\.env\.openExternal\(vscode\.Uri\.parse\(url\)\)\)\) flagNote\(`could not open issue/);
});
check("#204/#211: gitRepositoryForFile is the SHARED, side-effect-free git-ext access (activate; getRepository, not repositories[0]); total", () => {
  const m = COCKPIT_SRC.match(/async function gitRepositoryForFile\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "gitRepositoryForFile body");
  assert.match(m[1], /ext\.isActive \? ext\.exports : await ext\.activate\(\)/); // activate if needed
  assert.match(m[1], /api\?\.getRepository\(fileUri\)/); // closest containing repo — NOT repositories[0]
  assert.doesNotMatch(m[1], /repositories\[0\]/); // never guess a repo
  assert.doesNotMatch(m[1], /config\.update|cfg\.update|flagNote/); // PURE — no persist, no note (the #211 issue-create needs this)
  assert.match(m[1], /\} catch \{\s*\n\s*return undefined;/); // total catch
});
check("#211: githubRepoForFile derives {owner,repo} from the origin via the SHARED helper + the github-only parser (no persist)", () => {
  const m = COCKPIT_SRC.match(/async function githubRepoForFile\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "githubRepoForFile body");
  assert.match(m[1], /await gitRepositoryForFile\(fileUri\)/); // reuse the shared access
  assert.match(m[1], /githubRepoFromRemote\(origin\?\.fetchUrl \|\| origin\?\.pushUrl\)/); // github-only parser
  assert.doesNotMatch(m[1], /cfg\.update|flagNote/); // no side effects
});
check("#211: githubToken — SILENT probe first, prompt once, decline latches; forceNew forces a BRAND-NEW session (401 recovery)", () => {
  const m = COCKPIT_SRC.match(/async function githubToken\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "githubToken body");
  assert.match(m[1], /if \(!forceNew\) \{/); // the silent probe + declined-latch are skipped on a forced re-auth
  assert.match(m[1], /getSession\("github", \["repo"\], \{ silent: true \}\)/); // silent probe first (no UI if signed in)
  assert.match(m[1], /if \(githubAuthDeclined\) return undefined/); // declined earlier → don't nag on every flag
  assert.match(m[1], /forceNew \? \{ forceNewSession: true \} : \{ createIfNone: true \}/); // 401 → a guaranteed-fresh session
  assert.match(m[1], /if \(!forceNew\) githubAuthDeclined = true;/); // a normal decline latches; a forced re-auth decline doesn't
});
check("#204 auto-detect: detectIssueBaseFromGit uses the shared repo access, github-only, persists-if-unset, total (no throw)", () => {
  const m = COCKPIT_SRC.match(/async function detectIssueBaseFromGit\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "detectIssueBaseFromGit body");
  assert.match(m[1], /await gitRepositoryForFile\(fileUri\)/); // shared access (the closest containing repo)
  assert.doesNotMatch(m[1], /repositories\[0\]/); // never guess a repo
  assert.match(m[1], /githubIssuesBaseFromRemote\(origin\?\.fetchUrl \|\| origin\?\.pushUrl\)/); // fetch|push, github-only parser
  assert.match(m[1], /!info\?\.globalValue && !info\?\.workspaceValue && !info\?\.workspaceFolderValue/); // persist ONLY if unset (never clobber a user value)
  assert.match(m[1], /ConfigurationTarget\.WorkspaceFolder/); // per-repo owning folder
  assert.match(m[1], /derived the issue tracker from your git origin/); // non-silent note
  assert.match(m[1], /\} catch \{\s*\n\s*return undefined;/); // TOTAL outer catch — a link click never throws
});
check("#204 auto-detect: resolveOrDetectIssueBase — config WINS (respects the user setting); detect only in a trusted workspace", () => {
  const m = COCKPIT_SRC.match(/async function resolveOrDetectIssueBase\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  assert.ok(m, "resolveOrDetectIssueBase body");
  assert.match(m[1], /const configured = resolveIssueBase\(\);\s*\n\s*if \(configured\) return configured/); // config first — a set value is always respected
  assert.match(m[1], /if \(!vscode\.workspace\.isTrusted \|\| !fileUri\) return undefined/); // detect needs trust
  assert.match(m[1], /return detectIssueBaseFromGit\(fileUri\)/);
});

check("tree zoom: applyZoom scales the SVG BOX (viewBox base × treeZoom, not a CSS transform), re-applied after render", () => {
  assert.match(SCRIPT, /let treeZoom=1;/);
  assert.match(SCRIPT, /const applyZoom=\(\)=>\{const s=root\.querySelector\('\.flow-svg'\)/); // reads the flow SVG
  assert.match(SCRIPT, /s\.style\.width=\(bw\*treeZoom\)\+'px';s\.style\.height=\(bh\*treeZoom\)\+'px'/); // scale the box → the pane scrolls to pan
  assert.match(SCRIPT, /const setZoom=\(z\)=>\{treeZoom=Math\.min\(3,Math\.max\(\.25,z\)\)/); // clamped 0.25–3×
  assert.match(SCRIPT, /root\.innerHTML=m\.html;fcc\.innerHTML='';[\s\S]*?applyZoom\(\);/); // persists across a re-render
});
check("tree zoom: Ctrl+wheel (flow pane only, passive:false) + Ctrl +/-/0 + the − / reset / + control", () => {
  assert.match(SCRIPT, /addEventListener\('wheel',\(e\)=>\{if\(!e\.ctrlKey\)return;if\(!root\.querySelector\('\.flow-svg'\)\)return;e\.preventDefault\(\)/); // Ctrl+wheel, tree only
  assert.match(SCRIPT, /\{passive:false\}/); // preventDefault must work on wheel
  assert.match(SCRIPT, /keydown[\s\S]*?e\.key==='0'[\s\S]*?setZoom\(1\)/); // Ctrl+0 resets
  assert.match(SCRIPT, /closest\('\[data-zoom\]'\)[\s\S]*?setZoom\(a==='in'\?treeZoom\*1\.2:a==='out'\?treeZoom\/1\.2:1\)/); // control buttons
});

console.log(`\ncockpitWebviewScript.test: ${pass} checks passed`);
