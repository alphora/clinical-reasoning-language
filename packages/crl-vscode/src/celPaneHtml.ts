// CEL pane RENDERER (vscode-free, unit-tested) — three-pane viewer C2c-1/C2c-2 (#156).
// Renders the scenario CASES condensed (name + status + subject + facts + produced recs) — the KE's compact correspondence
// view, distinct from the full scenario-runner (the clinician surface, left untouched). Each case is anchored by its
// FROZEN caseId (the join key with the correspondence — looked up from the case name via caseIdByName); a case with no
// frozen id renders but is NOT a case reveal target (no anchor / no data-reveal). Mirrors crlPaneHtml conventions.
//
// C2c-2 fact-level: a fact whose `defined by` resolves to a CONCEPT (qualified — bare refs are FHIR types, activity
// targets aren't concepts) AND whose concept key is revealable (in `revealableConceptKeys`) renders as a clickable span
// with its OWN `fact:`-namespaced anchor. A click "peeks" that concept across panes (shell-side, no engine selection).
// Fact peek is independent of the case's frozen id — the concept's correspondence doesn't depend on the case anchor.
import { displayDetermination, nodeKey, type RenderScenarioResult } from "@smile-digital-health/crl";

import { caseDisplayName } from "./caseDisplayName";

import { corrKeyHtml } from "./corrKey";
// Type-only import (erased at compile — no runtime/bundle coupling to the store's node:fs deps): the review-state union +
// the Note shape are OWNED by medicalValidationStore, imported here so the dropdown option set + the opts type + the note
// render can't drift from them.
import type { Note, PersistedReviewState, ReviewState } from "./medicalValidationStore";

export interface CelAnchor {
  scrollTo: string;
  segmentIds: string[];
}
/** A case-block reveal (selects the case) or a fact reveal (peeks the fact's concept — carries the cel anchor to self-
 *  highlight + the concept key for the source/CRL arms). The `conceptKey` field discriminates the two. */
export type CelReveal = { caseId: string } | { conceptKey: string; factAnchorKey: string };
export interface RenderedCel {
  html: string;
  /** anchor key → highlight target. Case blocks are keyed by frozen caseId; facts by their `fact:`-namespaced key
   *  (colon is invalid in a caseId, so the two key spaces never collide). */
  anchors: Record<string, CelAnchor>;
  /** opaque data-reveal key (per render) → the trusted payload a click resolves to. */
  reveals: Record<string, CelReveal>;
  /** Medical Validation (#156 slice 4): opaque `data-worklist-toggle` key (per render) → the frozen caseId the toggle
   *  acts on. Populated ONLY in worklist mode (`opts.worklist.enabled`) and ONLY for REVIEWABLE cases (frozen, non-
   *  ambiguous). Absent/empty in cockpit mode. The host maps key→caseId here (the webview never sees the caseId), so a
   *  toggle click resolves through the same trusted-opaque-key discipline as `reveals` — keyed by caseId, never by name. */
  worklistActions?: Record<string, { caseId: string }>;
  /** REVERSE map (C2c-2b): concept key → the fact anchor keys rendered THIS render for that concept (accumulated across
   *  cases — a concept can be a fact in several). Domain = the revealable concept-kind facts that got a `fact:` span;
   *  the values embed the per-render gen prefix, so capture this ATOMICALLY with `anchors` (don't cache across renders).
   *  Lets a source/CRL selection highlight the specific fact spans that reference its concepts. */
  conceptToFactAnchors: Record<string, string[]>;
}

/** Facts-first, deduped union of a selection's fact-anchor keys (from its concept keys) + its case-block anchor keys.
 *  Facts first so highlightRows scrolls to the pinpoint fact (case block still highlighted for context). Pure. */
export function reverseCelAnchors(
  conceptKeys: string[],
  caseAnchorKeys: string[],
  conceptToFactAnchors: Record<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string): void => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  for (const ck of conceptKeys) for (const fa of conceptToFactAnchors[ck] ?? []) add(fa); // fact pinpoints first
  for (const ca of caseAnchorKeys) add(ca); // then case blocks for context
  return out;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
