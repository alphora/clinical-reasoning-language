// Unit tests for the CRL pane RENDERER (#156 C2b-2). vscode-free + crl types erase → esbuild-bundle-then-import.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({ entryPoints: [resolve(here, tsFile)], bundle: true, platform: "node", format: "cjs", target: "node18", outfile: out, logLevel: "silent" });
  return require(out);
}
const { renderCrlPane } = await load("crlPaneHtml.ts");
const { corrColorClass } = await load("corrKey.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};
const node = (nodeKey, kind, label, extra = {}, children = []) => ({ nodeKey, nodeId: nodeKey, decision: "D", lib: "T", kind, label, refKeys: [], location: {}, children, ...extra });
const structure = [
  {
    decision: "D", lib: "T", nodeKey: "dD", location: {},
    children: [
      node("when0", "when", "when A", {}, [node("when0act0", "action", "X", { actionKind: "recommend-activity" })]),
      node("oth", "otherwise", "otherwise"),
    ],
  },
];

check("renders a flex row per node; kind classes on the label span; row carries id/data-reveal", () => {
  const out = renderCrlPane(structure);
  assert.match(out.html, /<div id="crl0" class="crl-row" data-reveal="[^"]*"><span class="crl-node crl-decision corr-d0">decision &quot;D&quot;<\/span><\/div>/);
  assert.match(out.html, /class="crl-node when corr-d1">when A</);
  assert.match(out.html, /class="crl-node action recommend-activity corr-d2">X</);
  assert.match(out.html, /class="crl-node otherwise corr-d1">otherwise</);
});

check("anchors keyed by nodeKey (1:1), reveals by opaque key → nodeKey", () => {
  const out = renderCrlPane(structure);
  for (const k of ["dD", "when0", "when0act0", "oth"]) {
    assert.ok(out.anchors[k], `anchor for ${k}`);
    assert.equal(out.anchors[k].segmentIds.length, 1);
  }
  const revVals = Object.values(out.reveals).map((r) => r.nodeKey).sort();
  assert.deepEqual(revVals, ["dD", "oth", "when0", "when0act0"]);
});

check("indentation via depth CSS classes (CSP-safe; NO inline style=), deepening with tree depth", () => {
  const out = renderCrlPane(structure);
  assert.ok(!out.html.includes("style="), "no inline style= (CSP would drop it)");
  const depth = (key) => Number(out.html.match(new RegExp(`corr-d(\\d+)">${key}<`))[1]);
  assert.ok(depth("decision &quot;D&quot;") < depth("when A"));
  assert.ok(depth("when A") < depth("X")); // 0 < 1 < 2
});

check("at-rest key (#163): showKeys + rowKeyNumbers → a key slot (swatch + number) before the label; off → none", () => {
  const rowKeyNumbers = { when0: [3], when0act0: [3, 7] };
  const on = renderCrlPane(structure, { rowKeyNumbers, showKeys: true });
  assert.match(on.html, new RegExp(`<span class="corr-key"[^>]*><span class="corr-sw ${corrColorClass(3)}"></span><span class="corr-num">3</span></span><span class="crl-node when`));
  assert.ok(on.html.includes('<span class="corr-num">3,7</span>'), "multi-unit row shows sorted numbers");
  const off = renderCrlPane(structure, { rowKeyNumbers, showKeys: false });
  assert.ok(!off.html.includes("corr-key"), "showKeys off → no key slot");
  const noNums = renderCrlPane(structure, { rowKeyNumbers: {}, showKeys: true });
  assert.ok(!noNums.html.includes("corr-key"), "a row with no numbers gets no slot");
});

check("XSS: labels are escaped", () => {
  const out = renderCrlPane([{ decision: 'D<script>', lib: "T", nodeKey: "d", location: {}, children: [node("n", "when", 'when <b>x</b>')] }]);
  assert.ok(!out.html.includes("<script>") && !out.html.includes("<b>"));
  assert.ok(out.html.includes("&lt;script&gt;") && out.html.includes("&lt;b&gt;"));
});

check("empty structure AND no concepts → placeholder, no anchors", () => {
  const out = renderCrlPane([]);
  assert.match(out.html, /class="placeholder"/);
  assert.deepEqual(out.anchors, {});
});

// #166 Slice 3a — concept layer rendering.
const concept = (nodeKey, name, lib, extra = {}) => ({ nodeKey, name, lib, label: `concept "${name}"`, location: {}, hasLocalCode: false, hasRepresentations: false, definitionRefs: [], ...extra });
const concepts = [
  concept("cA", "Affected Breast", "Policy", { definitionKind: "defined-as", definitionRefs: ["cB"] }),
  concept("cB", "Implant Or Expander", "Policy", { hasLocalCode: true }),
  concept("cC", "Mammogram", "Common", { definitionKind: "coded-from", hasRepresentations: true }),
];

check("concepts render in a CONCEPTS section, grouped by library, after the decisions", () => {
  const out = renderCrlPane(structure, { concepts });
  assert.ok(out.html.includes('class="crl-concept-head"'), "concepts head");
  assert.match(out.html, /class="crl-lib-head">Policy</);
  assert.match(out.html, /class="crl-lib-head">Common</);
  // decisions precede concepts; Policy lib head precedes Common lib head (inventory order)
  assert.ok(out.html.indexOf("crl-decision") < out.html.indexOf("crl-concept-head"));
  assert.ok(out.html.indexOf(">Policy<") < out.html.indexOf(">Common<"));
});

check("concept row: ADR layer marker (inferred=defined-as / asserted=else) + orthogonal markers + name", () => {
  const out = renderCrlPane(structure, { concepts });
  assert.match(out.html, /<span class="crl-layer crl-layer-inferred">inferred<\/span>.*Affected Breast/);
  assert.match(out.html, /<span class="crl-layer crl-layer-asserted">asserted<\/span>.*Implant Or Expander/);
  assert.ok(out.html.includes(">local<"), "hasLocalCode → local marker");
  assert.ok(out.html.includes(">std<"), "coded-from → std marker");
  assert.ok(out.html.includes(">ext<"), "hasRepresentations → ext marker");
  // coded-from concept is asserted (NOT a 'sourced' layer) AND carries BOTH orthogonal markers (std + ext) on the one
  // asserted row — the axes coexist, never precedence-collapsed into the layer.
  assert.match(out.html, /crl-layer-asserted">asserted<\/span><span class="crl-mark"[^>]*>std<\/span><span class="crl-mark"[^>]*>ext<\/span><span class="crl-concept-name">Mammogram/);
});

check("concept rows are addressable: anchor by conceptNodeKey, reveal payload = {conceptNodeKey} (a PEEK, not {nodeKey})", () => {
  const out = renderCrlPane(structure, { concepts });
  for (const k of ["cA", "cB", "cC"]) assert.ok(out.anchors[k], `anchor for ${k}`);
  const conceptReveals = Object.values(out.reveals).filter((r) => "conceptNodeKey" in r).map((r) => r.conceptNodeKey).sort();
  assert.deepEqual(conceptReveals, ["cA", "cB", "cC"]);
  // decision rows still reveal {nodeKey}; the two payload shapes never collide
  assert.ok(Object.values(out.reveals).some((r) => "nodeKey" in r && r.nodeKey === "dD"));
});

check("defined-as suffix lists the direct definitionRefs by NAME (resolved within the rendered set)", () => {
  const out = renderCrlPane(structure, { concepts });
  assert.match(out.html, /Affected Breast<\/span><span class="crl-concept-def"> — defined as: Implant Or Expander<\/span>/);
  // a concept with no refs gets no suffix
  assert.ok(!/Mammogram<\/span><span class="crl-concept-def"/.test(out.html));
});

check("at-rest key on concept rows uses conceptKeyNumbers (NOT rowKeyNumbers)", () => {
  const out = renderCrlPane(structure, { concepts, conceptKeyNumbers: { cA: [2, 5] }, rowKeyNumbers: { cA: [9] }, showKeys: true });
  assert.ok(out.html.includes('<span class="corr-num">2,5</span>'), "concept key slot from conceptKeyNumbers");
  assert.ok(!out.html.includes('<span class="corr-num">9</span>'), "rowKeyNumbers must not leak onto a concept row");
});

check("concepts-only (no decisions) still renders concepts (not the placeholder)", () => {
  const out = renderCrlPane([], { concepts });
  assert.ok(!out.html.includes("placeholder"), "no placeholder when concepts present");
  assert.ok(out.anchors.cA && out.anchors.cB, "concept anchors present");
});

check("revealPrefix namespaces ids + reveal keys", () => {
  const out = renderCrlPane(structure, { revealPrefix: "9:" });
  assert.ok(Object.keys(out.reveals).every((k) => k.startsWith("9:")));
  assert.ok(out.anchors.dD.scrollTo.startsWith("9:"));
});

console.log(`\ncrlPaneHtml.test: ${pass} checks passed`);
