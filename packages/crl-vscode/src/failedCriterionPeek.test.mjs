// Unit tests for the failed-criterion PEEK model (#173 T3, disc 158/159). vscode-free + crl types erase →
// esbuild-bundle-then-import (mirrors celPaneHtml.test.mjs). Covers buildRuntimeRefIndex (the runtime-ref → row-nodeKey
// join, incl. a deep cross-lib chain) + resolveFailedCriteria (frontier re-root → standalone nodeKey; the gap fallback;
// whole-path validation; dedup).
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
const { buildRuntimeRefIndex, resolveFailedCriteria, runtimeRefKey } = await load("failedCriterionPeek.ts");
// The REAL T2 selectors, to prove the end-to-end frontier→re-root chain (not just the re-root in isolation).
const { failedCriterionFrontier, allUnsatisfiedCriteria } = await import("@smile-digital-health/crl/provenance");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// ── fixture builders (the structural fields the pure module reads) ──
// A structure node: nodeKey + standalone (lib,decision,nodeId) + children.
const sNode = (lib, decision, nodeId, nodeKey, children = []) => ({ nodeKey, nodeId, decision, lib, children });
const sDec = (children) => ({ children });

// A VM tree node (duck-typed for runtimeNodePathRefs): kind + nodeId + (use-decision: action {actionKind,expanded,target}).
const when = (nodeId, children = []) => ({ nodeId, kind: "when", children });
const action = (nodeId) => ({ nodeId, kind: "action", action: { produced: true, actionKind: "recommend-activity" }, children: [] });
const useDec = (nodeId, target, children, expanded = true) => ({
  nodeId, kind: "action", action: { actionKind: "use-decision", expanded, target }, children,
});

// ── buildRuntimeRefIndex ──

check("buildRuntimeRefIndex keys each spine row by (lib,decision,nodeId) → its nodeKey; recurses children", () => {
  const structure = [
    sDec([
      sNode("Pol", "Top", "when[0]", "KEY_top_when0", [sNode("Pol", "Top", "when[0]/action[0]", "KEY_top_act0")]),
    ]),
    sDec([sNode("Lib", "Sub", "when[0]", "KEY_sub_when0")]),
  ];
  const idx = buildRuntimeRefIndex(structure);
  assert.equal(idx.get(runtimeRefKey("Pol", "Top", "when[0]")), "KEY_top_when0");
  assert.equal(idx.get(runtimeRefKey("Pol", "Top", "when[0]/action[0]")), "KEY_top_act0");
  assert.equal(idx.get(runtimeRefKey("Lib", "Sub", "when[0]")), "KEY_sub_when0");
  assert.equal(idx.size, 3);
});

// ── resolveFailedCriteria: same-lib frontier ──

check("a same-lib frontier criterion re-roots to its own standalone row nodeKey (grounded)", () => {
  const structure = [sDec([sNode("Pol", "Top", "when[0]", "KEY_top_when0", [sNode("Pol", "Top", "when[0]/action[0]", "KEY_top_act0")])])];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [when("when[0]", [action("when[0]/action[0]")])];
  const resolved = resolveFailedCriteria([{ nodeId: "when[0]" }], { lib: "Pol", decision: "Top" }, tree, idx);
  assert.equal(resolved.length, 1);
  assert.ok(resolved[0].grounded, "grounded");
  assert.equal(resolved[0].nodeKey, "KEY_top_when0");
});

// ── resolveFailedCriteria: CROSS-LIB chain (the load-bearing re-root) ──

