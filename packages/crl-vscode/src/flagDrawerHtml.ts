// #211 create-flag drawer — the PURE HTML for the MV cockpit's flag-authoring drawer. Rendered into a DEDICATED
// `#flagDrawer` region (a sibling of `#root`, like `#fcChrome`) that the render handler never touches — so a same-policy
// tree rebuild leaves the drawer + the user's typed text intact (no snapshot/restore needed). All interpolated text is
// escaped (a `</textarea>` / `"` in a prefill would otherwise break out). No `vscode` import — pure + node-testable.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** A flag tag's authoring info for the drawer — structurally `FlagTagInfo` from the crl flag vocabulary (id + category + field
 *  rules), redeclared locally so this module stays decoupled from the crl package + node-testable. */
export interface FlagDrawerTag {
  id: string;
  category?: string;
  /** the human "Type" label — the drawer shows ONLY tags that have one (the MV Types); the option text IS this string. */
  displayName?: string;
  fields: { key: string; required: boolean; values?: readonly string[] }[];
}

/** Field keys NEVER author-input in the drawer. Host plumbing: `ref` (auto from the created issue), `key` (the GAP-3
 *  occurrence address), `status` (always `open` for a new flag; `createFlag` rejects a `fields.status`), `system` (derived).
 *  Plus `kind` — AI-only finer metadata (the cockpit agent may set it), hidden from the human MV drawer (the Type is the tag). */
const HOST_MANAGED_FIELDS = new Set(["ref", "key", "status", "system", "kind"]);

export interface FlagDrawerOptions {
  /** The resolved target's SHORT human label (e.g. `this condition`, `the concept "diabetes" (every use)`) — the header. */
  targetLabel: string;
  /** The FULL label (incl. an occurrence's verbose signature) — shown as the header's hover title. Defaults to targetLabel. */
  targetTitle?: string;
  /** The flag tags to offer (validation-concern is floated first). */
  tags: FlagDrawerTag[];
  /** Prefill (the agent seam supplies these; the human right-click supplies none). */
  tag?: string;
  summary?: string;
  stub?: string;
  fields?: Record<string, string>;
  /** #210 (disc 239) — the element to RING in CRL Assist purple ("summary" | "description" | "submit"), auto-derived by the
   *  agent-open path to draw the validator's eye to what's needed. Undefined for the human right-click (no ring). */
  focus?: string;
  /** Todo 3 (disc 358): render as the EDIT form for an existing flag, not the create form. Changes the heading ("Edit flag —"),
   *  the submit copy ("Save changes"), the description placeholder (no "becomes the GitHub issue body"), and — CRITICALLY — the
   *  Save/Cancel/✕ intents to DISTINCT `data-flag-edit-{save,cancel}` (the create `data-flag-{insert,cancel,close}` route to the
   *  create-only `commitFlagDraft`/`closeFlagDrawer`, dead when only `flagEditDraft` is set — disc 358 accept #2). */
  edit?: boolean;
  /** Todo 3.5 (operator): the DESCRIPTION-ONLY edit form for an AI/extraction flag — a human may fix only the description; the
   *  Type/summary/fields stay the AI's (no silent retype). Renders JUST the Description textarea (+ a read-only summary for
   *  context) with the edit intents. Implies `edit`. */
  descriptionOnly?: boolean;
}

/** Render the create-flag drawer: a tag `<select>` (validation-concern first) + each tag's registry field controls (only
 *  the selected tag's group is visible; the webview toggles them client-side), a one-line summary (→ issue title + flag
 *  gist), a "just enough" stub (→ issue body), and Insert / Cancel. The whole thing carries `data-flag-drawer`. */
