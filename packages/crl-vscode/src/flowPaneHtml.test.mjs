// Unit tests for the flow-pane RENDERER (graphical decision-tree flowchart, T2 / disc 132). vscode-free → esbuild-bundle.
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const { renderFlowPane, FLOW_STYLE } = await load("flowPaneHtml.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// ── fixtures (the renderer ignores `location`, so {} suffices) ──
const node = (nodeKey, kind, label, refKeys, children = [], extra = {}) => ({
  nodeKey, nodeId: nodeKey, decision: "D", lib: "Pol", kind, label, refKeys, location: {}, children, ...extra,
});
const concept = (nodeKey, name, extra = {}) => ({
  nodeKey, name, lib: "Pol", label: `concept "${name}"`, location: {}, hasLocalCode: false, hasRepresentations: false, definitionRefs: [], ...extra,
});

// decision D: when A → recommend X; when B → use-decision D2; recommend Y (guarded by G); when Z (UNRESOLVED); otherwise → recommend Q
const structure = [{
  decision: "D", lib: "Pol", nodeKey: "d:D", location: {},
  children: [
    node("w:A", "when", "when A", ["c:A"], [node("a:X", "action", "ActX", ["act:X"], [], { actionKind: "recommend-activity" })]),
    node("w:B", "when", "when B", ["c:B"], [node("a:D2", "action", "D2", ["d:D2"], [], { actionKind: "use-decision" })]),
    node("a:Y", "action", "ActY", ["act:Y", "c:G"], [], { actionKind: "recommend-activity" }), // guarded recommend
    node("w:Z", "when", "when Z", ["c:Z"], []), // c:Z is NOT in the concept map → unresolved
    node("o", "otherwise", "otherwise", [], [node("a:Q", "action", "ActQ", ["act:Q"], [], { actionKind: "recommend-activity" })]),
  ],
}];
const concepts = [concept("c:A", "A"), concept("c:B", "B", { definitionKind: "defined-as" }), concept("c:G", "G")];
const STRUCT_KEYS = ["d:D", "w:A", "a:X", "w:B", "a:D2", "a:Y", "w:Z", "o", "a:Q"]; // every structure node

const r = renderFlowPane(structure, { concepts, revealPrefix: "g1_" });
const revVals = Object.values(r.reveals);

check("empty structure → placeholder, no anchors/reveals", () => {
  const e = renderFlowPane([]);
  assert.match(e.html, /placeholder/);
  assert.deepEqual(e.anchors, {});
  assert.deepEqual(e.reveals, {});
});

check("anchors keyed by EVERY structure nodeKey → a generated (non-nodeKey) id", () => {
  assert.deepEqual(Object.keys(r.anchors).sort(), [...STRUCT_KEYS].sort());
  for (const k of STRUCT_KEYS) {
    const a = r.anchors[k];
    assert.ok(a && typeof a.scrollTo === "string", `anchor for ${k}`);
    assert.match(a.scrollTo, /^g1_flow\d+$/, "id is a generated counter, not the nodeKey");
    assert.deepEqual(a.segmentIds, [a.scrollTo]);
  }
});

check("reveals: one {nodeKey} per structure node; the ONLY concept peek here is the guarded recommend's guard tab (c:G)", () => {
  const nodeKeys = revVals.filter((v) => "nodeKey" in v).map((v) => v.nodeKey).sort();
  assert.deepEqual(nodeKeys, [...STRUCT_KEYS].sort());
  // Dots gone (Todo 2); the a:Y recommend is guarded (guard c:G) → its "when …" TAB peeks c:G. No outline in this fixture.
  const conceptKeys = revVals.filter((v) => "conceptNodeKey" in v).map((v) => v.conceptNodeKey).sort();
  assert.deepEqual(conceptKeys, ["c:G"], "only the guard-tab peek (a:Y's guard G)");
});

check("unresolved concept (when Z → c:Z absent from map): node still selectable", () => {
  assert.ok(r.anchors["w:Z"], "w:Z still anchored");
  assert.ok(revVals.some((v) => v.nodeKey === "w:Z"), "w:Z still has a {nodeKey} reveal");
  assert.ok(!revVals.some((v) => v.conceptNodeKey === "c:Z"), "no dangling {conceptNodeKey} for the unresolved ref");
});

check("Todo 2: an unresolved `when` concept is NEUTRAL grey (isSource undefined ≠ false → NOT purple-inferred)", () => {
  // w:Z's concept c:Z is absent → isSource undefined → the base grey `.flow-when`, never `.flow-inferred` (purple).
  // An unresolved when's label falls back to the stripped structure label ("Z"); its <text> is "Z".
  const zRow = r.html.match(/class="(flow-row flow-when[^"]*)"[^>]*><title>[^<]*<\/title><rect[^>]*\/><text[^>]*>Z<\/text>/);
  assert.ok(zRow, "the unresolved when Z renders");
  assert.ok(!zRow[1].includes("flow-inferred"), "an unresolved when is NOT flow-inferred (stays neutral grey)");
});

check("Todo 2b: the peek DOT is gone; a guarded recommend now exposes its guard via a labeled, clickable 'when …' TAB", () => {
  assert.ok(!/flow-peek/.test(r.html), "no `.flow-peek` DOT glyph (the dot is removed)");
  // the a:Y recommend (guard c:G) renders a `.flow-guard-tab` labeled "when G" that peeks the guard concept.
  assert.match(r.html, /<g class="flow-guard-tab[^"]*" data-reveal="[^"]*"><title>guard: G[^<]*<\/title><rect[^>]*\/><text[^>]*>when G<\/text><\/g>/, "a labeled clickable 'when G' guard tab");
  assert.ok(revVals.some((v) => v.conceptNodeKey === "c:G"), "the guard tab peeks the guard concept G");
  // c:G has no local code is → the tab reads inferred (purple).
  assert.match(r.html, /class="flow-guard-tab flow-inferred"/, "the guard tab is bordered by the guard's Source (c:G inferred → purple)");
});