check("a cross-lib frontier criterion (under an expanded use-decision) re-roots to the SUB's standalone row", () => {
  // Top delegates to Lib.Sub via an expanded cross-lib `use decision` at Top/action[0]; the sub's when is inlined under
  // it as Top/action[0]/when[0] (the caller-INLINED deep runtime id). The structure addresses the sub STANDALONE
  // (Sub/when[0]). The criterion's deep id must re-root to the SUB's (lib=Lib, decision=Sub, nodeId=when[0]) → KEY_sub_when0.
  const structure = [
    sDec([sNode("Pol", "Top", "action[0]", "KEY_top_use0")]), // the use-decision boundary row (calling decision)
    sDec([sNode("Lib", "Sub", "when[0]", "KEY_sub_when0", [sNode("Lib", "Sub", "when[0]/action[0]", "KEY_sub_act0")])]),
  ];
  const idx = buildRuntimeRefIndex(structure);
  // Runtime tree: Top has a cross-lib use-decision at action[0] (target {name:Sub, libraryName:Lib}); the sub's rows are
  // inlined as children with the caller prefix Top's action[0].
  const tree = [
    useDec("action[0]", { name: "Sub", libraryName: "Lib" }, [
      when("action[0]/when[0]", [action("action[0]/when[0]/action[0]")]),
    ]),
  ];
  const resolved = resolveFailedCriteria([{ nodeId: "action[0]/when[0]" }], { lib: "Pol", decision: "Top" }, tree, idx);
  assert.ok(resolved[0].grounded, "cross-lib criterion grounded");
  assert.equal(resolved[0].nodeKey, "KEY_sub_when0", "re-rooted to the SUB's standalone row, not the caller's");
});

// ── gap fallback ──

check("a criterion whose nodeId is NOT in the tree → undefined path → gap (not grounded, no nodeKey)", () => {
  const structure = [sDec([sNode("Pol", "Top", "when[0]", "KEY_top_when0")])];
  const idx = buildRuntimeRefIndex(structure);
  const tree = [when("when[0]")];
  const resolved = resolveFailedCriteria([{ nodeId: "when[9]" }], { lib: "Pol", decision: "Top" }, tree, idx);
  assert.equal(resolved[0].grounded, false, "not grounded → gap fallback");
  assert.ok(!("nodeKey" in resolved[0]), "no faked nodeKey");
});

check("a criterion whose re-rooted ref MISSES the structure index → gap (whole-path honesty, even though re-root succeeded)", () => {
  // The tree grounds when[0] to {Pol,Top,when[0]} but the index has NO such key → must be a gap, never a fabricated row.
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Other", "when[0]", "KEY_other")])]); // different decision
  const tree = [when("when[0]")];
  const resolved = resolveFailedCriteria([{ nodeId: "when[0]" }], { lib: "Pol", decision: "Top" }, tree, idx);
  assert.equal(resolved[0].grounded, false, "index miss → gap");
});

check("whole-path validation: an ANCESTOR frame missing the index gaps the criterion even if the terminal row resolves", () => {
  // Cross-lib chain: the caller's use-decision boundary row (Top/action[0]) is ABSENT from the index, but the sub's
  // terminal when IS present. A partially-broken delegation path must NOT light its terminus (disc 159 gpt55-9).
  const idx = buildRuntimeRefIndex([
    // NOTE: no Pol/Top/action[0] entry → the ancestor ref will miss.
    sDec([sNode("Lib", "Sub", "when[0]", "KEY_sub_when0")]),
  ]);
  const tree = [useDec("action[0]", { name: "Sub", libraryName: "Lib" }, [when("action[0]/when[0]")])];
  const resolved = resolveFailedCriteria([{ nodeId: "action[0]/when[0]" }], { lib: "Pol", decision: "Top" }, tree, idx);
  assert.equal(resolved[0].grounded, false, "ancestor index miss → gap (terminus not lit)");
});

// ── dedup + ordering ──

check("resolveFailedCriteria dedups by runtime nodeId (a SET), first-seen order", () => {
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "K0"), sNode("Pol", "Top", "when[1]", "K1")])]);
  const tree = [when("when[0]"), when("when[1]")];
  const resolved = resolveFailedCriteria(
    [{ nodeId: "when[1]" }, { nodeId: "when[0]" }, { nodeId: "when[1]" }],
    { lib: "Pol", decision: "Top" }, tree, idx,
  );
  assert.equal(resolved.length, 2, "duplicate nodeId collapsed");
  assert.equal(resolved[0].nodeKey, "K1");
  assert.equal(resolved[1].nodeKey, "K0");
});

check("empty criteria (e.g. a passing case's Blocking frontier) → empty result", () => {
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "K0")])]);
  assert.deepEqual(resolveFailedCriteria([], { lib: "Pol", decision: "Top" }, [when("when[0]")], idx), []);
});

