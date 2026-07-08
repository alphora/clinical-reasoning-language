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

check("reveals: one {nodeKey} per structure node + one {conceptNodeKey} per RESOLVED concept (when/guard)", () => {
  const nodeKeys = revVals.filter((v) => "nodeKey" in v).map((v) => v.nodeKey).sort();
  assert.deepEqual(nodeKeys, [...STRUCT_KEYS].sort());
  const conceptKeys = revVals.filter((v) => "conceptNodeKey" in v).map((v) => v.conceptNodeKey).sort();
  assert.deepEqual(conceptKeys, ["c:A", "c:B", "c:G"]); // w:A, w:B, and the a:Y guard — NOT the unresolved c:Z
});

check("unresolved concept (when Z → c:Z absent from map): node still selectable, NO peek", () => {
  assert.ok(r.anchors["w:Z"], "w:Z still anchored");
  assert.ok(revVals.some((v) => v.nodeKey === "w:Z"), "w:Z still has a {nodeKey} reveal");
  assert.ok(!revVals.some((v) => v.conceptNodeKey === "c:Z"), "no dangling {conceptNodeKey} for the unresolved ref");
});

check("guarded recommend exposes the guard concept as a peek", () => {
  assert.ok(revVals.some((v) => v.conceptNodeKey === "c:G"), "action guard G is a {conceptNodeKey} peek");
});

