// #(tree-snapshot) Todo 1 — the PURE exporter. Wrap a captured flow-pane render (the `.flow-wrap` SVG + its `.flow-zoom`
// control, WYSIWYG: the verdict/flag/on-path classes the host painted are already on the rows) into a COMPLETE,
// self-contained HTML document a customer opens in any browser — navigate (grab-drag pan) + zoom (control / Ctrl-wheel),
// no VS Code, no network, no external requests. Two facts make this cheap + robust:
//   - the tree is an SVG → zoom is LOSSLESS (we scale the element's width/height, native scroll pans, exactly like the cockpit);
//   - `FLOW_STYLE` carries a hex fallback for every `var(--vscode-*)` (incl. the `.flow-zoom` control it now owns) → it renders
//     standalone with no live theme.
// A `default-src 'none'` CSP meta ENFORCES the no-network property regardless of what the capture contains (defense in depth;
// it's network enforcement, not XSS protection — inline style/script are allowed). Pure (string in → string out), node-testable.
// ⚠ TRUST BOUNDARY (Todo 2's contract): `flowHtml` is our OWN renderer output (renderFlowPane escapes every text/attribute),
// re-serialized from the host-owned webview `#root`. It is NOT arbitrary user DOM — Todo 2 must capture that host markup, not
// widen to untrusted content. If capture ever broadens, this becomes an injection surface and needs host-side allowlisting.
// The effectful DOM capture + file write live in the cockpit (Todo 2).

/** A trimmed, self-contained copy of the cockpit webview's pan/zoom (COCKPIT_WEBVIEW_SCRIPT) — the SAME behavior, minus every
 *  host round-trip (no postMessage / reveal / node-select). Operates on `#flowroot`: scales `.flow-svg` by `treeZoom`
 *  (0.25–3, read from the viewBox so it's idempotent), pans by grab-drag (document scroll, 4px threshold like the cockpit),
 *  zooms via the `[data-zoom]` control + Ctrl-wheel (bound to `document` so a short tree has no dead zone). `applyZoom()` runs
 *  on load to normalize any zoom baked into the captured DOM back to 100%; it no-ops on a missing/zero-size SVG (never 0px). */
const SNAPSHOT_SCRIPT =
  `(function(){` +
  `var root=document.getElementById('flowroot');if(!root)return;` +
  `var treeZoom=1;` +
  `var applyZoom=function(){var s=root.querySelector('.flow-svg');if(!s)return;var vb=s.viewBox&&s.viewBox.baseVal;var bw=vb&&vb.width?vb.width:parseFloat(s.getAttribute('width'))||0;var bh=vb&&vb.height?vb.height:parseFloat(s.getAttribute('height'))||0;if(!bw||!bh)return;s.style.width=(bw*treeZoom)+'px';s.style.height=(bh*treeZoom)+'px';var p=root.querySelector('.flow-zoom-pct');if(p)p.textContent=Math.round(treeZoom*100)+'%';};` +
  `var setZoom=function(z){treeZoom=Math.min(3,Math.max(.25,z));applyZoom();};` +
  `document.addEventListener('click',function(e){var zb=e.target.closest&&e.target.closest('[data-zoom]');if(!zb)return;e.preventDefault();var a=zb.getAttribute('data-zoom');setZoom(a==='in'?treeZoom*1.2:a==='out'?treeZoom/1.2:1);});` +
  `document.addEventListener('wheel',function(e){if(!e.ctrlKey)return;if(!root.querySelector('.flow-svg'))return;e.preventDefault();setZoom(treeZoom*(e.deltaY<0?1.1:1/1.1));},{passive:false});` +
  `var fpPan=false,fpMoved=false,fpX=0,fpY=0,fpL=0,fpT=0;var fpSc=function(){return document.scrollingElement||document.documentElement;};` +
  `root.addEventListener('pointerdown',function(e){if(e.button!==0||!(e.target.closest&&e.target.closest('.flow-svg')))return;fpPan=true;fpMoved=false;fpX=e.clientX;fpY=e.clientY;var s=fpSc();fpL=s.scrollLeft;fpT=s.scrollTop;});` +
  `window.addEventListener('pointermove',function(e){if(!fpPan)return;var dx=e.clientX-fpX,dy=e.clientY-fpY;if(!fpMoved&&Math.abs(dx)+Math.abs(dy)<4)return;fpMoved=true;document.body.style.cursor='grabbing';var s=fpSc();s.scrollLeft=fpL-dx;s.scrollTop=fpT-dy;e.preventDefault();});` +
  `window.addEventListener('pointerup',function(){if(fpPan){fpPan=false;document.body.style.cursor='';}});` +
  `applyZoom();` +
  `})();`;

