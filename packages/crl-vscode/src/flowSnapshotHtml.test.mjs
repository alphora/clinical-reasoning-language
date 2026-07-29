// #(tree-snapshot) Todo 1 — the pure standalone-HTML exporter. A self-contained doc (no external requests) that preserves
// the WYSIWYG tree + pan/zoom, openable in any browser.
import assert from "node:assert/strict";

import { renderFlowSnapshotDocument } from "./flowSnapshotHtml.ts";
import { FLOW_STYLE } from "./flowPaneHtml.ts";

// Mirror the REAL renderer output: `.flow-svg` carries `xmlns` (flowPaneHtml.ts) + width/height/viewBox; the row carries a
// painted class (WYSIWYG). Todo 2 feeds in exactly this shape (the webview `#root` innerHTML).
const FLOW =
  `<div class="flow-wrap"><svg class="flow-svg" xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">` +
  `<g class="flow-row flow-decision crit-pass"><rect/></g></svg></div>` +
  `<div class="flow-zoom"><button data-zoom="out">-</button><button class="flow-zoom-pct" data-zoom="reset">100%</button><button data-zoom="in">+</button></div>`;
const doc = () => renderFlowSnapshotDocument({ flowHtml: FLOW, styleCss: FLOW_STYLE, title: "sur716-011 — decision tree" });