check("node shapes by kind (class counts)", () => {
  const count = (cls) => (r.html.match(new RegExp(`class="flow-row ${cls}[ "]`, "g")) || []).length; // allow trailing classes (e.g. flow-nonsource)
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
  assert.ok(/\.flow-row\.current>rect\{stroke:/.test(FLOW_STYLE), "SVG-friendly .current highlight");
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
  const strokeOnly = [
    [".flow-row.current>rect", "selection"],
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
  for (const kind of [".flow-row>rect", ".flow-decision>rect", ".flow-when>rect", ".flow-activity>rect"])
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
  // Ordered AFTER the three stroke channels so the focused-question marker wins when a node is also selected / a criterion.
  for (const sel of [".flow-row.current>rect", ".flow-row.failed-criterion>rect", ".flow-row.failed-criterion-preempt>rect"])
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
  // Ordered BEFORE .failed-criterion so a real blocker (red) wins over a diverter on the rare fail-overlap; AFTER .current.
  assert.ok(
    FLOW_STYLE.indexOf(".flow-row.current>rect{") < FLOW_STYLE.indexOf(".flow-row.diverter>rect{"),
    ".diverter>rect comes after .current>rect",
  );
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
  assert.ok(rects.length === STRUCT_KEYS.length, "one rect per node");
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

check("peek glyph is NESTED inside the row <g> (closest() routes glyph→peek, body→select); row carries id + data-reveal", () => {
  // a resolved when row: <g id=… class="flow-row flow-when" data-reveal=…><title>…</title><rect/><text>…</text><g class="flow-peek…" data-reveal=…><circle/><title/></g></g>
  assert.match(
    r.html,
    /<g id="g1_flow\d+" class="flow-row flow-when[^"]*" data-reveal="g1_kg1_flow\d+"><title>[^<]*<\/title><rect [^>]*\/><text [^>]*>[^<]*<\/text><g class="flow-peek [^"]*" data-reveal="g1_pg1_flow\d+"><circle [^>]*\/><title>[^<]*<\/title><\/g><\/g>/,
    "peek <g> sits between the row's <rect>/<text> and the row's closing </g> (nested, not a sibling)",
  );
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

check("guarded use-decision: flow-use node + a guard peek on it", () => {
  const g = renderFlowPane([{
    decision: "G", lib: "Pol", nodeKey: "d:G", location: {},
    children: [node("guse", "action", "Target", ["d:Target", "c:G"], [], { actionKind: "use-decision" })],
  }], { concepts });
  assert.ok(/class="flow-row flow-use"/.test(g.html), "use-decision renders as a flow-use node");
  assert.ok(Object.values(g.reveals).some((v) => v.conceptNodeKey === "c:G"), "the use-decision's guard G is a concept peek");
});

// ── #187 Todo 4: composite `defined as` leaves as def-leaf sub-nodes + non-Source grey fill ──
check("Todo 4: a composite when expands its defined-as leaves as flow-leaf nodes (distinct def-edge, non-Source greyed, peek-not-select, synthetic anchor)", () => {
  // when B's concept c:B is a composite; expand it to leaves L1 (code-is) + L2 (non-Source).
  const shape = {
    B: {
      nodeKey: "c:B", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true,
      children: [
        { nodeKey: "c:L1", hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false, children: [] },
        { nodeKey: "c:L2", hasCodeIs: false, leafEligible: false, isInferred: false, hasDefinedAs: false, children: [] },
      ],
    },
  };
  const info = { "c:L1": { lib: "Pol", name: "L1", valueTypes: [] }, "c:L2": { lib: "Pol", name: "L2", valueTypes: [] } };
  const rr = renderFlowPane(structure, { concepts, revealPrefix: "g2_", conceptShape: (_l, n) => shape[n], resolveConceptInfo: (nk) => info[nk] });
  const leafRows = [...rr.html.matchAll(/<g id="[^"]*" class="([^"]*flow-leaf[^"]*)"[^>]*>.*?<text[^>]*>([^<]*)<\/text>/g)].map((m) => ({ cls: m[1], label: m[2] }));
  assert.deepEqual(leafRows.map((l) => l.label).sort(), ["L1", "L2"], "two def-leaf nodes (L1, L2)");
  assert.ok(/class="flow-def-edge"/.test(rr.html), "def-leaf edges use the distinct flow-def-edge, not flow-edge");
  assert.ok(leafRows.find((l) => l.label === "L2").cls.includes("flow-nonsource"), "L2 (no code-is) is greyed");
  assert.ok(!leafRows.find((l) => l.label === "L1").cls.includes("flow-nonsource"), "L1 (code-is) is NOT greyed");
  const leafPeeks = Object.values(rr.reveals).filter((v) => v.conceptNodeKey === "c:L1" || v.conceptNodeKey === "c:L2");
  assert.equal(leafPeeks.length, 2, "a leaf body reveals its OWN concept (peek), never a {nodeKey} select");
  assert.equal(Object.keys(rr.anchors).filter((k) => k.startsWith("leaf::")).length, 2, "leaf anchors under the reserved leaf:: prefix (safe no-op)");
  assert.ok(!Object.values(rr.reveals).some((v) => v.nodeKey && v.nodeKey.startsWith("leaf::")), "no {nodeKey} select for a synthetic leaf");
});

check("Todo 4: a composite with more than the cap collapses the remainder into a '+N more' stub", () => {
  const kids = Array.from({ length: 13 }, (_, i) => ({ nodeKey: `c:K${i}`, hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false, children: [] }));
  const shape = { B: { nodeKey: "c:B", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true, children: kids } };
  const info = (nk) => (nk.startsWith("c:K") ? { lib: "Pol", name: nk.slice(2), valueTypes: [] } : undefined);
  const rr = renderFlowPane(structure, { concepts, revealPrefix: "g3_", conceptShape: (_l, n) => shape[n], resolveConceptInfo: info });
  const labels = [...rr.html.matchAll(/<g id="[^"]*" class="[^"]*flow-leaf[^"]*"[^>]*>.*?<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  assert.equal(labels.filter((l) => !l.startsWith("+")).length, 10, "at most LEAF_CAP (10) leaves shown");
  assert.ok(labels.some((l) => l === "+3 more"), "the remaining 3 collapse into a '+3 more' stub");
  // the stub is NON-CLICKABLE: its <g> carries no data-reveal (a leaf <g> whose class attr is immediately followed by
  // `>` — real leaves have ` data-reveal=…`; only the concept-less stub does not).
  assert.match(rr.html, /<g id="[^"]*" class="[^"]*flow-leaf[^"]*"><title>[^<]*<\/title><rect[^>]*\/><text[^>]*>\+\d+ more<\/text><\/g>/, "the '+N more' stub is non-clickable (no data-reveal)");
  // #187 Todo 5: the stub has NO concept → NO leafConcepts entry (it carries no verdict), and the 10 shown leaves each do.
  assert.ok(!Object.keys(rr.leafConcepts).some((k) => k.includes("+more")), "the '+N more' stub gets NO leafConcepts entry");
  assert.equal(Object.keys(rr.leafConcepts).length, 10, "exactly the 10 shown leaves have leafConcepts entries");
});

check("Todo 4: leaves keep the disjoint-band layout (no overlap with a following sibling) + a nested composite leaf recurses deeper", () => {
  const struct = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
    node("w:C2", "when", "when C2", ["c:C2"], [node("a:C2", "action", "Y", ["act:Y"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" }), concept("c:C2", "C2")];
  const shape = { C: { nodeKey: "c:C", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true, children: [
    { nodeKey: "c:L", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true, children: [
      { nodeKey: "c:La", hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false, children: [] },
    ] },
  ] } };
  const info = { "c:L": { lib: "Pol", name: "L", valueTypes: [] }, "c:La": { lib: "Pol", name: "La", valueTypes: [] } };
  const rr = renderFlowPane(struct, { concepts: cs, revealPrefix: "g4_", conceptShape: (_l, n) => shape[n], resolveConceptInfo: (nk) => info[nk] });
  const leaf = (name) => rr.html.match(new RegExp(`class="[^"]*flow-leaf[^"]*"[^>]*><title>[^<]*</title><rect x="(\\d+)"[^>]*/><text[^>]*>${name}</text>`));
  assert.ok(+leaf("La")[1] > +leaf("L")[1], "a nested composite leaf La renders one column DEEPER than its parent leaf L");
  const rects = [...rr.html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map((m) => ({ x: +m[1], y: +m[2], h: +m[4] }));
  const byX = new Map();
  for (const rc of rects) (byX.get(rc.x) ?? byX.set(rc.x, []).get(rc.x)).push(rc);
  for (const [, col] of byX) { col.sort((a, b) => a.y - b.y); for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, `overlap at x=${col[i].x}`); }
});

check("Todo 5: renderFlowPane exposes leafConcepts (key → {lib,name,topWhenKey}); nested leaves inherit the top composite when; cross-lib omitted; keys match anchors", () => {
  const struct = [{ decision: "D", lib: "Pol", nodeKey: "d:D", location: {}, children: [
    node("w:C", "when", "when C", ["c:C"], [node("a:C", "action", "X", ["act:X"], [], { actionKind: "recommend-activity" })]),
  ] }];
  const cs = [concept("c:C", "C", { definitionKind: "defined-as" })];
  const shape = { C: { nodeKey: "c:C", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true, children: [
    { nodeKey: "c:L", hasCodeIs: false, leafEligible: false, isInferred: true, hasDefinedAs: true, children: [
      { nodeKey: "c:La", hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false, children: [] },
    ] },
    { nodeKey: "c:X", hasCodeIs: true, leafEligible: true, isInferred: false, hasDefinedAs: false, children: [] }, // cross-lib (no info) → omitted
  ] } };
  const info = { "c:L": { lib: "Pol", name: "L", valueTypes: [] }, "c:La": { lib: "Pol", name: "La", valueTypes: [] } }; // c:X absent
  const rr = renderFlowPane(struct, { concepts: cs, conceptShape: (_l, n) => shape[n], resolveConceptInfo: (nk) => info[nk] });
  const entries = Object.entries(rr.leafConcepts);
  assert.ok(!entries.some(([, v]) => v.name === "X"), "a cross-lib / unaddressable operand gets NO leafConcepts entry");
  const L = entries.find(([, v]) => v.name === "L");
  const La = entries.find(([, v]) => v.name === "La");
  assert.ok(L && La, "L and La both have leafConcepts entries");
  assert.equal(L[1].lib, "Pol");
  assert.equal(L[1].topWhenKey, "w:C", "L's owning composite when is the structure when w:C");
  assert.equal(La[1].topWhenKey, "w:C", "the NESTED leaf La inherits the SAME top composite when (w:C), NOT its immediate parent leaf");
  for (const [k] of entries) assert.ok(rr.anchors[k], `leafConcepts key ${k} has a matching anchor (the cockpit's leafKey→segmentIds join)`);
});

console.log(`\nflowPaneHtml.test: ${pass} checks passed`);