const BADGE: Record<string, string> = { pass: "✓", fail: "✗", error: "⚠" };
// The four review-verdict labels the worklist dropdown offers (#156 slice 4, extended). "To do" is the unstored default
// (absence in the sidecar); Pending / Pass / Fail are the persisted verdicts. Each verdict paints its fired path on the tree
// (#210: Pass→green, Fail→red, Pending→yellow — the tree paints with these SAME dropdown colors; To do→none. deriveReviewOverlay).
const REVIEW_LABEL: Record<ReviewState, string> = { unreviewed: "To do", pending: "Pending", pass: "Pass", fail: "Fail" };
const REVIEW_ORDER: readonly ReviewState[] = ["unreviewed", "pending", "pass", "fail"];

/** Format a note's epoch-ms timestamp DETERMINISTICALLY in UTC (`YYYY-MM-DD HH:MM UTC`) — no locale/timezone, so this pure
 *  renderer stays machine-independent + unit-testable. (Local-time display, if ever wanted, would be a host-formatted string
 *  passed in — deferred; it would break the renderer's escaped-values-only purity.) Lives here (the only consumer) rather
 *  than in the store, so celPaneHtml keeps its fs-free, value-import-free footprint. */
export function formatNoteTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Medical-Validation worklist render options (mode-gated; ABSENT or `enabled:false` ⇒ the cockpit render is byte-
 *  unchanged). `statesByCaseId` (verdicts) + `notesByCaseId` (threads) are keyed by frozen caseId ONLY (never by name).
 *  `openNotesCaseId`/`editingNoteId` are HOST UI-state threaded in so the drawer + edit-in-place survive the pane's
 *  innerHTML re-renders (the webview is not the authority). */
export interface WorklistOpts {
  enabled: boolean;
  statesByCaseId: Record<string, PersistedReviewState>;
  policyLabel?: string;
  notesByCaseId?: Record<string, Note[]>;
  openNotesCaseId?: string;
  editingNoteId?: string;
}

