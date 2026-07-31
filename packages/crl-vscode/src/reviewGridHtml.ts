// Bulk-verdict GRID renderer (vscode-free, unit-tested) — the drawer BODY for "Review verdicts" (Todo 5, disc 366).
// Slice 5 moved the grid out of its own `crlReviewGrid` webview TAB into the shared `#flagDrawer` right flyout (the pattern
// slices 1–4 use), so the tree + questionnaire stay in context. The drawer is narrow (`width:min(360px,70%)`), so the old
// 5-column TABLE is reshaped into a VERTICAL list: one block per item, each a native-radio group laid out as a 2×2 segmented
// control (To do / Pending / Pass / Fail). NO pre-selection — an untouched item means "leave unchanged"; Apply posts only the
// items the reviewer explicitly picked.
//
// The HOST injects this body into `#flagDrawer` via the `flagDrawer` message (innerHTML), concatenates REVIEW_GRID_DRAWER_STYLE
// into the cockpit shell's nonced <style>, and concatenates REVIEW_GRID_DRAWER_SCRIPT (an isolated IIFE) into the tree webview's
// COCKPIT_WEBVIEW_SCRIPT. innerHTML does NOT run inline <script>, so ALL behavior lives in that IIFE, wired by delegated
// listeners on `#flagDrawer` scoped to `[data-review-grid]` — and ALL of its state is DOM-resident (`data-applying`/`data-dirty`
// on the grid root, picks derived on demand), so each innerHTML swap atomically resets it (no cross-session closure deadlock).
// Untrusted-input note: a block carries its (kind,id) in data-* attributes; the host resolves an assignment back to its CAPTURED
// ReviewItem by (kind,id) (never trusting webview-supplied identity).
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
 *  "Correctly encoded"/"Encoding wrong". We keep the neutral segment labels but disambiguate per option via aria/title. */
const CELL_ARIA: Record<string, Record<string, string>> = {
  criterion: { unreviewed: "To do", pending: "Undecided", pass: "Correctly encoded", fail: "Encoding wrong" },
  case: { unreviewed: "To do", pending: "Pending", pass: "Pass", fail: "Fail" },
};

/** Render the grid BODY (the host injects the style + IIFE). Empty `rows` is a caller error — the host shows the "No
 *  unsettled…" message and never opens the drawer — but we render an explicit empty state defensively. The root carries
 *  `flag-drawer` (the shared right-flyout positioning class every `#flagDrawer` mode uses — impl-review [critical]: without it
 *  the grid renders in-flow, not as an overlay) PLUS `rvg` (the grid's own flex layout). `data-review-grid` is the scope root
 *  the IIFE's delegated listeners key on; `data-dirty="0"` primes the two-way dirty signal; `data-epoch` is the grid-SESSION
 *  id the webview echoes on every message so a delayed message from a torn-down session can't act on a later one (impl [critical]). */
export function reviewGridHtml(rows: readonly ReviewGridRow[], epoch = 0): string {
  const ep = String(epoch);
  if (rows.length === 0) return `<div class="flag-drawer rvg" data-review-grid data-dirty="0" data-epoch="${esc(ep)}"><p class="rvg-empty">No unsettled case or criterion verdicts.</p></div>`;

  const setAll =
    `<div class="rvg-setall"><span class="rvg-setall-label">Set all:</span>` +
    COLS.map((c) => `<button type="button" class="rvg-all" data-rvg-all="${c.state}" title="Set every eligible item to ${esc(c.label)}">${esc(c.label)}</button>`).join("") +
    `</div>`;

  const list = rows
    .map((r, i) => {
      const name = `rvg-row-${i}`; // per-item radio group; the (kind,id) join lives in data-* (below), not the DOM name
      const hintId = `rvg-hint-${i}`;
      const meta = r.kind === "criterion" ? `Criterion · ${esc(r.lib ?? "")}` : `Case`;
      const head =
        `<div class="rvg-head"><span class="rvg-label">${esc(r.label)}</span> ` +
        `<span class="rvg-meta">${meta} · ${esc(r.currentLabel)}</span>` +
        (r.hint ? `<span class="rvg-hint" id="${hintId}"> — ${esc(r.hint)}</span>` : "") +
        `</div>`;
      const opts = COLS.map((c) => {
        const enabled = r.enabled[c.state];
        const aria = `${esc(r.label)}: ${esc(CELL_ARIA[r.kind][c.state])}`;
        const dis = enabled ? "" : ` disabled aria-disabled="true"${r.hint ? ` aria-describedby="${hintId}"` : ""}`;
        const disTitle = enabled ? "" : r.hint ? ` title="${esc(r.hint)}"` : "";
        return `<label class="rvg-opt"><input type="radio" name="${name}" value="${c.state}" aria-label="${aria}"${dis}${disTitle}><span>${esc(c.label)}</span></label>`;
      }).join("");
      // A <fieldset>/<legend> gives the radio group an accessible name; the segment div is the 2×2 flex control.
      return `<fieldset class="rvg-item" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}"><legend class="rvg-legend">${head}</legend><div class="rvg-seg">${opts}</div></fieldset>`;
    })
    .join("");

  return (
    `<div class="flag-drawer rvg" data-review-grid data-dirty="0" data-epoch="${esc(ep)}">` +
    `<div class="rvg-intro-wrap"><p class="rvg-intro">Set a verdict on any items you've reviewed, then Apply. Untouched items are left unchanged. ` +
    `A criterion Pass means "correctly encoded"; a disabled option explains why.</p>${setAll}</div>` +
    `<div class="rvg-list">${list}</div>` +
    `<div class="rvg-actions"><span class="rvg-status" data-rvg-status role="status" aria-live="polite"></span>` +
    `<button type="button" class="rvg-secondary" data-rvg-clear>Clear</button>` +
    `<button type="button" class="rvg-secondary" data-rvg-cancel>Cancel</button>` +
    `<button type="button" data-rvg-apply disabled>Apply</button></div>` +
    `</div>`
  );
}

