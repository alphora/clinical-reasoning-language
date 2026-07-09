// QUESTIONNAIRE pane RENDERER (vscode-free, unit-tested) — the read-only Medical Validation questionnaire panel.
// #187 Todo 3: it projects the pure `buildQuestionnaire` full-surface result into an INDENTED, read-only list of
// "<concept>?" questions (each with the case's answer highlighted) — on-path rows normal, `first:`-preempted rows dimmed,
// non-Source concepts greyed, inferred composites expanded into their leaves — ending in the produced outcome or a
// terminal message. Design authority: .vibe-tools/discussions/193-mv-panes-todo3-questionnaire-render-plan.md.
//
// SCOPE: a STATIC pane. The "this node" cross-pane marker is slice 4; the prev/next sub-nav is slice 5. This renderer
// emits a STABLE per-question anchor + `data-q="<nodeId>"` attribute NOW so slices 4/5 can target a question without a
// re-render of this module. `anchors`/`reveals` are emitted (empty `reveals` — the questionnaire posts no engine
// selections; the slice-4 marker drives the panes, not a click here).
//
// CSP-safe by construction (mirrors flowPaneHtml/sourcePaneHtml): no inline `style=` and no `<style>` in the payload;
// all color/font lives in QUESTIONNAIRE_STYLE (a CSS string the shell concatenates into its nonced <style>, exactly like
// CORR_STYLE/FLOW_STYLE). It imports ONLY types from `@smile-digital-health/crl` + the pure builder — NO `vscode`.
import type { ScenarioViewModel } from "@smile-digital-health/crl";

import { caseDisplayName } from "./caseDisplayName";
import {
  buildQuestionnaire,
  type ResolveValueTypes,
  type ResolveConceptShape,
  type ResolveDefExpr,
  type Question,
  type QExpr,
} from "./questionnaireModel";


