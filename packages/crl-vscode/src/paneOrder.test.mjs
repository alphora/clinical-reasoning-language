// Unit tests for normalizePaneOrder (#156 C2b-4 + medical-validation slice 3) — a malformed setting must never break a
// panel. vscode-free. The cockpit checks below assert the BYTE-IDENTICAL pre-spec behavior (COCKPIT_PANE_SPEC); the
// medical-validation block exercises the worklist→cel alias + the MV default + internal-pane dedup.
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
const { normalizePaneOrder, COCKPIT_PANE_SPEC, MEDICAL_VALIDATION_PANE_SPEC } = await load("paneOrder.ts");

// The cockpit canonical set (for the invariant) — derived from the spec so the test stays in lockstep with it.
const CANONICAL_PANE_ORDER = COCKPIT_PANE_SPEC.canonical;
// A thin alias so the cockpit checks read like the pre-spec single-arg calls.
const cockpit = (raw) => normalizePaneOrder(raw, COCKPIT_PANE_SPEC);
const mv = (raw) => normalizePaneOrder(raw, MEDICAL_VALIDATION_PANE_SPEC);

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

// ── COCKPIT spec: must stay BYTE-IDENTICAL to the pre-spec behavior ──
check("a valid permutation is preserved", () => {
  assert.deepEqual(cockpit(["crl", "source", "cel"]), ["crl", "source", "cel"]);
});
check("default order passes through", () => {
  assert.deepEqual(cockpit(["source", "crl", "cel"]), ["source", "crl", "cel"]);
});
check("dupes dropped (first wins), missing appended in canonical order", () => {
  assert.deepEqual(cockpit(["crl", "crl"]), ["crl", "source", "cel"]);
});
check("unknown ids dropped", () => {
  assert.deepEqual(cockpit(["crl", "xxx", "cel"]), ["crl", "cel", "source"]);
});
check("mixed valid/invalid/dupe (realistic hand-edit) → repaired", () => {
  assert.deepEqual(cockpit(["crl", "xxx", "crl", "cel"]), ["crl", "cel", "source"]);
});
check("partial array → missing appended", () => {
  assert.deepEqual(cockpit(["cel"]), ["cel", "source", "crl"]);
});
check("case/whitespace variants are NOT recognized (dropped) → canonical fallback", () => {
  assert.deepEqual(cockpit(["CRL", " source "]), ["source", "crl", "cel"]);
});
check("empty array → default", () => {
  assert.deepEqual(cockpit([]), ["source", "crl", "cel"]);
});
check("non-array inputs → default", () => {
  for (const bad of [undefined, null, "crl", 42, { 0: "crl" }, true])
    assert.deepEqual(cockpit(bad), ["source", "crl", "cel"]);
});
check("tree is honored when the user explicitly lists it (opt-in) — kept in position, missing canonical appended", () => {
  assert.deepEqual(cockpit(["source", "crl", "cel", "tree"]), ["source", "crl", "cel", "tree"]);
  assert.deepEqual(cockpit(["tree", "crl"]), ["tree", "crl", "source", "cel"]);
});
check("tree is NOT auto-appended when absent (stays opt-in until it graduates to canonical)", () => {
  assert.deepEqual(cockpit(["source", "crl", "cel"]), ["source", "crl", "cel"]);
  assert.ok(!cockpit(["cel"]).includes("tree"));
  assert.ok(!cockpit([]).includes("tree"));
  assert.ok(!cockpit(undefined).includes("tree"));
});
check("tree dupes dropped (first wins)", () => {
  assert.deepEqual(cockpit(["tree", "tree", "crl"]), ["tree", "crl", "source", "cel"]);
});

check("INVARIANT: every output keeps the 3 canonical panes (once each) + at most the opt-in tree, no dupes/unknowns", () => {
  for (const raw of [["crl"], ["x"], [], undefined, ["cel", "cel", "source", "crl", "z"], "junk", { a: 1 }, ["tree", "tree", "x"], ["tree", "source", "crl", "cel"]])
    assert.ok(isValidOrder(cockpit(raw)), `not a valid order for ${JSON.stringify(raw)}`);
});

