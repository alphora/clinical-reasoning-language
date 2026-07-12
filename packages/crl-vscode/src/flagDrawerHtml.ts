// #211 create-flag drawer — the PURE HTML for the MV cockpit's flag-authoring drawer. Rendered into a DEDICATED
// `#flagDrawer` region (a sibling of `#root`, like `#fcChrome`) that the render handler never touches — so a same-policy
// tree rebuild leaves the drawer + the user's typed text intact (no snapshot/restore needed). All interpolated text is
// escaped (a `</textarea>` / `"` in a prefill would otherwise break out). No `vscode` import — pure + node-testable.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** A flag tag's authoring info for the drawer — structurally `FlagTagInfo` from the registry (id + category + field
 *  rules), redeclared locally so this module stays decoupled from the crl package + node-testable. */
export interface FlagDrawerTag {
  id: string;
  category?: string;
  fields: { key: string; required: boolean; values?: readonly string[] }[];
}

export interface FlagDrawerOptions {
  /** The resolved target's human label (e.g. `the concept "diabetes" (every use)`) — shown in the header. */
  targetLabel: string;
  /** The flag tags to offer (validation-concern is floated first). */
  tags: FlagDrawerTag[];
  /** Prefill (the agent seam supplies these; the human right-click supplies none). */
  tag?: string;
  summary?: string;
  stub?: string;
  fields?: Record<string, string>;
}

/** Render the create-flag drawer: a tag `<select>` (validation-concern first) + each tag's registry field controls (only
 *  the selected tag's group is visible; the webview toggles them client-side), a one-line summary (→ issue title + flag
 *  gist), a "just enough" stub (→ issue body), and Insert / Cancel. The whole thing carries `data-flag-drawer`. */
export function renderFlagDrawer(opts: FlagDrawerOptions): string {
  // validation-concern first (the usual MV concern), the rest in the given (registry) order.
  const ordered = [...opts.tags].sort((a, b) => (a.id === "validation-concern" ? -1 : b.id === "validation-concern" ? 1 : 0));
  const selTag = ordered.some((t) => t.id === opts.tag) ? (opts.tag as string) : ordered[0]?.id;

  const tagOptions = ordered
    .map((t) => {
      const kind = t.category === "validation" ? "validation — CRL vs customer intent" : "extraction — CRL vs narrative";
      return `<option value="${escapeHtml(t.id)}"${t.id === selTag ? " selected" : ""}>@${escapeHtml(t.id)} — ${escapeHtml(kind)}</option>`;
    })
    .join("");

  const fieldGroups = ordered
    .map((t) => {
      const rows = t.fields
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

  return (
    `<div class="flag-drawer" data-flag-drawer>` +
    `<div class="flag-head"><span class="flag-title">Add flag — ${escapeHtml(opts.targetLabel)}</span>` +
    `<button type="button" class="flag-close" data-flag-close aria-label="Close">✕</button></div>` +
    `<label class="flag-row"><span class="flag-label">Type</span>` +
    `<select data-flag-tag aria-label="Flag type">${tagOptions}</select></label>` +
    `<div class="flag-fields">${fieldGroups}</div>` +
    `<label class="flag-row"><span class="flag-label">Summary</span>` +
    `<input type="text" data-flag-summary value="${escapeHtml(opts.summary ?? "")}" placeholder="one line — the issue title & the flag" aria-label="Summary"></label>` +
    `<label class="flag-col"><span class="flag-label">Just enough (→ issue)</span>` +
    `<textarea data-flag-stub placeholder="a couple lines; flesh out the issue after the meeting" aria-label="Stub">${escapeHtml(opts.stub ?? "")}</textarea></label>` +
    `<div class="flag-actions">` +
    `<button type="button" class="flag-cancel" data-flag-cancel>Cancel</button>` +
    `<button type="button" class="flag-insert" data-flag-insert>Insert flag + create issue</button>` +
    `</div></div>`
  );
}
