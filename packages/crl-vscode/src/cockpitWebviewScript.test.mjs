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

const { COCKPIT_WEBVIEW_SCRIPT: SCRIPT } = await loadCockpit();

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
  assert.ok(!/done-node|error-node/.test(body), "highlight MUST NOT touch the review classes at all");
});

check("SURVIVES-SELECTION: the clearHighlight handler does NOT call clrRO (clearing the selection keeps the review overlay)", () => {
  const body = handlerBody("clearHighlight");
  assert.ok(/clrFC\(\)/.test(body), "clearHighlight DOES clear the failed-criterion channel (sanity)");
  assert.ok(!/clrRO\(\)/.test(body), "clearHighlight MUST NOT call clrRO — review overlay survives a selection clear");
  assert.ok(!/done-node|error-node/.test(body), "clearHighlight MUST NOT touch the review classes");
});

check("SURVIVES-SELECTION: clrFC strips ONLY the failed-criterion classes, never the review classes", () => {
  const m = SCRIPT.match(/const clrFC=\(\)=>\{[^}]*\}[^;]*\};/);
  assert.ok(m, "clrFC body");
  assert.ok(!/done-node|error-node/.test(m[0]), "clrFC never removes .done-node/.error-node");
});

check("the failed-criterion handlers (markFailedCriteria/clearFailedCriteria) do NOT touch the review classes either", () => {
  for (const type of ["markFailedCriteria", "clearFailedCriteria"]) {
    const body = handlerBody(type);
    assert.ok(!/clrRO\(\)|done-node|error-node/.test(body), `${type} MUST NOT touch the review overlay (independent channel)`);
  }
});

// ── error-over-done single-classing (FIX 2b) ──
check("ERROR-OVER-DONE: markReviewOverlay adds .error-node to the error set, then SKIPS done-node for ids already in error", () => {
  const body = handlerBody("markReviewOverlay");
  assert.ok(/clrRO\(\)/.test(body), "mark clears the prior overlay first (clear-then-set)");
  assert.ok(/const errSet=new Set\(m\.error\|\|\[\]\)/.test(body), "builds the error id set");
  assert.ok(/errSet[\s\S]*add\('error-node'\)/.test(body), "error ids → .error-node");
  // The single-classing guard: in the done loop, ids present in errSet are skipped (continue) BEFORE adding done-node.
  assert.ok(/errSet\.has\(id\)\)continue;[\s\S]*add\('done-node'\)/.test(body), "done loop skips ids in errSet (error-over-done)");
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
  assert.ok(!/current|failed-criterion|done-node|error-node/.test(m[0]), "clrTN strips only .this-node");
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

console.log(`\ncockpitWebviewScript.test: ${pass} checks passed`);
