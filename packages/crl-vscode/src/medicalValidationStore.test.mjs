// Unit tests for the Medical Validation persistence + derivation CORE (#156 slice 2): medicalValidationSidecarPath,
// load/saveSidecar, deriveReviewOverlay, nextReviewState. vscode-free, so — like provenanceFindings.test.mjs — esbuild
// bundles the TS to CJS and we import it under node. Design authority: .vibe-tools/discussions/161-...
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { medicalValidationSidecarPath, loadSidecar, saveSidecar, deriveReviewOverlay, deriveAllPassLeaves, buildReviewPerCase, isReviewState, setReviewState, REVIEW_STATES, reviewProgress, renderProgressChrome, composeSidecar, addNote, editNote, deleteNote, mvCasesClean, mvComplete, renderFlagChrome, setCriterionVerdict, criterionVerdictState, criterionVerdictKey, criterionProgress, mvCriteriaClean, renderCriterionChrome, unsettledReviewItems, computeCriterionVerdictUpdate, applyBulkVerdict, reviewGridViewModel, applyGridAssignments, setAllReviewState } from "./medicalValidationStore.ts";

const check = test;

// ── path helper (temp fixture replicating the crl-content policy-dir layout) ─────
// artifacts/<policy>/src/{cel,provenance,medical-validation}. policyName = parent-of-src basename.
function makePolicySrc(policyName = "policy") {
  const root = mkdtempSync(join(tmpdir(), "mv-store-"));
  const src = join(root, "artifacts", policyName, "src");
  for (const d of ["cel", "provenance"]) mkdirSync(join(src, d), { recursive: true });
  const celPath = join(src, "cel", "p.cel");
  writeFileSync(celPath, '# C\nlibrary "C".\ncovers "P".\n');
  return { root, src, celPath, policyName };
}

