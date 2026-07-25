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
import { displayDetermination, frontierTooltip, type RenderScenarioResult, type ScenarioViewModel, type ViewNode } from "@smile-digital-health/crl";
import { allUnsatisfiedCriteria, failedCriterionFrontier, type FailedCriterionNode } from "@smile-digital-health/crl/provenance";

import { failedCriterionLabel } from "./failedCriterionLabel";

/** A per-node failed-criterion mark (#173 T3b, disc 158/160): which mode-set(s) the node is in + WHY + its label. The
 *  run-tree renderer stamps these as data attributes; the webview's All/Blocking toggle shows/hides them CLIENT-SIDE. */
interface FcMark {
  /** unsatisfied-when | guarded-out | preemption — drives the DISTINCT marking (preemption = a satisfied diverting
   *  sibling, NOT a failed criterion → its own amber attribute). */
  reason: "unsatisfied-when" | "guarded-out" | "preemption";
  /** Short label for the node's tooltip (failedCriterionLabel). */
  label: string;
  /** #224 i.4b: for a COMPOUND guard whose failure was a false `or` (a `no-alternative` frontier), the rich
   *  per-alternative detail ("alt 1 (A): unmet; alt 2 (B and C): C unmet"). Absent for single-ref guards and
   *  plain-conjunct compounds (whose short `label` already names the unmet conjunct). Enriches the HOVER only. */
  tooltip?: string;
  /** In the "Blocking" frontier set (the criteria that blocked the expected disposition). */
  inBlocking: boolean;
  /** In the "All" set (every evaluated-unsatisfied `when`). A preemption sibling is satisfied → NEVER in All. */
  inAll: boolean;
}

/** #224 i.4b: the rich per-alternative hover detail — ONLY when the compound guard's failure was a false `or`
 *  (`no-alternative`). A plain-conjunct compound's short `label` (`unmet: B`) already suffices, so no extra hover. */
function compoundDetail(c: FailedCriterionNode): string | undefined {
  const d = c.display;
  if (d.reason !== "unsatisfied-when" || d.guard !== "compound") return undefined;
  return d.frontier.some((i) => i.kind === "no-alternative") ? frontierTooltip(d.frontier) : undefined;
}

/**
 * Compute the per-node failed-criterion marks for one scenario (#173 T3b) — surface-agnostic reuse of the T2 selectors,
 * keyed by the node's OWN runtime nodeId (NO re-rooting: the highlight is in-place within this same run tree). Returns a
 * Map nodeId → FcMark (a node can be in both sets). GATED EMPTY for `status==="error"` (a partial trace; the run tree
 * shows no highlight) — `allUnsatisfiedCriteria` is NOT status-gated, so the gate MUST live here, since the renderer
 * invokes this on error cases too (it renders cases even on `success:false`). Pure.
 */
export function failedCriterionMarks(sv: ScenarioViewModel): Map<string, FcMark> {
  const marks = new Map<string, FcMark>();
  if (sv.status === "error") return marks; // partial trace, expected path undefined → no highlight (disc 158 §Trigger)
  const get = (nodeId: string, reason: FcMark["reason"], label: string): FcMark => {
    let m = marks.get(nodeId);
    if (!m) {
      m = { reason, label, inBlocking: false, inAll: false };
      marks.set(nodeId, m);
    }
    return m;
  };
  // All-mode set: every evaluated-unsatisfied `when` (reason is always "unsatisfied-when" here).
  for (const c of allUnsatisfiedCriteria(sv)) {
    const m = get(c.nodeId, "unsatisfied-when", failedCriterionLabel(c));
    m.inAll = true;
    const tip = compoundDetail(c);
    if (tip) m.tooltip = tip;
  }
  // Blocking-mode set: the frontier (empty for a pass / non-fail). A preemption blocker keeps its own reason so the
  // renderer marks the SATISFIED matched sibling distinctly (amber "diverted"), not as a red failed criterion.
  for (const c of failedCriterionFrontier(sv)) {
    const m = get(c.nodeId, c.reason, failedCriterionLabel(c));
    m.inBlocking = true;
    m.reason = c.reason; // the frontier reason wins (a node in both sets is the frontier's unsatisfied-when anyway)
    const tip = compoundDetail(c);
    if (tip) m.tooltip = tip;
  }
  return marks;
}

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

