// String-level regression tests for the cockpit/MV webview SCRIPT BODY (#156 slice 5, FIX 2 from the gpt55 impl review).
// The slice's CENTRAL invariant — the Medical Validation done/error overlay SURVIVES selection changes — was previously
// only comment/code-protected. Here we lock it against the exported COCKPIT_WEBVIEW_SCRIPT string.
//
// correspondenceCockpit.ts imports `vscode` (unavailable under plain node), so — unlike the other vscode-free renderers —
// we esbuild-bundle it with a tiny plugin that resolves `vscode` to an EMPTY stub. The module's top level only runs imports
// + const/function definitions (no side effects), so the stub suffices to evaluate COCKPIT_WEBVIEW_SCRIPT (a pure string).
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

console.log(`\ncockpitWebviewScript.test: ${pass} checks passed`);