test("renders a complete standalone HTML document (doctype, head, the inlined flow, the script)", () => {
  const h = doc();
  assert.ok(h.startsWith("<!doctype html>"), "starts with a doctype");
  assert.match(h, /<meta charset="utf-8">/);
  assert.match(h, /<div id="flowroot"><div class="flow-wrap">/, "the captured flow is wrapped in #flowroot verbatim");
  assert.ok(h.includes(FLOW), "the captured flow HTML is inlined verbatim (WYSIWYG — painted classes preserved)");
  assert.match(h, /<script>\(function\(\)\{/, "the self-contained pan/zoom script is embedded");
  assert.ok(h.trimEnd().endsWith("</html>"), "is a complete document");
});

test("is self-contained — a no-network CSP + no external-resource tags (xmlns/fragment refs are not fetches)", () => {
  const h = doc();
  assert.match(h, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">/, "a no-network CSP enforces self-containment in the browser");
  // Real fetch vectors only (NOT a bare `http` check — the SVG's xmlns namespace URI legitimately contains one).
  assert.ok(!/<img\b|<link\b|@import|\bsrc="https?:|\bhref="https?:/.test(h), "no external resource references");
});

test("inlines FLOW_STYLE incl. the .flow-zoom control CSS (moved into FLOW_STYLE) + the dark editor-bg fallback chrome", () => {
  const h = doc();
  assert.ok(h.includes(FLOW_STYLE), "FLOW_STYLE is inlined (the SVG's classes render standalone)");
  assert.match(h, /body\{background:var\(--vscode-editor-background,#1e1e1e\)/, "body carries the editor-bg fallback");
  // The zoom control is styled — it lives in FLOW_STYLE now, so the exported control is fixed bottom-right, not in-flow.
  assert.match(FLOW_STYLE, /\.flow-zoom\{position:fixed;bottom:10px;right:14px/, "FLOW_STYLE owns the fixed .flow-zoom control");
  assert.ok(!/var\(--vscode-editor-background\)\)/.test(FLOW_STYLE.match(/\.flow-zoom\{[^}]*\}/)[0]), ".flow-zoom bg fallback ends in a hex (renders themeless), not a nested var");
  assert.ok(FLOW_STYLE.includes(".crit-pass .flow-crit-verdict"), "sanity: FLOW_STYLE styles the painted classes the capture carries (#233 Todo 2b: `.crit-*` is row-type-agnostic)");
});

test("escapes the title in BOTH the <title> and the caption (no markup injection via the policy name)", () => {
  const h = renderFlowSnapshotDocument({ flowHtml: FLOW, styleCss: "", title: `x<script>alert(1)</script>&"` });
  assert.ok(!/<title>x<script>/.test(h), "the raw title is not emitted as markup");
  assert.match(h, /<title>x&lt;script&gt;alert\(1\)&lt;\/script&gt;&amp;&quot;<\/title>/, "title escaped");
  assert.match(h, /<div class="snap-caption">x&lt;script&gt;/, "caption escaped");
});

test("the caption is a STICKY in-flow bar (reserves space, never a fixed overlay over the root node)", () => {
  assert.match(doc(), /\.snap-caption\{position:sticky;top:0/, "caption is sticky/in-flow, not position:fixed");
});

// ── the pan/zoom script ACTUALLY runs (regex pins are not enough — a typo would ship dead pan/zoom) ──────────────────
// Extract the <script> body from the emitted doc and execute it against a minimal stub DOM, then assert real behavior.
function runScript(h, svgSpec) {
  const body = h.match(/<script>([\s\S]*?)<\/script>/)[1];
  const L = {};
  const svg =
    svgSpec === null
      ? null
      : { style: {}, viewBox: svgSpec.viewBox ? { baseVal: svgSpec.viewBox } : undefined, getAttribute: (n) => (svgSpec.attrs && svgSpec.attrs[n]) ?? null };
  const pct = { textContent: "" };
  const root = {
    querySelector: (s) => (s === ".flow-svg" ? svg : s === ".flow-zoom-pct" ? pct : null),
    addEventListener: (t, fn) => ((L["root:" + t] ||= []).push(fn)),
  };
  const document = {
    getElementById: (id) => (id === "flowroot" ? root : null),
    addEventListener: (t, fn) => ((L["doc:" + t] ||= []).push(fn)),
    scrollingElement: { scrollLeft: 0, scrollTop: 0 },
    body: { style: {} },
  };
  const window = { addEventListener: (t, fn) => ((L["win:" + t] ||= []).push(fn)) };
  // eslint-disable-next-line no-new-func — deliberately execute the shipped script string to catch syntax + behavior bugs.
  new Function("document", "window", body)(document, window);
  const click = (kind) => L["doc:click"][0]({ target: { closest: (s) => (s === "[data-zoom]" ? { getAttribute: () => kind } : null) }, preventDefault() {} });
  return { svg, pct, click };
}

test("smoke: the script parses + runs; applyZoom normalizes to 100% on load; the [data-zoom] control zooms + clamps", () => {
  const { svg, pct, click } = runScript(doc(), { viewBox: { width: 400, height: 200 } });
  assert.equal(svg.style.width, "400px", "load: width = viewBox width × 1 (normalized to 100%)");
  assert.equal(pct.textContent, "100%", "load: the % readout is normalized to 100%");
  click("in");
  assert.equal(svg.style.width, "480px", "zoom in ×1.2 → 480px");
  for (let i = 0; i < 20; i++) click("in");
  assert.equal(svg.style.width, "1200px", "zoom is clamped at 3× (400×3)");
  click("reset");
  assert.equal(svg.style.width, "400px", "reset → 100%");
});

test("smoke: no throw + no 0px write on a missing-dimensions or empty (no .flow-svg) tree", () => {
  // Missing viewBox AND width attr → base size 0 → applyZoom must NOT stamp 0px (leaves the SVG's own sizing).
  const { svg } = runScript(doc(), { attrs: {} });
  assert.equal(svg.style.width, undefined, "no 0px collapse — width left untouched when base size is 0");
  // Empty-tree placeholder: no .flow-svg → the script no-ops without throwing.
  const empty = renderFlowSnapshotDocument({ flowHtml: `<p class="placeholder">No CRL decisions to chart.</p>`, styleCss: FLOW_STYLE, title: "empty" });
  assert.doesNotThrow(() => runScript(empty, null), "empty tree: script runs without throwing");
  assert.ok(empty.startsWith("<!doctype html>") && empty.trimEnd().endsWith("</html>"), "still a complete document");
});
