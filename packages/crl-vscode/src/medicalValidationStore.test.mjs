// Unit tests for the Medical Validation persistence + derivation CORE (#156 slice 2): medicalValidationSidecarPath,
// load/saveSidecar, deriveReviewOverlay, nextReviewState. vscode-free, so — like provenanceFindings.test.mjs — esbuild
// bundles the TS to CJS and we import it under node. Design authority: .vibe-tools/discussions/161-...
import { build } from "esbuild";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function load(tsFile) {
  const out = resolve(tmpdir(), `crl-${tsFile.replace(/\W/g, "_")}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(here, tsFile)],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: out,
    logLevel: "silent",
  });
  return require(out);
}

const { medicalValidationSidecarPath, loadSidecar, saveSidecar, deriveReviewOverlay, nextReviewState, applyWorklistToggle } =
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
check("load: missing file → empty {schemaVersion:1, byCaseId:{}}, no warning", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "medical-validation", "p.json");
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar, { schemaVersion: 1, byCaseId: {} });
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

check("load: a FORWARD schemaVersion (2) → loads the known states best-effort + carries a warning (not silent)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 2, byCaseId: { c1: "reviewed", c2: "pending" } }));
    const r = loadSidecar(p);
    assert.deepEqual(r.sidecar.byCaseId, { c1: "reviewed", c2: "pending" }, "known states loaded best-effort");
    assert.equal(r.sidecar.schemaVersion, 1, "normalized to the version this build understands");
    assert.ok(r.warning && r.warning.includes("schemaVersion"), `expected a forward-version warning, got: ${r.warning}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("load: valid → parsed; an unknown state value for a caseId is dropped (valid entries kept)", () => {
  const root = mkdtempSync(join(tmpdir(), "mv-load-"));
  try {
    const p = join(root, "s.json");
    writeFileSync(p, JSON.stringify({ schemaVersion: 1, byCaseId: { c1: "reviewed", c2: "pending", c3: "bogus", c4: "unreviewed" } }));
    const r = loadSidecar(p);
    assert.equal(r.warning, undefined, "a present-but-coercible file is a clean load");
    assert.deepEqual(r.sidecar.byCaseId, { c1: "reviewed", c2: "pending" }, "c3(bogus)+c4(unreviewed) dropped");
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
    const sidecar = { schemaVersion: 1, byCaseId: { c1: "reviewed", c2: "pending" } };
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
    assert.throws(() => saveSidecar(p, { schemaVersion: 1, byCaseId: {} }), "a failed save is surfaced, not swallowed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the precedence fold ────────────────────────────────────────────────────────
const M = (entries) => new Map(entries);

check("fold: a reviewed case → its lit rows in done (status pass → not in error)", () => {
  const { done, error } = deriveReviewOverlay(
    { c1: "reviewed" },
    M([["c1", { status: "pass", litNodeKeys: ["n1", "n2"] }]]),
  );
  assert.deepEqual([...done].sort(), ["n1", "n2"]);
  assert.equal(error.size, 0);
});

check("fold: a reviewed status:error case → its rows in error AND done (error wins over a done from another case)", () => {
  const { done, error } = deriveReviewOverlay(
    { good: "reviewed", bad: "reviewed" },
    M([
      ["good", { status: "pass", litNodeKeys: ["shared", "g1"] }],
      ["bad", { status: "error", litNodeKeys: ["shared", "b1"] }],
    ]),
  );
  // shared is lit by both → in error (error > done) AND still in the done union; b1 error; g1 done-only.
  assert.ok(error.has("shared"), "the errored case marks the shared node error");
  assert.ok(error.has("b1"));
  assert.ok(!error.has("g1"), "a node lit only by the clean case is not error");
  assert.ok(done.has("shared") && done.has("g1") && done.has("b1"), "done is the union over all reviewed cases");
});

check("fold: a PENDING case contributes NOTHING (pending does not paint)", () => {
  const { done, error } = deriveReviewOverlay(
    { c1: "pending" },
    M([["c1", { status: "error", litNodeKeys: ["n1"] }]]),
  );
  assert.equal(done.size, 0);
  assert.equal(error.size, 0);
});

check("fold: a stale reviewed caseId (not in perCase) → inert (contributes nothing)", () => {
  const { done, error } = deriveReviewOverlay(
    { gone: "reviewed", live: "reviewed" },
    M([["live", { status: "pass", litNodeKeys: ["n1"] }]]),
  );
  assert.deepEqual([...done], ["n1"], "only the live case paints; the stale id is skipped");
  assert.equal(error.size, 0);
});

check("fold: multiple reviewed cases lighting the same node → done (union, idempotent)", () => {
  const { done, error } = deriveReviewOverlay(
    { a: "reviewed", b: "reviewed" },
    M([
      ["a", { status: "pass", litNodeKeys: ["n1"] }],
      ["b", { status: "pass", litNodeKeys: ["n1"] }],
    ]),
  );
  assert.deepEqual([...done], ["n1"], "deduped to a single entry");
  assert.equal(error.size, 0);
});

check("fold: a reviewed case with litNodeKeys:[] contributes nothing (no crash, empty sets)", () => {
  const { done, error } = deriveReviewOverlay(
    { c1: "reviewed" },
    M([["c1", { status: "error", litNodeKeys: [] }]]),
  );
  assert.equal(done.size, 0);
  assert.equal(error.size, 0);
});

check("fold: an unreviewed (absent) caseId never paints even when present in perCase", () => {
  const { done, error } = deriveReviewOverlay(
    {}, // nothing reviewed
    M([["c1", { status: "error", litNodeKeys: ["n1"] }]]),
  );
  assert.equal(done.size, 0);
  assert.equal(error.size, 0);
});

// ── nextReviewState cycle ────────────────────────────────────────────────────
check("nextReviewState: unreviewed → pending → reviewed → unreviewed", () => {
  assert.equal(nextReviewState("unreviewed"), "pending");
  assert.equal(nextReviewState("pending"), "reviewed");
  assert.equal(nextReviewState("reviewed"), "unreviewed");
});

// ── applyWorklistToggle (slice 4 host reducer) ────────────────────────────────
check("applyWorklistToggle: unreviewed (absent) → pending entry added", () => {
  assert.deepEqual(applyWorklistToggle({}, "c1"), { c1: "pending" });
});
check("applyWorklistToggle: pending → reviewed (in place)", () => {
  assert.deepEqual(applyWorklistToggle({ c1: "pending" }, "c1"), { c1: "reviewed" });
});
check("applyWorklistToggle: reviewed → unreviewed DELETES the entry (absence = unreviewed)", () => {
  assert.deepEqual(applyWorklistToggle({ c1: "reviewed" }, "c1"), {});
});
check("applyWorklistToggle: only the toggled caseId changes; others untouched", () => {
  assert.deepEqual(applyWorklistToggle({ c1: "pending", c2: "reviewed" }, "c1"), { c1: "reviewed", c2: "reviewed" });
});
check("applyWorklistToggle: returns a NEW object (input not mutated)", () => {
  const input = { c1: "reviewed" };
  const out = applyWorklistToggle(input, "c1");
  assert.deepEqual(input, { c1: "reviewed" }, "input untouched");
  assert.notEqual(out, input, "a fresh object is returned");
});
// FIX 1 (impl review): rapid double-toggle. The host advances from the COMMITTED map each time (the stable caseId key
// resolves even on a pre-re-render DOM), so two toggles in a row on the same case advance TWO states.
check("applyWorklistToggle: two toggles in a row on the same case advance two states (unreviewed→pending→reviewed)", () => {
  const after1 = applyWorklistToggle({}, "c1");
  assert.deepEqual(after1, { c1: "pending" }, "first → pending");
  const after2 = applyWorklistToggle(after1, "c1");
  assert.deepEqual(after2, { c1: "reviewed" }, "second (from committed) → reviewed");
  const after3 = applyWorklistToggle(after2, "c1");
  assert.deepEqual(after3, {}, "third wraps to unreviewed (entry deleted)");
});

console.log(`\nmedicalValidationStore.test: ${pass} checks passed`);