// ── END-TO-END: real T2 frontier/all → resolveFailedCriteria → standalone nodeKey ──
// Richer VM nodes carrying the run-state fields the T2 selectors read.
const vmWhen = (nodeId, satisfied, label, children = []) => ({
  nodeId, kind: "when", label: label ?? `when ${nodeId}`, source: { filePath: "p.crl", range: {} },
  evaluated: true, condition: { concept: { name: label ?? nodeId }, satisfied }, children,
});
const vmAct = (nodeId, label) => ({
  nodeId, kind: "action", label, source: { filePath: "p.crl", range: {} }, evaluated: true,
  action: { actionKind: "recommend-activity", produced: false }, children: [],
});
const fail = (branch, tree) => ({ status: "fail", expected: { decision: "Top", branch }, tree });

check("E2E (Blocking): an unsatisfied ancestor `when` blocking the expected action → re-roots to that when's row", () => {
  // Top: when[0] (Indication, NOT satisfied) → action[0] "Approve" (the expected, unproduced because the when is false).
  const tree = [vmWhen("when[0]", false, "Indication", [vmAct("when[0]/action[0]", "Approve")])];
  const sv = fail("Approve", tree);
  const frontier = failedCriterionFrontier(sv);
  assert.equal(frontier.length, 1, "one blocker");
  assert.equal(frontier[0].reason, "unsatisfied-when");
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "KEY_indication", [sNode("Pol", "Top", "when[0]/action[0]", "KEY_approve")])])]);
  const resolved = resolveFailedCriteria(frontier, { lib: "Pol", decision: "Top" }, sv.tree, idx);
  assert.ok(resolved[0].grounded);
  assert.equal(resolved[0].nodeKey, "KEY_indication", "the blocking when's standalone row, not the action");
});

check("E2E (Blocking): a first:-PREEMPTION → the MATCHED prior sibling re-roots (the case All-mode misses)", () => {
  // Ordered (first:) block: when[0] (Early, satisfied:TRUE → matched) preempts when[1] (Late) whose action is "Approve".
  // The frontier blocker is the MATCHED prior sibling (when[0]), satisfied:TRUE — not a false when.
  const matched = vmWhen("when[0]", true, "Early", [vmAct("when[0]/action[0]", "Defer")]);
  const preempted = { nodeId: "when[1]", kind: "when", label: "when Late", source: { filePath: "p.crl", range: {} },
    evaluated: false, unreachedReason: "preempted", children: [vmAct("when[1]/action[0]", "Approve")] };
  const sv = fail("Approve", [matched, preempted]);
  const frontier = failedCriterionFrontier(sv);
  assert.equal(frontier.length, 1);
  assert.equal(frontier[0].reason, "preemption");
  assert.equal(frontier[0].nodeId, "when[0]", "the matched prior sibling");
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "KEY_early"), sNode("Pol", "Top", "when[1]", "KEY_late")])]);
  const resolved = resolveFailedCriteria(frontier, { lib: "Pol", decision: "Top" }, sv.tree, idx);
  assert.ok(resolved[0].grounded);
  assert.equal(resolved[0].nodeKey, "KEY_early", "re-roots the matched sibling's row");
});

check("E2E (All): every evaluated-unsatisfied `when` is listed + re-rooted (untaken-branch info)", () => {
  const tree = [vmWhen("when[0]", false, "A"), vmWhen("when[1]", false, "B"), vmWhen("when[2]", true, "C")];
  const all = allUnsatisfiedCriteria({ status: "fail", expected: { decision: "Top", branch: "X" }, tree });
  assert.equal(all.length, 2, "two false whens (the satisfied one excluded)");
  const idx = buildRuntimeRefIndex([sDec([sNode("Pol", "Top", "when[0]", "KA"), sNode("Pol", "Top", "when[1]", "KB"), sNode("Pol", "Top", "when[2]", "KC")])]);
  const resolved = resolveFailedCriteria(all, { lib: "Pol", decision: "Top" }, tree, idx);
  assert.deepEqual(resolved.map((r) => r.nodeKey).sort(), ["KA", "KB"]);
});

check("E2E (Blocking): a PASS case → empty frontier → empty resolve (self-gating)", () => {
  const sv = { status: "pass", expected: { decision: "Top", branch: "Approve" }, tree: [vmAct("action[0]", "Approve")] };
  assert.deepEqual(failedCriterionFrontier(sv), []);
  assert.deepEqual(resolveFailedCriteria(failedCriterionFrontier(sv), { lib: "Pol", decision: "Top" }, sv.tree, new Map()), []);
});

console.log(`\nfailedCriterionPeek.test: ${pass} checks passed`);