// ── MEDICAL-VALIDATION spec: worklist→cel alias, MV default, internal-pane dedup, mode-distinct valid set ──
// #177 slice 3: questionnaire joined the MV canonical default (worklist/source/tree/questionnaire — the operator's
// 4-panel set), so the MV default now resolves to internal [cel, source, tree, questionnaire].
check("MV default resolves to internal [cel, source, tree, questionnaire] (worklist aliases the cel pane)", () => {
  assert.deepEqual(mv(undefined), ["cel", "source", "tree", "questionnaire"]);
  assert.deepEqual(mv([]), ["cel", "source", "tree", "questionnaire"]);
});
check("MV: an explicit worklist→cel in the user order, kept in position", () => {
  assert.deepEqual(mv(["source", "worklist"]), ["source", "cel", "tree", "questionnaire"]);
});
check("MV: listing BOTH worklist and cel dedups to ONE pane (first wins — internal-pane dedup)", () => {
  assert.deepEqual(mv(["worklist", "cel"]), ["cel", "source", "tree", "questionnaire"]);
  assert.deepEqual(mv(["cel", "worklist"]), ["cel", "source", "tree", "questionnaire"]);
});
check("MV: questionnaire is canonical — honored in position, auto-appended when absent", () => {
  assert.deepEqual(mv(["questionnaire", "worklist"]), ["questionnaire", "cel", "source", "tree"]);
  assert.ok(mv(["source"]).includes("questionnaire"), "questionnaire is appended (canonical)");
});
check("MV: crl is valid-but-non-canonical — honored when listed, never auto-appended", () => {
  assert.deepEqual(mv(["worklist", "crl"]), ["cel", "crl", "source", "tree", "questionnaire"]);
  assert.ok(!mv(["source"]).includes("crl"));
});
check("MV: a 5-pane order (all 4 canonical + crl) is preserved — the shell has a 5th column for it (#177 FIX 1)", () => {
  // A user explicitly listing every distinct internal pane → 5 panes; the cockpit's ORDERED_COLUMNS now has a 5th slot
  // so this lays out left-to-right (no overflow onto column One). normalizePaneOrder keeps all 5 (no dedup/append needed).
  const order = mv(["worklist", "source", "tree", "questionnaire", "crl"]);
  assert.deepEqual(order, ["cel", "source", "tree", "questionnaire", "crl"]);
  assert.equal(order.length, 5, "five distinct internal panes survive");
  assert.equal(new Set(order).size, 5, "no dupes");
});
check("MV: unknown keys dropped; canonical (worklist/source/tree/questionnaire) appended", () => {
  assert.deepEqual(mv(["worklist", "zzz", "source"]), ["cel", "source", "tree", "questionnaire"]);
});
check("MV: non-array inputs → the MV default", () => {
  for (const bad of [null, "worklist", 42, { 0: "worklist" }, true])
    assert.deepEqual(mv(bad), ["cel", "source", "tree", "questionnaire"]);
});

// ── cross-spec isolation: the cockpit spec rejects MV-only keys; the MV spec resolves them ──
check("cockpit spec does NOT recognize 'worklist' (MV-only public key) → dropped, cockpit default", () => {
  assert.deepEqual(cockpit(["worklist", "crl"]), ["crl", "source", "cel"]);
});
check("cockpit spec does NOT recognize 'questionnaire' (MV-only pane) → dropped, cockpit default", () => {
  assert.deepEqual(cockpit(["questionnaire", "crl"]), ["crl", "source", "cel"]);
  assert.ok(!cockpit(["source", "crl", "cel", "tree"]).includes("questionnaire"), "questionnaire never appears in a cockpit order");
});

console.log(`\npaneOrder.test: ${pass} checks passed`);
