// Unit tests for the "this node" cross-pane marker RE-ROOTING (#177 slice 4). vscode-free + crl types erase →
// esbuild-bundle-then-import (mirrors failedCriterionPeek.test.mjs). Covers resolveThisNode: a runtime nodeId →
// { nodeKey, sourceUnits } via the failed-criterion join — the grounded case (tree/crl nodeKey + source units), a
// no-source-unit node (nodeKey present, empty sourceUnits → silent source degrade), an ungroundable nodeId (no nodeKey,
// empty units), a cross-lib re-root, and the maps-absent path.
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
const { resolveThisNode } = await load("thisNodeMarker.ts");
const { buildRuntimeRefIndex } = await load("failedCriterionPeek.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// ── fixtures (mirror failedCriterionPeek.test.mjs) ──
const sNode = (lib, decision, nodeId, nodeKey, children = []) => ({ nodeKey, nodeId, decision, lib, children });
const sDec = (children) => ({ children });
const when = (nodeId, children = []) => ({ nodeId, kind: "when", children });
const action = (nodeId) => ({ nodeId, kind: "action", action: { produced: true, actionKind: "recommend-activity" }, children: [] });
const useDec = (nodeId, target, children, expanded = true) => ({
  nodeId, kind: "action", action: { actionKind: "use-decision", expanded, target }, children,
});

// A minimal CrlRevealMaps stub sufficient for unitsForRow's single-unit (<=1) early-out path: nodeByKey (the meta for
// the row), keyToUnitIds (the row's units), sourceBearingUnits (the source-bearing filter). One matched unit → no
// branch-scoping needed (rowUnits returns early when raw.length<=1).
const mapsWith = (nodeKey, units, sourceBearing) => ({
  nodeByKey: new Map([[nodeKey, { nodeKey, refKeys: [], decision: "Top", lib: "Pol", kind: "when", nodeId: "when[0]" }]]),
  keyToUnitIds: new Map([[nodeKey, units]]),
  sourceBearingUnits: new Set(sourceBearing),
  unitToKeys: new Map(),
  keyToRowNodeKeys: new Map(),
});

const ROOT = { lib: "Pol", decision: "Top" };

// ── grounded: nodeKey + source units ──
check("a grounded runtime nodeId → its standalone nodeKey + the row's source-bearing units", () => {
  const structure = [sDec([sNode("Pol", "Top", "when[0]", "KEY_when0", [sNode("Pol", "Top", "when[0]/action[0]", "KEY_act0")])])];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [when("when[0]", [action("when[0]/action[0]")])];
  const maps = mapsWith("KEY_when0", ["u1"], ["u1"]);
  const r = resolveThisNode("when[0]", ROOT, tree, idx, maps);
  assert.equal(r.nodeKey, "KEY_when0", "tree/crl mark via the re-rooted nodeKey");
  assert.deepEqual(r.sourceUnits, ["u1"], "source marks via the row's source-bearing unit");
});

// ── no-source-unit node: nodeKey present, EMPTY source units (silent source degrade) ──
check("a grounded node with NO source-bearing unit → nodeKey present, EMPTY sourceUnits (tree/crl mark; source degrades)", () => {
  const structure = [sDec([sNode("Pol", "Top", "when[0]", "KEY_when0")])];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [when("when[0]")];
  // The row's unit exists but is NOT source-bearing → unitsForRow filters it out → empty.
  const maps = mapsWith("KEY_when0", ["u1"], []); // u1 not in sourceBearingUnits
  const r = resolveThisNode("when[0]", ROOT, tree, idx, maps);
  assert.equal(r.nodeKey, "KEY_when0", "still grounded for tree/crl");
  assert.deepEqual(r.sourceUnits, [], "no source unit → empty (the silent source degrade)");
});

// ── ungroundable: no nodeKey, empty units ──
check("an ungroundable runtime nodeId (not in the tree) → no nodeKey, empty sourceUnits (no mark anywhere)", () => {
  const structure = [sDec([sNode("Pol", "Top", "when[0]", "KEY_when0")])];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [when("when[0]")];
  const r = resolveThisNode("when[9]", ROOT, tree, idx, mapsWith("KEY_when0", ["u1"], ["u1"]));
  assert.equal(r.nodeKey, undefined, "no nodeKey → tree/crl post empty (clear)");
  assert.deepEqual(r.sourceUnits, [], "no source units either");
});

// ── cross-lib re-root (the load-bearing join, same as the peek) ──
check("a cross-lib focused question (under an expanded use-decision) re-roots to the SUB's standalone row", () => {
  const structure = [
    sDec([sNode("Pol", "Top", "action[0]", "KEY_top_use0")]),
    sDec([sNode("Lib", "Sub", "when[0]", "KEY_sub_when0")]),
  ];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [useDec("action[0]", { name: "Sub", libraryName: "Lib" }, [when("action[0]/when[0]")])];
  const r = resolveThisNode("action[0]/when[0]", ROOT, tree, idx, mapsWith("KEY_sub_when0", ["u2"], ["u2"]));
  assert.equal(r.nodeKey, "KEY_sub_when0", "re-rooted to the SUB's standalone row, not the caller's");
  assert.deepEqual(r.sourceUnits, ["u2"]);
});

// ── maps absent: nodeKey resolves, no source units ──
check("maps undefined → nodeKey still resolves (tree/crl), sourceUnits empty", () => {
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "KEY_when0")])]);
  const r = resolveThisNode("when[0]", ROOT, [when("when[0]")], idx, undefined);
  assert.equal(r.nodeKey, "KEY_when0");
  assert.deepEqual(r.sourceUnits, []);
});

console.log(`\nthisNodeMarker.test: ${pass} checks passed`);