function renderNode(
  n: ViewNode,
  caseIdx: number,
  prefix: string,
  reveals: RenderedScenario["reveals"],
  marks: Map<string, FcMark>,
): string {
  const { cls, badge } = nodeState(n);
  const key = `${prefix}${caseIdx}.${n.nodeId}`;
  if (n.source) reveals[key] = { filePath: n.source.filePath, range: n.source.range };

  // #173 T3b: failed-criterion data attributes (BOTH mode-sets stamped server-side; the toggle shows/hides client-side
  // via a body class). A preemption blocker is a SATISFIED diverting sibling → its own `data-fc-preempt` (amber), NOT
  // the red `data-fc-blocking`/`data-fc-all` of a true failed criterion.
  const mark = marks.get(n.nodeId);
  let fcAttrs = "";
  let fcTip = ""; // the user-VISIBLE explanation (FIX 3 disc 160 — data-fc-tip alone was inert/invisible)
  let fcTipSpan = ""; // an inline label shown in the active mode (CSS-gated), so the reason is visible without hovering
  if (mark) {
    const parts: string[] = [];
    let tipCls: string;
    if (mark.reason === "preemption") {
      parts.push(`data-fc-preempt="1"`);
      tipCls = "fc-tip-preempt";
    } else {
      if (mark.inBlocking) parts.push(`data-fc-blocking="1"`);
      if (mark.inAll) parts.push(`data-fc-all="1"`);
      tipCls = "fc-tip-blk";
    }
    parts.push(`data-fc-reason="${mark.reason}"`);
    // Short line drives the inline VISIBLE label; the HOVER (data-fc-tip + title) appends the compound per-alternative
    // detail when present (#224 i.4b), so "which alternative failed" is available without cluttering the always-on label.
    const fcTipShort = mark.reason === "preemption" ? `matched first and diverted the run — ${mark.label}` : `blocked: ${mark.label}`;
    fcTip = mark.tooltip ? `${fcTipShort} — ${mark.tooltip}` : fcTipShort;
    parts.push(`data-fc-tip="${esc(fcTip)}"`);
    fcAttrs = ` ${parts.join(" ")}`;
    // The inline visible label. Class encodes both the channel (blk/preempt color) and the mode-membership so CSS can
    // show it only in the active mode (a blocker shows in its set; a preemption is Blocking-only) — mirrors the outline.
    const modeCls = mark.reason === "preemption" ? "fc-only-blocking" : `${mark.inBlocking ? "fc-in-blocking " : ""}${mark.inAll ? "fc-in-all" : ""}`.trim();
    fcTipSpan = `<span class="fc-tip ${tipCls} ${modeCls}">${esc(fcTipShort)}</span>`;
  }

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
    ? `<ul>${n.children.map((c) => renderNode(c, caseIdx, prefix, reveals, marks)).join("")}</ul>`
    : "";

  // Title: prefer the fc explanation when marked (so the hover SAYS why the node is highlighted), else the source path.
  const rowTitle = fcTip ? `${fcTip}${n.source ? ` — ${n.source.filePath}` : ""}` : n.source ? n.source.filePath : "";
  return (
    `<li class="node ${cls}"${fcAttrs}>` +
    `<span class="row" data-reveal="${esc(key)}" title="${esc(rowTitle)}">` +
    `<span class="badge">${esc(badge)}</span>` +
    `<span class="label">${esc(displayDetermination(n.label))}</span>${facts}${guard}${fcTipSpan}` +
    `</span>${children}</li>`
  );
}

