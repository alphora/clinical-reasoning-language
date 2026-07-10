// Unit tests for the Medical Validation persistence + derivation CORE (#156 slice 2): medicalValidationSidecarPath,
// load/saveSidecar, deriveReviewOverlay, nextReviewState. vscode-free, so — like provenanceFindings.test.mjs — esbuild
// bundles the TS to CJS and we import it under node. Design authority: .vibe-tools/discussions/161-...
import assert from "node:assert/strict";
import { load } from "./test-harness.mjs";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const { medicalValidationSidecarPath, loadSidecar, saveSidecar, deriveReviewOverlay, buildReviewPerCase, isReviewState, setReviewState, REVIEW_STATES, reviewProgress, renderProgressChrome, composeSidecar, addNote, editNote, deleteNote } =
  await load("medicalValidationStore.ts");

let pass = 0;
const check = (label, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ok  ${label}`);
  } catch (e) {
    console.error(`FAIL  ${label}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

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
// Each reviewed case lights its fired-path nodes with its VERDICT color: pass→green, fail→red, pending→grey; a node lit by
// several cases resolves to ONE color (grey always loses; green-vs-red flips on isLeaf — interior green wins, leaf red wins).
// error (⊆ green — a pass verdict whose RUN errored) is UNCHANGED from the prior slice.
const M = (entries) => new Map(entries);
const noLeaf = () => false; // default: every node is INTERIOR (green-wins)
const leafIs = (...keys) => (k) => keys.includes(k);

check("fold: a PASS-verdict case → its lit rows in green (run status pass → not in error)", () => {
  const { green, red, grey, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "pass", litNodeKeys: ["n1", "n2"] }]]),
    noLeaf,
  );
  assert.deepEqual([...green].sort(), ["n1", "n2"]);
  assert.equal(red.size, 0);
  assert.equal(grey.size, 0);
  assert.equal(error.size, 0);
});

check("fold: a FAIL-verdict case → its lit rows in red (#210: fail now paints red)", () => {
  const { green, red, grey } = deriveReviewOverlay(
    { c1: "fail" },
    M([["c1", { status: "pass", litNodeKeys: ["n1", "n2"] }]]), // a run-PASS case with a human FAIL verdict paints RED
    noLeaf,
  );
  assert.equal(green.size, 0, "fail verdict does not paint green");
  assert.deepEqual([...red].sort(), ["n1", "n2"], "fail paints red");
  assert.equal(grey.size, 0);
});

