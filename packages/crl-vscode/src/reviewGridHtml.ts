// Bulk-verdict GRID renderer (vscode-free, unit-tested) — the webview body for "CRL · Review verdicts" (Todo 2a).
// Rows = the unsettled review items (`ReviewGridRow`, projected by `reviewGridViewModel`); 4 columns = the review states
// (To do / Pending / Pass / Fail). Each row is a radio group (one state per row) so a reviewer sets Pass on some rows and
// Fail on others in one pass; each column header has an "all" button (sets every ENABLED cell in that column). NO
// pre-selection — an untouched row means "leave unchanged"; Apply posts only the rows the reviewer explicitly picked.
//
// The HOST wraps this body in a nonced, CSP-locked shell + concatenates REVIEW_GRID_STYLE (into its <style>) and
// REVIEW_GRID_SCRIPT (into a nonced <script>). CSP-safe by construction: no inline handlers, no external resources; the
// script wires listeners via addEventListener. Untrusted-input note: a row carries its (kind,id) in data-* attributes;
// the host resolves an assignment back to its CAPTURED ReviewItem by (kind,id) (never trusting webview-supplied identity).
import type { ReviewGridRow } from "./medicalValidationStore";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

const COLS: { state: "unreviewed" | "pending" | "pass" | "fail"; label: string }[] = [
  { state: "unreviewed", label: "To do" },
  { state: "pending", label: "Pending" },
  { state: "pass", label: "Pass" },
  { state: "fail", label: "Fail" },
];

/** The criterion verdict vocabulary differs from the case one (disc 346): a criterion "Pass"/"Fail" attests
 *  "Correctly encoded"/"Encoding wrong". We keep the neutral column headers but disambiguate per cell via aria/title. */
const CELL_ARIA: Record<string, Record<string, string>> = {
  criterion: { unreviewed: "To do", pending: "Undecided", pass: "Correctly encoded", fail: "Encoding wrong" },
  case: { unreviewed: "To do", pending: "Pending", pass: "Pass", fail: "Fail" },
};

/** Render the grid BODY (the host injects the shell + style + script). Empty `rows` is a caller error — the host shows the
 *  "No unsettled…" message and never opens the panel — but we render an explicit empty state defensively. */
export function reviewGridHtml(rows: readonly ReviewGridRow[]): string {
  if (rows.length === 0) return `<div class="rv-wrap"><p class="rv-empty">No unsettled case or criterion verdicts.</p></div>`;
  const head =
    `<tr><th scope="col" class="rv-item-col">Item</th>` +
    COLS.map(
      (c) =>
        `<th scope="col"><span>${esc(c.label)}</span>` +
        `<button type="button" class="rv-all" data-all="${c.state}" title="Set all eligible rows to ${esc(c.label)}">all</button></th>`,
    ).join("") +
    `</tr>`;

  const body = rows
    .map((r, i) => {
      const name = `rv-row-${i}`; // per-row radio group; the (kind,id) join lives in data-* (below), not the DOM name
      const meta = r.kind === "criterion" ? `Criterion · ${esc(r.lib ?? "")} · ${esc(r.currentLabel)}` : `Case · ${esc(r.currentLabel)}`;
      const rowHead =
        `<th scope="row"><span class="rv-label">${esc(r.label)}</span> <span class="rv-meta">${meta}</span>` +
        (r.hint ? `<span class="rv-hint"> — ${esc(r.hint)}</span>` : "") +
        `</th>`;
      const cells = COLS.map((c) => {
        const enabled = r.enabled[c.state];
        const aria = `${esc(r.label)}: ${esc(CELL_ARIA[r.kind][c.state])}`;
        const dis = enabled ? "" : ` disabled aria-disabled="true"`;
        const disTitle = enabled ? "" : r.hint ? ` title="${esc(r.hint)}"` : "";
        return `<td><input type="radio" name="${name}" value="${c.state}" aria-label="${aria}"${dis}${disTitle}></td>`;
      }).join("");
      return `<tr data-kind="${esc(r.kind)}" data-id="${esc(r.id)}">${rowHead}${cells}</tr>`;
    })
    .join("");

  return (
    `<div class="rv-wrap">` +
    `<p class="rv-intro">Set a verdict on any rows you've reviewed, then Apply. Untouched rows are left unchanged. ` +
    `A criterion Pass means "correctly encoded"; a disabled cell explains why.</p>` +
    `<div class="rv-scroll"><table class="rv-grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
    `<div class="rv-actions"><span class="rv-status" id="rv-status" role="status" aria-live="polite"></span>` +
    `<button type="button" id="rv-clear">Clear all</button>` +
    `<button type="button" id="rv-cancel">Cancel</button>` +
    `<button type="button" id="rv-apply" disabled>Apply</button></div>` +
    `</div>`
  );
}

/** CSS — concatenated into the host shell's nonced <style>. Theme-aware via VS Code webview CSS variables. */
export const REVIEW_GRID_STYLE =
  `.rv-wrap{font:13px var(--vscode-font-family,sans-serif);color:var(--vscode-foreground);padding:8px 10px}` +
  `.rv-intro{color:var(--vscode-descriptionForeground);margin:0 0 8px}` +
  `.rv-empty{color:var(--vscode-descriptionForeground)}` +
  `.rv-scroll{overflow-x:auto;max-width:100%}` +
  `.rv-grid{border-collapse:collapse;width:100%}` +
  `.rv-grid th,.rv-grid td{border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.25));padding:4px 8px;text-align:left}` +
  `.rv-grid thead th{text-align:center;white-space:nowrap;vertical-align:bottom}` +
  `.rv-grid td{text-align:center}` +
  `.rv-item-col{text-align:left}` +
  `.rv-grid tbody th{font-weight:400}` +
  `.rv-label{font-weight:600}` +
  `.rv-meta{color:var(--vscode-descriptionForeground);font-size:11px;margin-left:6px}` +
  `.rv-hint{color:var(--vscode-errorForeground);font-size:11px}` +
  `.rv-all{display:block;margin:2px auto 0;font-size:11px;cursor:pointer;background:none;border:1px solid var(--vscode-button-border,transparent);color:var(--vscode-textLink-foreground);border-radius:3px;padding:0 6px}` +
  `.rv-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;position:sticky;bottom:0;background:var(--vscode-editor-background);padding-top:6px}` +
  `.rv-status{margin-right:auto;color:var(--vscode-descriptionForeground)}` +
  `.rv-actions button{cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:none;border-radius:3px;padding:3px 12px}` +
  `.rv-actions button#rv-cancel{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}` +
  `.rv-actions button:disabled{opacity:.5;cursor:default}` +
  `.rv-grid input[type=radio]:disabled{opacity:.35}`;