function renderCase(s: ScenarioViewModel, caseIdx: number, prefix: string, reveals: RenderedScenario["reveals"]): string {
  const statusCls = s.status === "pass" ? "pass" : s.status === "fail" ? "fail" : "err";
  const mark = s.status === "pass" ? "✓" : "✗"; // green check on a match, red X otherwise (unit-test style)
  const facts = s.case.facts.map((f) => esc(f.name) + (f.conceptRef ? ` <em>(${esc(f.conceptRef)})</em>` : "")).join(", ");
  // expected = just the branch (the decision name is already on the `decision` row above).
  // DISPLAY-only: a determination outcome (`certify.Met`) shows as its human key (`Met`). No-op for ordinary branch /
  // activity names. The pass/fail verdict is computed in the CRE from the RAW names — this only touches the strings shown.
  const expected = s.expected ? esc(displayDetermination(s.expected.branch)) : "—";
  const actual = s.produced.length ? s.produced.map((p) => esc(displayDetermination(p.recommendation))).join(", ") : "(none)";
  const decision = s.decision
    ? esc(s.decision.name) + (s.decision.resolved ? "" : " <span class=\"err\">(unresolved)</span>")
    : "(no decision)";
  // #173 T3b: compute the failed-criterion marks ONCE per case (not per node), then thread the map down the recursion.
  const marks = failedCriterionMarks(s);
  const tree = s.tree.length
    ? `<ul class="tree">${s.tree.map((n) => renderNode(n, caseIdx, prefix, reveals, marks)).join("")}</ul>`
    : "";

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

/* #173 T3b — the failed-criterion in-place highlight + the All/Blocking toolbar. Highlights are CLIENT-SIDE: BOTH
   mode-sets are stamped server-side as data attributes; the body class (set by the toolbar) reveals one set. */
#fcToolbar { display: flex; align-items: center; gap: 6px; padding: 4px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; font-size: .85em; }
#fcToolbar .fc-label { opacity: .7; }
#fcToolbar .fc-btn { font: inherit; cursor: pointer; padding: 1px 8px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background, #252526); color: var(--vscode-foreground); }
#fcToolbar .fc-btn.fc-active { background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); border-color: var(--vscode-button-background, #0e639c); }
#fcToolbar .fc-legend { opacity: .65; margin-left: 8px; }
#fcToolbar .fc-legend .fc-swatch-blk { color: var(--vscode-editorError-foreground, #f14c4c); }
#fcToolbar .fc-legend .fc-swatch-div { color: var(--vscode-charts-yellow, #d29922); }
/* A true failed criterion (unsatisfied-when / guarded-out): a red dashed outline. Shown per the active mode. */
body.fc-mode-blocking .node[data-fc-blocking] > .row,
body.fc-mode-all .node[data-fc-all] > .row { outline: 2px dashed var(--vscode-editorError-foreground, #f14c4c); outline-offset: 1px; }
/* A preemption: a SATISFIED matched sibling that diverted the run — amber, distinct from the red blockers. It is a
   Blocking-set blocker (the satisfied sibling is not an unsatisfied when, so it is NOT in All) so it shows in Blocking. */
body.fc-mode-blocking .node[data-fc-preempt] > .row { outline: 2px dashed var(--vscode-charts-yellow, #d29922); outline-offset: 1px; }
/* The VISIBLE inline label (FIX 3 disc 160 — the reason, not just an inert data attr). Hidden by default; shown ONLY in
   the active mode for the channel(s) the node belongs to (a blocker in its set; a preemption in Blocking). */
.fc-tip { margin-left: 8px; font-size: .85em; opacity: .9; display: none; }
.fc-tip-blk { color: var(--vscode-editorError-foreground, #f14c4c); }
.fc-tip-preempt { color: var(--vscode-charts-yellow, #d29922); }
.fc-tip-preempt::before { content: "◂ "; }
body.fc-mode-blocking .fc-tip-preempt,
body.fc-mode-blocking .fc-in-blocking,
body.fc-mode-all .fc-in-all { display: inline; }
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