/** Minimal HTML-text escape for the values WE inject as text (the title). The flow markup itself is our own already-escaped
 *  renderer output and is inlined verbatim (see the trust-boundary note above). */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface FlowSnapshotOptions {
  /** The captured tree render: the `.flow-wrap` SVG (WYSIWYG, painted classes on the rows) + the `.flow-zoom` control —
   *  i.e. the cockpit tree pane's `#root` innerHTML. Trusted host-owned renderer output; inlined verbatim. */
  flowHtml: string;
  /** `FLOW_STYLE` (self-contained; every `var(--vscode-*)` has a hex fallback, and it now owns the `.flow-zoom` control CSS).
   *  Expected to be the trusted constant — it is inlined into a `<style>` verbatim. */
  styleCss: string;
  /** Browser-tab title + the on-page caption (e.g. `sur716-011 — decision tree`). Escaped here. */
  title: string;
}

/** Build the complete standalone HTML document. The body carries the vscode editor-bg/fg hex fallbacks so the snapshot reads
 *  the same as it did in the cockpit (a light-theme variant is a deferred option). A slim STICKY caption names the policy in
 *  the document flow (reserves space above the tree so it never overlaps the root node); the `.flow-zoom` control (from
 *  FLOW_STYLE) keeps working via SNAPSHOT_SCRIPT. Captured interactive affordances are inert in a snapshot, so their cursor
 *  is overridden to `grab` (they don't promise clicks the file can't honor). */
export function renderFlowSnapshotDocument(opts: FlowSnapshotOptions): string {
  const title = esc(opts.title);
  return (
    `<!doctype html>` +
    `<html lang="en"><head>` +
    `<meta charset="utf-8">` +
    // Enforce the no-network property in the browser (not just by convention): block every fetch, allow only the inline
    // style + script this document ships. Network enforcement, not XSS protection.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title>` +
    `<style>` +
    // A minimal reset + the standalone chrome. The body carries the vscode editor-bg/fg fallbacks so the snapshot matches the
    // cockpit's look with no live theme; it scrolls (the `.flow-wrap` overflows) so grab-pan works. The caption is STICKY (in
    // flow → reserves space, never overlaps the root node) rather than fixed. The id-scoped cursor override wins over
    // FLOW_STYLE's `.flow-row{cursor:pointer}` by specificity, so inert captured nodes show a grab cursor.
    `*{box-sizing:border-box}` +
    `html,body{margin:0;padding:0}` +
    `body{background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-foreground,#cccccc);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}` +
    `.snap-caption{position:sticky;top:0;z-index:8;padding:6px 14px;font-size:12px;background:var(--vscode-editorWidget-background,#252526);border-bottom:1px solid var(--vscode-panel-border,#454545)}` +
    `#flowroot .flow-row,#flowroot .flow-guard-tab,#flowroot .flow-crit-toggle{cursor:grab}` +
    opts.styleCss +
    `</style>` +
    `</head><body>` +
    `<div class="snap-caption">${title}</div>` +
    `<div id="flowroot">${opts.flowHtml}</div>` +
    `<script>${SNAPSHOT_SCRIPT}</script>` +
    `</body></html>`
  );
}
