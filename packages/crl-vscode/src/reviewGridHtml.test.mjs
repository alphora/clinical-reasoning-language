// Unit tests for the bulk-verdict GRID renderer (Todo 2a, disc 347). vscode-free → imported directly (esbuild→CJS→node).
// Covers the static table body (columns, per-row radio groups, data-* refs, disabled Pass, aria, escaping, empty state)
// and smoke-checks the CSP-injected STYLE + SCRIPT strings. The host wiring (Todo 2b) is tested separately.
import assert from "node:assert/strict";

import { reviewGridHtml, REVIEW_GRID_STYLE, REVIEW_GRID_SCRIPT } from "./reviewGridHtml.ts";

const check = test;

const row = (over = {}) => ({
  kind: "criterion", id: '["L","A"]', label: "A", lib: "L", currentLabel: "To do",
  enabled: { unreviewed: true, pending: true, pass: true, fail: true }, ...over,
});

check("reviewGridHtml: empty rows → the 'No unsettled…' empty state (host never opens the panel, but render defensively)", () => {
  const html = reviewGridHtml([]);
  assert.match(html, /No unsettled case or criterion verdicts/);
  assert.doesNotMatch(html, /<table/); // no grid at all
});

check("reviewGridHtml: 4 column headers (To do / Pending / Pass / Fail) each with an 'all' button carrying its state", () => {
  const html = reviewGridHtml([row()]);
  for (const label of ["To do", "Pending", "Pass", "Fail"]) assert.ok(html.includes(`>${label}<`), `missing column ${label}`);
  for (const st of ["unreviewed", "pending", "pass", "fail"]) assert.match(html, new RegExp(`class="rv-all" data-all="${st}"`), `missing all-button ${st}`);
});

check("reviewGridHtml: a row is one radio group (per-row name) with the (kind,id) on data-* and 4 value radios", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /data-kind="criterion"/);
  assert.match(html, /data-id="\[&quot;L&quot;,&quot;A&quot;\]"/); // id JSON-escaped into the attribute
  // one shared per-row name across the 4 radios (match on the radio, not the row's data-name attr)
  const names = [...html.matchAll(/type="radio" name="(rv-row-\d+)"/g)].map((m) => m[1]);
  assert.equal(names.length, 4);
  assert.equal(new Set(names).size, 1);
  for (const v of ["unreviewed", "pending", "pass", "fail"]) assert.match(html, new RegExp(`type="radio" name="rv-row-0" value="${v}"`));
});

check("reviewGridHtml: an elided criterion → the Pass radio is disabled (the only refused cell); the others stay enabled", () => {
  const html = reviewGridHtml([row({ enabled: { unreviewed: true, pending: true, pass: false, fail: true }, hint: "truncated — can't mark Pass" })]);
  assert.match(html, /value="pass"[^>]*disabled/);
  assert.doesNotMatch(html, /value="fail"[^>]*disabled/);
  assert.match(html, /truncated/); // the hint is surfaced
});

check("reviewGridHtml: an orphan case → only 'To do' enabled (Pending/Pass/Fail disabled), orphaned hint shown", () => {
  const html = reviewGridHtml([{ kind: "case", id: "orph", label: "orph", currentLabel: "Pass (orphaned)", enabled: { unreviewed: true, pending: false, pass: false, fail: false }, hint: "orphaned — case no longer in the policy (clear only)" }]);
  assert.match(html, /value="pending"[^>]*disabled/);
  assert.match(html, /value="pass"[^>]*disabled/);
  assert.match(html, /value="fail"[^>]*disabled/);
  assert.doesNotMatch(html, /value="unreviewed"[^>]*disabled/);
  assert.match(html, /orphaned/);
});

check("reviewGridHtml: criterion Pass/Fail cells read 'Correctly encoded'/'Encoding wrong' via aria (per-kind vocabulary)", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /aria-label="A: Correctly encoded"/);
  assert.match(html, /aria-label="A: Encoding wrong"/);
});

check("reviewGridHtml: a case Pass cell reads 'Pass' via aria (NOT the criterion vocabulary)", () => {
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

check("reviewGridHtml: Apply (disabled at load) + Cancel + Clear-all controls", () => {
  const html = reviewGridHtml([row()]);
  assert.match(html, /id="rv-apply" disabled/);
  assert.match(html, /id="rv-cancel"/);
  assert.match(html, /id="rv-clear"/);
});

check("REVIEW_GRID_STYLE / REVIEW_GRID_SCRIPT: non-empty, CSP-safe (theme vars; no external URLs; posts apply/cancel; re-enables on 'reenable')", () => {
  assert.ok(REVIEW_GRID_STYLE.length > 100);
  assert.match(REVIEW_GRID_STYLE, /var\(--vscode-/); // theme-aware
  assert.ok(REVIEW_GRID_SCRIPT.length > 100);
  assert.doesNotMatch(REVIEW_GRID_SCRIPT, /https?:\/\//); // no external resources
  assert.match(REVIEW_GRID_SCRIPT, /type:'apply'/);
  assert.match(REVIEW_GRID_SCRIPT, /type:'cancel'/);
  assert.match(REVIEW_GRID_SCRIPT, /reenable/);
});

check("REVIEW_GRID_SCRIPT: guards a 2nd apply while one is in flight — an `applying` flag Apply/all/clear all respect (gpt56 R1 [critical])", () => {
  assert.match(REVIEW_GRID_SCRIPT, /var applying=false/);
  assert.match(REVIEW_GRID_SCRIPT, /applying=true;apply\.disabled=true/); // set on Apply click
  assert.match(REVIEW_GRID_SCRIPT, /apply\.disabled=applying\|\|n===0/); // refresh can't re-enable while applying
  assert.match(REVIEW_GRID_SCRIPT, /if\(m&&m\.type==='reenable'\)\{applying=false/); // only reenable clears it
});

check("REVIEW_GRID_SCRIPT: column-all skips DISABLED cells and reports the ineligible count (disc 347 pt 11)", () => {
  assert.match(REVIEW_GRID_SCRIPT, /if\(r&&!r\.disabled\)\{r\.checked=true;set\+\+;\}else\{skip\+\+;\}/); // eligible-only + count skips
  assert.match(REVIEW_GRID_SCRIPT, /ineligible skipped/); // surfaced to the reviewer
});

check("REVIEW_GRID_SCRIPT: a picked row can be returned to 'leave unchanged' — clear-all + per-row toggle-OFF (Claude R1 [important])", () => {
  assert.match(REVIEW_GRID_SCRIPT, /getElementById\('rv-clear'\)/);
  assert.match(REVIEW_GRID_SCRIPT, /_wc/); // mousedown records prior checked-state; a click on an already-checked radio unchecks it
  assert.match(REVIEW_GRID_SCRIPT, /e\.target\.checked=false/);
});