export function renderCelPane(
  result: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  // caseKeyNumbers: caseId → its corresponding units' numbers (#163 at-rest key). showKeys gates the slot.
  // duplicateScenarioNames: names shared by >1 case (frozen OR unfrozen). #173 FIX 1 (disc 160): such a case is NOT
  // anchored/clickable — clicking it would mis-attribute to the frozen same-name case's caseId. Rendered with a marker.
  // worklist (#156, mode-gated): when `enabled`, render a review-verdict <select> + a notes glyph per reviewable case +
  // (for the open case) a right-side notes drawer. ABSENT or `enabled:false` → byte-identical to the cockpit render.
  opts: { revealPrefix?: string; revealableConceptKeys?: ReadonlySet<string>; caseKeyNumbers?: Record<string, number[]>; showKeys?: boolean; duplicateScenarioNames?: ReadonlySet<string>; worklist?: WorklistOpts } = {},
): RenderedCel {
  const prefix = opts.revealPrefix ?? "";
  const revealable = opts.revealableConceptKeys;
  const caseKeyNumbers = opts.caseKeyNumbers ?? {};
  const showKeys = opts.showKeys ?? false;
  const duplicateNames = opts.duplicateScenarioNames ?? new Set<string>();
  const worklist = opts.worklist?.enabled ? opts.worklist : undefined; // undefined ⇒ cockpit path (byte-unchanged)
  // Worklist header: the policy under validation, pinned at the top of the pane so the reviewer always knows WHICH
  // policy this worklist belongs to. Worklist mode only (empty in cockpit) and only when a label was supplied.
  const worklistHeader =
    worklist && worklist.policyLabel
      ? `<div class="cel-worklist-header" title="Policy under validation">${escapeHtml(worklist.policyLabel)}</div>`
      : "";
  const anchors: Record<string, CelAnchor> = {};
  const reveals: Record<string, CelReveal> = {};
  const conceptToFactAnchors: Record<string, string[]> = {};
  // Only allocated in worklist mode (kept undefined otherwise so cockpit's RenderedCel omits the field entirely).
  const worklistActions: Record<string, { caseId: string }> | undefined = worklist ? {} : undefined;

  // Render cases whenever there ARE cases — even when `result.success === false` (a sibling case errored, so the
  // RenderScenarioResult envelope is unsuccessful). Suppressing all cases on any failure hid the FAILING case #173
  // needs to select (disc 158 §"Cockpit robustness"). Only the no-cases path (e.g. a graph/parse failure → empty
  // scenarios) falls to the placeholder. Graph-level `errors` ride a banner ABOVE the cases instead of suppressing them.
  if (result.scenarios.length === 0) {
    const why = result.errors.length ? `: ${escapeHtml(result.errors.join("; "))}` : "";
    const msg = result.errors.length ? `CEL did not render${why}` : "No CEL cases.";
    const emptyHtml = `${worklistHeader}<p class="placeholder">${msg}</p>`;
    return worklistActions ? { html: emptyHtml, anchors, reveals, conceptToFactAnchors, worklistActions } : { html: emptyHtml, anchors, reveals, conceptToFactAnchors };
  }

  // A banner only when there's a graph-level error string to show; errored CASES carry their own ⚠ badge + diagnostics
  // (the per-case error path leaves `result.errors` empty — no banner, the ⚠ rows tell the story).
  let html =
    worklistHeader +
    (result.errors.length > 0
      ? `<p class="placeholder fc-cel-banner">⚠ ${escapeHtml(result.errors.join("; "))}</p>`
      : "");
  // The notes drawer (#156 notes) is a PANE-LEVEL right panel (only one case's drawer is open at a time — openNotesCaseId),
  // so it's captured during the loop and appended ONCE after all case blocks, not nested inside a row's div.
  let drawerHtml = "";
  let idx = 0;
  for (const sc of result.scenarios) {
    // FIX 1 (disc 160): an AMBIGUOUS-name case (its name shared by >1 case) must NOT be anchored to the frozen
    // caseIdByName[name] — clicking EITHER same-name block would otherwise select that ONE frozen caseId and apply
    // cross-pane `.current` highlights as if it were the frozen case (a mis-attribution). So treat it as un-revealable.
    const ambiguous = duplicateNames.has(sc.case.name);
    const caseId = ambiguous ? undefined : caseIdByName[sc.case.name]; // undefined → case un-revealable (no case anchor)
    const id = `${prefix}cel${idx}`;
    const attrs = [`id="${escapeHtml(id)}"`, `class="cel-case cel-${sc.status}${ambiguous ? " cel-ambiguous" : ""}"`];
    if (caseId !== undefined) {
      anchors[caseId] = { scrollTo: id, segmentIds: [id] };
      const key = `${prefix}k${id}`;
      reveals[key] = { caseId };
      attrs.push(`data-reveal="${escapeHtml(key)}"`);
    }

    // Facts: a concept-resolved, revealable fact becomes its own clickable peek anchor; others render as plain text.
    // The whole fact token sits inside its span (no clickable gaps); the separator is outside, so clicking between
    // facts falls through to the case block (closest('[data-reveal]') picks the nearest — the inner fact span wins).
    const factParts = sc.case.facts.map((f, fi) => {
      const db = f.definedBy;
      if (db?.kind === "concept") {
        const conceptKey = nodeKey({ lib: db.lib, kind: "concept", name: db.name });
        if (revealable?.has(conceptKey)) {
          const factElId = `${id}f${fi}`;
          const factAnchorKey = `fact:${id}:f${fi}`; // colon → never collides with a caseId anchor
          anchors[factAnchorKey] = { scrollTo: factElId, segmentIds: [factElId] };
          reveals[factAnchorKey] = { conceptKey, factAnchorKey };
          (conceptToFactAnchors[conceptKey] ??= []).push(factAnchorKey); // reverse: a concept can be a fact in many cases
          return `<span id="${escapeHtml(factElId)}" class="cel-fact" data-reveal="${escapeHtml(factAnchorKey)}">${escapeHtml(f.name)}</span>`;
        }
      }
      return escapeHtml(f.name);
    });
    // DISPLAY-only: a determination outcome (`certify.Met`) shows as its human key (`Met`); a no-op for ordinary
    // activity names. The raw `recommendation` is untouched — matching/oracle checks run off the CRE's raw names.
    const produced = sc.produced.map((p) => escapeHtml(displayDetermination(p.recommendation))).join(", ");
    // At-rest key slot (#163): the units this case corresponds to. Only when the case is frozen (caseId-keyed) + showKeys.
    const keySlot = showKeys && caseId !== undefined ? corrKeyHtml(caseKeyNumbers[caseId] ?? []) : "";
    // Worklist review-state DROPDOWN (#156 slice 4, mode-gated; a <select>, no longer a cycling checkbox). REVIEWABLE = a
    // frozen, non-ambiguous case (caseId !== undefined, which already excludes the ambiguous branch above) → an interactive
    // <select data-worklist-select> carrying an opaque STABLE key (resolved host-side to the caseId — the webview never
    // sees a caseId). NON-reviewable = unfrozen (no caseId) OR ambiguous-name → a DISABLED select (no key, a title
    // explaining why), never hidden. State is read from statesByCaseId by caseId only (never by name); an unfrozen/
    // ambiguous case has no caseId so it has no persisted state → always "To do". A native <select> is inherently keyboard-
    // + screen-reader-operable (no hand-rolled aria-checked/tabindex), and the host validates the posted value.
    let reviewControl = "";
    if (worklist && worklistActions) {
      if (caseId !== undefined) {
        const wstate: ReviewState = worklist.statesByCaseId[caseId] ?? "unreviewed";
        // STABLE key, derived from the caseId — NOT gen-scoped (unlike the reveal keys). The dropdown change does NOT go
        // through the reveal coordinator, so it needn't be gen-fresh; a stable key means a change on a STALE (pre-re-render)
        // DOM still resolves to the caseId, instead of being silently dropped when renderPane bumps the gen. caseId is
        // unique per frozen case, so `wl_<caseId>` is collision-free across cases.
        const wlKey = `wl_${caseId}`;
        worklistActions[wlKey] = { caseId };
        const options = REVIEW_ORDER.map(
          (st) => `<option value="${st}"${st === wstate ? " selected" : ""}>${REVIEW_LABEL[st]}</option>`,
        ).join("");
        reviewControl =
          `<select class="cel-review cel-review-${wstate}" data-worklist-select="${escapeHtml(wlKey)}" ` +
          `aria-label="Review state: ${REVIEW_LABEL[wstate]}" title="Set review state">${options}</select> `;
      } else {
        // DISABLED select (unfrozen / ambiguous). It carries NO data-worklist-select, so a change can't fire and the host
        // never resolves it. INVARIANT: it safely falls through (does NOT select the case) only because an unfrozen/
        // ambiguous case ALSO renders without a parent `data-reveal` (see above) — so the shell's reveal handler finds no
        // target either. If a future state ever made such a case revealable, guard the select-click fall-through explicitly.
        const why = ambiguous ? "name shared; not reviewable" : "freeze this case to review it";
        reviewControl =
          `<select class="cel-review cel-review-disabled" disabled aria-label="Not reviewable" title="${escapeHtml(why)}"><option>${REVIEW_LABEL.unreviewed}</option></select> `;
      }
    }
    // Notes glyph + drawer (#156 notes, worklist mode, REVIEWABLE cases only — a stable caseId to key the thread; unfrozen/
    // ambiguous get no glyph, consistent with the verdict select's no-trustworthy-caseId rule). The glyph reuses the SAME
    // opaque `wl_<caseId>` key as the verdict select (both resolve to the caseId host-side). has-notes → 💬 + count; none →
    // 🗨 outline. When this case is the OPEN drawer, capture the pane-level drawer to append after the loop.
    let notesGlyph = "";
    if (worklist && worklistActions && caseId !== undefined) {
      const wlKey = `wl_${caseId}`;
      worklistActions[wlKey] = { caseId }; // idempotent with the verdict branch — ensure present regardless
      const notes = worklist.notesByCaseId?.[caseId] ?? [];
      const count = notes.length;
      const isOpen = worklist.openNotesCaseId === caseId;
      notesGlyph =
        `<span class="cel-notes-glyph${count ? " cel-notes-has" : ""}${isOpen ? " cel-notes-open" : ""}" role="button" tabindex="0" ` +
        `data-notes-toggle="${escapeHtml(wlKey)}" title="${count ? `${count} note${count === 1 ? "" : "s"}` : "No notes"} — click to open/close" ` +
        `aria-label="Notes (${count})">${count ? `💬 ${count}` : "🗨"}</span>`;
      if (isOpen) drawerHtml = renderNotesDrawer(wlKey, sc.case.name, notes, worklist.editingNoteId);
    }
    // Worklist rows are numbered (1-based, in scenario order) so a reviewer can refer to "row 7". Worklist mode only —
    // cockpit stays byte-identical. Numbers EVERY row (incl. unfrozen/ambiguous), so the count matches the visible list.
    const rowNum = worklist ? `<span class="cel-rownum">${idx + 1}.</span> ` : "";
    html +=
      `<div ${attrs.join(" ")}>` +
      rowNum +
      reviewControl +
      (notesGlyph ? `${notesGlyph} ` : "") + // sits immediately after the verdict dropdown
      keySlot +
      `<span class="cel-status">${BADGE[sc.status] ?? "·"}</span> ` +
      `<span class="cel-name">${escapeHtml(caseDisplayName(sc.case.name))}</span>` +
      (sc.case.subject ? ` <span class="cel-subject">(${escapeHtml(sc.case.subject)})</span>` : "") +
      (ambiguous ? ` <span class="cel-ambiguous-marker" title="This case's name is shared by another case — give each a distinct name to make it selectable.">⚠ name shared; not selectable</span>` : "") +
      (factParts.length ? `<div class="cel-facts">facts: ${factParts.join(", ")}</div>` : "") +
      (produced ? `<div class="cel-produced">→ ${produced}</div>` : "") +
      `</div>`;
    idx++;
  }
  html += drawerHtml; // pane-level right drawer (empty unless a case's notes drawer is open)
  return worklistActions ? { html, anchors, reveals, conceptToFactAnchors, worklistActions } : { html, anchors, reveals, conceptToFactAnchors };
}

