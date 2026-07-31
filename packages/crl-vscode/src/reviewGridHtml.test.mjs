// Unit tests for the bulk-verdict GRID renderer (Todo 5, disc 366). vscode-free → imported directly (esbuild→CJS→node).
// Todo 5 moved the grid from its own webview TAB into the shared `#flagDrawer` right flyout: the body is now a VERTICAL list
// of per-item native-radio groups (2×2 segmented control), not a 5-column table. Covers the body (per-item radio groups,
// data-* refs, disabled Pass, aria, escaping, empty state, `data-review-grid`/`data-dirty` scope) and smoke-checks the
// CSP-injected DRAWER STYLE + SCRIPT strings. The host wiring is tested in cockpitWebviewScript.test.mjs.
import assert from "node:assert/strict";

import { reviewGridHtml, REVIEW_GRID_DRAWER_STYLE, REVIEW_GRID_DRAWER_SCRIPT } from "./reviewGridHtml.ts";

const check = test;

const row = (over = {}) => ({
  kind: "criterion", id: '["L","A"]', label: "A", lib: "L", currentLabel: "To do",
  enabled: { unreviewed: true, pending: true, pass: true, fail: true }, current: null, ...over,
});

check("reviewGridHtml: empty rows → the 'No unsettled…' empty state (host never opens the drawer, but render defensively)", () => {
  const html = reviewGridHtml([]);
  assert.match(html, /No unsettled case or criterion verdicts/);
  assert.match(html, /class="flag-drawer rvg" data-review-grid data-dirty="0"/); // still the flyout scope root
  assert.doesNotMatch(html, /rvg-item/); // no item blocks
});

check("reviewGridHtml: the grid root carries the FLYOUT class (flag-drawer) + data-review-grid + data-dirty=0 + data-epoch", () => {
  const html = reviewGridHtml([row()], 7);
  // impl-review [critical]: without `flag-drawer` the grid renders in-flow, not as a right flyout (the other 3 modes carry it).
  assert.match(html, /<div class="flag-drawer rvg" data-review-grid data-dirty="0" data-epoch="7">/);
});

check("reviewGridHtml: a 'Set all' header offers all 4 states (SHORT labels Todo/Pend so the 2×2 columns align), each carrying data-rvg-all=<state>", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /Set all:/);
  for (const st of ["unreviewed", "pending", "pass", "fail"]) assert.match(html, new RegExp(`class="rvg-all" data-rvg-all="${st}"`), `missing set-all ${st}`);
  for (const label of ["Todo", "Pend", "Pass", "Fail"]) assert.ok(html.includes(`>${label}<`), `missing state label ${label}`);
});

check("reviewGridHtml: an item is one radio group (per-item name) with the (kind,id) + data-current on data-* and 4 value radios", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /<fieldset class="rvg-item" data-kind="criterion" data-id="\[&quot;L&quot;,&quot;A&quot;\]" data-current="">/); // id JSON-escaped; current="" (row() has no current)
  const names = [...html.matchAll(/type="radio" name="(rvg-row-\d+)"/g)].map((m) => m[1]);
  assert.equal(names.length, 4);
  assert.equal(new Set(names).size, 1); // one shared per-item group name across the 4 radios
  for (const v of ["unreviewed", "pending", "pass", "fail"]) assert.match(html, new RegExp(`type="radio" name="rvg-row-0" value="${v}"`));
});

check("reviewGridHtml: the row PRE-SELECTS its current verdict (checked radio + data-current) so the grid opens showing where each item stands", () => {
  const html = reviewGridHtml([row({ current: "pending" })]);
  assert.match(html, /data-current="pending"/);
  assert.match(html, /value="pending" aria-label="[^"]*" checked/); // the pending radio opens checked
  assert.doesNotMatch(html, /value="pass"[^>]*checked/); // only the current one
});

check("reviewGridHtml: an elided criterion → the Pass radio is disabled (the only refused option); the others stay enabled", () => {
  const html = reviewGridHtml([row({ enabled: { unreviewed: true, pending: true, pass: false, fail: true }, hint: "truncated — can't mark Pass" })]);
  assert.match(html, /value="pass"[^>]*disabled/);
  assert.doesNotMatch(html, /value="fail"[^>]*disabled/);
  assert.match(html, /truncated/); // the hint is surfaced
  assert.match(html, /aria-describedby="rvg-hint-0"/); // the disabled reason is exposed to a11y, not only via title
});

check("reviewGridHtml: an orphan case → only 'To do' enabled (Pending/Pass/Fail disabled), orphaned hint shown", () => {
  const html = reviewGridHtml([{ kind: "case", id: "orph", label: "orph", currentLabel: "Pass (orphaned)", enabled: { unreviewed: true, pending: false, pass: false, fail: false }, hint: "orphaned — case no longer in the policy (clear only)" }]);
  assert.match(html, /value="pending"[^>]*disabled/);
  assert.match(html, /value="pass"[^>]*disabled/);
  assert.match(html, /value="fail"[^>]*disabled/);
  assert.doesNotMatch(html, /value="unreviewed"[^>]*disabled/);
  assert.match(html, /orphaned/);
});

check("reviewGridHtml: criterion Pass/Fail options read 'Correctly encoded'/'Encoding wrong' via aria (per-kind vocabulary)", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /aria-label="A: Correctly encoded"/);
  assert.match(html, /aria-label="A: Encoding wrong"/);
});