/** Client script — concatenated into the host shell's nonced <script>. Tracks picks, wires the column "all" buttons
 *  (skipping disabled cells + reporting how many were ineligible), Clear-all, and per-row toggle-OFF (radios don't
 *  natively deselect, so clicking a checked cell returns the row to "leave unchanged" — the only route back after a
 *  fat-fingered pick without discarding the rest). Enables Apply when ≥1 row is picked and posts the assignments. While
 *  an apply is in flight (`applying`) Apply stays disabled through any later radio/all/clear interaction — the webview
 *  must never post a 2nd apply before the host's one persist resolves. The host owns the trust boundary; this only
 *  reports what the reviewer chose. On a persist failure the host posts `{type:"reenable"}`: `applying` clears, Apply
 *  comes back, and the panel stays open so the reviewer's picks survive. */
export const REVIEW_GRID_SCRIPT =
  `(function(){const vscode=acquireVsCodeApi();` +
  `const apply=document.getElementById('rv-apply');const status=document.getElementById('rv-status');` +
  `if(!apply)return;var applying=false;` +
  `function picks(){const out=[];document.querySelectorAll('tr[data-kind]').forEach(function(tr){` +
  `const sel=tr.querySelector('input[type=radio]:checked');if(sel)out.push({kind:tr.getAttribute('data-kind'),id:tr.getAttribute('data-id'),state:sel.value});});return out;}` +
  `function refresh(msg){const n=picks().length;apply.disabled=applying||n===0;if(applying)return;` +
  `status.textContent=msg!==undefined?msg:(n?(n+' row'+(n===1?'':'s')+' set'):'');}` +
  `document.addEventListener('mousedown',function(e){if(e.target&&e.target.matches('input[type=radio]'))e.target._wc=e.target.checked;});` +
  `document.addEventListener('click',function(e){if(e.target&&e.target.matches('input[type=radio]')&&e.target._wc){e.target.checked=false;e.target._wc=false;refresh();}});` +
  `document.addEventListener('change',function(e){if(e.target&&e.target.matches('input[type=radio]'))refresh();});` +
  `document.querySelectorAll('.rv-all').forEach(function(btn){btn.addEventListener('click',function(){if(applying)return;const st=btn.getAttribute('data-all');var set=0,skip=0;` +
  `document.querySelectorAll('tr[data-kind]').forEach(function(tr){const r=tr.querySelector('input[value="'+st+'"]');if(r&&!r.disabled){r.checked=true;set++;}else{skip++;}});` +
  `refresh(set+' row'+(set===1?'':'s')+' set'+(skip?' — '+skip+' ineligible skipped':''));});});` +
  `var clear=document.getElementById('rv-clear');if(clear)clear.addEventListener('click',function(){if(applying)return;` +
  `document.querySelectorAll('tr[data-kind] input[type=radio]:checked').forEach(function(r){r.checked=false;});refresh('');});` +
  `apply.addEventListener('click',function(){const a=picks();if(!a.length||applying)return;applying=true;apply.disabled=true;status.textContent='Applying…';vscode.postMessage({type:'apply',assignments:a});});` +
  `var cancel=document.getElementById('rv-cancel');if(cancel)cancel.addEventListener('click',function(){vscode.postMessage({type:'cancel'});});` +
  `window.addEventListener('message',function(e){const m=e.data;if(m&&m.type==='reenable'){applying=false;refresh(m.note||'Not saved — try again.');}});` +
  `refresh();})();`;