check("node shapes by kind (class counts)", () => {
  const count = (cls) => (r.html.match(new RegExp(`class="flow-row ${cls}[ "]`, "g")) || []).length; // allow trailing classes (e.g. flow-inferred)
  assert.equal(count("flow-decision"), 1);
  assert.equal(count("flow-when"), 3); // A, B, Z
  assert.equal(count("flow-activity"), 3); // X, Y, Q (recommend)
  assert.equal(count("flow-use"), 1); // D2 (use-decision)
  assert.equal(count("flow-otherwise"), 1);
});

check("determination recommend leaf shows the KEY, not the dotted <category>.<key> (MV Tree is non-technical)", () => {
  const struct = [
    {
      decision: "Cov",
      lib: "Pol",
      nodeKey: "d:c",
      location: {},
      children: [
        node("o2", "otherwise", "otherwise", [], [
          node("a:u", "action", "not-certify.Unmet", ["act:u"], [], { actionKind: "recommend-activity" }),
        ]),
      ],
    },
  ];
  const rr = renderFlowPane(struct, {});
  assert.match(rr.html, />Unmet</, "leaf renders the key 'Unmet'");
  assert.doesNotMatch(rr.html, /not-certify\.Unmet/, "no dotted <category>.<key> anywhere");
  assert.match(rr.html, />otherwise</, "non-determination 'otherwise' label is left unchanged");
});

check("emits a sized <svg> with numeric intrinsic width/height (scrolls, not 100%)", () => {
  const m = r.html.match(/<svg class="flow-svg" width="(\d+)" height="(\d+)" viewBox="0 0 \1 \2"/);
  assert.ok(m, "svg with matching width/height/viewBox");
  assert.ok(Number(m[1]) > 0 && Number(m[2]) > 0);
});