check("reviewGridHtml: a case Pass option reads 'Pass' via aria (NOT the criterion vocabulary)", () => {
  const html = reviewGridHtml([{ kind: "case", id: "c1", label: "Case 1", currentLabel: "To do", enabled: { unreviewed: true, pending: true, pass: true, fail: true } }]);
  assert.match(html, /aria-label="Case 1: Pass"/);
});

check("reviewGridHtml: HTML-escapes label/lib/id (no raw injection from a criterion name)", () => {
  const html = reviewGridHtml([row({ label: '<img src=x>', lib: 'A&B', id: '["A&B","<x>"]' })]);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /A&amp;B/);
});

check("reviewGridHtml: a hostile id stays wholly INSIDE the quoted data-id attribute (no attribute-context break)", () => {
  const evil = '" onmouseover="x';
  const html = reviewGridHtml([row({ id: evil })]);
  assert.doesNotMatch(html, /onmouseover="x"/); // the quote is escaped, so the handler never becomes a real attribute
  assert.match(html, /data-id="&quot; onmouseover=&quot;x"/); // both quotes entity-encoded, still one attribute
});

check("reviewGridHtml: Apply (disabled at load) + Cancel + Clear controls carry data-rvg-* intents", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /data-rvg-apply disabled/);
  assert.match(html, /data-rvg-cancel/);
  assert.match(html, /data-rvg-clear/);
  assert.match(html, /data-rvg-status role="status" aria-live="polite"/); // the live status region survives the move
});

check("REVIEW_GRID_DRAWER_STYLE / SCRIPT: non-empty, CSP-safe (theme vars; no external URLs; posts apply/cancel; reuses outer vscode api)", () => {
  assert.ok(REVIEW_GRID_DRAWER_STYLE.length > 100);
  assert.match(REVIEW_GRID_DRAWER_STYLE, /var\(--vscode-/); // theme-aware
  assert.ok(REVIEW_GRID_DRAWER_SCRIPT.length > 100);
  assert.doesNotMatch(REVIEW_GRID_DRAWER_SCRIPT, /https?:\/\//); // no external resources
  assert.doesNotMatch(REVIEW_GRID_DRAWER_SCRIPT, /acquireVsCodeApi/); // reuses the enclosing COCKPIT_WEBVIEW_SCRIPT `v` (one api per webview)
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /type:'reviewGridApply'/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /type:'reviewGridCancel'/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /reviewGridReenable/);
  // every outbound message carries the grid-session epoch (impl-review [critical]) + reenable is epoch-gated
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /epoch:rgEpoch\(r\)/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /String\(m\.epoch\)!==rgEpoch\(r\)/);
});

check("REVIEW_GRID_DRAWER_SCRIPT: state is DOM-resident (data-applying on the grid root), scoped to [data-review-grid], its own IIFE", () => {
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /^\(function\(\)\{/); // isolated IIFE (no cross-session closure state)
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /fld\.querySelector\('\[data-review-grid\]'\)/); // scoped to the grid root, not document
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /setAttribute\('data-applying','1'\)/); // applying lives in the DOM (swap-atomic reset)
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /ab\.disabled=ap\|\|n===0/); // refresh can't re-enable Apply while applying
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /removeAttribute\('data-applying'\)/); // only reviewGridReenable clears it
});

check("REVIEW_GRID_DRAWER_SCRIPT: column set-all skips DISABLED options and reports the ineligible count (disc 347 pt 11)", () => {
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /if\(rb&&!rb\.disabled\)\{rb\.checked=true;set\+\+;\}else\{skip\+\+;\}/); // eligible-only + count skips
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /ineligible skipped/); // surfaced to the reviewer
});

check("REVIEW_GRID_DRAWER_SCRIPT: the DIFF model — a pick differs from data-current; Revert restores current; toggle-OFF only for BLANK rows", () => {
  // a pick = selected value present AND != the item's pre-selected current (untouched items stay on current → not sent)
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /var cur=fs\.getAttribute\('data-current'\)\|\|'';var val=sel\?sel\.value:'';if\(val&&val!==cur\)/);
  // Revert (data-rvg-clear) restores each item's radio to its data-current (the diff-model "undo my changes"), never to blank
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /data-rvg-clear/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /rbs\[k\]\.checked=\(cur!==''&&rbs\[k\]\.value===cur\)/);
  // per-row toggle-OFF is SCOPED to blank-open rows only (data-current="") — a definite-state row always shows one selection
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /function rgBlank\(inp\)\{[^}]*data-current[^}]*===''/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /inp\._rgwc=\(rgBlank\(inp\)&&inp\.checked\)/); // only a blank row records a prior-checked for toggle-off
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /if\(toff&&toff\._rgwc\)\{toff\.checked=false/);
});

check("REVIEW_GRID_DRAWER_SCRIPT: a TWO-WAY dirty signal (0↔≥1 picks) so the host discard guard clears when picks are cleared", () => {
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /type:'reviewGridDirty',epoch:rgEpoch\(r\),dirty:n>0/);
  assert.match(REVIEW_GRID_DRAWER_SCRIPT, /setAttribute\('data-dirty',d\)/); // deduped to one message per transition
});
