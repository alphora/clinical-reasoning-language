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

check("renders a row per node (decision root + when/action/otherwise) with kind classes", () => {
  const out = renderCrlPane(structure);
  assert.match(out.html, /class="crl-node crl-decision"[^>]*>decision &quot;D&quot;</);
  assert.match(out.html, /class="crl-node when"[^>]*>when A</);
  assert.match(out.html, /class="crl-node action recommend-activity"[^>]*>X</);
  assert.match(out.html, /class="crl-node otherwise"[^>]*>otherwise</);
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

check("indentation deepens with tree depth (decision 0 < when 1 < action 2)", () => {
  const out = renderCrlPane(structure);
  const pad = (key) => Number(out.html.match(new RegExp(`>${key}<`)) && out.html.match(new RegExp(`padding-left:(\\d+)px"[^>]*>${key}<`))[1]);
  assert.ok(pad("decision &quot;D&quot;") < pad("when A"));
  assert.ok(pad("when A") < pad("X"));
});

check("XSS: labels are escaped", () => {
  const out = renderCrlPane([{ decision: 'D<script>', lib: "T", nodeKey: "d", location: {}, children: [node("n", "when", 'when <b>x</b>')] }]);
  assert.ok(!out.html.includes("<script>") && !out.html.includes("<b>"));
  assert.ok(out.html.includes("&lt;script&gt;") && out.html.includes("&lt;b&gt;"));
});

check("empty structure → placeholder, no anchors", () => {
  const out = renderCrlPane([]);
  assert.match(out.html, /class="placeholder"/);
  assert.deepEqual(out.anchors, {});
});

check("revealPrefix namespaces ids + reveal keys", () => {
  const out = renderCrlPane(structure, { revealPrefix: "9:" });
  assert.ok(Object.keys(out.reveals).every((k) => k.startsWith("9:")));
  assert.ok(out.anchors.dD.scrollTo.startsWith("9:"));
});

console.log(`\ncrlPaneHtml.test: ${pass} checks passed`);