check("no <style> or style= inside the SVG (CSP); FLOW_STYLE carries var() + fallbacks", () => {
  assert.ok(!/<style/.test(r.html), "no <style> element in the SVG payload");
  assert.ok(!/ style=/.test(r.html), "no inline style= attribute");
  assert.ok(/var\(--vscode-[\w-]+,#/.test(FLOW_STYLE), "FLOW_STYLE uses var(--vscode-*, fallback) pairs");
  // #187 Todo 3: the on-path highlight is the SVG-friendly RING (a rect stroke on `.flow-ring>rect`), NOT a CSS outline.
  assert.ok(/\.flow-ring>rect\{[^}]*stroke:/.test(FLOW_STYLE), "SVG-friendly on-path ring (rect stroke)");
  assert.ok(!/\.flow-row\.current>rect\{stroke:/.test(FLOW_STYLE), "Todo 3: .current no longer recolors the base rect stroke COLOUR (a stroke-WIDTH thicken is fine)");
});

check("#156 slice 5: .done-node/.error-node review overlay CSS exists, is NON-OUTLINE (fill, not stroke/outline)", () => {
  // The review overlay must be a fill tint, NOT a stroke/outline — so it coexists with .current (stroke) + .failed-criterion
  // (dashed stroke) on independent SVG axes. Assert both rules exist and set `fill` (and crucially NOT `stroke`/`outline`).
  const doneRule = FLOW_STYLE.match(/\.flow-row\.done-node>rect\{([^}]*)\}/);
  const errRule = FLOW_STYLE.match(/\.flow-row\.error-node>rect\{([^}]*)\}/);
  assert.ok(doneRule, ".done-node>rect rule present");
  assert.ok(errRule, ".error-node>rect rule present");
  for (const [, body] of [doneRule, errRule]) {
    assert.match(body, /fill:/, "review overlay paints via fill");
    assert.ok(!/stroke:/.test(body), "review overlay does NOT set stroke (independent axis from .current/.failed-criterion)");
    assert.ok(!/outline/.test(body), "review overlay is non-outline");
  }
  // done and error must be visually DISTINCT (different fill colors).
  assert.notEqual(doneRule[1].match(/fill:([^;]*)/)[1], errRule[1].match(/fill:([^;]*)/)[1], "done fill ≠ error fill");
});

check("#156 slice 5: review overlay COEXISTS — .current/.failed-criterion/-preempt rules are ALL stroke-only (no fill)", () => {
  // The coexistence guarantee: the selection + BOTH failed-criterion channels set ONLY stroke, so adding a done/error fill
  // can never override them. Lock that all three existing highlight channels remain stroke-based (a future fill on any of
  // them would silently break the review channel). FIX 3: -preempt is the 2nd #173 stroke class the fill must coexist with.
  // #187 Todo 3: `.current` left the stroke axis (it's now the `.flow-ring` on-path ring), so it's no longer here — the
  // failed-criterion channels remain stroke-only so the done/error FILL still coexists with them.
  const strokeOnly = [
    [".flow-row.failed-criterion>rect", "failed-criterion (blocker)"],
    [".flow-row.failed-criterion-preempt>rect", "failed-criterion (preempt)"],
  ];
  for (const [sel, name] of strokeOnly) {
    const body = FLOW_STYLE.match(new RegExp(`${sel.replace(/[.>]/g, (c) => "\\" + c)}\\{([^}]*)\\}`))[1];
    assert.match(body, /stroke:/, `${name} is a stroke highlight`);
    assert.ok(!/[^-]fill:/.test(body), `${name} sets no fill — the review fill coexists with it`);
  }
  // FIX 4: review state wins the rect fill by SPECIFICITY ((0,2,1) > (0,1,1)), not order — but the EQUAL-specificity
  // error-over-done tiebreak IS order-dependent, so assert .error-node>rect comes AFTER .done-node>rect. Also assert review
  // sits after EVERY fill-setting kind rule (a defensive lock: if a future kind rule were bumped to (0,2,x), order saves us).
  for (const kind of [".flow-row>rect", ".flow-decision>rect", ".flow-when>rect", ".flow-activity>rect", ".flow-certify>rect", ".flow-notcertify>rect"])
    assert.ok(FLOW_STYLE.indexOf(kind) < FLOW_STYLE.indexOf(".flow-row.done-node>rect"), `review fills sit after the ${kind} kind fill`);
  assert.ok(
    FLOW_STYLE.indexOf(".flow-row.done-node>rect") < FLOW_STYLE.indexOf(".flow-row.error-node>rect"),
    "error-over-done: .error-node>rect comes AFTER .done-node>rect (equal-specificity last-wins tiebreak)",
  );
});

check("#177 slice 4: .this-node marker uses a PROVEN stroke (NOT outline), wins the stroke axis by order, coexists with the done/error fill", () => {
  // FIX 1 (impl review): the tree marker must NOT rely on `outline` on an SVG rect — this repo's evidence is outline does
  // NOT paint here (it's why .current/.failed-criterion switched to stroke). So .this-node>rect paints a `stroke`, NO outline,
  // NO fill. Against the other STROKE channels (.current/.failed-criterion/-preempt) it intentionally WINS by being ordered
  // LAST (equal specificity, later-wins); against the FILL channels (.done-node/.error-node) it COEXISTS (stroke + fill layer).
  const rule = FLOW_STYLE.match(/\.flow-row\.this-node>rect\{([^}]*)\}/);
  assert.ok(rule, ".flow-row.this-node>rect rule present");
  assert.match(rule[1], /stroke:/, "this-node marks via stroke (the PROVEN-painting SVG axis, like .current)");
  assert.ok(!/outline/.test(rule[1]), "this-node does NOT use outline (outline does not paint on the SVG rect here)");
  assert.ok(!/[^-]fill:/.test(rule[1]), "this-node sets NO fill — coexists with .done-node/.error-node (the fill axis)");
  // Ordered AFTER the stroke channels so the focused-question marker wins when a node is also a criterion. (#187 Todo 3:
  // `.current` is no longer a rect-stroke channel — it's the ring — so it's dropped from this ordering list.)
  for (const sel of [".flow-row.failed-criterion>rect", ".flow-row.failed-criterion-preempt>rect"])
    assert.ok(
      FLOW_STYLE.indexOf(sel + "{") < FLOW_STYLE.indexOf(".flow-row.this-node>rect{"),
      `.this-node>rect comes AFTER ${sel} (later-wins, so the marker overrides the transient ${sel} stroke)`,
    );
  // The done/error FILL rules are UNTOUCHED (still fill, no stroke) — stroke + fill layer, so a done+focused node shows both.
  for (const sel of [".flow-row.done-node>rect", ".flow-row.error-node>rect"]) {
    const b = FLOW_STYLE.match(new RegExp(`${sel.replace(/[.>]/g, (c) => "\\" + c)}\\{([^}]*)\\}`))[1];
    assert.match(b, /fill:/, `${sel} still paints via fill (untouched by the slice-4 stroke)`);
    assert.ok(!/stroke:/.test(b), `${sel} sets no stroke — the this-node stroke layers over its fill`);
  }
});

check("disc 164: .diverter overlay uses a stroke (NOT outline/fill), ordered AFTER .current but BEFORE .failed-criterion, and .this-node still wins", () => {
  const rule = FLOW_STYLE.match(/\.flow-row\.diverter>rect\{([^}]*)\}/);
  assert.ok(rule, ".flow-row.diverter>rect rule present");
  assert.match(rule[1], /stroke:/, "diverter marks via stroke (the proven-painting SVG axis; outline does not paint here)");
  assert.ok(!/outline/.test(rule[1]), "diverter does NOT use outline on the SVG rect");
  assert.ok(!/[^-]fill:/.test(rule[1]), "diverter sets NO fill — it is a stroke channel");
  assert.match(rule[1], /stroke-dasharray:1 3/, "dotted (1 3) — distinct from the dashed (4 2) failed-criterion channels");
  // Ordered BEFORE .failed-criterion so a real blocker (red) wins over a diverter on the rare fail-overlap. (#187 Todo 3:
  // the old "after .current" ordering is moot — `.current` is no longer a rect-stroke channel.)
  assert.ok(
    FLOW_STYLE.indexOf(".flow-row.diverter>rect{") < FLOW_STYLE.indexOf(".flow-row.failed-criterion>rect{"),
    ".diverter>rect comes BEFORE .failed-criterion>rect (a blocker stroke wins over a diverter on overlap)",
  );
  // And the focus marker still wins over the diverter (this-node is ordered last among strokes).
  assert.ok(
    FLOW_STYLE.indexOf(".flow-row.diverter>rect{") < FLOW_STYLE.indexOf(".flow-row.this-node>rect{"),
    ".this-node>rect comes AFTER .diverter>rect (focus overrides the diverter overlay)",
  );
});