check("fold: a PENDING-verdict case → its lit rows in grey (#210: pending now paints grey)", () => {
  const { green, red, grey } = deriveReviewOverlay(
    { c1: "pending" },
    M([["c1", { status: "pass", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.equal(green.size, 0);
  assert.equal(red.size, 0);
  assert.deepEqual([...grey], ["n1"], "pending paints grey");
});

check("fold: an unreviewed (absent) caseId paints nothing even when present in perCase", () => {
  const { green, red, grey, error } = deriveReviewOverlay(
    {}, // nothing has a verdict
    M([["c1", { status: "error", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.equal(green.size + red.size + grey.size + error.size, 0);
});

// ── precedence: grey always loses; green-vs-red flips on isLeaf ─────────────────
check("precedence: grey + green on the same node → GREEN (grey loses)", () => {
  const { green, grey } = deriveReviewOverlay(
    { p: "pending", g: "pass" },
    M([
      ["p", { status: "pass", litNodeKeys: ["shared"] }],
      ["g", { status: "pass", litNodeKeys: ["shared"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...green], ["shared"], "green beats grey");
  assert.equal(grey.size, 0, "grey lost — not in the grey set");
});

check("precedence: grey + red on the same node → RED (grey loses)", () => {
  const { red, grey } = deriveReviewOverlay(
    { p: "pending", f: "fail" },
    M([
      ["p", { status: "pass", litNodeKeys: ["shared"] }],
      ["f", { status: "pass", litNodeKeys: ["shared"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...red], ["shared"], "red beats grey");
  assert.equal(grey.size, 0);
});

check("precedence: green + red on an INTERIOR node → GREEN (interior: green wins)", () => {
  const { green, red } = deriveReviewOverlay(
    { g: "pass", f: "fail" },
    M([
      ["g", { status: "pass", litNodeKeys: ["interior"] }],
      ["f", { status: "pass", litNodeKeys: ["interior"] }],
    ]),
    noLeaf, // "interior" is not a leaf
  );
  assert.deepEqual([...green], ["interior"], "green wins on an interior node");
  assert.equal(red.size, 0);
});

check("precedence: green + red on a LEAF node → RED (leaf: red wins)", () => {
  const { green, red } = deriveReviewOverlay(
    { g: "pass", f: "fail" },
    M([
      ["g", { status: "pass", litNodeKeys: ["leaf"] }],
      ["f", { status: "pass", litNodeKeys: ["leaf"] }],
    ]),
    leafIs("leaf"),
  );
  assert.deepEqual([...red], ["leaf"], "red wins on a leaf (a failed outcome shows red even if a pass path reaches it)");
  assert.equal(green.size, 0);
});

check("precedence: green+red+grey — interior→green, leaf→red, both drop grey (mixed tree)", () => {
  const per = M([
    ["g", { status: "pass", litNodeKeys: ["mid", "tip"] }],
    ["f", { status: "pass", litNodeKeys: ["mid", "tip"] }],
    ["p", { status: "pass", litNodeKeys: ["mid", "tip"] }],
  ]);
  const { green, red, grey } = deriveReviewOverlay(
    { g: "pass", f: "fail", p: "pending" },
    per,
    leafIs("tip"), // "tip" is the disposition leaf; "mid" is interior
  );
  assert.deepEqual([...green], ["mid"], "interior node → green (green beats red beats grey)");
  assert.deepEqual([...red], ["tip"], "leaf node → red (red beats green beats grey)");
  assert.equal(grey.size, 0, "grey lost on every contested node");
});

check("fold: the three verdict sets are DISJOINT (exactly one color per node)", () => {
  const { green, red, grey } = deriveReviewOverlay(
    { g: "pass", f: "fail", p: "pending" },
    M([
      ["g", { status: "pass", litNodeKeys: ["a"] }],
      ["f", { status: "pass", litNodeKeys: ["b"] }],
      ["p", { status: "pass", litNodeKeys: ["c"] }],
    ]),
    noLeaf,
  );
  const all = [...green, ...red, ...grey];
  assert.equal(new Set(all).size, all.length, "no nodeKey appears in more than one set");
  assert.deepEqual([...green], ["a"]);
  assert.deepEqual([...red], ["b"]);
  assert.deepEqual([...grey], ["c"]);
});

// ── error (⊆ green): a pass-verdict node whose RUN errored (Slice-1 unchanged) ──
check("fold: a PASS-verdict, run-status:error case → its rows in error AND green (error ⊆ green)", () => {
  const { green, error } = deriveReviewOverlay(
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
  assert.ok(green.has("shared") && green.has("g1") && green.has("b1"), "green is the union over all pass cases");
});

check("fold: error ⊆ green — a LEAF lit by a pass-run-error case AND a fail case resolves to RED, drops out of error (no double class)", () => {
  const { green, red, error } = deriveReviewOverlay(
    { e: "pass", f: "fail" },
    M([
      ["e", { status: "error", litNodeKeys: ["leaf"] }], // pass verdict, run errored → would be error…
      ["f", { status: "pass", litNodeKeys: ["leaf"] }], // …but a fail case reaches the same LEAF
    ]),
    leafIs("leaf"),
  );
  assert.deepEqual([...red], ["leaf"], "leaf red-wins (a failed outcome tip)");
  assert.equal(green.size, 0, "not green — red won");
  assert.equal(error.size, 0, "error ⊆ green: a red-resolved node is NOT in error (already red, no double class)");
});

check("fold: error ⊆ green — an INTERIOR pass-run-error node shared with a fail case stays GREEN and IN error (error-over-green)", () => {
  const { green, red, error } = deriveReviewOverlay(
    { e: "pass", f: "fail" },
    M([
      ["e", { status: "error", litNodeKeys: ["mid"] }],
      ["f", { status: "pass", litNodeKeys: ["mid"] }],
    ]),
    noLeaf, // interior → green wins
  );
  assert.deepEqual([...green], ["mid"], "interior green-wins");
  assert.equal(red.size, 0);
  assert.deepEqual([...error], ["mid"], "the green node's run errored → in error (painted error-over-green)");
});

check("fold: a PASS-verdict case whose RUN status is 'fail' STILL paints green (human override, not error)", () => {
  const { green, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "fail", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.deepEqual([...green], ["n1"], "the human pass verdict paints green over the automated fail");
  assert.equal(error.size, 0, "run-status 'fail' does NOT redden — only run-status 'error' does");
});

check("fold: a stale pass caseId (not in perCase) → inert (contributes nothing)", () => {
  const { green } = deriveReviewOverlay(
    { gone: "pass", live: "pass" },
    M([["live", { status: "pass", litNodeKeys: ["n1"] }]]),
    noLeaf,
  );
  assert.deepEqual([...green], ["n1"], "only the live case paints; the stale id is skipped");
});

check("fold: multiple pass cases lighting the same node → green (union, idempotent)", () => {
  const { green } = deriveReviewOverlay(
    { a: "pass", b: "pass" },
    M([
      ["a", { status: "pass", litNodeKeys: ["n1"] }],
      ["b", { status: "pass", litNodeKeys: ["n1"] }],
    ]),
    noLeaf,
  );
  assert.deepEqual([...green], ["n1"], "deduped to a single entry");
});

check("fold: a case with litNodeKeys:[] contributes nothing (no crash, empty sets)", () => {
  const { green, red, grey, error } = deriveReviewOverlay(
    { c1: "pass" },
    M([["c1", { status: "error", litNodeKeys: [] }]]),
    noLeaf,
  );
  assert.equal(green.size + red.size + grey.size + error.size, 0);
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

check("buildReviewPerCase: a frozen PASS-verdict, run-pass case → its nodes green, none error", () => {
  const { green, error } = overlayFor({ c1: "pass" }, ["c1", "c2"]);
  assert.deepEqual([...green].sort(), ["n:a", "n:b"]);
  assert.equal(error.size, 0);
});
check("buildReviewPerCase: a frozen FAIL-verdict case → its nodes red (#210)", () => {
  const { red, green } = overlayFor({ c2: "fail" }, ["c1", "c2"]);
  assert.deepEqual([...red].sort(), ["n:b", "n:c"], "fail paints red");
  assert.equal(green.size, 0);
});
check("buildReviewPerCase: a frozen PASS-verdict, run-ERROR case → its nodes error AND green (error⊆green)", () => {
  const { green, error } = overlayFor({ cErr: "pass" }, ["cErr", "cClean"]);
  assert.deepEqual([...green].sort(), ["n:c", "n:d"], "error nodes are also green");
  assert.deepEqual([...error].sort(), ["n:c", "n:d"]);
});
check("error-over-green: a node lit by a clean pass case AND a run-errored pass case is error (and green)", () => {
  // cClean lights n:c (run-pass), cErr lights n:c + n:d (run-error) → n:c is in BOTH green and error; webview paints error over it.
  const { green, error } = overlayFor({ cClean: "pass", cErr: "pass" }, ["cClean", "cErr"]);
  assert.ok(green.has("n:c") && error.has("n:c"), "shared node is error AND green");
  assert.ok(green.has("n:d") && error.has("n:d"));
});
check("interior precedence end-to-end: a pass case + a fail case share n:b (interior) → green", () => {
  const { green, red } = overlayFor({ c1: "pass", c2: "fail" }, ["c1", "c2"]); // c1 lights n:a,n:b; c2 lights n:b,n:c
  assert.ok(green.has("n:b"), "shared interior node → green (interior green-wins)");
  assert.ok(green.has("n:a"));
  assert.ok(red.has("n:c") && !green.has("n:c"), "c2-only node is red");
  assert.ok(!red.has("n:b"), "the shared node is not also red (disjoint)");
});
check("leaf precedence end-to-end: the same shared node as a LEAF → red-wins", () => {
  const { green, red } = overlayFor({ c1: "pass", c2: "fail" }, ["c1", "c2"], leafIs("n:b"));
  assert.ok(red.has("n:b"), "shared leaf node → red (leaf red-wins)");
  assert.ok(!green.has("n:b"));
});
check("PENDING case paints grey (#210)", () => {
  const { grey, green, red } = overlayFor({ c1: "pending" }, ["c1", "c2"]);
  assert.deepEqual([...grey].sort(), ["n:a", "n:b"], "pending paints grey");
  assert.equal(green.size, 0);
  assert.equal(red.size, 0);
});
check("an unfrozen/ambiguous caseId (statusOf → undefined) is skipped — never appears in perCase", () => {
  // "ghost" is pass in the sidecar but not a live/frozen case → buildReviewPerCase skips it → the fold finds no row → inert.
  const perCase = buildReviewPerCase(["ghost", "c1"], statusOf, litOf);
  assert.ok(!perCase.has("ghost"), "no perCase row for an unresolved (undefined-status) case");
  assert.ok(perCase.has("c1"));
  const { green } = deriveReviewOverlay({ ghost: "pass", c1: "pass" }, perCase, noLeaf);
  assert.deepEqual([...green].sort(), ["n:a", "n:b"], "only the live pass case painted; the ghost is inert");
});
check("empty worklist (no verdicts) → empty overlay (host posts a clear)", () => {
  const { green, red, grey, error } = overlayFor({}, ["c1", "c2", "cErr"]);
  assert.equal(green.size + red.size + grey.size + error.size, 0);
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
check("renderProgressChrome: all ADJUDICATED but some FAILED is NOT clean — shows the failed tally, no green all-clear", () => {
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

console.log(`\nmedicalValidationStore.test: ${pass} checks passed`);