export function renderFlagDrawer(opts: FlagDrawerOptions): string {
  // #210 (disc 239) — the CRL Assist purple focus ring: ` flag-focus` on the element the agent-open path derived as needed.
  const ring = (key: string): string => (opts.focus === key ? " flag-focus" : "");

  // Todo 3.5: the DESCRIPTION-ONLY edit form (an AI/extraction flag). No Type select / fields / summary input — just a read-only
  // summary line (context) + the editable Description, with the edit intents. `flagCollect()` finds no tag/summary/field controls,
  // so it posts tag:''/summary:''/fields:{} + the stub — `saveFlagEdit` (descriptionOnly) ignores those and writes only the description.
  if (opts.descriptionOnly) {
    const ctx = opts.summary ? `<div class="flag-ctx" title="${escapeHtml(opts.summary)}">${escapeHtml(opts.summary)}</div>` : "";
    return (
      `<div class="flag-drawer flag-edit-drawer" data-flag-drawer>` +
      `<div class="flag-head"><span class="flag-title" title="${escapeHtml(opts.targetTitle ?? opts.targetLabel)}">Edit description — ${escapeHtml(opts.targetLabel)}</span>` +
      `<button type="button" class="flag-close" data-flag-edit-cancel aria-label="Close">✕</button></div>` +
      ctx +
      `<label class="flag-col"><span class="flag-label">Description</span>` +
      `<textarea class="flag-input${ring("description")}" data-flag-stub placeholder="add a note for this AI finding" aria-label="Description">${escapeHtml(opts.stub ?? "")}</textarea></label>` +
      `<div class="flag-actions">` +
      `<button type="button" class="flag-cancel" data-flag-edit-cancel>Cancel</button>` +
      `<button type="button" class="flag-save${ring("submit")}" data-flag-edit-save>Save changes</button>` +
      `</div></div>`
    );
  }
  // validation-concern first (the usual MV concern), the rest in the given (registry) order.
  const ordered = [...opts.tags].sort((a, b) => (a.id === "validation-concern" ? -1 : b.id === "validation-concern" ? 1 : 0));
  // A prefill `tag` not in the offered set (absent, or a non-MV/extraction tag) falls back to the first Type (validation-concern,
  // floated above) — intentional: the human right-click passes no tag, and both agent paths force validation-concern, so this
  // only guards a future non-MV prefill, which should default to the canonical MV Type rather than render an empty select.
  const selTag = ordered.some((t) => t.id === opts.tag) ? (opts.tag as string) : ordered[0]?.id;

  const tagOptions = ordered
    .map((t) => {
      // the option text is the human "Type" (displayName); the drawer only receives displayName-bearing tags (the MV Types).
      const label = t.displayName ?? t.id;
      return `<option value="${escapeHtml(t.id)}"${t.id === selTag ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");

  const fieldGroups = ordered
    .map((t) => {
      const rows = t.fields
        .filter((f) => !HOST_MANAGED_FIELDS.has(f.key)) // host-managed plumbing (ref/key/status/system) is never author-input
        .map((f) => {
          const pre = opts.fields?.[f.key] ?? "";
          const req = f.required ? " *" : "";
          let control: string;
          if (f.values && f.values.length) {
            const opts0 = [`<option value="">${f.required ? "— choose —" : "— none —"}</option>`]
              .concat(f.values.map((v) => `<option value="${escapeHtml(v)}"${v === pre ? " selected" : ""}>${escapeHtml(v)}</option>`))
              .join("");
            control = `<select data-flag-field="${escapeHtml(f.key)}">${opts0}</select>`;
          } else {
            control = `<input type="text" data-flag-field="${escapeHtml(f.key)}" value="${escapeHtml(pre)}">`;
          }
          return `<label class="flag-row"><span class="flag-label">${escapeHtml(f.key)}${req}</span>${control}</label>`;
        })
        .join("");
      // The selected tag's group is visible; others start hidden (the webview's aff() keeps this in sync on change).
      return `<div class="flag-fieldgroup" data-flag-field-for="${escapeHtml(t.id)}"${t.id === selTag ? "" : " hidden"}>${rows}</div>`;
    })
    .join("");

  // Todo 3: the edit form carries DISTINCT intents so its Save/Cancel/✕ don't hit the create-only handlers (dead in edit mode).
  const heading = opts.edit ? "Edit flag" : "Add flag";
  const closeIntent = opts.edit ? "data-flag-edit-cancel" : "data-flag-close"; // ✕ → Cancel-back-to-view in edit; drop-draft in create
  const cancelIntent = opts.edit ? "data-flag-edit-cancel" : "data-flag-cancel";
  const submitIntent = opts.edit ? "data-flag-edit-save" : "data-flag-insert";
  const submitClass = opts.edit ? "flag-save" : "flag-insert";
  const submitLabel = opts.edit ? "Save changes" : "Insert flag + create issue";
  // The create form tells the author the description becomes the issue body; on edit that framing is wrong (the body only
  // re-syncs on a Type change), so use a neutral placeholder.
  const descPlaceholder = opts.edit ? "the concern in a couple of lines" : "the concern in a couple of lines — becomes the GitHub issue body";

  return (
    `<div class="flag-drawer${opts.edit ? " flag-edit-drawer" : ""}" data-flag-drawer>` +
    `<div class="flag-head"><span class="flag-title" title="${escapeHtml(opts.targetTitle ?? opts.targetLabel)}">${heading} — ${escapeHtml(opts.targetLabel)}</span>` +
    `<button type="button" class="flag-close" ${closeIntent} aria-label="Close">✕</button></div>` +
    `<label class="flag-row"><span class="flag-label">Type</span>` +
    `<select data-flag-tag aria-label="Flag type">${tagOptions}</select></label>` +
    `<div class="flag-fields">${fieldGroups}</div>` +
    `<label class="flag-row"><span class="flag-label">Summary</span>` +
    `<input type="text" class="flag-input${ring("summary")}" data-flag-summary value="${escapeHtml(opts.summary ?? "")}" placeholder="one line — the issue title & the flag" aria-label="Summary"></label>` +
    `<label class="flag-col"><span class="flag-label">Description</span>` +
    `<textarea class="flag-input${ring("description")}" data-flag-stub placeholder="${escapeHtml(descPlaceholder)}" aria-label="Description">${escapeHtml(opts.stub ?? "")}</textarea></label>` +
    `<div class="flag-actions">` +
    `<button type="button" class="flag-cancel" ${cancelIntent}>Cancel</button>` +
    `<button type="button" class="${submitClass}${ring("submit")}" ${submitIntent}>${submitLabel}</button>` +
    `</div></div>`
  );
}
