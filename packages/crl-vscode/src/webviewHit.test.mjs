// Unit tests for the webview hit classifier (#156 C2c-2). Guards the peek-only invariant: a fact hit must NEVER be
// routed into the engine selection path. vscode-free + crl types erase → esbuild-bundle-then-import.
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
const { isFactHit, isConceptHit } = await load("webviewHit.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

check("a fact hit (has conceptKey) → isFactHit true (→ peek, NOT engine selection)", () => {
  assert.equal(isFactHit({ conceptKey: "k", factAnchorKey: "fact:g_cel0:f0" }), true);
});

check("the three engine-selectable hits → isFactHit false (→ mapHitToPrimary)", () => {
  assert.equal(isFactHit({ unitId: "u1", range: {} }), false);
  assert.equal(isFactHit({ nodeKey: "n1" }), false);
  assert.equal(isFactHit({ caseId: "c1" }), false);
});

check("a concept-row hit (has conceptNodeKey) → isConceptHit true (→ peekConceptNode, NOT engine selection)", () => {
  assert.equal(isConceptHit({ conceptNodeKey: "cA" }), true);
});

check("concept hit is NOT a fact hit, and a decision {nodeKey} is NOT a concept hit (the disjointness that keeps routing safe)", () => {
  assert.equal(isFactHit({ conceptNodeKey: "cA" }), false);
  assert.equal(isConceptHit({ conceptKey: "k", factAnchorKey: "f" }), false);
  assert.equal(isConceptHit({ nodeKey: "n1" }), false);
  assert.equal(isConceptHit({ unitId: "u1", range: {} }), false);
  assert.equal(isConceptHit({ caseId: "c1" }), false);
});

console.log(`\nwebviewHit.test: ${pass} checks passed`);