check("XSS: labels are escaped in <text> and <title>", () => {
  const evil = renderFlowPane([{ decision: 'X"><script>alert(1)</script>', lib: "Pol", nodeKey: "d:x", location: {}, children: [] }]);
  assert.ok(!/<script>/.test(evil.html), "no raw <script>");
  assert.ok(/&lt;script&gt;/.test(evil.html), "escaped");
});

check("deterministic: two renders of the same input are byte-identical", () => {
  assert.equal(renderFlowPane(structure, { concepts, revealPrefix: "g1_" }).html, r.html);
});

check("LAYOUT INVARIANT: no two nodes at the same depth (x) have overlapping y-boxes", () => {
  const rects = [...r.html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({
    x: +m[1], y: +m[2], h: +m[4],
  }));
  assert.ok(rects.filter((rc) => rc.h === 34).length === STRUCT_KEYS.length, "one node rect (h=34) per structure node (a guard tab adds a shorter pill, excluded here)");
  const byX = new Map();
  for (const rc of rects) (byX.get(rc.x) ?? byX.set(rc.x, []).get(rc.x)).push(rc);
  for (const [, col] of byX) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++)
      assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, `overlap at x=${col[i].x}: y=${col[i - 1].y} vs ${col[i].y}`);
  }
});

check("forest: two decisions get disjoint vertical bands (no cross-tree overlap at depth 0)", () => {
  const two = renderFlowPane([
    { decision: "A", lib: "Pol", nodeKey: "d:A", location: {}, children: [node("aw", "when", "when A", ["c:A"], [node("aa", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })])] },
    { decision: "B", lib: "Pol", nodeKey: "d:B", location: {}, children: [node("ba", "action", "Y", ["act:Y"], [], { actionKind: "recommend-activity" })] },
  ], { concepts });
  // decision roots are the two depth-0 rects (x === smallest x); their y must differ by at least the node height
  const rects = [...two.html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({ x: +m[1], y: +m[2], h: +m[4] }));
  const minX = Math.min(...rects.map((rc) => rc.x));
  const roots = rects.filter((rc) => rc.x === minX).sort((a, b) => a.y - b.y);
  assert.equal(roots.length, 2);
  assert.ok(roots[1].y >= roots[0].y + roots[0].h, "decision B's root does not overlap A's");
});

check("INVARIANT: flow anchors cover EVERY structure nodeKey (the cockpit reuses crl anchor-key sets for the tree pane)", () => {
  // The cockpit highlights the tree by reusing the CRL pane's anchor-key sets; if the flow renderer ever dropped a
  // structure node from `anchors`, that node would silently stop highlighting with no failing shell test. Lock it here,
  // fixture-independent (walk the structure rather than a hand-listed set).
  const keys = [];
  const walk = (n) => { keys.push(n.nodeKey); n.children.forEach(walk); };
  for (const d of structure) { keys.push(d.nodeKey); d.children.forEach(walk); }
  for (const k of keys) assert.ok(r.anchors[k], `flow must anchor structure node ${k}`);
});

check("GOLDEN coords pin COL/ROW/midpoint/rounding (a uniform shift/scale would pass relative-only checks)", () => {
  // d:D is the first node (flow0): depth 0 → x=14; its 5 branches occupy slots 0..4 → midpoint y=2 → round(14+2*48)=110.
  assert.match(r.html, /<g id="g1_flow0" class="flow-row flow-decision" data-reveal="[^"]*"><title>[^<]*<\/title><rect x="14" y="110"/);
  // a:X is depth 2 (decision→when→action), slot 0 → x=14+2*220=454, y=round(14+0)=14.
  assert.ok(r.html.includes('<rect x="454" y="14" width="168" height="34"'), "depth-2 leaf at the expected column/row");
});

