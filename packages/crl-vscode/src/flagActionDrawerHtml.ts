// Flag-ACTION drawer — the PURE HTML for the MV cockpit's read-only "act on one flag" flyout. Rendered into the SAME
// dedicated `#flagDrawer` region as the create-flag drawer (`flagDrawerHtml.ts`), mutually exclusive with it (the host's
// one-slot dispatcher renders whichever of create/action is active). A right flyout so the tree + questionnaire stay in
// view while a reviewer reads / resolves a flag. NO `vscode` import — pure + node-testable. All interpolated text escaped.
//
// Trusted-input discipline: the webview's controls carry OPAQUE, action-specific intents (`data-flag-action-*`) and NO flag
// id — the host acts on its host-captured `flagActionView.flag`. Distinct from the create drawer's `data-flag-*` so the two
// share the `#flagDrawer` region without their click listeners colliding.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** One extra registry field to display (already filtered to non-plumbing keys by the host — ref/key/status/system removed). */
export interface FlagActionField {
  key: string;
  value: string;
}

/** The read-only view of ONE flag the drawer renders. The host derives the display-only bits (Type via `flagDisplayNameOf`,
 *  the occurrence signature via `parseOccurrenceKey`, the numeric issue no via `issueRefOf`) so this module stays decoupled
 *  from the crl vocabulary + pure. */
export interface FlagActionView {
  /** the human "Type" — `displayName` when the tag has one, else the raw tag id (extraction/legacy tags have none). */
  typeLabel: string;
  /** step-provenance (`extraction` | `validation`) — shown so a KE-origin finding reads distinctly from an MV-origin one. */
  category: string;
  status: "open" | "resolved";
  /** the target's SHORT label (the header) + its FULL self-describing label (the anchor's retained `label`). */
  targetLabel: string;
  targetTitle?: string;
  /** the stored anchor address — `scope:name` (+ ` "lib"`), for the Target row. */
  anchorAddress: string;
  /** a decision occurrence's node signature, when the flag addresses a specific leaf/`when` (scope==="decision"). */
  occurrenceSignature?: string;
  /** the one-line summary (the flag `gist`). */
  summary: string;
  /** the "just enough" body (the flag `description`), possibly multiline; undefined → rendered as an em dash. */
  description?: string;
  /** extra registry fields (kind, direction, …) — already non-plumbing, in registry/stored order. */
  fields: FlagActionField[];
  /** the raw linked-issue ref string (e.g. `#42` or a URL) — shown in the Ref row even when non-numeric (not a link). */
  issueRef?: string;
  /** the numeric issue number, when `issueRef` is a `#N` the injection guard accepts → the Open-issue affordance. */
  issueNo?: number;
  createdAt: string;
  editedAt?: string;
  /** the stable record id — shown in the collapsed Details (disc 359). */
  id: string;
  /** whether the flag's anchor resolves to at least one node in the CURRENT tree render. false → the gold node-link can't be
   *  drawn, so the drawer auto-opens Details + notes it (a moved occurrence / library-wide / concept drawn nowhere). */
  targetPresent: boolean;
  /** Todo 3.5 (operator): EVERY flag is editable now — a human MV Type gets the FULL form; an AI/extraction (or legacy) flag
   *  gets a DESCRIPTION-ONLY form (a human may add/fix the description; the Type/summary/fields stay the AI's, so no silent
   *  retype). `descriptionOnly` drives the button label + the edit-form mode. */
  descriptionOnly: boolean;
}

/** A labelled read-only row: `<span class="fa-key">…</span><span class="fa-val">…</span>`. `pre` keeps a multiline body's
 *  line breaks (white-space:pre-wrap in the host CSS). */
function row(key: string, valueHtml: string, pre = false): string {
  return `<div class="fa-row"><span class="fa-key">${escapeHtml(key)}</span><span class="fa-val${pre ? " fa-pre" : ""}">${valueHtml}</span></div>`;
}

