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

const { COCKPIT_WEBVIEW_SCRIPT: SCRIPT, leafMarkBuckets, leafBucketsFromQuestionnaire, resolveProducedLeafKeys, shouldWidenFilterForSelection } = await loadCockpit();

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
check("Slice 1b/#210: driveDoneOverlay reviewed-only painting; litNodeKeys = interior ∪ PRODUCED leaves ∪ yes sub-questions", () => {
  // reviewed-only painting input: unreviewed cases can't vote.
  assert.ok(/buildReviewPerCase\(\s*Object\.keys\(reviewByCaseId\)/.test(COCKPIT_SRC), "buildReviewPerCase is fed Object.keys(reviewByCaseId), not scenarioByCaseId.keys()");
  // INTERIOR structure = crlAnchors MINUS disposition leaves (reveal reach); leaves come from the EXECUTION reach instead.
  assert.ok(/crlAnchorsForUnits\(unitsForCase\(caseId, m\), m\)\.filter\(\(k\) => !dispositionLeafKeys\.has\(k\)\)/.test(COCKPIT_SRC), "interior = crlAnchors minus disposition leaves");
  assert.ok(/const produced = producedByCaseId\.get\(caseId\)/.test(COCKPIT_SRC), "the case's PRODUCED disposition leaves (execution reach) are unioned in");
  assert.ok(/leafBucketsFromQuestionnaire\(questionnaireFor\(caseId, sv\)\.questions/.test(COCKPIT_SRC), "on-path sub-question yes-leaves via questionnaireFor");
  assert.ok(/return \[\.\.\.interior, \.\.\.produced, \.\.\.yes\];/.test(COCKPIT_SRC), "litNodeKeys = interior ∪ produced ∪ yes");
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

console.log(`\ncockpitWebviewScript.test: ${pass} checks passed`);