/** CSS — concatenated into the cockpit shell's nonced <style> (theme-aware via VS Code webview CSS variables). Scoped under
 *  `.rvg` so it can't leak into the flag forms sharing `#flagDrawer`. The list scrolls between a sticky intro/set-all header
 *  and a sticky actions footer; the 4 segments wrap 2×2 so a ~260–280px drawer never scrolls sideways. */
export const REVIEW_GRID_DRAWER_STYLE =
  // The root is `.flag-drawer.rvg` — `.flag-drawer` supplies the fixed right-flyout box (position/width/bg/z-index/overflow-y:auto);
  // `.rvg` overlays the grid's own flex column + `overflow:hidden` so ONLY the middle `.rvg-list` scrolls (later-in-sheet wins).
  `.rvg{display:flex;flex-direction:column;min-height:0;overflow:hidden;gap:0;font:13px var(--vscode-font-family,sans-serif);color:var(--vscode-foreground)}` +
  `.rvg[data-applying] input{pointer-events:none}` + // Todo 5 (nit): freeze picks while an apply is in flight (host window is one sync turn, but free defense)
  `.rvg-empty{color:var(--vscode-descriptionForeground)}` +
  `.rvg-intro-wrap{position:sticky;top:0;z-index:2;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));padding-bottom:6px;border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.25))}` +
  `.rvg-intro{color:var(--vscode-descriptionForeground);margin:0 0 6px}` +
  `.rvg-setall{display:flex;flex-wrap:wrap;gap:4px;align-items:center}` +
  `.rvg-setall-label{color:var(--vscode-descriptionForeground);font-size:11px}` +
  `.rvg-all{cursor:pointer;font-size:11px;background:none;border:1px solid var(--vscode-button-border,transparent);color:var(--vscode-textLink-foreground);border-radius:3px;padding:1px 7px}` +
  `.rvg-list{flex:1 1 auto;min-height:0;overflow-y:auto;padding:6px 0}` +
  `.rvg-item{border:0;border-bottom:1px solid var(--vscode-widget-border,rgba(128,128,128,.25));margin:0;padding:6px 0;min-inline-size:0}` +
  `.rvg-legend{padding:0;width:100%;float:left}` + // float:left makes a legend take full width + flow like a block (a bare legend is shrink-to-fit)
  `.rvg-head{margin-bottom:4px}` +
  `.rvg-label{font-weight:600}` +
  `.rvg-meta{color:var(--vscode-descriptionForeground);font-size:11px;margin-left:4px}` +
  `.rvg-hint{color:var(--vscode-errorForeground);font-size:11px}` +
  `.rvg-seg{display:flex;flex-wrap:wrap;gap:4px;clear:both}` +
  `.rvg-opt{flex:1 1 calc(50% - 4px);display:flex;align-items:center;gap:5px;box-sizing:border-box;padding:3px 6px;border:1px solid var(--vscode-widget-border,rgba(128,128,128,.3));border-radius:3px;cursor:pointer;font-size:12px;user-select:none}` +
  `.rvg-opt:has(input:checked){background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background)}` +
  `.rvg-opt:has(input:disabled){opacity:.4;cursor:default}` +
  `.rvg-opt input{margin:0}` +
  `.rvg-actions{display:flex;gap:8px;align-items:center;position:sticky;bottom:0;z-index:2;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));padding-top:8px;border-top:1px solid var(--vscode-widget-border,rgba(128,128,128,.25))}` +
  `.rvg-status{margin-right:auto;color:var(--vscode-descriptionForeground);font-size:11px}` +
  `.rvg-actions button{cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:none;border-radius:3px;padding:3px 12px}` +
  `.rvg-actions button.rvg-secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}` +
  `.rvg-actions button:disabled{opacity:.5;cursor:default}`;