check("sidecar path: a .cel in a policy src/ → <src>/medical-validation/<policy>.json", () => {
  const { root, src, celPath, policyName } = makePolicySrc("dme101");
  try {
    const p = medicalValidationSidecarPath(celPath);
    assert.equal(p, join(src, "medical-validation", `${policyName}.json`));
    // keyed by the POLICY dir (parent of src), NOT the .cel stem:
    assert.ok(p.endsWith(join("medical-validation", "dme101.json")));
    assert.ok(!p.includes("p.json"), "must not be keyed by the .cel basename");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("sidecar path: ONE sidecar per policy — two .cels in the same policy src/ share one path", () => {
  const { root, src } = makePolicySrc("polX");
  try {
    mkdirSync(join(src, "cel"), { recursive: true });
    const a = join(src, "cel", "a.cel");
    const b = join(src, "cel", "b.cel");
    writeFileSync(a, "x");
    writeFileSync(b, "x");
    assert.equal(medicalValidationSidecarPath(a), medicalValidationSidecarPath(b));
    assert.ok(medicalValidationSidecarPath(a).endsWith(join("medical-validation", "polX.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("sidecar path: a .cel nested under src/cel/sub/ → still resolves to the same policy sidecar (findPolicySrc ascends)", () => {
  const { root, src } = makePolicySrc("polNested");
  try {
    const nested = join(src, "cel", "sub", "foo.cel");
    mkdirSync(dirname(nested), { recursive: true });
    writeFileSync(nested, "x");
    assert.equal(medicalValidationSidecarPath(nested), join(src, "medical-validation", "polNested.json"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("sidecar path: a .cel NOT inside a policy src/ (no provenance/ ancestor) → undefined", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-loose-"));
  try {
    const celPath = join(root, "loose", "x.cel");
    mkdirSync(dirname(celPath), { recursive: true });
    writeFileSync(celPath, "x");
    assert.equal(medicalValidationSidecarPath(celPath), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── load ─────────────────────────────────────────────────────────────────────
check("load: missing file → empty {schemaVersion:2, byCaseId:{}}, no warning", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "medical-validation", "p.json");
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar, { schemaVersion: 2, byCaseId: {} });
    assert.equal(r.warning, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: malformed JSON → empty + a soft warning (NO throw)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, "{ not json");
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, {});
    assert.ok(r.warning && r.warning.includes("malformed JSON"), `expected a malformed-JSON warning, got: ${r.warning}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: wrong shape (byCaseId not an object) → empty + warning (no throw)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, byCaseId: "nope" }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, {});
    assert.ok(r.warning && r.warning.includes("unexpected shape"), `got: ${r.warning}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: an ARRAY byCaseId is wrong shape → empty + warning (NOT coerced to {'0':...})", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, byCaseId: ["reviewed"] }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, {}, "an array must not become {'0':'reviewed'}");
    assert.ok(r.warning && r.warning.includes("unexpected shape"), `got: ${r.warning}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: a legacy v1 sidecar migrates 'reviewed' → 'pass', normalizes to v2, NO warning (v1 is understood)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, byCaseId: { c1: "reviewed", c2: "pending" } }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass", c2: "pending" }, "v1 'reviewed' → v2 'pass'");
    assert.equal(r.sidecar.schemaVersion, 2, "normalized to v2");
    assert.equal(r.warning, undefined, "v1 is a KNOWN legacy version — a clean, warning-free migration");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: a v2 sidecar loads the pass/fail/pending verdicts natively (no migration, no warning)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: { c1: "pass", c2: "fail", c3: "pending" } }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass", c2: "fail", c3: "pending" });
    assert.equal(r.warning, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: a genuinely FORWARD schemaVersion (3) → best-effort over current states + a warning (not silent)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 3, byCaseId: { c1: "pass", c2: "pending" } }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass", c2: "pending" }, "known states loaded best-effort");
    assert.equal(r.sidecar.schemaVersion, 2, "normalized to the version this build understands");
    assert.ok(r.warning && r.warning.includes("schemaVersion"), `expected a forward-version warning, got: ${r.warning}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: valid → parsed; an unknown state value for a caseId is dropped (valid entries kept, 'reviewed' migrated)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, byCaseId: { c1: "reviewed", c2: "pending", c3: "bogus", c4: "unreviewed" } }));
    const r = loadSidecar(p);
    assert.equal(r.warning, undefined, "a present-but-coercible v1 file is a clean load");
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass", c2: "pending" }, "c1 migrated; c3(bogus)+c4(unreviewed) dropped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── save ─────────────────────────────────────────────────────────────────────
check("save: tear-free round-trip (save → load === input), creates the parent dir, no .tmp scratch lingers", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-save-"));
  try {
    const dir = join(root, "medical-validation"); // parent dir does NOT exist yet
    const p = join(dir, "p.json");
    const sidecar = { schemaVersion: 2, byCaseId: { c1: "pass", c2: "pending" } };
    saveSidecar(p, sidecar);
    assert.ok(existsSync(p), "the final file exists");
    assert.ok(existsSync(dir), "the medical-validation/ parent dir was created");
    // the per-pid tmp (`p.<pid>.tmp`) is renamed away → only the final file remains in the dir.
    assert.deepEqual(readdirSync(dir), ["p.json"], "no .tmp scratch file lingers after rename");
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar, sidecar, "round-trips byte-faithfully");
    // and the on-disk JSON is real, pretty-printed JSON:
    assert.deepEqual(JSON.parse(readFileSync(p, "utf8")), sidecar);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("save: a real IO failure THROWS (parent path component is a FILE → mkdirSync fails)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-save-"));
  try {
    const blocker = join(root, "blocker"); // an existing FILE where a dir is expected
    writeFileSync(blocker, "x");
    const p = join(blocker, "medical-validation", "p.json"); // mkdirSync(dirname(p)) must fail — `blocker` is a file
    assert.throws(() => saveSidecar(p, { schemaVersion: 2, byCaseId: {} }), "a failed save is surfaced, not swallowed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the VERDICT-painting fold (#210) ─────────────────────────────────────────────
// Each reviewed case lights its fired-path nodes with its VERDICT (the caller colors pass→green, fail→red, pending→yellow —
// the worklist dropdown colors); a node lit by several cases resolves to ONE verdict (pending always loses; pass-vs-fail
// flips on isLeaf — interior pass wins, leaf fail wins). error (⊆ pass — a pass verdict whose RUN errored) is unchanged.
const M = (entries) => new Map(entries);
const noLeaf = () => false; // default: every node is INTERIOR (pass-wins)
const leafIs = (...keys) => (k) => keys.includes(k);

check("fold: a PASS-verdict case → its lit rows in pass (run status pass → not in error)", () => {
  const { pass, fail, pending, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "pass", litNodeKeys: ["n1", "n2"] }]]),
    noLeaf,
  );
  assert.deepEqual([...pass].sort(), ["n1", "n2"]);
  assert.equal(fail.size, 0);
  assert.equal(pending.size, 0);
  assert.equal(error.size, 0);
});

check("fold: a FAIL-verdict case → its lit rows in fail (#210: fail now paints red)", () => {
  const { pass, fail, pending } = deriveReviewOverlay(
    { c1: "fail" },
    M([["c1", { status: "pass", litNodeKeys: ["n1", "n2"] }]]), // a run-PASS case with a human FAIL verdict paints FAIL
    noLeaf,
  );
  assert.equal(pass.size, 0, "fail verdict does not paint pass");
  assert.deepEqual([...fail].sort(), ["n1", "n2"], "fail paints red");
  assert.equal(pending.size, 0);
});

check("fold: a PENDING-verdict case → its lit rows in pending (#210: pending now paints yellow)", () => {
  const { pass, fail, pending } = deriveReviewOverlay(
    { c1: "pending" },
    M([["c1", { status: "pass", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.equal(pass.size, 0);
  assert.equal(fail.size, 0);
  assert.deepEqual([...pending], ["n1"], "pending paints yellow");
});

check("fold: an unreviewed (absent) caseId paints nothing even when present in perCase", () => {
  const { pass, fail, pending, error } = deriveReviewOverlay(
    {}, // nothing has a verdict
    M([["c1", { status: "error", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.equal(pass.size + fail.size + pending.size + error.size, 0);
});

// ── precedence: pending always loses; pass-vs-fail flips on isLeaf ─────────────────
check("precedence: pending + pass on the same node → PASS (pending loses)", () => {
  const { pass, pending } = deriveReviewOverlay(
    { p: "pending", g: "pass" },
    M([
      ["p", { status: "pass", litNodeKeys: ["shared"] }],
      ["g", { status: "pass", litNodeKeys: ["shared"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...pass], ["shared"], "pass beats pending");
  assert.equal(pending.size, 0, "pending lost — not in the pending set");
});

check("precedence: pending + fail on the same node → FAIL (pending loses)", () => {
  const { fail, pending } = deriveReviewOverlay(
    { p: "pending", f: "fail" },
    M([
      ["p", { status: "pass", litNodeKeys: ["shared"] }],
      ["f", { status: "pass", litNodeKeys: ["shared"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...fail], ["shared"], "fail beats pending");
  assert.equal(pending.size, 0);
});

check("precedence: pass + fail on an INTERIOR node → PASS (interior: pass wins)", () => {
  const { pass, fail } = deriveReviewOverlay(
    { g: "pass", f: "fail" },
    M([
      ["g", { status: "pass", litNodeKeys: ["interior"] }],
      ["f", { status: "pass", litNodeKeys: ["interior"] }],
    ]),
    noLeaf, // "interior" is not a leaf
  );
  assert.deepEqual([...pass], ["interior"], "pass wins on an interior node");
  assert.equal(fail.size, 0);
});

check("precedence: pass + fail on a LEAF node → FAIL (leaf: fail wins)", () => {
  const { pass, fail } = deriveReviewOverlay(
    { g: "pass", f: "fail" },
    M([
      ["g", { status: "pass", litNodeKeys: ["leaf"] }],
      ["f", { status: "pass", litNodeKeys: ["leaf"] }],
    ]),
    leafIs("leaf"),
  );
  assert.deepEqual([...fail], ["leaf"], "fail wins on a leaf (a failed outcome shows fail even if a pass path reaches it)");
  assert.equal(pass.size, 0);
});

check("precedence: pass+fail+pending — interior→pass, leaf→fail, both drop pending (mixed tree)", () => {
  const per = M([
    ["g", { status: "pass", litNodeKeys: ["mid", "tip"] }],
    ["f", { status: "pass", litNodeKeys: ["mid", "tip"] }],
    ["p", { status: "pass", litNodeKeys: ["mid", "tip"] }],
  ]);
  const { pass, fail, pending } = deriveReviewOverlay(
    { g: "pass", f: "fail", p: "pending" },
    per,
    leafIs("tip"), // "tip" is the disposition leaf; "mid" is interior
  );
  assert.deepEqual([...pass], ["mid"], "interior node → pass (pass beats fail beats pending)");
  assert.deepEqual([...fail], ["tip"], "leaf node → fail (fail beats pass beats pending)");
  assert.equal(pending.size, 0, "pending lost on every contested node");
});

check("fold: the three verdict sets are DISJOINT (exactly one color per node)", () => {
  const { pass, fail, pending } = deriveReviewOverlay(
    { g: "pass", f: "fail", p: "pending" },
    M([
      ["g", { status: "pass", litNodeKeys: ["a"] }],
      ["f", { status: "pass", litNodeKeys: ["b"] }],
      ["p", { status: "pass", litNodeKeys: ["c"] }],
    ]),
    noLeaf,
  );
  const all = [...pass, ...fail, ...pending];
  assert.equal(new Set(all).size, all.length, "no nodeKey appears in more than one set");
  assert.deepEqual([...pass], ["a"]);
  assert.deepEqual([...fail], ["b"]);
  assert.deepEqual([...pending], ["c"]);
});

// ── error (⊆ pass): a pass-verdict node whose RUN errored (Slice-1 unchanged) ──
check("fold: a PASS-verdict, run-status:error case → its rows in error AND pass (error ⊆ pass)", () => {
  const { pass, error } = deriveReviewOverlay(
    { good: "pass", bad: "pass" },
    M([
      ["good", { status: "pass", litNodeKeys: ["shared", "g1"] }],
      ["bad", { status: "error", litNodeKeys: ["shared", "b1"] }],
    ]),
    noLeaf,
  );
  assert.ok(error.has("shared"), "the errored case marks the shared node error");
  assert.ok(error.has("b1"));
  assert.ok(!error.has("g1"), "a node lit only by the clean case is not error");
  assert.ok(pass.has("shared") && pass.has("g1") && pass.has("b1"), "pass is the union over all pass cases");
});

check("fold: error ⊆ pass — a LEAF lit by a pass-run-error case AND a fail case resolves to FAIL, drops out of error (no double class)", () => {
  const { pass, fail, error } = deriveReviewOverlay(
    { e: "pass", f: "fail" },
    M([
      ["e", { status: "error", litNodeKeys: ["leaf"] }], // pass verdict, run errored → would be error…
      ["f", { status: "pass", litNodeKeys: ["leaf"] }], // …but a fail case reaches the same LEAF
    ]),
    leafIs("leaf"),
  );
  assert.deepEqual([...fail], ["leaf"], "leaf fail-wins (a failed outcome tip)");
  assert.equal(pass.size, 0, "not pass — fail won");
  assert.equal(error.size, 0, "error ⊆ pass: a fail-resolved node is NOT in error (already fail, no double class)");
});

check("fold: error ⊆ pass — an INTERIOR pass-run-error node shared with a fail case stays PASS and IN error (error-over-pass)", () => {
  const { pass, fail, error } = deriveReviewOverlay(
    { e: "pass", f: "fail" },
    M([
      ["e", { status: "error", litNodeKeys: ["mid"] }],
      ["f", { status: "pass", litNodeKeys: ["mid"] }],
    ]),
    noLeaf, // interior → pass wins
  );
  assert.deepEqual([...pass], ["mid"], "interior pass-wins");
  assert.equal(fail.size, 0);
  assert.deepEqual([...error], ["mid"], "the pass node's run errored → in error (painted error-over-pass)");
});

check("fold: a PASS-verdict case whose RUN status is 'fail' STILL paints pass (human override, not error)", () => {
  const { pass, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "fail", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.deepEqual([...pass], ["n1"], "the human pass verdict paints pass over the automated fail");
  assert.equal(error.size, 0, "run-status 'fail' does NOT redden — only run-status 'error' does");
});

check("fold: a stale pass caseId (not in perCase) → inert (contributes nothing)", () => {
  const { pass } = deriveReviewOverlay(
    { gone: "pass", live: "pass" },
    M([["live", { status: "pass", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.deepEqual([...pass], ["n1"], "only the live case paints; the stale id is skipped");
});

check("fold: multiple pass cases lighting the same node → pass (union, idempotent)", () => {
  const { pass } = deriveReviewOverlay(
    { a: "pass", b: "pass" },
    M([
      ["a", { status: "pass", litNodeKeys: ["n1"] }],
      ["b", { status: "pass", litNodeKeys: ["n1"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...pass], ["n1"], "deduped to a single entry");
});

check("fold: a case with litNodeKeys:[] contributes nothing (no crash, empty sets)", () => {
  const { pass, fail, pending, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "error", litNodeKeys: [] }]]),
    noLeaf,
  );
  assert.equal(pass.size + fail.size + pending.size + error.size, 0);
});

// ── the all-pass LEAF ✓ fold (#210) — strictly every PRODUCING scenario must be pass ──
check("allpass: a leaf produced ONLY by pass scenarios → badge", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: ["L1"], verdict: "pass" },
    { producedLeafKeys: ["L1"], verdict: "pass" },
  ]);
  assert.deepEqual([...s], ["L1"], "all producing scenarios pass → ✓");
});
check("allpass: a single PENDING producing scenario → NO badge", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: ["L1"], verdict: "pass" },
    { producedLeafKeys: ["L1"], verdict: "pending" },
  ]);
  assert.equal(s.size, 0, "a pending route suppresses");
});
check("allpass: a single FAIL producing scenario → NO badge (via VERDICT, independent of run status)", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: ["L1"], verdict: "pass" },
    { producedLeafKeys: ["L1"], verdict: "fail" },
  ]);
  assert.equal(s.size, 0, "a fail route suppresses");
});
check("allpass: a single UNREVIEWED (to-do / ambiguous) producing scenario → NO badge", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: ["L1"], verdict: "pass" },
    { producedLeafKeys: ["L1"], verdict: "unreviewed" },
  ]);
  assert.equal(s.size, 0, "an unreviewed route suppresses (strict all-pass)");
});
check("allpass: per-leaf independence — L1 all-pass badges, L2 has a fail → only L1", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: ["L1", "L2"], verdict: "pass" },
    { producedLeafKeys: ["L2"], verdict: "fail" },
    { producedLeafKeys: ["L1"], verdict: "pass" },
  ]);
  assert.deepEqual([...s].sort(), ["L1"], "L1 all-pass → ✓; L2 has a fail route → no ✓");
});
check("allpass: an UNREACHED leaf (no producing scenario) is never in the set; empty produced → no contribution", () => {
  const s = deriveAllPassLeaves([
    { producedLeafKeys: [], verdict: "pass" }, // a blocked/errored case produces nothing
    { producedLeafKeys: ["L1"], verdict: "pass" },
  ]);
  assert.deepEqual([...s], ["L1"], "only the produced leaf; the empty-produced scenario contributes nothing");
  assert.ok(!s.has("Lx"), "a leaf no scenario produced is absent");
});
check("allpass: no scenarios → empty set", () => {
  assert.equal(deriveAllPassLeaves([]).size, 0);
});

// ── isReviewState (trusted-input guard) ───────────────────────────────────────
check("isReviewState: accepts the four states, rejects everything else (incl legacy 'reviewed')", () => {
  for (const s of ["unreviewed", "pending", "pass", "fail"]) assert.ok(isReviewState(s), `${s} is valid`);
  for (const s of ["reviewed", "bogus", "", undefined, null, 1, {}]) assert.ok(!isReviewState(s), `${JSON.stringify(s)} rejected`);
  assert.deepEqual([...REVIEW_STATES], ["unreviewed", "pending", "pass", "fail"], "dropdown order");
});

// ── setReviewState (slice 4 host reducer — direct dropdown set, no cycle) ──────
check("setReviewState: set 'pass' on an absent case → entry added", () => {
  assert.deepEqual(setReviewState({}, "c1", "pass"), { c1: "pass" });
});
check("setReviewState: set 'fail' overwrites a prior verdict in place", () => {
  assert.deepEqual(setReviewState({ c1: "pass" }, "c1", "fail"), { c1: "fail" });
});
check("setReviewState: set 'unreviewed' DELETES the entry (absence = To do, never stored)", () => {
  assert.deepEqual(setReviewState({ c1: "fail" }, "c1", "unreviewed"), {});
});
check("setReviewState: only the target caseId changes; others untouched", () => {
  assert.deepEqual(setReviewState({ c1: "pending", c2: "pass" }, "c1", "fail"), { c1: "fail", c2: "pass" });
});
check("setReviewState: returns a NEW object (input not mutated)", () => {
  const input = { c1: "pass" };
  const out = setReviewState(input, "c1", "fail");
  assert.deepEqual(input, { c1: "pass" }, "input untouched");
  assert.notEqual(out, input, "a fresh object is returned");
});
check("setReviewState: any-to-any is one step (no cycling) — fail → pass directly", () => {
  assert.deepEqual(setReviewState({ c1: "fail" }, "c1", "pass"), { c1: "pass" }, "a mis-marked fail corrects in ONE set");
});

// ── buildReviewPerCase → deriveReviewOverlay (host join, end-to-end) ──────────────
// The host's driveDoneOverlay composes buildReviewPerCase (frozen-case join) then deriveReviewOverlay (the verdict fold).
// Test the composition with stub statusOf/litNodeKeysOf closures (the closures stand in for scenarioByCaseId + the
// crlAnchorsForUnits(unitsForCase(...)) reveal join). The 3rd fold arg is isLeaf — noLeaf here (structure interior).
const lit = { c1: ["n:a", "n:b"], c2: ["n:b", "n:c"], cErr: ["n:c", "n:d"], cClean: ["n:c"] };
const status = { c1: "pass", c2: "fail", cErr: "error", cClean: "pass" };
const statusOf = (id) => status[id]; // undefined for an unknown id (unfrozen / ambiguous)
const litOf = (id) => lit[id] ?? [];
const overlayFor = (byCaseId, caseIds, isLeaf = noLeaf) =>
  deriveReviewOverlay(byCaseId, buildReviewPerCase(caseIds, statusOf, litOf), isLeaf);

check("buildReviewPerCase: a frozen PASS-verdict, run-pass case → its nodes pass, none error", () => {
  const { pass, error } = overlayFor({ c1: "pass" }, ["c1", "c2"]);
  assert.deepEqual([...pass].sort(), ["n:a", "n:b"]);
  assert.equal(error.size, 0);
});
check("buildReviewPerCase: a frozen FAIL-verdict case → its nodes fail (#210)", () => {
  const { fail, pass } = overlayFor({ c2: "fail" }, ["c1", "c2"]);
  assert.deepEqual([...fail].sort(), ["n:b", "n:c"], "fail paints red");
  assert.equal(pass.size, 0);
});
check("buildReviewPerCase: a frozen PASS-verdict, run-ERROR case → its nodes error AND pass (error⊆pass)", () => {
  const { pass, error } = overlayFor({ cErr: "pass" }, ["cErr", "cClean"]);
  assert.deepEqual([...pass].sort(), ["n:c", "n:d"], "error nodes are also pass");
  assert.deepEqual([...error].sort(), ["n:c", "n:d"]);
});
check("error-over-pass: a node lit by a clean pass case AND a run-errored pass case is error (and pass)", () => {
  // cClean lights n:c (run-pass), cErr lights n:c + n:d (run-error) → n:c is in BOTH pass and error; webview paints error over it.
  const { pass, error } = overlayFor({ cClean: "pass", cErr: "pass" }, ["cClean", "cErr"]);
  assert.ok(pass.has("n:c") && error.has("n:c"), "shared node is error AND pass");
  assert.ok(pass.has("n:d") && error.has("n:d"));
});
check("interior precedence end-to-end: a pass case + a fail case share n:b (interior) → pass", () => {
  const { pass, fail } = overlayFor({ c1: "pass", c2: "fail" }, ["c1", "c2"]); // c1 lights n:a,n:b; c2 lights n:b,n:c
  assert.ok(pass.has("n:b"), "shared interior node → pass (interior pass-wins)");
  assert.ok(pass.has("n:a"));
  assert.ok(fail.has("n:c") && !pass.has("n:c"), "c2-only node is fail");
  assert.ok(!fail.has("n:b"), "the shared node is not also fail (disjoint)");
});
check("leaf precedence end-to-end: the same shared node as a LEAF → fail-wins", () => {
  const { pass, fail } = overlayFor({ c1: "pass", c2: "fail" }, ["c1", "c2"], leafIs("n:b"));
  assert.ok(fail.has("n:b"), "shared leaf node → fail (leaf fail-wins)");
  assert.ok(!pass.has("n:b"));
});
check("PENDING case paints pending (#210)", () => {
  const { pending, pass, fail } = overlayFor({ c1: "pending" }, ["c1", "c2"]);
  assert.deepEqual([...pending].sort(), ["n:a", "n:b"], "pending paints yellow");
  assert.equal(pass.size, 0);
  assert.equal(fail.size, 0);
});
check("an unfrozen/ambiguous caseId (statusOf → undefined) is skipped — never appears in perCase", () => {
  // "ghost" is pass in the sidecar but not a live/frozen case → buildReviewPerCase skips it → the fold finds no row → inert.
  const perCase = buildReviewPerCase(["ghost", "c1"], statusOf, litOf);
  assert.ok(!perCase.has("ghost"), "no perCase row for an unresolved (undefined-status) case");
  assert.ok(perCase.has("c1"));
  const { pass } = deriveReviewOverlay({ ghost: "pass", c1: "pass" }, perCase, noLeaf);
  assert.deepEqual([...pass].sort(), ["n:a", "n:b"], "only the live pass case painted; the ghost is inert");
});
check("empty worklist (no verdicts) → empty overlay (host posts a clear)", () => {
  const { pass, fail, pending, error } = overlayFor({}, ["c1", "c2", "cErr"]);
  assert.equal(pass.size + fail.size + pending.size + error.size, 0);
});
check("buildReviewPerCase passes litNodeKeys verbatim from the join closure", () => {
  const perCase = buildReviewPerCase(["c2"], statusOf, litOf);
  assert.deepEqual([...perCase.get("c2").litNodeKeys], ["n:b", "n:c"]);
  assert.equal(perCase.get("c2").status, "fail");
});

// ── reviewProgress (slice 6 count) ────────────────────────────────────────────
const PROG = (o) => ({ total: 0, reviewed: 0, passed: 0, failed: 0, pending: 0, unreviewable: 0, stale: 0, ...o });
check("reviewProgress: a mix — passed/failed/pending over reviewable, absent=To do, orphan keys=stale", () => {
  // reviewable = [r1, r2, p1, u1]; sidecar also has two orphans (o1 pass, o2 pending) not in reviewable → both stale.
  const p = reviewProgress(
    { r1: "pass", r2: "pass", p1: "pending", o1: "pass", o2: "pending" },
    ["r1", "r2", "p1", "u1"], // u1 absent from sidecar → To do (not counted in passed/failed/pending)
  );
  assert.deepEqual(p, PROG({ total: 4, reviewed: 2, passed: 2, failed: 0, pending: 1, stale: 2 }));
  // NOT a partition: passed+pending+stale = 5 ≠ total (4); stale counts a DIFFERENT universe (orphans), incl a pending orphan.
});
check("reviewProgress: passed + failed split (reviewed = passed + failed = adjudicated)", () => {
  const p = reviewProgress({ a: "pass", b: "fail", c: "pending" }, ["a", "b", "c", "d"]);
  assert.deepEqual(p, PROG({ total: 4, reviewed: 2, passed: 1, failed: 1, pending: 1, stale: 0 }));
});
check("reviewProgress: empty reviewable set → total 0 (everything 0)", () => {
  assert.deepEqual(reviewProgress({}, []), PROG({}));
  // a total-0 panel can still have orphans: those surface as stale.
  assert.deepEqual(reviewProgress({ gone: "pass" }, []), PROG({ stale: 1 }));
});
check("reviewProgress: all-passed (passed===total, nothing failed/pending/stale/unreviewable)", () => {
  assert.deepEqual(reviewProgress({ a: "pass", b: "pass" }, ["a", "b"]), PROG({ total: 2, reviewed: 2, passed: 2 }));
});
check("reviewProgress: unreviewable = totalCaseCount − reviewable (floored at 0)", () => {
  // 5 worklist rows, 3 reviewable (frozen, non-ambiguous) → 2 unreviewable (unfrozen/ambiguous).
  const p = reviewProgress({ a: "pass" }, ["a", "b", "c"], 5);
  assert.deepEqual(p, PROG({ total: 3, reviewed: 1, passed: 1, unreviewable: 2 }));
  // defensive floor: a totalCaseCount somehow < reviewable never yields a negative unreviewable.
  assert.equal(reviewProgress({}, ["a", "b"], 1).unreviewable, 0);
});
check("reviewProgress: a duplicate reviewable id does NOT inflate the counts (de-duped)", () => {
  const p = reviewProgress({ a: "pass" }, ["a", "a", "b"]);
  assert.deepEqual(p, PROG({ total: 2, reviewed: 1, passed: 1 }));
});

// ── renderProgressChrome (slice 6 chrome HTML) ─────────────────────────────────
check("renderProgressChrome: a mix renders Reviewed N/M + pending/failed/stale clauses", () => {
  const html = renderProgressChrome(PROG({ total: 5, reviewed: 3, passed: 2, failed: 1, pending: 1, stale: 2 }));
  assert.match(html, /class="mv-progress"/);
  assert.ok(!/mv-progress-done/.test(html), "not the done state when work remains");
  assert.match(html, /Reviewed 3\/5/);
  assert.match(html, /1 pending/);
  assert.match(html, /1 failed/);
  assert.match(html, /2 stale/);
});
check("renderProgressChrome: all-PASSED (passed===total, clean) → '✓ All passed' done indicator INSTEAD of the count", () => {
  const html = renderProgressChrome(PROG({ total: 3, reviewed: 3, passed: 3 }));
  assert.match(html, /mv-progress-done/);
  assert.match(html, /✓ All passed/);
  assert.ok(!/Reviewed 3\/3/.test(html), "no redundant count beside the done indicator");
});
check("renderProgressChrome: all ADJUDICATED but some FAILED is NOT clean — shows the failed tally, no pass all-clear", () => {
  const html = renderProgressChrome(PROG({ total: 3, reviewed: 3, passed: 2, failed: 1 }));
  assert.ok(!/mv-progress-done/.test(html), "a failure blocks the '✓ All passed' badge");
  assert.ok(!/All passed/.test(html));
  assert.match(html, /Reviewed 3\/3/, "completion is still visible");
  assert.match(html, /1 failed/, "and so is the failure");
});
check("renderProgressChrome: pending/failed/unreviewable/stale clauses OMITTED when their count is 0", () => {
  const html = renderProgressChrome(PROG({ total: 5, reviewed: 2, passed: 2 }));
  assert.match(html, /Reviewed 2\/5/);
  assert.ok(!/pending/.test(html) && !/failed/.test(html) && !/not reviewable/.test(html) && !/stale/.test(html), "no zero clauses");
});
check("renderProgressChrome: unreviewable rows surface as '· U not reviewable' (honesty — they're never hidden)", () => {
  const html = renderProgressChrome(PROG({ total: 3, reviewed: 1, passed: 1, unreviewable: 2 }));
  assert.match(html, /Reviewed 1\/3/);
  assert.match(html, /2 not reviewable/);
});
check("renderProgressChrome: passed===total but stale>0 is NOT the done state (a dangling orphan ≠ clean)", () => {
  const html = renderProgressChrome(PROG({ total: 2, reviewed: 2, passed: 2, stale: 1 }));
  assert.ok(!/mv-progress-done/.test(html), "stale orphan blocks the all-passed indicator");
  assert.match(html, /Reviewed 2\/2/);
  assert.match(html, /1 stale/);
});
check("renderProgressChrome: nothing to say (total 0, no stale, no unreviewable) → empty string (chrome:empty hides it)", () => {
  assert.equal(renderProgressChrome(PROG({})), "");
});
check("renderProgressChrome: total 0 but stale>0 STILL renders (the orphan count is the only useful signal)", () => {
  const html = renderProgressChrome(PROG({ stale: 3 }));
  assert.notEqual(html, "");
  assert.match(html, /0 reviewable/);
  assert.match(html, /3 stale/);
});
check("renderProgressChrome: total 0 but unreviewable>0 STILL renders (all rows unfrozen/ambiguous → none reviewable)", () => {
  const html = renderProgressChrome(PROG({ unreviewable: 2 }));
  assert.notEqual(html, "");
  assert.match(html, /0 reviewable/);
  assert.match(html, /2 not reviewable/);
});

// ── notes: composeSidecar + reducers + coerce/round-trip ─────────────────────────
const NOTE = (id, text, created = 1700000000000, edited) => (edited !== undefined ? { id, text, created, edited } : { id, text, created });

check("composeSidecar: omits notesByCaseId when empty (verdict-only sidecar stays byte-identical to before)", () => {
  assert.deepEqual(composeSidecar({ c1: "pass" }, {}), { schemaVersion: 2, byCaseId: { c1: "pass" } });
});
check("composeSidecar: includes notesByCaseId when non-empty (both maps married in one object)", () => {
  const notes = { c1: [NOTE("n1", "hi")] };
  assert.deepEqual(composeSidecar({ c1: "pass" }, notes), { schemaVersion: 2, byCaseId: { c1: "pass" }, notesByCaseId: notes });
});

check("addNote: appends to a case thread (creating it if absent); returns a NEW map; input untouched", () => {
  const input = {};
  const out = addNote(input, "c1", NOTE("n1", "first"));
  assert.deepEqual(out, { c1: [NOTE("n1", "first")] });
  assert.deepEqual(input, {}, "input not mutated");
  assert.deepEqual(addNote(out, "c1", NOTE("n2", "second")), { c1: [NOTE("n1", "first"), NOTE("n2", "second")] });
});
check("editNote: replaces text + sets edited; no-op on a missing case or id", () => {
  const m = { c1: [NOTE("n1", "old")] };
  assert.deepEqual(editNote(m, "c1", "n1", "new", 1700000009999), { c1: [NOTE("n1", "new", 1700000000000, 1700000009999)] });
  assert.deepEqual(editNote(m, "c1", "nope", "x", 1), { c1: [NOTE("n1", "old")] }, "missing id → no-op (equivalent map)");
  assert.deepEqual(editNote(m, "cX", "n1", "x", 1), { c1: [NOTE("n1", "old")] }, "missing case → no-op");
  assert.notEqual(editNote(m, "c1", "n1", "new", 1), m, "returns a new object");
});
check("deleteNote: removes the note; empties→DELETE the case key (absence = no notes)", () => {
  assert.deepEqual(deleteNote({ c1: [NOTE("n1", "a"), NOTE("n2", "b")] }, "c1", "n1"), { c1: [NOTE("n2", "b")] });
  assert.deepEqual(deleteNote({ c1: [NOTE("n1", "a")] }, "c1", "n1"), {}, "last note removed → case key dropped");
  assert.deepEqual(deleteNote({ c1: [NOTE("n1", "a")] }, "c1", "nope"), { c1: [NOTE("n1", "a")] }, "missing id → no-op");
});

check("load: a v2 sidecar with notesByCaseId round-trips the threads (coerce carries them through — no drop)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-notes-"));
  try {
    const p = join(root, "s.json");
    const notes = { c1: [NOTE("n1", "hello"), NOTE("n2", "world", 1700000005000, 1700000006000)] };
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: { c1: "pass" }, notesByCaseId: notes }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass" });
    assert.deepEqual(r.sidecar.notesByCaseId, notes, "notes survive load");
    assert.equal(r.warning, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
check("save→load: composeSidecar round-trips BOTH maps (a verdict + notes persist together)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-notes-"));
  try {
    const p = join(root, "medical-validation", "p.json");
    const sc = composeSidecar({ c1: "fail" }, { c1: [NOTE("n1", "why it failed")] });
    saveSidecar(p, sc);
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar, sc, "verdict AND notes both round-trip");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
check("load: malformed notes dropped, valid kept; a bad notesByCaseId container drops notes but KEEPS verdicts", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-notes-"));
  try {
    const p = join(root, "s.json");
    // c1: one valid + one bad (blank text) + one bad (no id) → keep the valid; c2: non-array → dropped; c3: empty array → dropped
    writeFileSync(p, JSON.stringify({
      schemaVersion: 2,
      byCaseId: { c1: "pass" },
      notesByCaseId: {
        c1: [NOTE("n1", "keep"), { id: "n2", text: "   ", created: 1 }, { text: "no id", created: 1 }],
        c2: "not-an-array",
        c3: [],
      },
    }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.notesByCaseId, { c1: [NOTE("n1", "keep")] }, "only the valid note under c1 survives");
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass" }, "verdicts untouched by a partly-bad notes blob");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
check("load: a non-object notesByCaseId (e.g. an array) drops notes entirely, keeps verdicts, no whole-sidecar reject", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-notes-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: { c1: "pass" }, notesByCaseId: ["nope"] }));
    const r = loadSidecar(p);
    assert.equal(r.sidecar.notesByCaseId, undefined, "bad notes container → omitted");
    assert.deepEqual(r.sidecar.byCaseId, { c1: "pass" }, "verdicts survive");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
check("load: STALE/orphan note caseIds are PRESERVED (coerce has no model to prune against; re-frozen case keeps history)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-notes-"));
  try {
    const p = join(root, "s.json");
    const notes = { ghost: [NOTE("n1", "orphaned history")] };
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: {}, notesByCaseId: notes }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.notesByCaseId, notes, "an orphan caseId's notes are not pruned on load");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── #203 Todo 4: the flags-half readout + the mvComplete gate ──────────────────────
const P = (o) => ({ total: 0, reviewed: 0, passed: 0, failed: 0, pending: 0, unreviewable: 0, stale: 0, ...o });

check("mvCasesClean: every case passed, nothing else → true", () => {
  assert.equal(mvCasesClean(P({ total: 3, reviewed: 3, passed: 3 })), true);
});
check("mvCasesClean: total 0 → false (no cases is not 'complete')", () => {
  assert.equal(mvCasesClean(P({ total: 0 })), false);
});
check("mvCasesClean: a pending/failed/stale/unreviewable case → false", () => {
  assert.equal(mvCasesClean(P({ total: 2, passed: 1, pending: 1 })), false);
  assert.equal(mvCasesClean(P({ total: 2, reviewed: 2, passed: 1, failed: 1 })), false);
  assert.equal(mvCasesClean(P({ total: 2, reviewed: 2, passed: 2, stale: 1 })), false);
  assert.equal(mvCasesClean(P({ total: 2, reviewed: 2, passed: 2, unreviewable: 1 })), false);
});

check("mvComplete: cases clean AND no open flags AND no load error → true", () => {
  assert.equal(mvComplete(P({ total: 1, reviewed: 1, passed: 1 }), { open: 0, resolved: 2, error: false }), true);
});
check("mvComplete: an open flag blocks even when cases are clean", () => {
  assert.equal(mvComplete(P({ total: 1, reviewed: 1, passed: 1 }), { open: 1, resolved: 0, error: false }), false);
});
check("mvComplete: a flag LOAD ERROR blocks (unknown state must never silently pass)", () => {
  assert.equal(mvComplete(P({ total: 1, reviewed: 1, passed: 1 }), { open: 0, resolved: 0, error: true }), false);
});
check("mvComplete: cases not clean → false regardless of flags", () => {
  assert.equal(mvComplete(P({ total: 2, passed: 1, pending: 1 }), { open: 0, resolved: 0, error: false }), false);
});

check("renderFlagChrome: open>0 → clickable ⚑ count (singular/plural)", () => {
  const one = renderFlagChrome({ open: 1, resolved: 0, error: false });
  assert.ok(one.includes("data-mv-flags"), "clickable hook");
  assert.ok(one.includes(">⚑ 1 open flag<"), "singular label");
  assert.ok(renderFlagChrome({ open: 3, resolved: 0, error: false }).includes(">⚑ 3 open flags<"), "plural label");
});
check("renderFlagChrome: open 0 with resolved → ✓ flags clear (clickable)", () => {
  const c = renderFlagChrome({ open: 0, resolved: 2, error: false });
  assert.ok(c.includes("✓ flags clear") && c.includes("data-mv-flags"));
});
check("renderFlagChrome: no flags at all → '' (nothing to say)", () => {
  assert.equal(renderFlagChrome({ open: 0, resolved: 0, error: false }), "");
});
check("renderFlagChrome: a load error → ⚠ flags unreadable (still clickable)", () => {
  const e = renderFlagChrome({ open: 0, resolved: 0, error: true });
  assert.ok(e.includes("⚠ flags unreadable") && e.includes("data-mv-flags"));
});


// ── #224 ii.3 Slice 2b: model-level CRITERION verdicts ──────────────────────────────
const KEY = criterionVerdictKey("Lib", "Meets TAR");
const live = (bodyHash, elided = false) => ({ bodyHash, elided });

check("criterionVerdictKey: JSON([lib,name]) — collision-proof identity", () => {
  assert.equal(criterionVerdictKey("Lib", "Meets TAR"), '["Lib","Meets TAR"]');
  assert.notEqual(criterionVerdictKey("A B", "C"), criterionVerdictKey("A", "B C")); // space-join would collide
});

check("setCriterionVerdict: set stores {state,bodyHash}; unreviewed DELETES; returns a NEW map", () => {
  const m0 = {};
  const m1 = setCriterionVerdict(m0, KEY, "pass", "sha256:abc");
  assert.deepEqual(m1, { [KEY]: { state: "pass", bodyHash: "sha256:abc" } });
  assert.deepEqual(m0, {}, "input map is not mutated");
  const m2 = setCriterionVerdict(m1, KEY, "unreviewed", "sha256:abc");
  assert.deepEqual(m2, {}, "unreviewed deletes the entry (absence = To do)");
});

check("criterionVerdictState: unreviewed / fresh passthrough / STALE on hash-change / STALE on elided", () => {
  assert.equal(criterionVerdictState(undefined, live("h1")), "unreviewed");
  assert.equal(criterionVerdictState({ state: "pass", bodyHash: "h1" }, live("h1")), "pass");
  assert.equal(criterionVerdictState({ state: "fail", bodyHash: "h1" }, live("h1")), "fail");
  assert.equal(criterionVerdictState({ state: "pending", bodyHash: "h1" }, live("h1")), "pending");
  assert.equal(criterionVerdictState({ state: "pass", bodyHash: "h1" }, live("h2")), "stale", "body edited → stale");
  assert.equal(criterionVerdictState({ state: "pass", bodyHash: "h1" }, live("h1", true)), "stale", "elided body → never trusted");
});

check("criterionProgress: tallies over LIVE identities (deduped by key); a stale pass is NOT passed", () => {
  const ids = new Map([
    [criterionVerdictKey("L", "A"), live("ha")], // pass fresh
    [criterionVerdictKey("L", "B"), live("hb")], // pass STALE (stored hb-old)
    [criterionVerdictKey("L", "C"), live("hc")], // fail
    [criterionVerdictKey("L", "D"), live("hd")], // unreviewed
  ]);
  const map = {
    [criterionVerdictKey("L", "A")]: { state: "pass", bodyHash: "ha" },
    [criterionVerdictKey("L", "B")]: { state: "pass", bodyHash: "hb-old" },
    [criterionVerdictKey("L", "C")]: { state: "fail", bodyHash: "hc" },
  };
  assert.deepEqual(criterionProgress(ids, map), { total: 4, passed: 1, failed: 1, pending: 0, stale: 1, unreviewed: 1, truncated: 0 });
});

check("#233 Todo 2b criterionProgress: an ELIDED-canonical identity is tallied as `truncated` (un-passable) + its verdict-state (unreviewed OR stale); the chrome names it 'cannot complete'", () => {
  const ids = new Map([
    [criterionVerdictKey("L", "A"), live("ha")], // normal, unreviewed
    [criterionVerdictKey("L", "T"), live("ht", true)], // ELIDED canonical body → un-passable
  ]);
  // A stored "pass" on the elided one reads STALE (never passed); it also counts as `truncated`.
  const map = { [criterionVerdictKey("L", "T")]: { state: "pass", bodyHash: "ht" } };
  assert.deepEqual(criterionProgress(ids, map), { total: 2, passed: 0, failed: 0, pending: 0, stale: 1, unreviewed: 1, truncated: 1 });
  // The chrome NAMES the blocker so the gate's by-design livelock is legible, not an undifferentiated N/M.
  const s = renderCriterionChrome({ total: 2, passed: 0, failed: 0, pending: 0, stale: 1, unreviewed: 1, truncated: 1 });
  assert.match(s, /1 truncated — cannot complete/);
  // `mvCriteriaClean` still gates on passed===total (a truncated criterion is never passed → blocks), no change needed.
  assert.equal(mvCriteriaClean({ total: 2, passed: 1, failed: 0, pending: 0, stale: 0, unreviewed: 1, truncated: 1 }), false);
});

check("criterionProgress: a stored verdict whose identity is NOT live (compound-only / renamed criterion) is NOT tallied — total = identities.size (disc 320 review [important] 2 boundary)", () => {
  const ids = new Map([[criterionVerdictKey("L", "A"), live("ha")]]); // only ONE live single-ref identity
  const map = {
    [criterionVerdictKey("L", "A")]: { state: "pass", bodyHash: "ha" },
    [criterionVerdictKey("L", "Ghost")]: { state: "pass", bodyHash: "hg" }, // an orphan (renamed, or a compound-only criterion never rendered as sole)
  };
  // The orphan neither adds to `total` nor sneaks a pass in — the gate is over LIVE single-ref identities only.
  assert.deepEqual(criterionProgress(ids, map), { total: 1, passed: 1, failed: 0, pending: 0, stale: 0, unreviewed: 0, truncated: 0 });
});

check("mvCriteriaClean + mvComplete gate: all-fresh-pass clean; a stale/fail/unreviewed criterion BLOCKS", () => {
  const cleanP = { total: 1, reviewed: 1, passed: 1, failed: 0, pending: 0, unreviewable: 0, stale: 0 };
  const cleanF = { open: 0, resolved: 0, error: false };
  assert.equal(mvCriteriaClean({ total: 0, passed: 0, failed: 0, pending: 0, stale: 0, unreviewed: 0 }), true, "no criteria → clean");
  assert.equal(mvCriteriaClean({ total: 2, passed: 2, failed: 0, pending: 0, stale: 0, unreviewed: 0 }), true);
  assert.equal(mvCriteriaClean({ total: 2, passed: 1, failed: 0, pending: 0, stale: 1, unreviewed: 0 }), false, "a stale criterion blocks");
  // the gate ANDs the criteria half
  assert.equal(mvComplete(cleanP, cleanF, { total: 1, passed: 1, failed: 0, pending: 0, stale: 0, unreviewed: 0 }), true);
  assert.equal(mvComplete(cleanP, cleanF, { total: 1, passed: 0, failed: 0, pending: 0, stale: 0, unreviewed: 1 }), false, "an unreviewed criterion blocks MV complete");
  assert.equal(mvComplete(cleanP, cleanF), true, "cp omitted (back-compat) → criteria half is clean");
});

check("renderCriterionChrome: none → ''; all-fresh-pass → ✓ criteria reviewed; else Criteria N/M + tallies", () => {
  assert.equal(renderCriterionChrome({ total: 0, passed: 0, failed: 0, pending: 0, stale: 0, unreviewed: 0 }), "");
  assert.match(renderCriterionChrome({ total: 3, passed: 3, failed: 0, pending: 0, stale: 0, unreviewed: 0 }), /✓ criteria reviewed/);
  const s = renderCriterionChrome({ total: 4, passed: 1, failed: 1, pending: 1, stale: 1, unreviewed: 0 });
  assert.match(s, /Criteria 1\/4/);
  assert.match(s, /1 encoding wrong/);
  assert.match(s, /1 undecided/);
  assert.match(s, /1 stale/);
});

check("sidecar round-trip: criterionVerdictsByKey composes, loads, and a v2 sidecar WITHOUT the field loads clean", () => {
  const { root, celPath } = makePolicySrc("crit-policy");
  try {
    const p = medicalValidationSidecarPath(celPath);
    const verdicts = { [KEY]: { state: "pass", bodyHash: "sha256:deadbeef" } };
    saveSidecar(p, composeSidecar({ c1: "pass" }, {}, verdicts));
    const back = loadSidecar(p).sidecar;
    assert.deepEqual(back.criterionVerdictsByKey, verdicts, "verdicts round-trip");
    assert.deepEqual(back.byCaseId, { c1: "pass" }, "cases still present");
    // a pre-2b v2 sidecar (no criterionVerdictsByKey) loads with the field simply absent — additive, no bump, no warning
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: { c2: "fail" } }));
    const older = loadSidecar(p);
    assert.equal(older.warning, undefined, "no warning — additive field, still schemaVersion 2");
    assert.equal(older.sidecar.criterionVerdictsByKey, undefined, "absent field → undefined (tolerated)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("coerceCriterionVerdicts (via load): drops entries with a bad state or a missing bodyHash; keeps valid ones", () => {
  const { root, celPath } = makePolicySrc("crit-coerce");
  try {
    const p = medicalValidationSidecarPath(celPath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({
      schemaVersion: 2, byCaseId: {},
      criterionVerdictsByKey: {
        good: { state: "pass", bodyHash: "h1" },
        badState: { state: "approved", bodyHash: "h2" }, // unknown state → dropped
        noHash: { state: "fail" }, // no bodyHash → dropped (un-invalidatable attestation)
        emptyHash: { state: "fail", bodyHash: "" }, // empty bodyHash → dropped
      },
    }));
    const back = loadSidecar(p).sidecar;
    assert.deepEqual(back.criterionVerdictsByKey, { good: { state: "pass", bodyHash: "h1" } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Bulk verdict buy-off (the pure model — disc 344) ─────────────────────────────────────────────────────────────────
const gc = (lib, name, bodyHash, elided = false) => ({ key: criterionVerdictKey(lib, name), lib, name, bodyHash, elided });
const cv = (state, bodyHash) => ({ state, bodyHash });

check("unsettledReviewItems: excludes settled pass/fail; includes unreviewed/pending/stale criteria + cases + orphans, in order", () => {
  const criteria = [
    gc("L", "Unrev", "h"), // no stored verdict → unreviewed
    gc("L", "Pass", "h"), // fresh pass → EXCLUDED
    gc("L", "Fail", "h"), // fail → EXCLUDED
    gc("L", "Pend", "h"), // pending
    gc("L", "Stale", "hNew"), // stored pass on hOld → stale
    gc("L", "Elided", "h", true), // elided → stale (un-passable)
  ];
  const criterionVerdicts = {
    [criterionVerdictKey("L", "Pass")]: cv("pass", "h"),
    [criterionVerdictKey("L", "Fail")]: cv("fail", "h"),
    [criterionVerdictKey("L", "Pend")]: cv("pending", "h"),
    [criterionVerdictKey("L", "Stale")]: cv("pass", "hOld"),
    [criterionVerdictKey("L", "Elided")]: cv("pass", "h"),
  };
  const items = unsettledReviewItems({
    criteria,
    criterionVerdicts,
    liveCaseIds: ["cA", "cB", "cC"],
    reviewByCaseId: { cB: "pass", cC: "pending", orphanX: "fail" },
    caseLabel: (id) => `case:${id}`,
  });
  assert.deepEqual(
    items.map((i) => (i.kind === "criterion" ? `crit:${i.name}:${i.currentState}:${i.passable}` : `case:${i.id}:${i.currentState}:${i.live}`)),
    [
      "crit:Unrev:unreviewed:true",
      "crit:Pend:pending:true",
      "crit:Stale:stale:true",
      "crit:Elided:stale:false", // elided → not passable
      "case:cA:unreviewed:true", // cA has no stored verdict
      "case:cC:pending:true", // cB is a fresh pass → excluded
      "case:orphanX:fail:false", // orphan (not a live case) → clear-only
    ],
  );
  const critUnrev = items.find((i) => i.kind === "criterion" && i.name === "Unrev");
  assert.equal(critUnrev.expectedBodyHash, "h"); // the concurrency snapshot
  assert.equal(critUnrev.id, criterionVerdictKey("L", "Unrev"));
});

check("computeCriterionVerdictUpdate: body-hash mismatch refuses ALL verdicts (not just pass)", () => {
  for (const v of ["pass", "fail", "pending", "unreviewed"]) {
    const r = computeCriterionVerdictUpdate({}, "k", v, "hOld", { bodyHash: "hNew", elided: false }, false);
    assert.deepEqual(r, { ok: false, reason: "body-changed" }, v);
  }
});

check("computeCriterionVerdictUpdate: refusePassElided refuses PASS only; fail/pending/clear apply", () => {
  assert.deepEqual(computeCriterionVerdictUpdate({}, "k", "pass", "h", { bodyHash: "h", elided: true }, true), { ok: false, reason: "elided" });
  const okFail = computeCriterionVerdictUpdate({}, "k", "fail", "h", { bodyHash: "h", elided: true }, true);
  assert.equal(okFail.ok, true);
  assert.deepEqual(okFail.map, { k: { state: "fail", bodyHash: "h" } });
});

check("computeCriterionVerdictUpdate: not-live when live is undefined; changed accounting + purity", () => {
  assert.deepEqual(computeCriterionVerdictUpdate({}, "k", "pass", "h", undefined, false), { ok: false, reason: "not-live" });
  // no-op: same state + hash already stored
  const map0 = { k: { state: "pass", bodyHash: "h" } };
  const noop = computeCriterionVerdictUpdate(map0, "k", "pass", "h", { bodyHash: "h", elided: false }, false);
  assert.equal(noop.ok && noop.changed, false);
  assert.notEqual(noop.map, map0); // returns a NEW map (pure), input untouched
  assert.deepEqual(map0, { k: { state: "pass", bodyHash: "h" } });
  // changed: re-stamping a stale pass (old hash) to the live hash
  const stalePass = computeCriterionVerdictUpdate({ k: { state: "pass", bodyHash: "hOld" } }, "k", "pass", "h", { bodyHash: "h", elided: false }, false);
  assert.equal(stalePass.ok && stalePass.changed, true);
  // clear on an absent entry = no-op; clear on a present entry = changed + deletes
  assert.equal(computeCriterionVerdictUpdate({}, "k", "unreviewed", "h", { bodyHash: "h", elided: false }, false).changed, false);
  const cleared = computeCriterionVerdictUpdate({ k: { state: "pass", bodyHash: "h" } }, "k", "unreviewed", "h", { bodyHash: "h", elided: false }, false);
  assert.equal(cleared.ok && cleared.changed, true);
  assert.deepEqual(cleared.map, {});
});

check("applyBulkVerdict: applies to selected criteria + cases in one result; changed counts real moves; input maps untouched", () => {
  const key = (n) => criterionVerdictKey("L", n);
  const criterionVerdicts = { [key("Prev")]: cv("pending", "h") };
  const reviewByCaseId = { c2: "pending" };
  const selected = [
    { kind: "criterion", id: key("A"), lib: "L", name: "A", label: "A", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "criterion", id: key("Prev"), lib: "L", name: "Prev", label: "Prev", currentState: "pending", expectedBodyHash: "h", passable: true },
    { kind: "case", id: "c1", label: "c1", currentState: "unreviewed", live: true },
    { kind: "case", id: "c2", label: "c2", currentState: "pending", live: true }, // pending → pass: MOVES
  ];
  const r = applyBulkVerdict(selected, "pass", {
    criterionVerdicts,
    reviewByCaseId,
    liveCriteria: new Map([[key("A"), { bodyHash: "h", elided: false }], [key("Prev"), { bodyHash: "h", elided: false }]]),
    liveCaseIds: new Set(["c1", "c2"]),
  });
  assert.equal(r.applied.length, 4); // all eligible processed
  assert.equal(r.skipped.length, 0);
  assert.equal(r.changed, 4); // A, Prev, c1, c2 all moved to pass
  assert.equal(r.criterionVerdicts[key("A")].state, "pass");
  assert.equal(r.reviewByCaseId.c1, "pass");
  // purity: inputs untouched
  assert.deepEqual(criterionVerdicts, { [key("Prev")]: cv("pending", "h") });
  assert.deepEqual(reviewByCaseId, { c2: "pending" });
});

check("applyBulkVerdict: skips body-changed / removed criterion / currently-elided pass; a non-live case verdict skips but CLEAR removes the orphan", () => {
  const key = (n) => criterionVerdictKey("L", n);
  const selected = [
    { kind: "criterion", id: key("Moved"), lib: "L", name: "Moved", label: "Moved", currentState: "unreviewed", expectedBodyHash: "hOld", passable: true },
    { kind: "criterion", id: key("Gone"), lib: "L", name: "Gone", label: "Gone", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "criterion", id: key("Elided"), lib: "L", name: "Elided", label: "Elided", currentState: "stale", expectedBodyHash: "h", passable: false },
    { kind: "case", id: "orphan", label: "orphan", currentState: "fail", live: false },
  ];
  const ctx = {
    criterionVerdicts: {},
    reviewByCaseId: { orphan: "fail" },
    liveCriteria: new Map([[key("Moved"), { bodyHash: "hNew", elided: false }], [key("Elided"), { bodyHash: "h", elided: true }]]), // "Gone" absent
    liveCaseIds: new Set(["live1"]), // "orphan" not live
  };
  const nameOf = (id) => (id.includes("Moved") ? "Moved" : id.includes("Gone") ? "Gone" : id.includes("Elided") ? "Elided" : id);
  const pass = applyBulkVerdict(selected, "pass", ctx);
  assert.deepEqual(
    pass.skipped.map((s) => `${nameOf(s.ref.id)}:${s.reason}`).sort(),
    ["Elided:elided", "Gone:not-live", "Moved:body-changed", "orphan:not-live"].sort(),
  );
  assert.equal(pass.applied.length, 0);
  // but CLEAR removes the orphan (unblocks the gate) even though the case is not live
  const clear = applyBulkVerdict([{ kind: "case", id: "orphan", label: "orphan", currentState: "fail", live: false }], "unreviewed", ctx);
  assert.deepEqual(clear.applied, [{ kind: "case", id: "orphan" }]);
  assert.deepEqual(clear.reviewByCaseId, {}); // orphan cleared
});

check("applyBulkVerdict: dedups by (kind,id); a criterion and a case sharing a textual id are BOTH applied", () => {
  const shared = "sameId";
  const selected = [
    { kind: "criterion", id: shared, lib: "L", name: "X", label: "X", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "criterion", id: shared, lib: "L", name: "X", label: "X", currentState: "unreviewed", expectedBodyHash: "h", passable: true }, // dup
    { kind: "case", id: shared, label: "c", currentState: "unreviewed", live: true },
  ];
  const r = applyBulkVerdict(selected, "fail", {
    criterionVerdicts: {},
    reviewByCaseId: {},
    liveCriteria: new Map([[shared, { bodyHash: "h", elided: false }]]),
    liveCaseIds: new Set([shared]),
  });
  assert.deepEqual(r.applied, [{ kind: "criterion", id: shared }, { kind: "case", id: shared }]); // dup dropped; both kinds kept
  assert.equal(r.criterionVerdicts[shared].state, "fail");
  assert.equal(r.reviewByCaseId[shared], "fail");
});

// ── #(bulk-verdict) round-2 gap tests (disc 344 matrix + impl panel) ────────────────────────────────────────────────
check("unsettledReviewItems: a LIVE fail case is excluded (settled); an elided criterion with NO stored verdict is unreviewed + not-passable; orphan pass/pending included", () => {
  const items = unsettledReviewItems({
    criteria: [gc("L", "ElidedNew", "h", true)], // elided, NO stored verdict → unreviewed (the !stored check precedes elided) + passable:false
    criterionVerdicts: {},
    liveCaseIds: ["live"],
    reviewByCaseId: { live: "fail", orphA: "pass", orphB: "pending" }, // live fail → excluded; both orphans → included
    caseLabel: (id) => id,
  });
  assert.deepEqual(
    items.map((i) => (i.kind === "criterion" ? `${i.name}:${i.currentState}:${i.passable}` : `${i.id}:${i.currentState}:${i.live}`)),
    ["ElidedNew:unreviewed:false", "orphA:pass:false", "orphB:pending:false"],
  );
});

check("unsettledReviewItems: a duplicated liveCaseId yields ONE row (deduped by the live set)", () => {
  const items = unsettledReviewItems({ criteria: [], criterionVerdicts: {}, liveCaseIds: ["c", "c", "c"], reviewByCaseId: {}, caseLabel: (id) => id });
  assert.equal(items.filter((i) => i.id === "c").length, 1);
});

check("computeCriterionVerdictUpdate: pending + clear also apply through an elided body (only PASS is refused)", () => {
  const pend = computeCriterionVerdictUpdate({}, "k", "pending", "h", { bodyHash: "h", elided: true }, true);
  assert.equal(pend.ok && pend.map.k.state, "pending");
  const clr = computeCriterionVerdictUpdate({ k: { state: "fail", bodyHash: "h" } }, "k", "unreviewed", "h", { bodyHash: "h", elided: true }, true);
  assert.deepEqual(clr.ok && clr.map, {});
});

check("applyBulkVerdict: current-elision MOVED since enumeration — an item enumerated passable now refuses a PASS at apply", () => {
  const key = criterionVerdictKey("L", "WasFine");
  const selected = [{ kind: "criterion", id: key, lib: "L", name: "WasFine", label: "WasFine", currentState: "unreviewed", expectedBodyHash: "h", passable: true }];
  const r = applyBulkVerdict(selected, "pass", {
    criterionVerdicts: {},
    reviewByCaseId: {},
    liveCriteria: new Map([[key, { bodyHash: "h", elided: true }]]), // became elided since the list opened (same hash)
    liveCaseIds: new Set(),
  });
  assert.deepEqual(r.skipped, [{ ref: { kind: "criterion", id: key }, reason: "elided" }]); // apply-time elision honored, not the snapshot
  assert.equal(r.applied.length, 0);
});

check("applyBulkVerdict: a case enumerated LIVE that vanished before apply is skipped not-live (a verdict); a MIXED batch applies the rest", () => {
  const key = criterionVerdictKey("L", "OK");
  const selected = [
    { kind: "criterion", id: key, lib: "L", name: "OK", label: "OK", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "case", id: "gone", label: "gone", currentState: "unreviewed", live: true }, // was live at enum, absent at apply
    { kind: "case", id: "here", label: "here", currentState: "pending", live: true },
  ];
  const r = applyBulkVerdict(selected, "pass", {
    criterionVerdicts: {},
    reviewByCaseId: { here: "pending" },
    liveCriteria: new Map([[key, { bodyHash: "h", elided: false }]]),
    liveCaseIds: new Set(["here"]), // "gone" no longer live
  });
  assert.deepEqual(r.skipped, [{ ref: { kind: "case", id: "gone" }, reason: "not-live" }]);
  assert.deepEqual(r.applied.map((a) => a.id).sort(), [key, "here"].sort());
  assert.equal(r.criterionVerdicts[key].state, "pass");
  assert.equal(r.reviewByCaseId.here, "pass");
  assert.equal(r.reviewByCaseId.gone, undefined); // NOT minted
  assert.equal(r.changed, 2);
});

check("applyBulkVerdict: a case re-applied its stored verdict is applied but changed=false (host messages from changed)", () => {
  const r = applyBulkVerdict([{ kind: "case", id: "c", label: "c", currentState: "pass", live: true }], "pass", {
    criterionVerdicts: {},
    reviewByCaseId: { c: "pass" },
    liveCriteria: new Map(),
    liveCaseIds: new Set(["c"]),
  });
  assert.deepEqual(r.applied, [{ kind: "case", id: "c" }]);
  assert.equal(r.changed, 0);
});

check("COMPOSITION: enumerate → select-all → applyBulkVerdict('pass') → re-enumerate: passable items are bought off; an elided criterion + an orphan case REMAIN", () => {
  const criteria = [gc("L", "A", "h"), gc("L", "B", "h"), gc("L", "Elided", "h", true)];
  const liveCriteria = new Map(criteria.map((c) => [c.key, { bodyHash: c.bodyHash, elided: c.elided }]));
  const criterionVerdicts0 = {};
  const reviewByCaseId0 = { orphan: "pass" }; // an orphan (not in liveCaseIds)
  const liveCaseIds = ["case1"];
  const enumArgs = (cv, rc) => ({ criteria, criterionVerdicts: cv, liveCaseIds, reviewByCaseId: rc, caseLabel: (id) => id });

  const items1 = unsettledReviewItems(enumArgs(criterionVerdicts0, reviewByCaseId0));
  // unsettled: A, B, Elided (criteria) + case1 (unreviewed) + orphan
  assert.equal(items1.length, 5);

  const r = applyBulkVerdict(items1, "pass", { criterionVerdicts: criterionVerdicts0, reviewByCaseId: reviewByCaseId0, liveCriteria, liveCaseIds: new Set(liveCaseIds) });
  // A, B, case1 pass (3 applied+changed); Elided skipped (elided); orphan skipped (not-live for a pass)
  assert.equal(r.changed, 3);
  assert.deepEqual(r.skipped.map((s) => s.reason).sort(), ["elided", "not-live"]);

  const items2 = unsettledReviewItems(enumArgs(r.criterionVerdicts, r.reviewByCaseId));
  // ONLY the un-buy-offable remain: the elided criterion (still stale) + the orphan (still there)
  assert.deepEqual(
    items2.map((i) => (i.kind === "criterion" ? `crit:${i.name}` : `case:${i.id}`)).sort(),
    ["case:orphan", "crit:Elided"],
  );
  // and CLEARING the orphan removes it from the queue next time
  const r2 = applyBulkVerdict([items2.find((i) => i.kind === "case")], "unreviewed", { criterionVerdicts: r.criterionVerdicts, reviewByCaseId: r.reviewByCaseId, liveCriteria, liveCaseIds: new Set(liveCaseIds) });
  const items3 = unsettledReviewItems(enumArgs(r.criterionVerdicts, r2.reviewByCaseId));
  assert.deepEqual(items3.map((i) => i.kind === "criterion" ? i.name : i.id), ["Elided"]); // only the elided criterion (un-passable by design) remains
});

// ── Bulk verdict GRID — the pure seam (Todo 2a, disc 347): reviewGridViewModel + applyGridAssignments ────────────────
check("reviewGridViewModel: passable criterion → all 4; elided criterion → Pass disabled + hint; live case → all 4; orphan → clear-only + '(orphaned)' chip", () => {
  const kA = criterionVerdictKey("L", "A");
  const kT = criterionVerdictKey("L", "T");
  const items = [
    { kind: "criterion", id: kA, lib: "L", name: "A", label: "A", currentState: "stale", expectedBodyHash: "h", passable: true },
    { kind: "criterion", id: kT, lib: "L", name: "T", label: "T", currentState: "unreviewed", expectedBodyHash: "ht", passable: false },
    { kind: "case", id: "c1", label: "Case 1", currentState: "pending", live: true },
    { kind: "case", id: "orph", label: "orph", currentState: "pass", live: false },
  ];
  const rows = reviewGridViewModel(items);
  // passable criterion → all four, lib carried, Stale chip, NO hint key; a STALE current isn't a pickable column → current:null
  assert.deepEqual(rows[0], { kind: "criterion", id: kA, label: "A", lib: "L", currentLabel: "Stale", enabled: { unreviewed: true, pending: true, pass: true, fail: true }, current: null });
  // elided criterion → Pass column disabled + hint (the ONE cell the model refuses); current (unreviewed) is enabled → pre-selected
  assert.deepEqual(rows[1].enabled, { unreviewed: true, pending: true, pass: false, fail: true });
  assert.equal(rows[1].hint, "truncated — can't mark Pass");
  assert.equal(rows[1].current, "unreviewed");
  // live case → all four, no hint; current (pending) is enabled → pre-selected
  assert.deepEqual(rows[2], { kind: "case", id: "c1", label: "Case 1", currentLabel: "Pending", enabled: { unreviewed: true, pending: true, pass: true, fail: true }, current: "pending" });
  // orphan case → clear-only, "(orphaned)" chip, hint; current (pass) is DISABLED for an orphan → current:null (opens blank)
  assert.deepEqual(rows[3].enabled, { unreviewed: true, pending: false, pass: false, fail: false });
  assert.equal(rows[3].currentLabel, "Pass (orphaned)");
  assert.match(rows[3].hint, /orphaned/);
  assert.equal(rows[3].current, null);
});

check("applyGridAssignments: resolves to captured items + groups by state + threads maps — Pass some rows, Fail others, in one apply", () => {
  const kA = criterionVerdictKey("L", "A"), kB = criterionVerdictKey("L", "B");
  const items = [
    { kind: "criterion", id: kA, lib: "L", name: "A", label: "A", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "criterion", id: kB, lib: "L", name: "B", label: "B", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "case", id: "c1", label: "c1", currentState: "unreviewed", live: true },
  ];
  const ctx = {
    criterionVerdicts: {}, reviewByCaseId: {},
    liveCriteria: new Map([[kA, { bodyHash: "h", elided: false }], [kB, { bodyHash: "h", elided: false }]]),
    liveCaseIds: new Set(["c1"]),
  };
  const r = applyGridAssignments([
    { kind: "criterion", id: kA, state: "pass" },
    { kind: "criterion", id: kB, state: "fail" },
    { kind: "case", id: "c1", state: "pending" },
  ], items, ctx);
  assert.equal(r.criterionVerdicts[kA].state, "pass");
  assert.equal(r.criterionVerdicts[kB].state, "fail");
  assert.equal(r.reviewByCaseId.c1, "pending");
  assert.equal(r.changed, 3);
  assert.equal(r.skipped.length, 0);
});

check("applyGridAssignments: drops unknown/kind-mismatch/invalid-state + dedups (kind,id) across the WHOLE array before grouping (first wins, changed never double-counts)", () => {
  const kA = criterionVerdictKey("L", "A");
  const items = [
    { kind: "criterion", id: kA, lib: "L", name: "A", label: "A", currentState: "unreviewed", expectedBodyHash: "h", passable: true },
    { kind: "case", id: "c1", label: "c1", currentState: "unreviewed", live: true },
  ];
  const ctx = {
    criterionVerdicts: {}, reviewByCaseId: {},
    liveCriteria: new Map([[kA, { bodyHash: "h", elided: false }]]),
    liveCaseIds: new Set(["c1"]),
  };
  const r = applyGridAssignments([
    { kind: "criterion", id: kA, state: "pass" },   // wins
    { kind: "criterion", id: kA, state: "fail" },   // DUP across state-group → dropped
    { kind: "criterion", id: "nope", state: "pass" }, // unknown id → dropped
    { kind: "case", id: kA, state: "pass" },        // kind mismatch (kA is a criterion id) → dropped
    { kind: "criterion", id: kA, state: "bogus" },  // invalid state → dropped (doesn't consume the dedup slot)
    { kind: "widget", id: "c1", state: "pass" },    // invalid kind → dropped
  ], items, ctx);
  assert.equal(r.criterionVerdicts[kA].state, "pass"); // FIRST assignment won, not the later fail
  assert.equal(r.changed, 1);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.applied, [{ kind: "criterion", id: kA }]);
});

check("applyGridAssignments: uses the CAPTURED expectedBodyHash — a moved body → body-changed skip (the webview supplies no hash)", () => {
  const kA = criterionVerdictKey("L", "A");
  const items = [{ kind: "criterion", id: kA, lib: "L", name: "A", label: "A", currentState: "unreviewed", expectedBodyHash: "hOld", passable: true }];
  const r = applyGridAssignments([{ kind: "criterion", id: kA, state: "pass" }], items, {
    criterionVerdicts: {}, reviewByCaseId: {},
    liveCriteria: new Map([[kA, { bodyHash: "hNew", elided: false }]]), liveCaseIds: new Set(),
  });
  assert.deepEqual(r.skipped, [{ ref: { kind: "criterion", id: kA }, reason: "body-changed" }]);
  assert.equal(r.changed, 0);
  assert.equal(Object.keys(r.criterionVerdicts).length, 0);
});

check("setAllReviewState: sets the same verdict on many cases in one map; skips already-there; changed counts real movement", () => {
  const before = { c2: "fail", c3: "pass" };
  const { map, changed } = setAllReviewState(before, ["c1", "c2", "c3"], "pass");
  assert.equal(changed, 2); // c1 (unreviewed→pass) + c2 (fail→pass); c3 already pass → skipped
  assert.deepEqual(map, { c1: "pass", c2: "pass", c3: "pass" });
  assert.deepEqual(before, { c2: "fail", c3: "pass" }, "input not mutated");
});

check("setAllReviewState: a wholly-redundant call is a no-op — changed 0 AND the SAME map ref (caller can skip persist)", () => {
  const before = { c1: "pass", c2: "pass" };
  const r = setAllReviewState(before, ["c1", "c2"], "pass");
  assert.equal(r.changed, 0);
  assert.equal(r.map, before); // same ref → persistMv/mvRevision correctly untouched
});

check("setAllReviewState: empty caseIds → no-op same ref", () => {
  const before = { c1: "fail" };
  const r = setAllReviewState(before, [], "pass");
  assert.equal(r.changed, 0);
  assert.equal(r.map, before);
});

check("setAllReviewState: a DUPLICATE caseId counts as ONE change (compares the evolving map, not the input)", () => {
  const before = {};
  const r = setAllReviewState(before, ["a", "a", "a"], "pass");
  assert.equal(r.changed, 1); // not 3 — the 2nd/3rd see the already-set evolving map
  assert.deepEqual(r.map, { a: "pass" });
  assert.deepEqual(before, {}, "input not mutated");
});

check("applyGridAssignments: empty assignments → no-op (changed 0, maps returned untouched)", () => {
  const before = { [criterionVerdictKey("L", "A")]: { state: "pass", bodyHash: "h" } };
  const r = applyGridAssignments([], [], { criterionVerdicts: before, reviewByCaseId: {}, liveCriteria: new Map(), liveCaseIds: new Set() });
  assert.equal(r.changed, 0);
  assert.equal(r.criterionVerdicts, before); // same ref — nothing threaded
});

check("applyGridAssignments: owns the whole untrusted boundary — a non-array payload / null / primitive entries are DROPPED, never thrown on", () => {
  const kA = criterionVerdictKey("L", "A");
  const items = [{ kind: "criterion", id: kA, lib: "L", name: "A", label: "A", currentState: "unreviewed", expectedBodyHash: "h", passable: true }];
  const ctx = { criterionVerdicts: {}, reviewByCaseId: {}, liveCriteria: new Map([[kA, { bodyHash: "h", elided: false }]]), liveCaseIds: new Set() };
  for (const bad of [undefined, null, "x", 5, {}, { assignments: [] }]) {
    const r = applyGridAssignments(bad, items, ctx); // a non-array payload → dropped wholesale
    assert.equal(r.changed, 0, `payload ${JSON.stringify(bad)}`);
  }
  // an array whose ENTRIES are null / primitive / missing-field: each entry dropped, the one valid entry still applies
  const r = applyGridAssignments([null, 5, "x", {}, { kind: "criterion" }, { kind: "criterion", id: kA, state: "pass" }], items, ctx);
  assert.equal(r.criterionVerdicts[kA].state, "pass");
  assert.equal(r.changed, 1);
  assert.equal(r.skipped.length, 0);
});
