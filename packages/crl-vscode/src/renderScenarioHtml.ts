// Pure renderer for the scenario-runner webview (roadmap item #3). Takes the headless
// `RenderScenarioResult` (the CRE↔UI contract) and returns the webview BODY HTML + a `reveals`
// map (opaque key → source span). NO vscode import → unit-testable under node. The host posts
// `html` into the webview and keeps `reveals` to resolve click-to-source safely (it never trusts
// a path/range sent back by the webview — only the opaque key, looked up in `reveals`).
//
// The CSS lives in `SCENARIO_STYLE` (no <style> tag) — the host wraps it in a NONCED <style> in
// the shell, so the page CSP needs no `style-src 'unsafe-inline'` and the dynamic body (injected
// via innerHTML) carries no styles of its own. `opts.revealPrefix` namespaces reveal keys per
// render so a click on stale DOM (after the host swapped in a new render's `reveals`) resolves to
// an unknown key and is ignored, rather than mis-resolving to a same-positioned node.
import type { RenderScenarioResult, ScenarioViewModel, ViewNode } from "@smile-digital-health/crl";

export interface RenderedScenario {
  html: string;
  /** key (`<revealPrefix><caseIdx>.<nodeId>`) → the CRL source span to reveal on click. */
  reveals: Record<string, { filePath: string; range: { startLine: number; startCol: number; endLine: number; endCol: number } }>;
}

export interface RenderOptions {
  /** Namespaces reveal keys per render (the host passes the render generation). Default "". */
  revealPrefix?: string;
}

/** HTML-escape every interpolated author/string value (text + attribute contexts). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The run-state badge for a node (drives both the label text and the CSS class). */
function nodeState(n: ViewNode): { cls: string; badge: string } {
  if (n.kind === "action") {
    if (!n.evaluated) return { cls: "st-skip", badge: "not reached" };
    if (n.guardedOut) return { cls: "st-guard", badge: "guarded out" };
    if (n.action?.produced) return { cls: "st-produced", badge: "PRODUCED" };
    return { cls: "st-eval", badge: "evaluated" };
  }
  // when / otherwise
  if (!n.evaluated) {
    return n.unreachedReason === "preempted"
      ? { cls: "st-preempt", badge: "preempted" }
      : { cls: "st-skip", badge: "not reached" };
  }
  if (n.condition) return n.condition.satisfied ? { cls: "st-sat", badge: "satisfied" } : { cls: "st-unsat", badge: "not satisfied" };
  return { cls: "st-eval", badge: "evaluated" };
}

function renderNode(n: ViewNode, caseIdx: number, prefix: string, reveals: RenderedScenario["reveals"]): string {
  const { cls, badge } = nodeState(n);
  const key = `${prefix}${caseIdx}.${n.nodeId}`;
  if (n.source) reveals[key] = { filePath: n.source.filePath, range: n.source.range };

  const facts =
    n.kind !== "action" && n.condition?.facts?.length
      ? `<span class="facts">⟵ ${n.condition.facts.map(esc).join(", ")}</span>`
      : "";
  const guard =
    n.kind === "action" && n.guard
      ? `<span class="guard">[${esc(n.guard.polarity)} ${esc(n.guard.concept.name)}${
          n.guard.evaluated ? (n.guard.satisfied ? " ✓" : " ✗") : ""
        }]</span>`
      : "";
  const children = n.children?.length
    ? `<ul>${n.children.map((c) => renderNode(c, caseIdx, prefix, reveals)).join("")}</ul>`
    : "";

  return (
    `<li class="node ${cls}">` +
    `<span class="row" data-reveal="${esc(key)}" title="${esc(n.source ? n.source.filePath : "")}">` +
    `<span class="badge">${esc(badge)}</span>` +
    `<span class="label">${esc(n.label)}</span>${facts}${guard}` +
    `</span>${children}</li>`
  );
}