/** Render the pane-level right notes drawer for the OPEN case: header (case name + ✕ close), the note thread (each note
 *  text + timestamp + Edit/Delete, OR — for the note whose id === `editingNoteId` — a prefilled textarea + Save/Cancel), and
 *  an add-row (a textarea + explicit Send). ALL user text (`text`, `name`) is `escapeHtml`-d, INCLUDING the textarea prefill
 *  (a raw `</textarea>` would otherwise break out of the element). The `data-note-draft` keys (`add:<wlKey>` / `edit:<id>`)
 *  let the webview preserve a half-typed draft across an unrelated re-render (a verdict change on another row). `wlKey` is
 *  the case's opaque `wl_<caseId>` — the trusted key the host resolves; the webview never sees a caseId. Pure. */
function renderNotesDrawer(wlKey: string, caseName: string, notes: readonly Note[], editingNoteId: string | undefined): string {
  const items = notes
    .map((n) => {
      const stamp = formatNoteTimestamp(n.created) + (n.edited !== undefined ? ` · edited ${formatNoteTimestamp(n.edited)}` : "");
      if (n.id === editingNoteId) {
        return (
          `<li class="cel-note cel-note-editing">` +
          `<textarea class="cel-note-input" data-note-draft="edit:${escapeHtml(n.id)}" aria-label="Edit note">${escapeHtml(n.text)}</textarea>` +
          `<div class="cel-note-actions">` +
          `<button type="button" class="cel-note-btn" data-note-save="${escapeHtml(n.id)}">Save</button>` +
          `<button type="button" class="cel-note-btn" data-note-cancel="1">Cancel</button>` +
          `</div></li>`
        );
      }
      return (
        `<li class="cel-note">` +
        `<div class="cel-note-text">${escapeHtml(n.text)}</div>` +
        `<div class="cel-note-meta"><span class="cel-note-ts">${escapeHtml(stamp)}</span>` +
        `<span class="cel-note-actions">` +
        `<button type="button" class="cel-note-btn" data-note-edit="${escapeHtml(n.id)}">Edit</button>` +
        `<button type="button" class="cel-note-btn" data-note-delete="${escapeHtml(n.id)}">Delete</button>` +
        `</span></div></li>`
      );
    })
    .join("");
  const thread = notes.length ? `<ul class="cel-note-list">${items}</ul>` : `<p class="cel-note-empty">No notes yet.</p>`;
  return (
    `<div class="cel-notes-drawer" data-notes-drawer>` +
    `<div class="cel-notes-head"><span class="cel-notes-title">Notes — ${escapeHtml(caseName)}</span>` +
    `<button type="button" class="cel-notes-close" data-notes-close="1" aria-label="Close notes">✕</button></div>` +
    thread +
    `<div class="cel-note-add">` +
    `<textarea class="cel-note-input" data-note-draft="add:${escapeHtml(wlKey)}" placeholder="Add a note…" aria-label="Add a note"></textarea>` +
    `<button type="button" class="cel-note-send" data-note-add="${escapeHtml(wlKey)}">Send</button>` +
    `</div></div>`
  );
}