/** Client IIFE — concatenated into COCKPIT_WEBVIEW_SCRIPT (which supplies `fld` = the #flagDrawer element and `v` = the
 *  vscode api in the enclosing scope). Isolated in its own function scope with `rg`-prefixed identifiers (the 4.97.0 SEV-1 was
 *  a variable COLLISION, which parses fine — isolation, not the `new Function` parse guard, is what prevents it). Delegated
 *  listeners on `fld`, every selector scoped to `[data-review-grid]`; state is DOM-resident (`data-applying`/`data-dirty` on
 *  the grid root), so an innerHTML swap to another drawer mode or another grid session resets it atomically. Mirrors the old
 *  panel script: per-row toggle-OFF (radios don't natively deselect — click a checked option to return the item to "leave
 *  unchanged"), Set-all (skips disabled + reports ineligible), Clear, Apply (posts the picks; disabled while applying), and a
 *  two-way dirty signal so the host's discard guard knows when picks exist. `reviewGridReenable` (host→webview, on a persist
 *  failure) clears `data-applying` so the picks survive a retry. */
export const REVIEW_GRID_DRAWER_SCRIPT =
  `(function(){` +
  `function rgRoot(){return fld.querySelector('[data-review-grid]');}` +
  `function rgEpoch(r){return r.getAttribute('data-epoch');}` + // the grid-session id echoed on every outbound message
  `function rgOptInput(t){var o=t&&t.closest&&t.closest('[data-review-grid] .rvg-opt');return o?o.querySelector('input[type=radio]'):null;}` +
  `function rgPicks(r){var out=[];var it=r.querySelectorAll('[data-kind]');for(var i=0;i<it.length;i++){var sel=it[i].querySelector('input[type=radio]:checked');if(sel)out.push({kind:it[i].getAttribute('data-kind'),id:it[i].getAttribute('data-id'),state:sel.value});}return out;}` +
  `function rgRefresh(note){var r=rgRoot();if(!r)return;var ap=r.hasAttribute('data-applying');var n=rgPicks(r).length;` +
  `var ab=r.querySelector('[data-rvg-apply]');if(ab)ab.disabled=ap||n===0;` +
  `var st=r.querySelector('[data-rvg-status]');if(st&&!ap)st.textContent=note!==undefined?note:(n?(n+' item'+(n===1?'':'s')+' set'):'');` +
  `var d=n>0?'1':'0';if(r.getAttribute('data-dirty')!==d){r.setAttribute('data-dirty',d);v.postMessage({type:'reviewGridDirty',epoch:rgEpoch(r),dirty:n>0});}}` +
  // per-option toggle-OFF: on mousedown record the checked state of the segment's radio (resolved via the .rvg-opt, so a click
  // on the label TEXT — most of the hit area — counts, not only a direct hit on the ~14px radio circle); undo it on the click.
  `fld.addEventListener('mousedown',function(e){var inp=rgOptInput(e.target);if(inp)inp._rgwc=inp.checked;});` +
  `fld.addEventListener('click',function(e){var r=rgRoot();if(!r)return;var ap=r.hasAttribute('data-applying');` +
  `var toff=rgOptInput(e.target);if(toff&&toff._rgwc){toff.checked=false;toff._rgwc=false;rgRefresh();return;}` +
  `var all=e.target.closest&&e.target.closest('[data-rvg-all]');` +
  `if(all){if(ap)return;var stt=all.getAttribute('data-rvg-all');var set=0,skip=0;var it=r.querySelectorAll('[data-kind]');` +
  `for(var i=0;i<it.length;i++){var rb=it[i].querySelector('input[value="'+stt+'"]');if(rb&&!rb.disabled){rb.checked=true;set++;}else{skip++;}}` +
  `rgRefresh(set+' item'+(set===1?'':'s')+' set'+(skip?' — '+skip+' ineligible skipped':''));return;}` +
  `var clr=e.target.closest&&e.target.closest('[data-rvg-clear]');` +
  `if(clr){if(ap)return;var ch=r.querySelectorAll('input[type=radio]:checked');for(var j=0;j<ch.length;j++)ch[j].checked=false;rgRefresh('');return;}` +
  `var cn=e.target.closest&&e.target.closest('[data-rvg-cancel]');` +
  `if(cn){if(ap)return;v.postMessage({type:'reviewGridCancel',epoch:rgEpoch(r)});return;}` +
  `var apb=e.target.closest&&e.target.closest('[data-rvg-apply]');` +
  `if(apb){if(ap)return;var a=rgPicks(r);if(!a.length)return;r.setAttribute('data-applying','1');apb.disabled=true;var st=r.querySelector('[data-rvg-status]');if(st)st.textContent='Applying…';v.postMessage({type:'reviewGridApply',epoch:rgEpoch(r),assignments:a});return;}});` +
  `fld.addEventListener('change',function(e){if(rgOptInput(e.target))rgRefresh();});` +
  // reenable (host→webview on a persist failure) — act ONLY on the SAME session (epoch match) so a delayed reenable from a
  // torn-down session can't un-freeze a later grid's apply.
  `window.addEventListener('message',function(e){var m=e.data;if(!m||m.type!=='reviewGridReenable')return;var r=rgRoot();if(!r||String(m.epoch)!==rgEpoch(r))return;r.removeAttribute('data-applying');rgRefresh(m.note||'Not saved — try again.');});` +
  `})();`;