check("nested when-children (when → when → action) lay out without same-depth overlap", () => {
  const nested = renderFlowPane([{
    decision: "N", lib: "Pol", nodeKey: "d:N", location: {},
    children: [
      node("nw1", "when", "when A", ["c:A"], [
        node("nw2", "when", "when B", ["c:B"], [node("nx", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
        node("no", "otherwise", "otherwise", [], [node("ny", "action", "Y", ["act:Y"], [], { actionKind: "recommend-activity" })]),
      ]),
      node("nq", "action", "Q", ["act:Q"], [], { actionKind: "recommend-activity" }),
    ],
  }], { concepts });
  const rects = [...nested.html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({ x: +m[1], y: +m[2], h: +m[4] }));
  assert.equal(rects.length, 7); // d:N, nw1, nq, nw2, no, nx, ny
  const byX = new Map();
  for (const rc of rects) (byX.get(rc.x) ?? byX.set(rc.x, []).get(rc.x)).push(rc);
  for (const [, col] of byX) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, "no same-depth overlap in a nested tree");
  }
});

check("Todo 2: a use-decision renders flow-use (NEUTRAL grey + dashed, NOT blue); its guard shows via the same 'when …' tab", () => {
  const g = renderFlowPane([{
    decision: "G", lib: "Pol", nodeKey: "d:G", location: {},
    children: [node("guse", "action", "Target", ["d:Target", "c:G"], [], { actionKind: "use-decision" })],
  }], { concepts });
  assert.ok(/class="flow-row flow-use"/.test(g.html), "use-decision renders as a flow-use node");
  assert.match(FLOW_STYLE, /\.flow-use>rect\{[^}]*stroke:var\(--vscode-descriptionForeground/, "flow-use border is NEUTRAL grey (not blue textLink)");
  assert.ok(!/flow-peek/.test(g.html), "no peek DOT glyph");
  assert.match(g.html, /class="flow-guard-tab[^"]*"[^>]*><title>guard: G/, "a guarded use-decision shows its guard via the 'when …' tab too");
  assert.ok(Object.values(g.reveals).some((v) => v.conceptNodeKey === "c:G"), "the guard tab peeks G");
});

// ── #187 Option-C: composite `defined as` → an indented operator OUTLINE (ANY OF / ALL OF / NOT rows + leaf boxes) ──
// DefExpr fixtures: a `ref` edge carries the operand's static flags; a `dentry` is a concept's operator-tree entry.
const dref = (name, nodeKey, { hasCodeIs = true, isInferred = false, hasDefinedAs = false } = {}) => ({
  kind: "ref", ref: { name, lib: "Pol", crossLib: false, nodeKey, hasCodeIs, leafEligible: !hasDefinedAs, isInferred, hasDefinedAs },
});
const dext = (name) => ({ kind: "ref", ref: { name, lib: "Other", crossLib: true, leafEligible: false } });
const dor = (...operands) => ({ kind: "or", operands });
const dand = (...operands) => ({ kind: "and", operands });
const dnot = (operand) => ({ kind: "not", operand });
const dentry = (nodeKey, name, body, { hasCodeIs = false, isInferred = true } = {}) => ({ nodeKey, lib: "Pol", name, hasCodeIs, leafEligible: false, isInferred, hasDefinedAs: true, body });
const defExprOf = (map) => (_lib, name) => map[name];
const leafRowsOf = (html) => [...html.matchAll(/<g id="[^"]*" class="(flow-row flow-leaf[^"]*)"[^>]*>.*?<text[^>]*>([^<]*)<\/text>/g)].map((m) => ({ cls: m[1], label: m[2] }));

check("Option-C: an INFERRED composite when renders an ANY OF outline of leaf rows (def-edge, non-Source grey, peek-not-select, path-keyed anchor, NO top OR)", () => {
  // when B (c:B, inferred — no code is) `defined as` (L1 or L2); L2 has no code is.
  const map = { B: dentry("c:B", "B", dor(dref("L1", "c:L1"), dref("L2", "c:L2", { hasCodeIs: false }))) };
  const rr = renderFlowPane(structure, { concepts, revealPrefix: "g2_", defExpr: defExprOf(map) });
  const leafRows = leafRowsOf(rr.html);
  assert.deepEqual(leafRows.map((l) => l.label).sort(), ["L1", "L2"], "two leaf rows (L1, L2)");
  assert.ok(/class="flow-outline flow-op"><text[^>]*>ANY OF</.test(rr.html), "an ANY OF operator label row (or → any of)");
  assert.ok(!/flow-topor/.test(rr.html), "an INFERRED composite (no code is) has NO top-OR row");
  assert.ok(/class="flow-def-edge"/.test(rr.html), "outline connectors use the distinct flow-def-edge, not flow-edge");
  assert.ok(leafRows.find((l) => l.label === "L2").cls.includes("flow-inferred"), "L2 (no code-is) → inferred (purple solid border)");
  assert.ok(!leafRows.find((l) => l.label === "L1").cls.includes("flow-inferred"), "L1 (code-is) → NOT inferred (blue solid border — a 'real' sub-question)");
  const leafPeeks = Object.values(rr.reveals).filter((v) => v.conceptNodeKey === "c:L1" || v.conceptNodeKey === "c:L2");
  assert.equal(leafPeeks.length, 2, "each leaf reveals its OWN concept (peek), never a {nodeKey} select");
  assert.equal(Object.keys(rr.anchors).filter((k) => k.startsWith("leaf::")).length, 2, "ONLY the 2 leaf rows anchor (op rows are render-only)");
  assert.ok(!Object.values(rr.reveals).some((v) => v.nodeKey && v.nodeKey.startsWith("leaf::")), "no {nodeKey} select for a synthetic leaf");
});

check("Option-C: a level with more than the cap collapses the remainder into a '+N more' render-only stub", () => {
  const ops = Array.from({ length: 13 }, (_, i) => dref(`K${i}`, `c:K${i}`));
  const map = { B: dentry("c:B", "B", { kind: "or", operands: ops }) };
  const rr = renderFlowPane(structure, { concepts, revealPrefix: "g3_", defExpr: defExprOf(map) });
  const leafLabels = leafRowsOf(rr.html).map((l) => l.label);
  assert.equal(leafLabels.filter((l) => l.startsWith("K")).length, 10, "at most DEF_EXPR_CAP (10) leaves shown");
  assert.match(rr.html, /<g id="[^"]*" class="flow-outline flow-more"><title>[^<]*<\/title><rect[^>]*\/><text[^>]*>\+3 more<\/text><\/g>/, "the remaining 3 → a '+3 more' render-only stub (no data-reveal)");
  assert.ok(!Object.keys(rr.leafConcepts).some((k) => k.endsWith('"more"]')), "the '+N more' stub gets NO leafConcepts entry");
  assert.equal(Object.keys(rr.leafConcepts).length, 10, "exactly the 10 shown leaves have leafConcepts entries");
});

check("Option-C: a nested composite operand indents DEEPER + rows never overlap in a column", () => {
  const struct = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
    node("w:C2", "when", "when C2", ["c:C2"], [node("a:C2", "action", "Y", ["act:Y"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" }), concept("c:C2", "C2")];
  // C `defined as` L; L is ITSELF a composite `defined as` La → La nests one indent under L.
  const map = {
    C: dentry("c:C", "C", dref("L", "c:L", { hasCodeIs: false, isInferred: true, hasDefinedAs: true })),
    L: dentry("c:L", "L", dref("La", "c:La")),
  };
  const rr = renderFlowPane(struct, { concepts: cs, revealPrefix: "g4_", defExpr: defExprOf(map) });
  const leafX = (name) => +rr.html.match(new RegExp(`<rect x="(\\d+)"[^>]*/><text[^>]*>${name}</text>`))[1];
  assert.ok(leafX("La") > leafX("L"), "the nested operand La indents DEEPER than its parent leaf L");
  const rects = [...rr.html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({ x: +m[1], y: +m[2], h: +m[4] }));
  const byX = new Map();
  for (const rc of rects) (byX.get(rc.x) ?? byX.set(rc.x, []).get(rc.x)).push(rc);
  for (const [, col] of byX) { col.sort((a, b) => a.y - b.y); for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, `overlap at x=${col[i].x}`); }
});

check("Option-C: leafConcepts join — path-keyed, nested leaves inherit the TOP when, external operand omitted, keys match anchors", () => {
  const struct = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" })];
  const map = {
    C: dentry("c:C", "C", dor(dref("L", "c:L", { hasCodeIs: false, isInferred: true, hasDefinedAs: true }), dext("X"))),
    L: dentry("c:L", "L", dref("La", "c:La")),
  };
  const rr = renderFlowPane(struct, { concepts: cs, defExpr: defExprOf(map) });
  const entries = Object.entries(rr.leafConcepts);
  assert.ok(!entries.some(([, v]) => v.name === "X"), "a cross-lib operand is an external stub → NO leafConcepts entry");
  assert.ok(/class="flow-outline flow-ext"/.test(rr.html), "the cross-lib operand renders as an external stub row");
  const L = entries.find(([, v]) => v.name === "L");
  const La = entries.find(([, v]) => v.name === "La");
  assert.ok(L && La, "L and La both have leafConcepts entries");
  assert.equal(L[1].lib, "Pol");
  assert.equal(L[1].topWhenKey, "w:C", "L's owning composite when is w:C");
  assert.equal(La[1].topWhenKey, "w:C", "the NESTED leaf La inherits the SAME top when (w:C), not its parent leaf");
  for (const [k] of entries) assert.ok(rr.anchors[k], `leafConcepts key ${k} has a matching anchor`);
});

check("Option-C: the SAME concept at two positions gets DISTINCT path-keyed anchors + leafConcepts (no collision)", () => {
  // when B `defined as` ((A or Bx) and (A or D)) — concept A appears at TWO positions.
  const map = { B: dentry("c:B", "B", dand(dor(dref("A", "c:A"), dref("Bx", "c:Bx")), dor(dref("A", "c:A"), dref("D", "c:D")))) };
  const rr = renderFlowPane(structure, { concepts, revealPrefix: "g5_", defExpr: defExprOf(map) });
  const aAnchors = Object.keys(rr.anchors).filter((k) => k.startsWith("leaf::") && k.endsWith('"c:A"]'));
  assert.equal(aAnchors.length, 2, "concept A at two positions → TWO distinct anchors (positional key, not one overwritten)");
  assert.ok(new Set(aAnchors).size === 2, "the two A anchors are DISTINCT keys (JSON-structured, collision-proof)");
  assert.equal(Object.entries(rr.leafConcepts).filter(([, v]) => v.name === "A").length, 2, "A gets TWO leafConcepts entries (the Todo-5 verdict join is not corrupted)");
});

check("Option-C: an INFERRED single-operand body (bare-ref alias) is wrapped in ANY OF (parity with the questionnaire's renderInferredWhen)", () => {
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" })];
  const struct2 = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const map = { C: dentry("c:C", "C", dref("L", "c:L")) }; // C `defined as` L — a single bare ref
  const rr = renderFlowPane(struct2, { concepts: cs, defExpr: defExprOf(map) });
  assert.ok(/class="flow-outline flow-op"><text[^>]*>ANY OF</.test(rr.html), "a single-operand inferred body gets a synthetic ANY OF wrapper");
  assert.ok(leafRowsOf(rr.html).some((l) => l.label === "L"), "the wrapped leaf L renders under it");
  assert.ok(!/flow-topor/.test(rr.html), "still no top-OR (it's inferred)");
});

check("Option-C: a body-less composite when (no branch body) sits ATOP its outline, no overlap", () => {
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" })];
  const struct2 = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], []), // NO branch body (unreachable in practice, but the layout must not overlap)
  ] }];
  const map = { C: dentry("c:C", "C", dor(dref("L1", "c:L1"), dref("L2", "c:L2"))) };
  const rr = renderFlowPane(struct2, { concepts: cs, defExpr: defExprOf(map) });
  assert.equal(leafRowsOf(rr.html).map((l) => l.label).sort().join(), "L1,L2", "the outline leaves still render");
  const whenY = +rr.html.match(/<rect x="\d+" y="(\d+)" width="168"/)[1]; // the when box (NODE_W=168)
  const leafYs = [...rr.html.matchAll(/<rect x="\d+" y="(\d+)" width="150"/g)].map((m) => +m[1]); // outline leaf boxes
  assert.ok(whenY < Math.min(...leafYs), "the body-less composite sits ABOVE its outline rows (not centered within them)");
});

check("Option-C: the outline is TOP-aligned to its when (just below it), NOT sunk to the bottom of a tall branch body", () => {
  // when C has a TALL branch body (6 sibling whens → a deep band) AND a composite `defined as` outline. Before the
  // top-align fix the outline was appended AFTER the band (sunk to the bottom); now it hangs just below the node.
  const kids = Array.from({ length: 6 }, (_, i) => node(`w:C${i}`, "when", `when C${i}`, [`c:C${i}`], [node(`a:${i}`, "action", `X${i}`, [`act:${i}`], [], { actionKind: "recommend-activity" })]));
  const struct2 = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [node("w:C", "when", "when C", ["c:C"], kids)] }];
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" }), ...Array.from({ length: 6 }, (_, i) => concept(`c:C${i}`, `C${i}`))];
  const map = { C: dentry("c:C", "C", dor(dref("L1", "c:L1"), dref("L2", "c:L2"))) };
  const rr = renderFlowPane(struct2, { concepts: cs, defExpr: defExprOf(map) });
  const cY = +rr.html.match(/<rect x="\d+" y="(\d+)" width="168"[^>]*\/><text[^>]*>C<\/text>/)[1];
  const l1Y = +rr.html.match(/<rect x="\d+" y="(\d+)" width="150"[^>]*\/><text[^>]*>L1<\/text>/)[1];
  const maxBranchY = Math.max(...[...rr.html.matchAll(/<rect x="\d+" y="(\d+)" width="168"/g)].map((m) => +m[1]));
  assert.ok(l1Y > cY, "the outline hangs BELOW the when");
  assert.ok(l1Y < maxBranchY, "the outline is TOP-aligned — it starts before the branch body's bottom, not sunk beneath it");
  assert.ok(l1Y - cY < 4 * (34 + 14), "the first outline leaf is within a few rows of the when (top-aligned), not the full branch-body height below");
});