function renderCase(s: ScenarioViewModel, caseIdx: number, prefix: string, reveals: RenderedScenario["reveals"]): string {
  const statusCls = s.status === "pass" ? "pass" : s.status === "fail" ? "fail" : "err";
  const mark = s.status === "pass" ? "✓" : "✗"; // green check on a match, red X otherwise (unit-test style)
  const facts = s.case.facts.map((f) => esc(f.name) + (f.conceptRef ? ` <em>(${esc(f.conceptRef)})</em>` : "")).join(", ");
  // expected = just the branch (the decision name is already on the `decision` row above).
  const expected = s.expected ? esc(s.expected.branch) : "—";
  const actual = s.produced.length ? s.produced.map((p) => esc(p.recommendation)).join(", ") : "(none)";
  const decision = s.decision
    ? esc(s.decision.name) + (s.decision.resolved ? "" : " <span class=\"err\">(unresolved)</span>")
    : "(no decision)";
  const tree = s.tree.length ? `<ul class="tree">${s.tree.map((n) => renderNode(n, caseIdx, prefix, reveals)).join("")}</ul>` : "";

  return (
    `<section class="case">` +
    `<h2><span class="status ${statusCls}">${esc(s.status.toUpperCase())}</span> ${esc(s.case.name)}</h2>` +
    (s.case.description ? `<p class="desc">${esc(s.case.description.replace(/\s+/g, " ").trim())}</p>` : "") +
    `<dl class="meta">` +
    (s.case.subject ? `<dt>subject</dt><dd>${esc(s.case.subject)}</dd>` : "") +
    `<dt>facts</dt><dd>${facts || "(none)"}</dd>` +
    `<dt>decision</dt><dd>${decision}</dd>` +
    `<dt>expected</dt><dd class="expected ${statusCls}"><span class="mark">${mark}</span>${expected}</dd>` +
    `<dt>actual</dt><dd class="actual ${statusCls}"><span class="mark">${mark}</span>${actual}</dd>` +
    `</dl>` +
    tree +
    (s.diagnostics.length ? `<ul class="diags">${s.diagnostics.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "") +
    `</section>`
  );
}

/** Scenario-runner CSS (no <style> tag — the host wraps it in a nonced <style> in the shell). */
export const SCENARIO_STYLE = `
:root { color-scheme: var(--vscode-editor-foreground); }
body, .sr { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
.summary { padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; }
.summary .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
.summary .bad { color: var(--vscode-testing-iconFailed, #f85149); }
.case { margin: 10px 0 16px; }
.case h2 { font-size: 1.05em; margin: 6px 0; }
.status { font-size: .8em; padding: 1px 6px; border-radius: 3px; margin-right: 6px; }
.status.pass { background: var(--vscode-testing-iconPassed, #2ea043); color: #fff; }
.status.fail, .status.err { background: var(--vscode-testing-iconFailed, #da3633); color: #fff; }
.desc { opacity: .8; font-style: italic; margin: 2px 0 6px; }
dl.meta { display: grid; grid-template-columns: max-content 1fr; gap: 0 10px; margin: 4px 0 8px; }
dl.meta dt { opacity: .65; }
dl.meta dd { margin: 0; }
dl.meta dd.expected, dl.meta dd.actual { font-weight: 600; }
dl.meta dd.expected.pass, dl.meta dd.actual.pass { color: var(--vscode-testing-iconPassed, #3fb950); }
dl.meta dd.expected.fail, dl.meta dd.expected.err, dl.meta dd.actual.fail, dl.meta dd.actual.err { color: var(--vscode-testing-iconFailed, #f85149); }
dl.meta dd .mark { margin-right: 5px; font-weight: 700; }
ul.tree, ul.tree ul { list-style: none; margin: 0; padding-left: 16px; border-left: 1px dotted var(--vscode-panel-border); }
ul.tree { padding-left: 4px; border-left: none; }
.node .row { cursor: pointer; padding: 1px 4px; border-radius: 3px; display: inline-block; }
.node .row:hover { background: var(--vscode-list-hoverBackground); }
.badge { font-size: .72em; text-transform: uppercase; opacity: .9; margin-right: 6px; padding: 0 4px; border-radius: 3px; border: 1px solid var(--vscode-panel-border); }
.facts, .guard { opacity: .7; margin-left: 8px; font-size: .9em; }
.st-sat > .row .badge, .st-produced > .row .badge { color: var(--vscode-testing-iconPassed, #3fb950); border-color: currentColor; }
.st-unsat > .row .badge, .st-guard > .row .badge { color: var(--vscode-testing-iconFailed, #f85149); border-color: currentColor; }
.st-preempt > .row, .st-skip > .row { opacity: .5; }
.st-preempt > .row .badge { color: var(--vscode-charts-yellow, #d29922); border-color: currentColor; }
.diags { color: var(--vscode-testing-iconFailed, #f85149); }
.err { color: var(--vscode-testing-iconFailed, #f85149); }
`;

/** A standalone error view (graph failed to resolve, or the host caught a throw). Pure; no reveals. */
export function renderErrorHtml(title: string, messages: string[]): RenderedScenario {
  const errs = messages.length ? messages.map((m) => `<li>${esc(m)}</li>`).join("") : "<li>unknown error</li>";
  return {
    html: `<div class="sr"><div class="summary bad">${esc(title)}</div><ul class="diags">${errs}</ul></div>`,
    reveals: {},
  };
}

/** Render the webview body for a RenderScenarioResult. Pure. */
export function renderScenarioHtml(result: RenderScenarioResult, opts?: RenderOptions): RenderedScenario {
  const reveals: RenderedScenario["reveals"] = {};
  const prefix = opts?.revealPrefix ?? "";

  if (!result.success && result.scenarios.length === 0) {
    return renderErrorHtml(`Scenario did not run — ${result.source.celFilePath}`, result.errors);
  }

  const cls = result.success ? "ok" : "bad";
  const summary =
    `<div class="summary"><span class="${cls}">${result.passCount}/${result.caseCount} pass</span>` +
    (result.failCount ? ` · <span class="bad">${result.failCount} fail</span>` : "") +
    (result.errorCount ? ` · <span class="bad">${result.errorCount} error</span>` : "") +
    ` · ${esc(result.source.celFilePath)}</div>`;
  // Surface graph-level errors even when some scenarios rendered (don't drop them).
  const graphErrs = result.errors.length
    ? `<ul class="diags">${result.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
    : "";
  const cases = result.scenarios.map((s, i) => renderCase(s, i, prefix, reveals)).join("");
  return { html: `<div class="sr">${summary}${graphErrs}${cases}</div>`, reveals };
}