/** Render the read-only flag-action drawer: a header (target + ✕), the flag's full content as labelled rows, and the action
 *  buttons that exist in this todo — Resolve/Reopen (status toggle) + Open issue #N (numeric ref only). Edit/Delete arrive in
 *  later todos (deliberately absent, not disabled). Carries `data-flag-action-drawer`. */
export function renderFlagActionDrawer(v: FlagActionView): string {
  const em = `<span class="fa-em">—</span>`;
  // The header IS the summary now (disc 359 — the target label was too long + duplicated the Target row); an empty gist
  // (extraction/legacy flags) falls back to the Type so the header is never a bare "Flag —".
  const headerText = v.summary || v.typeLabel;
  // Description is ALWAYS shown (an em-dash when empty) — even on an AI flag with no description — because a human can EDIT it
  // (operator: don't omit it; it's the one editable field on an AI flag, so an empty one is a visible add-target). Ref, by
  // contrast, is NOT editable, so an empty Ref row is pure noise → omitted. Type/Origin/Status/Created always have a value.
  const rows =
    row("Type", escapeHtml(v.typeLabel)) +
    row("Origin", escapeHtml(v.category)) +
    row("Status", `<span class="fa-status fa-status-${v.status}">${v.status === "resolved" ? "resolved" : "open"}</span>`) +
    row("Description", v.description?.trim() ? escapeHtml(v.description) : em, true) + // .trim(): a whitespace-only value reads as empty (em-dash)
    v.fields.map((f) => row(f.key, escapeHtml(f.value))).join("") +
    (v.issueRef?.trim() ? row("Ref", escapeHtml(v.issueRef)) : "") +
    row("Created", escapeHtml(v.createdAt)) +
    (v.editedAt ? row("Edited", escapeHtml(v.editedAt)) : "");

  // The technical "which exact node" address is buried in a collapsible Details (the gold node-link answers "which node?"
  // visually). It AUTO-OPENS + notes when the target isn't drawn in the current tree (no gold node to point at).
  const target = v.occurrenceSignature
    ? `${escapeHtml(v.anchorAddress)} · ${escapeHtml(v.occurrenceSignature)}`
    : escapeHtml(v.anchorAddress);
  const missingNote = v.targetPresent ? "" : `<div class="fa-row fa-note">This flag's target isn't drawn in the current tree (a moved occurrence, or a library-wide flag).</div>`;
  const details =
    `<details class="fa-details"${v.targetPresent ? "" : " open"}><summary>Details</summary>` +
    missingNote +
    row("Target", `${escapeHtml(v.targetLabel)}<span class="fa-addr">${target}</span>`) +
    row("Id", escapeHtml(v.id)) +
    `</details>`;

  const toggle =
    v.status === "resolved"
      ? `<button type="button" class="fa-btn fa-toggle" data-flag-action-toggle>↻ Reopen flag</button>`
      : `<button type="button" class="fa-btn fa-toggle fa-primary" data-flag-action-toggle>✓ Resolve flag</button>`;
  const issue =
    v.issueNo !== undefined
      ? `<button type="button" class="fa-btn" data-flag-action-issue>↗ Open issue #${escapeHtml(String(v.issueNo))}</button>`
      : "";
  // Todo 3.5: Edit is offered for EVERY flag — a human MV Type edits the whole flag; an AI/extraction flag edits only its
  // Description (the label + the form mode follow `descriptionOnly`).
  const edit = `<button type="button" class="fa-btn" data-flag-action-edit>✎ Edit ${v.descriptionOnly ? "description" : "flag"}</button>`;

  return (
    `<div class="flag-drawer flag-action-drawer" data-flag-action-drawer>` +
    `<div class="flag-head"><span class="flag-title" title="${escapeHtml(headerText)}">Flag — ${escapeHtml(headerText)}</span>` +
    `<button type="button" class="flag-close" data-flag-action-close aria-label="Close">✕</button></div>` +
    `<div class="fa-body">${rows}${details}</div>` +
    `<div class="flag-actions">${issue}${edit}${toggle}</div>` +
    `</div>`
  );
}
