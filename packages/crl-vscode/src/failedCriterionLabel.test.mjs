// Unit test for the SHARED failed-criterion labeler (#173 T3, disc 160 FIX 6) — pins the exact rendered string for each
// `display` variant. This is the "labels can't drift across the cockpit + run-tree surfaces" hinge, so the strings are
// asserted directly here (both surfaces consume this one fn). vscode-free → esbuild-bundle-then-import.
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
const { failedCriterionLabel } = await load("failedCriterionLabel.ts");

let pass = 0;
const check = (label, fn) => {
  try { fn(); pass++; console.log(`  ok  ${label}`); }
  catch (e) { console.error(`FAIL  ${label}\n      ${e.message}`); process.exitCode = 1; }
};

// A minimal FailedCriterionNode carrying just the `display` the labeler reads.
const node = (display) => ({ nodeId: "n", conceptLabel: "x", source: {}, reason: display.reason, display });

check("unsatisfied-when → 'when <concept>'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "unsatisfied-when", concept: { name: "Indication" } })), "when Indication");
});

check("guarded-out WITH concept → '<polarity> <concept>'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "unless", concept: { name: "Contra" } })), "unless Contra");
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "only-when", concept: { name: "Elig" } })), "only-when Elig");
});

check("guarded-out WITHOUT concept (degenerate guard) → '<polarity> ?'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "guarded-out", polarity: "unless" })), "unless ?");
});

check("preemption (when) WITH concept → 'matched: when <concept>'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "when", concept: { name: "Early" } })), "matched: when Early");
});

check("preemption (when) WITHOUT concept → 'matched: when ?'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "when" })), "matched: when ?");
});

check("preemption (otherwise) → 'matched: otherwise'", () => {
  assert.equal(failedCriterionLabel(node({ reason: "preemption", siblingKind: "otherwise" })), "matched: otherwise");
});

console.log(`\nfailedCriterionLabel.test: ${pass} checks passed`);
