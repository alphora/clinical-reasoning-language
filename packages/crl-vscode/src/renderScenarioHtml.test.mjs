// Unit tests for the scenario-runner's pure pieces (roadmap item #3): renderScenarioHtml / renderErrorHtml
// (the webview body + reveals map) and isRelevantSave (the live-re-run filter). These are extension TS but
// vscode-free, so — like the golden oracle — esbuild bundles them to ESM and we import them under node. The
// happy-path fixture is a REAL RenderScenarioResult from the core (renderScenario on dme101-030).
import { build } from "esbuild";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolveCelImports, renderScenario } from "@smile-digital-health/crl";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function load(tsFile) {
  // CJS output: the bundle pulls in the (CommonJS) core for `canonicalize`, whose require("node:path")
  // needs CJS — an ESM bundle would turn it into an unsupported dynamic require.
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, tsFile)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
  });
  return require(out);
}

const { renderScenarioHtml, renderErrorHtml } = await load("renderScenarioHtml.ts");
const { isRelevantSave } = await load("scenarioWatch.ts");

// --- renderScenarioHtml over the real dme101 view-model ---
const celPath = resolve(here, "../../crl/src/tests/fixtures/policies/dme101-030/dme101-030.cel");
const result = renderScenario(resolveCelImports(celPath));
const { html, reveals } = renderScenarioHtml(result);

assert.ok(html.includes("Skull fracture"), "renders the exclusion case name");
assert.ok(/2\/3 pass|3\/3 pass/.test(html), "renders the pass summary");
assert.ok(html.includes("PRODUCED"), "marks a produced action");
assert.ok(html.includes("preempted"), "marks a preempted branch (the exclusion short-circuits the rest)");
assert.ok(html.includes("satisfied"), "marks a satisfied condition");
assert.ok(html.includes('data-reveal="'), "nodes carry an opaque reveal key");

const keys = Object.keys(reveals);
assert.ok(keys.length > 0, "reveals map is populated");
for (const k of keys) {
  const r = reveals[k];
  assert.equal(typeof r.filePath, "string", `reveal ${k} has a filePath`);
  for (const f of ["startLine", "startCol", "endLine", "endCol"]) {
    assert.equal(typeof r.range[f], "number", `reveal ${k} range.${f} is a number`);
  }
  assert.ok(html.includes(`data-reveal="${k}"`), `every reveal key ${k} appears in the html`);
}

// --- XSS: author strings are escaped, never raw HTML ---
const evil = {
  schemaVersion: 1,
  success: true,
  source: { celFilePath: "/x.cel" },
  caseCount: 1,
  passCount: 1,
  failCount: 0,
  errorCount: 0,
  errors: [],
  scenarios: [
    {
      case: { name: '<img src=x onerror=alert(1)> "evil"', facts: [] },
      decision: { name: "D", resolved: true },
      status: "pass",
      expected: null,
      produced: [],
      tree: [
        {
          nodeId: "when[0]",
          kind: "when",
          label: '<script>alert(2)</script>',
          source: { filePath: "/x.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
          evaluated: true,
          condition: { concept: { name: "C" }, satisfied: true, facts: ['<b>f</b>'] },
        },
      ],
      diagnostics: [],
    },
  ],
};
const evilHtml = renderScenarioHtml(evil).html;
assert.ok(!evilHtml.includes("<img src=x"), "raw <img> is escaped");
assert.ok(!evilHtml.includes("<script>alert(2)"), "raw <script> is escaped");
assert.ok(evilHtml.includes("&lt;script&gt;alert(2)"), "the label is HTML-escaped");
assert.ok(evilHtml.includes("&lt;img src=x"), "the case name is HTML-escaped");

// --- renderErrorHtml ---
const err = renderErrorHtml("did not run", ['covers "X" unresolved <b>', "second"]);
assert.ok(err.html.includes("did not run"), "error title rendered");
assert.ok(err.html.includes("&lt;b&gt;"), "error message escaped");
assert.deepEqual(err.reveals, {}, "error view has no reveals");

// --- reveal keys are render-namespaced (stale-DOM clicks become unknown keys) ---
const prefixed = renderScenarioHtml(result, { revealPrefix: "9:" });
const pkeys = Object.keys(prefixed.reveals);
assert.ok(pkeys.length > 0 && pkeys.every((k) => k.startsWith("9:")), "revealPrefix namespaces every key");
assert.ok(prefixed.html.includes('data-reveal="9:'), "the prefix appears in the html");
assert.ok(!(pkeys[0] in reveals), "a prefixed key is NOT in the unprefixed render's map");

// --- isRelevantSave ---
assert.equal(isRelevantSave("/proj/lib.crl", undefined), true, "any .crl save re-renders (even before a .cel target)");
assert.equal(isRelevantSave("/proj/a.cel", "/proj/a.cel"), true, "the active .cel re-renders");
assert.equal(isRelevantSave("/proj/b.cel", "/proj/a.cel"), false, "an unrelated .cel does not");
assert.equal(isRelevantSave("/proj/a.cel", undefined), false, "a .cel with no active target does not");
if (process.platform === "win32") {
  // canonicalize uppercases the drive so a drive-case mismatch still matches the active .cel.
  assert.equal(isRelevantSave("e:\\proj\\a.cel", "E:\\proj\\a.cel"), true, "Windows drive-case is canonicalized");
}

console.log(`renderScenarioHtml.test.mjs: ${keys.length} reveal keys; render + XSS + error + isRelevantSave checks passed.`);