export interface QuestionnaireAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedQuestionnaire {
  html: string;
  /** question nodeId → its DOM <li> id (the slice-4 "this node" self-highlight target). Keyed BY nodeId so slice 4/5
   *  can resolve a question to its DOM element across re-renders (the id embeds the render prefix, like flowPaneHtml). */
  anchors: Record<string, QuestionnaireAnchor>;
  /** No engine reveals: the questionnaire is read-only and posts no selections. Emitted (always `{}`) so the shell's
   *  per-pane `{html, anchors, reveals}` contract is uniform with the other renderers. */
  reveals: Record<string, never>;
  /** The NAV-STOP question runtime nodeIds, in display order (#177 slice 4; #187 Todo 3: runtime whens/guards only —
   *  NOT expanded leaves, which can't ground the cross-pane marker). The host stores this so `driveThisNode(index)` can
   *  resolve the FOCUSED question's nodeId without re-running the walk, then reach its DOM `<li>` via
   *  `anchors[questionNodeIds[i]].scrollTo` (NOT by a `q<i>` id — leaves interleave, so the render-index ≠ the nav-stop
   *  index). Empty when no case is focused / no questions. */
  questionNodeIds: string[];
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** The placeholder shown when no case is focused (mirrors the other panes' `.placeholder` convention). */
const PLACEHOLDER = '<p class="placeholder">Select a scenario in the worklist to see its questionnaire.</p>';

/**
 * The pure next-index for the panel-local prev/next sub-nav (#177 slice 5). Moves `cur` one step in `dir`, CLAMPED to
 * `[0, count - 1]`. A 0-question questionnaire (empty/blocked/error terminal) is a no-op (returns 0 — there is no focused
 * question to move). Extracted so the bounds (clamp at 0, clamp at count-1, the 0-count no-op) are unit-tested rather than
 * living only in the untested cockpit shell. The host calls this then re-renders + re-drives the `.this-node` marker.
 */
export function nextQuestionIndex(cur: number, dir: "prev" | "next", count: number): number {
  if (count <= 0) return 0;
  const moved = cur + (dir === "next" ? 1 : -1);
  return Math.max(0, Math.min(moved, count - 1));
}

/** Render the prev/next sub-nav chrome (#177 slice 5) — a small region above the question list, styled like the tree's
 *  `#fcChrome`. A `‹ Prev` button, a `Question X of Y` indicator, a `Next ›` button. Prev is disabled at index 0; Next at
 *  the last index. The buttons carry an opaque `data-qnav="prev"`/`"next"` action (CSP-safe — no inline handlers). With 0
 *  questions (terminal-only questionnaire) NO nav is rendered (there is no question to step through). The current index is
 *  clamped defensively so a stale index can't render "Question 7 of 3" if it ever over-ran a shorter questionnaire. */
function renderQuestionNav(currentIndex: number, count: number): string {
  if (count <= 0) return "";
  // `-1` = the DEFAULT "no question focused" state ("Question 0 of Y"): Prev disabled, Next → question 1. Clamp to [-1, count-1].
  const idx = Math.max(-1, Math.min(currentIndex, count - 1));
  const prevDisabled = idx <= 0 ? " disabled" : "";
  const nextDisabled = idx >= count - 1 ? " disabled" : "";
  // Prev + Next sit together on the LEFT; the position indicator is pushed to the RIGHT (via `.q-nav-pos` margin-left:auto).
  return (
    `<div class="q-nav" title="Step through this case's questions">` +
    `<button class="q-nav-btn" data-qnav="prev"${prevDisabled}>‹ Prev</button>` +
    `<button class="q-nav-btn" data-qnav="next"${nextDisabled}>Next ›</button>` +
    `<span class="q-nav-pos">Question ${idx + 1} of ${count}</span>` +
    `</div>`
  );
}

/** #187 Option-3: render a leaf's Yes/No options with the case's answer highlighted (an "unknown" off-path answer
 *  highlights NEITHER + shows an n/a marker — the Todo-2 contract). Shared shape with `renderQuestion`'s opts. */
function renderExpOpts(answer: "yes" | "no" | "unknown"): string {
  const opts = ["Yes", "No"]
    .map((o) => `<span class="${(answer === "yes" || answer === "no") && o.toLowerCase() === answer ? "q-opt q-opt-answer" : "q-opt"}">${o}</span>`)
    .join("");
  const unknown = answer === "unknown" ? `<span class="q-unknown" title="no case answer — a question this path never asked">n/a</span>` : "";
  return `<span class="q-opts">${opts}${unknown}</span>`;
}

/** The operator connective chip (OUTSIDE the box): `or` / `and` (tinted amber / teal) or `not`. `top` marks a
 *  composite's own operator above its box (vs an infix operator between two operands). */
function connDiv(op: "or" | "and" | "not", top: boolean): string {
  return `<div class="q-conn q-conn-${op}${top ? " q-conn-top" : ""}">${op}</div>`;
}

/**
 * Render a `defined as` operator-tree node (Option-3): `or`/`and` → an ANY OF / ALL OF box with its operands (the
 * operator shown OUTSIDE the box at top + BETWEEN operands); a leaf → the concept + its answer (+ a nested box for a
 * named-composite / both-rep operand); an external (cross-lib) stub; a `+N more` / `…` truncation. ALL `<div>`s (no
 * `<li>` — the whole expansion lives in ONE `<li class="q-exp">`, so the flat `q-item` regex can't mis-slice it).
 * The `not` operand is ALWAYS rendered (a dropped operand would vanish a criterion `$apply` still asks).
 */
/** Render a `defined as` body: a FORCED top `or` chip — every `defined as` is a disjunction of alternative
 *  representations, so its top is always `or` (a top-level `and` reads `or` then its single ALL OF compound) — then the
 *  body's own structure (its ALL OF / ANY OF box, unchanged). Used at each `defined as` boundary (the when's expansion +
 *  each named-composite operand's body). Sub-question nesting is shown by the BOX borders (no per-leaf number/indent). */
function renderExpansion(body: QExpr): string {
  return connDiv("or", true) + renderQExpr(body);
}

/** An INFERRED composite `when` (no `code is`) can't be answered directly — it is DERIVED from its representations. So its
 *  concept + its derived Yes/No render (in PARENS) just ABOVE the box — a NORMAL-FLOW element that reflows/wraps as the pane
 *  narrows (unlike an absolute title on the border). The derived answer is purple-bordered; there is NO top `or`. */
function renderInferredWhen(q: Question, gid: string, body: QExpr): string {
  const layer = `<span class="q-layer" title="nesting layer ${q.depth + 1}">${q.depth + 1}</span>`;
  const answer = q.answer === "no" ? "no" : q.answer === "unknown" ? "unknown" : "yes";
  const title = `<span class="q-inferred-title">(<span class="q-prompt"><span class="q-concept">${escapeHtml(q.conceptName)}</span>?</span> ${renderExpOpts(answer)})</span>`;
  let box: string;
  if (body.kind === "or" || body.kind === "and") {
    const op = body.kind === "or" ? "or" : "and";
    const label = body.kind === "or" ? "any of" : "all of";
    let inner = "";
    body.operands.forEach((o, i) => {
      if (i > 0) inner += connDiv(op, false);
      inner += renderQExpr(o);
    });
    box = `<div class="q-box q-box-${op}"><span class="q-box-tab">${label}</span><div class="q-box-body">${inner}</div></div>`;
  } else {
    box = `<div class="q-box q-box-or"><span class="q-box-tab">any of</span><div class="q-box-body">${renderQExpr(body)}</div></div>`;
  }
  return `<li class="q-item q-inferred-when" id="${escapeHtml(gid)}" data-q="${escapeHtml(q.nodeId)}">${layer}${title}${box}</li>`;
}

function renderQExpr(e: QExpr): string {
  switch (e.kind) {
    case "or":
    case "and": {
      const op = e.kind === "or" ? "or" : "and";
      const label = e.kind === "or" ? "any of" : "all of";
      let inner = "";
      e.operands.forEach((o, i) => {
        if (i > 0) inner += connDiv(op, false); // infix operator between operands
        inner += renderQExpr(o);
      });
      return `<div class="q-box q-box-${op}"><span class="q-box-tab">${label}</span><div class="q-box-body">${inner}</div></div>`;
    }
    case "not":
      return connDiv("not", false) + renderQExpr(e.operand);
    case "leaf": {
      const cls = ["q-exp-leaf"];
      if (!e.isSource) cls.push("q-nonsource");
      if (e.isInferred) cls.push("q-inferred");
      const row = `<div class="${cls.join(" ")}"><span class="q-prompt"><span class="q-concept">${escapeHtml(e.name)}</span>?</span>${renderExpOpts(e.answer)}</div>`;
      // A named-composite / both-rep operand is answerable AND expandable → its OWN `defined as` body renders below (with
      // its own forced top `or`, since it too is a disjunction of alternatives).
      return e.composite ? row + renderExpansion(e.composite) : row;
    }
    case "external":
      return `<div class="q-exp-leaf q-external" title="a cross-library concept — not evaluated here"><span class="q-prompt"><span class="q-concept">${escapeHtml(e.name)}</span>?</span><span class="q-ext-mark">(external)</span></div>`;
    case "more":
      return `<div class="q-more">${e.count > 0 ? `+${e.count} more` : "…"}</div>`;
  }
}

/** Render one question <li>: "<concept>?" + the two Yes/No options with the case's answer highlighted, plus a subtle
 *  value-type label for a non-boolean concept. #187 Todo 3: INDENT by `depth` (a `q-d<n>` class); DIM `first:`-preempted
 *  rows; mark non-Source (no `code is`) on an inner channel that does NOT fight the `.this-node` wash; render an "unknown"
 *  off-path answer as blank + a marker (NEVER "No" — the Todo-2 contract). `data-q` carries the (runtime or synthetic
 *  leaf) nodeId; the <li> id is the highlight target keyed in `anchors`. */
function renderQuestion(q: Question, gid: string): string {
  const opts = q.options
    .map((o) => {
      // Highlight only a definite "yes"/"no". "unknown" (off-path, no case answer) + null highlight NEITHER.
      const isAnswer = (q.answer === "yes" || q.answer === "no") && o.toLowerCase() === q.answer;
      return `<span class="${isAnswer ? "q-opt q-opt-answer" : "q-opt"}">${escapeHtml(o)}</span>`;
    })
    .join("");
  const typeLabel =
    !q.isBoolean && q.valueType
      ? `<span class="q-type" title="answer value type (richer options deferred)">${escapeHtml(q.valueType)}</span>`
      : "";
  const unknown =
    q.answer === "unknown"
      ? `<span class="q-unknown" title="no case answer — a question this path never asked">n/a</span>`
      : "";
  // A MAIN question carries its decision-nesting DEPTH as a LAYER NUMBER badge instead of indentation (flat left edge).
  const cls = ["q-item"];
  if (q.reach === "preempted") cls.push("q-preempted");
  if (!q.isSource) cls.push("q-nonsource");
  if (q.isInferred) cls.push("q-inferred");
  // Non-color affordance (VS Code high-contrast can collapse opacity/tint) — reach AND source state as a tooltip (a row
  // that is BOTH preempted and non-Source shows both hints, so neither affordance is lost).
  const titleParts: string[] = [];
  if (q.reach === "preempted") titleParts.push("skipped by an earlier first: match");
  if (!q.isSource) titleParts.push("inferred / non-source concept (no local code)");
  const titleAttr = titleParts.length ? ` title="${escapeHtml(titleParts.join(" · "))}"` : "";
  // 1-based for readability (a top-level when reads "1", not the raw 0-based decision depth).
  const layer = `<span class="q-layer" title="nesting layer ${q.depth + 1}">${q.depth + 1}</span>`;
  return (
    `<li class="${cls.join(" ")}" id="${escapeHtml(gid)}" data-q="${escapeHtml(q.nodeId)}"${titleAttr}>` +
    layer +
    `<span class="q-prompt"><span class="q-concept">${escapeHtml(q.conceptName)}</span>?</span>` +
    typeLabel +
    `<span class="q-opts">${opts}${unknown}</span>` +
    `</li>`
  );
}

/** The terminal line below the question list — the produced outcome OR a per-terminalKind message. */
function renderTerminal(q: ReturnType<typeof buildQuestionnaire>): string {
  switch (q.terminalKind) {
    case "produced":
    case "empty": {
      const activity = q.outcome?.activity ?? "(none)";
      const note = q.note ? ` <span class="q-note">(${escapeHtml(q.note)})</span>` : "";
      return `<p class="q-outcome"><span class="q-outcome-label">Outcome:</span> <span class="q-activity">${escapeHtml(activity)}</span>${note}</p>`;
    }
    case "blocked":
      return `<p class="q-terminal q-blocked">Blocked (no determination).</p>`;
    case "blocked-guard":
      // The guard question is the LAST item in the list (the builder appends it); add a blocked note beneath it.
      return `<p class="q-terminal q-blocked">Blocked (no determination) — the last criterion above was contraindicating.</p>`;
    case "error":
      return `<p class="q-terminal q-error">Questionnaire unavailable: ${escapeHtml(q.note ?? "evaluation error")}.</p>`;
    default: {
      // Exhaustiveness guard (FIX 6): a future 6th `terminalKind` is a compile error here, not a silently-blank terminal.
      const _exhaustive: never = q.terminalKind;
      return _exhaustive;
    }
  }
}

/**
 * Render the questionnaire pane for the FOCUSED case's `ScenarioViewModel`.
 *
 * @param sv               the focused case's view model, or undefined when no case is selected → a placeholder.
 * @param resolveValueTypes injected concept→value-types resolver (the shell builds it from `conceptByKey` + nodeKey).
 * @param rootLib          the root decision's library (`sv.decision?.libraryName`) — the builder's starting frame.
 * @param opts.revealPrefix gen-scoped DOM-id prefix (mirrors the other renderers; keeps ids unique across renders).
 * @param opts.currentIndex the host's `currentQuestionIndex` — drives the sub-nav's "Question X of Y" + the Prev/Next
 *                          disabled states (#177 slice 5). Defaults to 0. Clamped to the question count internally.
 */
export function renderQuestionnairePane(
  sv: ScenarioViewModel | undefined,
  resolveValueTypes: ResolveValueTypes,
  rootLib: string | undefined,
  opts: {
    revealPrefix?: string;
    currentIndex?: number;
    conceptShape?: ResolveConceptShape;
    defExpr?: ResolveDefExpr;
  } = {},
): RenderedQuestionnaire {
  const prefix = opts.revealPrefix ?? "";
  const anchors: Record<string, QuestionnaireAnchor> = {};
  const reveals: Record<string, never> = {};

  if (!sv) return { html: PLACEHOLDER, anchors, reveals, questionNodeIds: [] };

  const q = buildQuestionnaire(sv, resolveValueTypes, rootLib, {
    conceptShape: opts.conceptShape,
    defExpr: opts.defExpr,
  });

  let items = "";
  // NAV-STOPS = runtime whens/guards ONLY (their `nodeId` grounds in `sv.tree`). #187 Option-3: an on-path composite
  // when's `defined as` operator tree renders as a SEPARATE `<li class="q-exp">` box tree (all `<div>`s inside — no
  // nested `<li>`, so the flat `q-item` slicing can't reach into it); its operand leaves are NOT questions/nav-stops.
  const questionNodeIds: string[] = [];
  q.questions.forEach((question, i) => {
    const gid = `${prefix}q${i}`;
    anchors[question.nodeId] = { scrollTo: gid, segmentIds: [gid] };
    if (question.isNavStop) questionNodeIds.push(question.nodeId);
    // A composite WITH a `code is` (both-rep) is answerable directly OR via its sub-questions → a normal row + top `or` +
    // box. A composite WITHOUT a `code is` is INFERRED (derived) → its concept + derived answer render ON the box border.
    if (question.expansion && !question.isSource) {
      items += renderInferredWhen(question, gid, question.expansion);
    } else {
      items += renderQuestion(question, gid);
      if (question.expansion) items += `<li class="q-exp">${renderExpansion(question.expansion)}</li>`;
    }
  });

  const caseName = caseDisplayName(sv.case?.name ?? ""); // strip the authored `-> outcome` suffix (redundant w/ the Outcome line)
  const header = caseName
    ? `<p class="q-head">Case - <span class="q-case">${escapeHtml(caseName)}</span></p>`
    : "";
  // The prev/next sub-nav steps through the NAV-STOPS (runtime whens), not every rendered row — "X of Y" counts those.
  const nav = renderQuestionNav(opts.currentIndex ?? 0, questionNodeIds.length);
  const list = q.questions.length ? `<ul class="q-list">${items}</ul>` : "";
  const terminal = renderTerminal(q);

  return { html: `<div class="q-wrap">${header}${nav}${list}${terminal}</div>`, anchors, reveals, questionNodeIds };
}

/**
 * Should the selection-scoped questionnaire re-render fire? The pure decision behind the shell's `dispatch` hook (#177
 * slice 3) — extracted so the most failure-prone bit lives in a unit-tested module, not the untested cockpit shell. The
 * questionnaire re-renders (and the host resets `currentQuestionIndex`) ONLY when:
 *   - mode is "medical-validation" (the pane is cockpit-inert — it's not in the cockpit spec); AND
 *   - the questionnaire pane is OPEN; AND
 *   - the focused cel caseId genuinely CHANGED (`nextCaseId !== prevCaseId`).
 * A same-selection redispatch (the highlight-restore re-dispatch setWorklist/applyShowKeys fire, same caseId) is a
 * no-op — so the index is NOT reset on a dropdown change. A clear (prev set → next undefined) IS a real change (the pane
 * re-renders to its placeholder). caseId is undefined when the selection is not a cel case.
 */
export function shouldRerenderQuestionnaire(args: {
  prevCaseId: string | undefined;
  nextCaseId: string | undefined;
  mode: "cockpit" | "medical-validation";
  paneOpen: boolean;
}): boolean {
  return args.mode === "medical-validation" && args.paneOpen && args.nextCaseId !== args.prevCaseId;
}

/** Questionnaire-pane CSS — concatenated into the cockpit's nonced <style> (CSP-safe: no inline styles). Every
 *  var(--vscode-*) carries a hex fallback (the pane renders in tests / high-contrast with no live theme), matching
 *  CORR_STYLE/FLOW_STYLE. The `.q-opt-answer` highlight reuses the editor find-match palette so it reads as "this is the
 *  case's answer"; `.q-item.this-node` (slice 4) will layer the cross-pane marker on top. */
export const QUESTIONNAIRE_STYLE =
  `.q-wrap{white-space:normal;line-height:1.5}` +
  `.q-head{margin:0 0 8px;font-weight:bold;opacity:.85}` +
  `.q-case{font-weight:normal;opacity:.9}` +
  // #177 slice 5: the prev/next sub-nav chrome — mirrors the tree pane's `.fc-toggle` shape (segmented buttons + a label).
  // A disabled button reads dimmed + non-interactive (the host clamps the index, so a click on a disabled edge is a no-op).
  `.q-nav{display:flex;align-items:center;gap:8px;padding:2px 2px 8px;font-size:.85em}` +
  `.q-nav-btn{font:inherit;cursor:pointer;padding:1px 8px;border:1px solid var(--vscode-panel-border,#454545);background:var(--vscode-editorWidget-background,#252526);color:var(--vscode-foreground)}` +
  `.q-nav-btn:disabled{cursor:default;opacity:.45}` +
  `.q-nav-pos{opacity:.8;margin-left:auto}` +
  `.q-list{list-style:none;margin:0;padding-left:0}` +
  `.q-item{padding:2px 4px 2px 6px;border-radius:3px;margin:1px 0}` +
  // #187 Option-3: main questions are FLAT (no decision-depth indent) — their nesting shows as a `.q-layer` number badge.
  // DIM a first:-preempted (skipped-by-an-earlier-match) row.
  `.q-preempted{opacity:.5}` +
  // NON-SOURCE (no local `code is`): a grey wash on the INNER `.q-prompt` span — a channel DISTINCT from the `.q-item`
  // background, so it never fights the `.this-node` li wash (disc 193, Claude). Reads as "▒grey▒" behind the concept.
  `.q-nonsource .q-prompt{background:var(--vscode-editorWidget-background,#2b2b2e);border-radius:3px;padding:0 5px}` +
  // A composite-operand leaf is lighter weight than a decision `when`.
  `.q-exp-leaf .q-concept{font-weight:normal;opacity:.92}` +
  // An "unknown" off-path answer (no conceptTruth) — a subtle marker; NEITHER Yes/No option is highlighted.
  `.q-unknown{font-size:.75em;opacity:.6;font-style:italic;margin-left:6px}` +
  `.q-prompt{margin-right:6px}` +
  `.q-concept{font-weight:bold;color:var(--vscode-symbolIcon-keywordForeground,#c586c0)}` +
  `.q-type{display:inline-block;font-size:.8em;opacity:.7;font-style:italic;margin-right:6px;padding:0 4px;border:1px solid var(--vscode-panel-border,#454545);border-radius:3px}` +
  `.q-opts{display:inline-flex;gap:6px}` +
  `.q-opt{font-size:.85em;padding:0 6px;border:1px solid var(--vscode-panel-border,#454545);border-radius:3px;opacity:.6}` +
  `.q-opt-answer{opacity:1;font-weight:bold;background:var(--vscode-editor-findMatchBackground,rgba(100,170,255,.4));border-color:var(--vscode-focusBorder,#3794ff)}` +
  `.q-outcome{margin:8px 0 0;padding:4px 6px;border-left:3px solid var(--vscode-testing-iconPassed,#73c991)}` +
  `.q-outcome-label{opacity:.7}` +
  `.q-activity{font-weight:bold;color:var(--vscode-symbolIcon-functionForeground,#dcdcaa)}` +
  `.q-note{opacity:.7;font-size:.9em}` +
  `.q-terminal{margin:8px 0 0;padding:4px 6px;font-style:italic}` +
  `.q-blocked{border-left:3px solid var(--vscode-charts-yellow,#d29922);opacity:.9}` +
  `.q-error{border-left:3px solid var(--vscode-editorError-foreground,#f14c4c);opacity:.9}` +
  // Slice 4 ("this node" cross-pane marker) self-highlights the FOCUSED question's <li> via `.this-node`. NON-OUTLINE by
  // design (a left-edge accent BAR via inset box-shadow + a subtle wash) so it LAYERS with — never fights — any future
  // `.current` (outline) on the row and the `.q-opt-answer` find-match fill on the option spans: box-shadow/background-color
  // are independent axes from outline. The same marker channel paints the tree/crl/source panes (the shell posts
  // markThisNode); this rule is the questionnaire pane's leg of it.
  `.q-item.this-node{box-shadow:inset 3px 0 0 var(--vscode-charts-orange,#d18616);background:rgba(209,134,22,.12)}` +
  // #187 Option-3: the `defined as` operator-tree expansion under an on-path composite when — ANY OF / ALL OF boxes
  // with the boolean operator shown OUTSIDE each box (amber = OR / any-of, teal = AND / all-of, grey = not). All `<div>`s.
  `.q-exp{list-style:none;margin:1px 0 7px}` +
  // the operator connective chip (outside the box; above the top box + between operands). ONE accent (blue) for every
  // grouping operator — the ANY OF / ALL OF text carries the or/and distinction, no per-operator/per-nesting colour.
  `.q-conn{display:inline-block;font:700 10px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.14em;text-transform:uppercase;padding:2px 7px;border-radius:4px;margin:4px 0 2px}` +
  `.q-conn-top{margin-left:20px}` +
  `.q-conn-or,.q-conn-and{color:var(--vscode-charts-blue,#3794ff);background:rgba(55,148,255,.13);border:1px solid var(--vscode-charts-blue,#3794ff)}` +
  `.q-conn-not{color:var(--vscode-descriptionForeground,#8c8c8c);background:var(--vscode-editorWidget-background,#2b2b2e);border:1px solid var(--vscode-panel-border,#454545)}` +
  // the grouping box. The ANY OF / ALL OF tab pops onto the box's top-left border (as before). The box's top margin (4px)
  // is LESS than the tab's -9px pop, so the operator chip's BOTTOM border OVERLAPS the tab's TOP border. A NESTED box does
  // NOT indent further.
  `.q-box{position:relative;margin:4px 0 8px 20px;border:1px solid var(--vscode-panel-border,#454545);border-left:2px solid var(--vscode-charts-blue,#3794ff);border-radius:0 6px 6px 6px;background:var(--vscode-editor-background,#1e1e1e);padding:13px 8px 6px 8px}` +
  `.q-box .q-box{margin-left:0}` +
  `.q-box-tab{position:absolute;top:-9px;left:-2px;font:700 10px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;border-radius:5px 5px 5px 0;color:var(--vscode-charts-blue,#3794ff);border:1px solid var(--vscode-charts-blue,#3794ff);background:var(--vscode-editor-background,#1e1e1e)}` +
  // An INFERRED composite when's concept + DERIVED answer, in PARENS just above the box — NORMAL FLOW (reflows/wraps as the
  // pane narrows, unlike an absolute title). Its answer option is PURPLE-bordered (derived, not a direct `code is` answer).
  `.q-inferred-title{display:inline-flex;align-items:center;gap:2px;flex-wrap:wrap}` +
  `.q-inferred-when .q-box{margin-top:9px}` + // room for the ANY OF/ALL OF tab to pop just below the title
  `.q-inferred-title .q-opt-answer,.q-exp-leaf.q-nonsource .q-opt-answer{background:rgba(197,134,192,.22);border-color:var(--vscode-charts-purple,#c586c0)}` +
  // a leaf row inside a box (the concept + its Yes/No answer). Reuses .q-nonsource/.q-opt.
  `.q-exp-leaf{padding:2px 0;margin:1px 0}` +
  `.q-layer{display:inline-block;min-width:13px;text-align:center;font:700 9px/1 var(--vscode-editor-font-family,monospace);color:var(--vscode-descriptionForeground,#8c8c8c);background:var(--vscode-editorWidget-background,#2b2b2e);border:1px solid var(--vscode-panel-border,#454545);border-radius:3px;padding:1px 3px;margin-right:7px;vertical-align:middle}` +
  `.q-external{opacity:.75;font-style:italic}` +
  `.q-ext-mark{font-size:.75em;opacity:.7;margin-left:6px}` +
  `.q-more{font-size:.8em;opacity:.6;font-style:italic;padding:2px 0 2px 2px}`;
