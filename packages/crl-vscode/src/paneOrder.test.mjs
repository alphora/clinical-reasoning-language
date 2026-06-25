// Unit tests for normalizePaneOrder (#156 C2b-4) — a malformed setting must never break the cockpit. vscode-free.
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
const { normalizePaneOrder, CANONICAL_PANE_ORDER } = await load("paneOrder.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};
// A valid order: no dupes, ALL canonical panes present, and only valid ids (the 3 canonical + the opt-in "tree").
const VALID_IDS = ["source", "crl", "cel", "tree"];
const isValidOrder = (a) =>
  Array.isArray(a) &&
  new Set(a).size === a.length &&
  CANONICAL_PANE_ORDER.every((p) => a.includes(p)) &&
  a.every((x) => VALID_IDS.includes(x));

check("a valid permutation is preserved", () => {
  assert.deepEqual(normalizePaneOrder(["crl", "source", "cel"]), ["crl", "source", "cel"]);
});
check("default order passes through", () => {
  assert.deepEqual(normalizePaneOrder(["source", "crl", "cel"]), ["source", "crl", "cel"]);
});
check("dupes dropped (first wins), missing appended in canonical order", () => {
  assert.deepEqual(normalizePaneOrder(["crl", "crl"]), ["crl", "source", "cel"]);
});
check("unknown ids dropped", () => {
  assert.deepEqual(normalizePaneOrder(["crl", "xxx", "cel"]), ["crl", "cel", "source"]);
});
check("mixed valid/invalid/dupe (realistic hand-edit) → repaired", () => {
  assert.deepEqual(normalizePaneOrder(["crl", "xxx", "crl", "cel"]), ["crl", "cel", "source"]);
});
check("partial array → missing appended", () => {
  assert.deepEqual(normalizePaneOrder(["cel"]), ["cel", "source", "crl"]);
});
check("case/whitespace variants are NOT recognized (dropped) → canonical fallback", () => {
  assert.deepEqual(normalizePaneOrder(["CRL", " source "]), ["source", "crl", "cel"]);
});
check("empty array → default", () => {
  assert.deepEqual(normalizePaneOrder([]), ["source", "crl", "cel"]);
});
check("non-array inputs → default", () => {
  for (const bad of [undefined, null, "crl", 42, { 0: "crl" }, true])
    assert.deepEqual(normalizePaneOrder(bad), ["source", "crl", "cel"]);
});
check("tree is honored when the user explicitly lists it (opt-in) — kept in position, missing canonical appended", () => {
  assert.deepEqual(normalizePaneOrder(["source", "crl", "cel", "tree"]), ["source", "crl", "cel", "tree"]);
  assert.deepEqual(normalizePaneOrder(["tree", "crl"]), ["tree", "crl", "source", "cel"]);
});
check("tree is NOT auto-appended when absent (stays opt-in until it graduates to canonical)", () => {
  assert.deepEqual(normalizePaneOrder(["source", "crl", "cel"]), ["source", "crl", "cel"]);
  assert.ok(!normalizePaneOrder(["cel"]).includes("tree"));
  assert.ok(!normalizePaneOrder([]).includes("tree"));
  assert.ok(!normalizePaneOrder(undefined).includes("tree"));
});
check("tree dupes dropped (first wins)", () => {
  assert.deepEqual(normalizePaneOrder(["tree", "tree", "crl"]), ["tree", "crl", "source", "cel"]);
});

check("INVARIANT: every output keeps the 3 canonical panes (once each) + at most the opt-in tree, no dupes/unknowns", () => {
  for (const raw of [["crl"], ["x"], [], undefined, ["cel", "cel", "source", "crl", "z"], "junk", { a: 1 }, ["tree", "tree", "x"], ["tree", "source", "crl", "cel"]])
    assert.ok(isValidOrder(normalizePaneOrder(raw)), `not a valid order for ${JSON.stringify(raw)}`);
});

console.log(`\npaneOrder.test: ${pass} checks passed`);
