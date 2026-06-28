// QUESTIONNAIRE pane RENDERER (vscode-free, unit-tested) — the read-only Medical Validation questionnaire panel
// (#177 slice 3). For the FOCUSED CEL case it projects the pure `buildQuestionnaire` result (slice 2) into a static,
// read-only ordered list of "Is <concept>?" questions (each with the case's answer highlighted) ending in the produced
// activity outcome or a terminal message. Design authority: .vibe-tools/discussions/163-questionnaire-panel-design.md
// ("Pane registration surface", "Selection-scoped render", produced-leaf "Path"/"Terminals" decisions).
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

import { buildQuestionnaire, type ResolveValueTypes, type Question } from "./questionnaireModel";

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
  /** The fired-path question runtime nodeIds, in walk (display) order (#177 slice 4). The host stores this so
   *  `driveThisNode(currentQuestionIndex)` can resolve the FOCUSED question's nodeId WITHOUT re-running the walk; the
   *  i-th id is the question rendered at <li id="<prefix>q<i>">. Empty when no case is focused / no questions. */
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
  const idx = Math.max(0, Math.min(currentIndex, count - 1));
  const prevDisabled = idx <= 0 ? " disabled" : "";
  const nextDisabled = idx >= count - 1 ? " disabled" : "";
  return (
    `<div class="q-nav" title="Step through this case's questions">` +
    `<button class="q-nav-btn" data-qnav="prev"${prevDisabled}>‹ Prev</button>` +
    `<span class="q-nav-pos">Question ${idx + 1} of ${count}</span>` +
    `<button class="q-nav-btn" data-qnav="next"${nextDisabled}>Next ›</button>` +
    `</div>`
  );
}

/** Render one question <li>: "Is <concept>?" + the two Yes/No options with the case's answer highlighted, plus a subtle
 *  value-type label for a non-boolean concept. `data-q` carries the runtime nodeId (slice-4 anchor); the <li> id is the
 *  highlight target keyed in `anchors`. */
function renderQuestion(q: Question, gid: string): string {
  const opts = q.options
    .map((o) => {
      // The case's answer: "Yes" highlights when answer==="yes", "No" when answer==="no". A null answer (unevaluated)
      // highlights neither. Compare case-insensitively against the canonical "yes"/"no" tokens.
      const isAnswer = q.answer !== null && o.toLowerCase() === q.answer;
      const cls = isAnswer ? "q-opt q-opt-answer" : "q-opt";
      return `<span class="${cls}">${escapeHtml(o)}</span>`;
    })
    .join("");
  // A non-boolean question keeps Yes/No options but flags its value type subtly (richer options are deferred — slice 2).
  const typeLabel =
    !q.isBoolean && q.valueType
      ? `<span class="q-type" title="answer value type (richer options deferred)">${escapeHtml(q.valueType)}</span>`
      : "";
  return (
    `<li class="q-item" id="${escapeHtml(gid)}" data-q="${escapeHtml(q.nodeId)}">` +
    `<span class="q-prompt">Is <span class="q-concept">${escapeHtml(q.conceptName)}</span>?</span>` +
    typeLabel +
    `<span class="q-opts">${opts}</span>` +
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
  opts: { revealPrefix?: string; currentIndex?: number } = {},
): RenderedQuestionnaire {
  const prefix = opts.revealPrefix ?? "";
  const anchors: Record<string, QuestionnaireAnchor> = {};
  const reveals: Record<string, never> = {};

  if (!sv) return { html: PLACEHOLDER, anchors, reveals, questionNodeIds: [] };

  const q = buildQuestionnaire(sv, resolveValueTypes, rootLib);

  let items = "";
  // The ordered question nodeIds — index i is the FOCUSED-question key the host's driveThisNode reads (slice 4).
  const questionNodeIds = q.questions.map((question) => question.nodeId);
  q.questions.forEach((question, i) => {
    const gid = `${prefix}q${i}`;
    anchors[question.nodeId] = { scrollTo: gid, segmentIds: [gid] };
    items += renderQuestion(question, gid);
  });

  const caseName = sv.case?.name ?? "";
  const header = caseName
    ? `<p class="q-head">Questionnaire — <span class="q-case">${escapeHtml(caseName)}</span></p>`
    : "";
  // #177 slice 5: the panel-local prev/next sub-nav, ABOVE the question list. Rendered only when there ARE questions
  // (a terminal-only questionnaire has no question to step through). "X of Y" + the disabled states read the host's index.
  const nav = renderQuestionNav(opts.currentIndex ?? 0, q.questions.length);
  const list = q.questions.length ? `<ol class="q-list">${items}</ol>` : "";
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
 * A same-selection redispatch (the highlight-restore re-dispatch toggleWorklist/applyShowKeys fire, same caseId) is a
 * no-op — so the index is NOT reset on a checkbox toggle. A clear (prev set → next undefined) IS a real change (the pane
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
  `.q-nav-pos{opacity:.8}` +
  `.q-list{list-style:decimal;margin:0;padding-left:22px}` +
  `.q-item{padding:2px 4px;border-radius:3px;margin:1px 0}` +
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
  `.q-item.this-node{box-shadow:inset 3px 0 0 var(--vscode-focusBorder,#3794ff);background:var(--vscode-list-inactiveSelectionBackground,rgba(120,170,255,.12))}`;