check("Option-C: a SOURCE composite (has code is) gets a top-OR row; a NOT renders a NOT row + its operand", () => {
  const cs = [concept("c:S", "S", { definitionKind: "defined-as", hasLocalCode: true })];
  const struct = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:S", "when", "when S", ["c:S"], [node("a:S", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const map = { S: { nodeKey: "c:S", lib: "Pol", name: "S", hasCodeIs: true, leafEligible: false, isInferred: false, hasDefinedAs: true, body: dor(dref("L1", "c:L1"), dnot(dref("L2", "c:L2"))) } };
  const rr = renderFlowPane(struct, { concepts: cs, defExpr: defExprOf(map) });
  assert.ok(/class="flow-outline flow-topor"><text[^>]*>OR</.test(rr.html), "a SOURCE (both-rep) composite shows a top-OR row");
  assert.ok(/class="flow-outline flow-op"><text[^>]*>ANY OF</.test(rr.html), "with the ANY OF body below it");
  assert.ok(/class="flow-outline flow-op"><text[^>]*>NOT</.test(rr.html), "a NOT operator row");
  assert.ok(leafRowsOf(rr.html).some((l) => l.label === "L2"), "the NOT's operand L2 is still rendered (never dropped)");
});

// ── #187 Todo 2: border semantics (inferred purple / source grey, determinations green+gold, dots gone) ──
check("Todo 2: `when` border — inferred (no code is) → flow-inferred (purple); Source (has code is) → neutral grey", () => {
  const cs = [concept("c:S", "S", { hasLocalCode: true }), concept("c:I", "I", { definitionKind: "defined-as" })];
  const st = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:S", "when", "when S", ["c:S"], [node("a:s", "action", "certify.Approve", ["act:s"], [], { actionKind: "recommend-activity" })]),
    node("w:I", "when", "when I", ["c:I"], [node("a:i", "action", "certify.Approve", ["act:i"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const rr = renderFlowPane(st, { concepts: cs });
  const whenCls = (name) => rr.html.match(new RegExp(`class="(flow-row flow-when[^"]*)"[^>]*><title>[^<]*</title><rect[^>]*/><text[^>]*>${name}</text>`))[1];
  assert.ok(!whenCls("S").includes("flow-inferred"), "a Source when (has code is) → neutral grey (no flow-inferred)");
  assert.ok(whenCls("I").includes("flow-inferred"), "an inferred when (no code is) → flow-inferred (purple)");
});

check("Todo 2: determination leaf border by PAS category — certify GREEN, not-certify + pended GOLD, ordinary NEUTRAL", () => {
  const st = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w1", "when", "when A", ["c:A"], [node("aC", "action", "certify.Approve", ["act:c"], [], { actionKind: "recommend-activity" })]),
    node("w2", "when", "when B", ["c:B"], [node("aN", "action", "not-certify.Deny", ["act:n"], [], { actionKind: "recommend-activity" })]),
    node("w3", "when", "when G", ["c:G"], [node("aP", "action", "pended.Info", ["act:p"], [], { actionKind: "recommend-activity" })]),
    node("o", "otherwise", "otherwise", [], [node("aO", "action", "Order MRI", ["act:o"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const rr = renderFlowPane(st, { concepts });
  const actCls = (label) => rr.html.match(new RegExp(`class="(flow-row flow-[a-z]+)"[^>]*><title>[^<]*</title><rect[^>]*/><text[^>]*>${label}</text>`))[1];
  assert.equal(actCls("Approve"), "flow-row flow-certify", "certify.* → green");
  assert.equal(actCls("Deny"), "flow-row flow-notcertify", "not-certify.* → gold");
  assert.equal(actCls("Info"), "flow-row flow-notcertify", "pended.* → gold (same bucket as not-certify)");
  assert.equal(actCls("Order MRI"), "flow-row flow-activity", "an ordinary (non-determination) activity → neutral flow-activity");
});

check("Todo 2: FLOW_STYLE — decision grey (not blue), certify green, not-certify gold, inferred purple; NO peek / non-source / textLink-blue", () => {
  assert.match(FLOW_STYLE, /\.flow-decision>rect\{[^}]*stroke:var\(--vscode-descriptionForeground/, "decision border is neutral grey (not focusBorder blue)");
  assert.match(FLOW_STYLE, /\.flow-certify>rect\{[^}]*charts-green/, "certify → green");
  assert.match(FLOW_STYLE, /\.flow-notcertify>rect\{[^}]*editorWarning-foreground/, "not-certify + pended → gold (distinct token from the preempt amber)");
  assert.match(FLOW_STYLE, /\.flow-when\.flow-inferred>rect\{[^}]*charts-purple/, "inferred when → purple");
  assert.match(FLOW_STYLE, /\.flow-leaf\.flow-inferred>rect\{[^}]*charts-purple/, "inferred outline leaf → purple (still dashed via .flow-leaf)");
  assert.ok(!/flow-peek/.test(FLOW_STYLE), "no peek-dot CSS");
  assert.ok(!/flow-nonsource/.test(FLOW_STYLE), "no non-source FILL CSS (border carries the signal now)");
  assert.ok(!/textLink-foreground/.test(FLOW_STYLE), "use-decision is no longer blue (textLink)");
  assert.equal((FLOW_STYLE.match(/focusBorder/g) || []).length, 1, "focusBorder (blue) appears ONLY in the on-path .current ring");
});

// ── #187 Todo 3: the on-path RING (a deterministic hidden <rect>, revealed by .current / .flow-leaf-yes) replaces ✓/✗ ──
check("Todo 3: a hidden .flow-ring <rect> on every structure node + outline leaf (none on op/ext/more rows); NO tick paths", () => {
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" })];
  const st = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "certify.Approve", ["act:c"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const map = { C: dentry("c:C", "C", dor(dref("L1", "c:L1"), dref("L2", "c:L2"))) };
  const rr = renderFlowPane(st, { concepts: cs, defExpr: defExprOf(map) });
  assert.ok(!/leaf-tick/.test(rr.html), "the ✓/✗ tick paths are gone from the render");
  assert.ok(!/leaf-tick/.test(FLOW_STYLE), "the .leaf-tick CSS is gone");
  // rings: d:D (decision) + w:C (when) + a:C (activity) = 3 structure nodes, + L1 + L2 = 2 leaves → 5. The ANY OF op row: none.
  assert.equal((rr.html.match(/<g class="flow-ring">/g) || []).length, 5, "a ring on every structure node + outline leaf, none on op/topor/ext/more rows");
  assert.match(FLOW_STYLE, /\.flow-ring\{display:none\}/, "the ring is hidden by default");
  assert.match(FLOW_STYLE, /\.flow-ring>rect\{[^}]*fill:none[^}]*stroke:var\(--vscode-focusBorder/, "the ring is a blue rect stroke, no fill (deterministic — not a CSS outline)");
  assert.match(FLOW_STYLE, /\.flow-row\.current \.flow-ring,\.flow-row\.flow-leaf-yes \.flow-ring\{display:inline\}/, "revealed by .current (main path) OR .flow-leaf-yes (true operand)");
  assert.match(FLOW_STYLE, /\.flow-leaf \.flow-ring>rect\{stroke-width:1\.5\}/, "the leaf ring is thinner (clears the compact outline row pitch)");
  assert.match(FLOW_STYLE, /\.flow-row\.current,[^{]*\{outline:none\}/, "the shell's outline overlays (current + diverter/failed-criterion/-preempt) are neutralized on flow nodes (no double ring)");
});

check("Todo 3b: a sub-question is a SOLID blue (source) / purple (inferred) border; the native border thickens under the ring; connectors are thicker", () => {
  // outline leaves are "real" questions → SOLID coloured borders (no dashed operand-chip look).
  assert.match(FLOW_STYLE, /\.flow-leaf>rect\{[^}]*stroke:var\(--vscode-charts-blue[^}]*\}/, "a source sub-question → blue border");
  assert.ok(!/\.flow-leaf>rect\{[^}]*stroke-dasharray/.test(FLOW_STYLE), "the sub-question border is SOLID (no dashed operand-chip)");
  assert.match(FLOW_STYLE, /\.flow-leaf\.flow-inferred>rect\{stroke:var\(--vscode-charts-purple/, "an inferred sub-question → purple border (recurses into its own subs)");
  // the native border thickens when the on-path ring is shown (so the identity colour reads inside the ring).
  assert.match(FLOW_STYLE, /\.flow-row\.current>rect\{stroke-width:2\.5\}/, "a structure node's border thickens when on-path");
  assert.match(FLOW_STYLE, /\.flow-row\.flow-leaf-yes>rect\{stroke-width:2\}/, "a leaf's border thickens when on-path");
  // the thicken rules sit BEFORE the overlay stroke channels (so this-node/failed-criterion still win the stroke).
  assert.ok(FLOW_STYLE.indexOf(".flow-row.current>rect{stroke-width") < FLOW_STYLE.indexOf(".flow-row.this-node>rect{"), "the current-thicken is ordered before .this-node (overlay wins)");
  // connectors thicker (hard to see on Mac).
  assert.match(FLOW_STYLE, /\.flow-edge\{[^}]*stroke-width:1\.6\}/, "control-flow edge thicker");
  assert.match(FLOW_STYLE, /\.flow-def-edge\{[^}]*stroke-width:1\.5[^}]*opacity:\.8\}/, "def-edge (outline spine) thicker + less faint");
});

console.log(`\nflowPaneHtml.test: ${pass} checks passed`);
