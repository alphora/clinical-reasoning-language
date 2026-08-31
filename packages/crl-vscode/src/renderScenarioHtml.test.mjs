// Unit tests for the scenario-runner's pure pieces (roadmap item #3): renderScenarioHtml / renderErrorHtml
// (the webview body + reveals map) and isRelevantSave (the live-re-run filter). These are extension TS but
// vscode-free, so — like the golden oracle — esbuild bundles them to ESM and we import them under node. The
// happy-path fixture is a REAL RenderScenarioResult from the core (renderScenario on dme101-030).
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveCelImports, renderScenario } from "@smile-digital-health/crl";

const here = dirname(fileURLToPath(import.meta.url));

import { renderScenarioHtml, renderErrorHtml, failedCriterionMarks } from "./renderScenarioHtml.ts";
import { isRelevantSave } from "./scenarioWatch.ts";

// #189 — UN-MARKED. This block renders the REAL dme101-030 view-model, and was an expected-fail while the CRE
// could not evaluate its both-rep age concept (`Adult Eighteen Or Older`) — the `value projection` posrep drove
// the run to status error. The CRE now evaluates it, `test.fails` flagged GREEN exactly as it was designed to,
// and the marker is removed. Un-marking also restores this block's XSS/reveal/error/isRelevantSave coverage,
// which used to short-circuit at the first failing assertion.
test("renderScenarioHtml — render/error/reveal/XSS/isRelevantSave", () => {
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

// meta header tweaks: expected = branch only; "produced" → "actual"; expected/actual color-tagged
assert.ok(html.includes("<dt>actual</dt>"), "the produced row is relabeled 'actual'");
assert.ok(!html.includes("<dt>produced</dt>"), "no legacy 'produced' meta label remains");
assert.ok(html.includes('class="actual pass"'), "the actual value carries the status class for coloring");
assert.ok(html.includes('class="expected pass"'), "the expected value carries the status class");
assert.ok(html.includes('<span class="mark">✓</span>'), "expected/actual prefixed with a ✓ on a passing case");
assert.ok(!/Coverage is (Approve|Deny)/.test(html), "expected shows just the branch, not '<decision> is <branch>'");

// a failing case shows a red ✗ mark + the fail status class on expected/actual
const failVm = JSON.parse(JSON.stringify(result));
failVm.scenarios[0].status = "fail";
const failHtml = renderScenarioHtml(failVm).html;
assert.ok(failHtml.includes('<span class="mark">✗</span>'), "a failing case uses the ✗ mark");
assert.ok(failHtml.includes('class="actual fail"'), "a failing case tags actual with the fail status");

// --- determination outcomes render as the human key, not the dotted `<category>.<key>` name ---
// dme101-030 produces `certify.Approve` / `not-certify.Deny`; the tree leaf + the actual meta row must show the KEY only.
assert.ok(!html.includes("certify."), "no `certify.` / `not-certify.` dotted prefix appears anywhere in the tree/meta");
assert.ok(/>Approve</.test(html) || html.includes("Approve"), "the certify leaf shows the human key `Approve`");
assert.ok(html.includes("Deny"), "the not-certify leaf shows the human key `Deny`");
// a keyed flavor WITH a space is preserved end-to-end (tree label + actual row), and stays un-dotted.
const detVm = JSON.parse(JSON.stringify(result));
const detCase = detVm.scenarios[0];
detCase.produced = [{ recommendation: "not-certify.Unmet EIU", actionKind: "recommend-activity" }];
detCase.expected = { decision: detCase.decision?.name ?? "D", branch: "not-certify.Unmet EIU" };
// give the tree a produced determination leaf so the arm/leaf label path is exercised too
detCase.tree = [{
  nodeId: "when[0].action[0]", kind: "action", label: "not-certify.Unmet EIU",
  source: { filePath: "/x.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
  evaluated: true, action: { actionKind: "recommend-activity", produced: true }, children: [],
}];
const detHtml = renderScenarioHtml(detVm).html;
assert.ok(detHtml.includes("Unmet EIU"), "a keyed determination with a space renders its full key");
assert.ok(!detHtml.includes("not-certify.Unmet EIU"), "the dotted determination name is NOT rendered (display strips it)");
assert.ok(detHtml.includes('<span class="label">Unmet EIU</span>'), "the tree arm/leaf label shows just the key");

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// #173 T3b — the failed-criterion in-place highlight (failedCriterionMarks + the stamped data-fc-* attributes).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
});

const t3b = test;

// VM node builders carrying the run-state fields the T2 selectors read.
const vmWhen = (nodeId, satisfied, name, children = []) => ({
  nodeId, kind: "when", label: `when ${name}`, source: { filePath: "p.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
  evaluated: true, condition: { concept: { name }, satisfied, facts: [] }, children,
});
const vmAct = (nodeId, label) => ({
  nodeId, kind: "action", label, source: { filePath: "p.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
  evaluated: true, action: { actionKind: "recommend-activity", produced: false }, children: [],
});
const scenario = (status, branch, tree) => ({
  case: { name: "C", facts: [] }, decision: { name: "Top", libraryName: "Pol", resolved: true },
  status, expected: branch ? { decision: "Top", branch } : null, produced: [], tree, diagnostics: [],
});
const resultOf = (sv) => ({ schemaVersion: 1, success: sv.status === "pass", source: { celFilePath: "x.cel" },
  caseCount: 1, passCount: sv.status === "pass" ? 1 : 0, failCount: sv.status === "fail" ? 1 : 0,
  errorCount: sv.status === "error" ? 1 : 0, scenarios: [sv], errors: [] });

t3b("failedCriterionMarks: a failing case marks the blocking unsatisfied-when (inBlocking + inAll)", () => {
  const sv = scenario("fail", "Approve", [vmWhen("when[0]", false, "Indication", [vmAct("when[0]/action[0]", "Approve")])]);
  const marks = failedCriterionMarks(sv);
  const m = marks.get("when[0]");
  assert.ok(m, "the false when is marked");
  assert.equal(m.reason, "unsatisfied-when");
  assert.ok(m.inBlocking && m.inAll, "an unsatisfied-when frontier blocker is in BOTH sets");
  assert.equal(m.label, "when Indication");
});

t3b("failedCriterionMarks: preemption marks the MATCHED SATISFIED sibling, BLOCKING-only (not in All)", () => {
  const matched = vmWhen("when[0]", true, "Early", [vmAct("when[0]/action[0]", "Defer")]);
  const preempted = { nodeId: "when[1]", kind: "when", label: "when Late", source: { filePath: "p.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
    evaluated: false, unreachedReason: "preempted", children: [vmAct("when[1]/action[0]", "Approve")] };
  const marks = failedCriterionMarks(scenario("fail", "Approve", [matched, preempted]));
  const m = marks.get("when[0]");
  assert.ok(m, "the matched sibling is marked");
  assert.equal(m.reason, "preemption");
  assert.ok(m.inBlocking, "preemption is a Blocking-set blocker");
  assert.ok(!m.inAll, "the SATISFIED matched sibling is NOT an unsatisfied when → NOT in All");
});

t3b("failedCriterionMarks: All-mode lists every evaluated-unsatisfied when (satisfied excluded)", () => {
  const sv = scenario("fail", "X", [vmWhen("when[0]", false, "A"), vmWhen("when[1]", false, "B"), vmWhen("when[2]", true, "C")]);
  const marks = failedCriterionMarks(sv);
  assert.ok(marks.get("when[0]").inAll && marks.get("when[1]").inAll, "both false whens in All");
  assert.ok(!marks.has("when[2]"), "the satisfied when is not marked");
});

t3b("failedCriterionMarks: a PASS with no unsatisfied whens → empty (Blocking self-gates; no frontier)", () => {
  const sv = scenario("pass", "Approve", [vmAct("action[0]", "Approve")]);
  assert.equal(failedCriterionMarks(sv).size, 0, "no marks on a pass with no unsatisfied whens");
});

t3b("failedCriterionMarks: an ERROR case → empty even with an unsatisfied when in the (partial) tree", () => {
  const sv = scenario("error", "Approve", [vmWhen("when[0]", false, "Indication")]);
  assert.equal(failedCriterionMarks(sv).size, 0, "error status gated → no marks (partial trace)");
});

t3b("render: a failing case stamps data-fc-blocking + data-fc-all + reason on the blocking node", () => {
  const sv = scenario("fail", "Approve", [vmWhen("when[0]", false, "Indication", [vmAct("when[0]/action[0]", "Approve")])]);
  const out = renderScenarioHtml(resultOf(sv));
  assert.match(out.html, /<li class="node[^"]*" data-fc-blocking="1" data-fc-all="1" data-fc-reason="unsatisfied-when" data-fc-tip="blocked: when Indication">/);
});

// #224 i.4b — a COMPOUND guard whose failure is a false `or` gets the rich per-alternative HOVER detail
// (data-fc-tip + title), while the always-visible inline label stays the short "unmet: ..." summary.
const bcRef = (name, satisfied) => ({ op: "ref", satisfied, concept: { name } });
const vmCompoundWhen = (nodeId, expr, satisfied, guardLabel, children = []) => ({
  nodeId, kind: "when", label: `when ${guardLabel}`, source: { filePath: "p.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
  evaluated: true, condition: { expr, satisfied, facts: [] }, children,
});
t3b("render: a compound `(A or B) and C` all-false blocker carries per-alternative detail in the HOVER, short label inline", () => {
  const expr = { op: "and", satisfied: false, operands: [
    { op: "or", satisfied: false, operands: [bcRef("A", false), bcRef("B", false)] },
    bcRef("C", false),
  ] };
  const sv = scenario("fail", "Approve", [vmCompoundWhen("when[0]", expr, false, "(A or B) and C", [vmAct("when[0]/action[0]", "Approve")])]);
  const out = renderScenarioHtml(resultOf(sv));
  // the HOVER (data-fc-tip) expands the false `or` into its alternatives + the bare conjunct — no dangling token.
  assert.match(out.html, /data-fc-tip="blocked: when \(A or B\) and C — unmet: no alternative held, C — alt 1 \(A\): unmet; alt 2 \(B\): unmet; C unmet"/);
  // the always-on inline label is the SHORT summary only (no per-alternative expansion).
  assert.match(out.html, /<span class="fc-tip[^"]*">blocked: when \(A or B\) and C — unmet: no alternative held, C<\/span>/);
});

// FIX 2 (disc 160): the label must be USER-VISIBLE — a row `title` + an inline `.fc-tip` span — not just the inert
// data-fc-tip attribute (which nothing rendered).
t3b("render: a blocker's label is VISIBLE — the .row title AND an inline .fc-tip span carry 'blocked: when Indication'", () => {
  const sv = scenario("fail", "Approve", [vmWhen("when[0]", false, "Indication", [vmAct("when[0]/action[0]", "Approve")])]);
  const out = renderScenarioHtml(resultOf(sv));
  assert.match(out.html, /<span class="row" data-reveal="[^"]*" title="blocked: when Indication[^"]*">/, "the row title says WHY");
  assert.match(out.html, /<span class="fc-tip fc-tip-blk fc-in-blocking fc-in-all">blocked: when Indication<\/span>/, "inline visible label");
});

t3b("render: a preemption node stamps data-fc-preempt (NOT data-fc-blocking/all) + a VISIBLE 'diverted' label", () => {
  const matched = vmWhen("when[0]", true, "Early", [vmAct("when[0]/action[0]", "Defer")]);
  const preempted = { nodeId: "when[1]", kind: "when", label: "when Late", source: { filePath: "p.crl", range: { startLine: 0, startCol: 0, endLine: 0, endCol: 1 } },
    evaluated: false, unreachedReason: "preempted", children: [vmAct("when[1]/action[0]", "Approve")] };
  const out = renderScenarioHtml(resultOf(scenario("fail", "Approve", [matched, preempted])));
  assert.match(out.html, /data-fc-preempt="1" data-fc-reason="preemption" data-fc-tip="matched first and diverted the run/);
  assert.match(out.html, /<span class="fc-tip fc-tip-preempt fc-only-blocking">matched first and diverted the run/, "visible amber diverted label");
  // the matched node must NOT carry the red blocker attributes (it's a satisfied diverting sibling)
  const liMatched = out.html.match(/<li class="node[^>]*data-fc-preempt[^>]*>/)[0];
  assert.ok(!liMatched.includes("data-fc-blocking"), "preemption node is not a red blocker");
});

t3b("render: a PASS case stamps NO data-fc-blocking; an ERROR case stamps no marks at all", () => {
  const passHtml = renderScenarioHtml(resultOf(scenario("pass", "Approve", [vmAct("action[0]", "Approve")]))).html;
  assert.ok(!passHtml.includes("data-fc-blocking") && !passHtml.includes("data-fc-preempt"), "no blocking marks on a pass");
  const errHtml = renderScenarioHtml(resultOf(scenario("error", "Approve", [vmWhen("when[0]", false, "Indication")]))).html;
  assert.ok(!errHtml.includes("data-fc-"), "no marks on an error case");
});

t3b("render: the VISIBLE tip (row title + inline span) is HTML-escaped (XSS via a concept name)", () => {
  const sv = scenario("fail", "Approve", [vmWhen("when[0]", false, '"><img src=x>', [vmAct("when[0]/action[0]", "Approve")])]);
  const out = renderScenarioHtml(resultOf(sv));
  assert.ok(!out.html.includes('"><img src=x>'), "raw concept name does not break out of the title attr or the span");
  assert.ok(out.html.includes("&quot;&gt;&lt;img src=x&gt;"), "concept name escaped");
  // the USER-VISIBLE paths (title + inline span), not just the inert data attribute, must be safe
  assert.match(out.html, /title="blocked: when &quot;&gt;&lt;img src=x&gt;/, "escaped in the visible row title");
  assert.match(out.html, /class="fc-tip[^"]*">blocked: when &quot;&gt;&lt;img src=x&gt;/, "escaped in the visible inline label");
});

t3b("render: All-mode marks survive on a PASS case's untaken-branch unsatisfied whens (the All contract)", () => {
  // A passing case can still have evaluated-unsatisfied whens on untaken branches → All marks them (Blocking does not).
  const sv = scenario("pass", "Approve", [vmWhen("when[0]", false, "Other"), vmAct("action[0]", "Approve")]);
  const marks = failedCriterionMarks(sv);
  assert.ok(marks.get("when[0]") && marks.get("when[0]").inAll && !marks.get("when[0]").inBlocking,
    "untaken false when is in All but not Blocking on a pass");
  assert.ok(renderScenarioHtml(resultOf(sv)).html.includes('data-fc-all="1"'), "stamped for All mode");
});

