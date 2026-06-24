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
const isPermutation = (a) => a.length === 3 && new Set(a).size === 3 && [...a].sort().join() === [...CANONICAL_PANE_ORDER].sort().join();

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
check("INVARIANT: every output is a length-3 permutation of the panes", () => {
  for (const raw of [["crl"], ["x"], [], undefined, ["cel", "cel", "source", "crl", "z"], "junk", { a: 1 }])
    assert.ok(isPermutation(normalizePaneOrder(raw)), `not a permutation for ${JSON.stringify(raw)}`);
});

console.log(`\npaneOrder.test: ${pass} checks passed`);
