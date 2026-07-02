// Glob test runner (replaces the hand-curated `&&` chain in package.json's "test" script). Two things the chain couldn't do:
//   1. It runs EVERY suite even when one fails, then reports ALL failures — the `&&` chain stopped at the first, hiding the
//      rest (a red oracle golden once masked every suite after it).
//   2. It DISCOVERS suites (`src/*.test.mjs` + the oracle gate) at runtime, so a newly-added suite runs automatically — no
//      hand-editing a 34-entry chain, where a forgotten entry means a suite silently never runs.
//
// Each suite runs as its OWN child process (spawnSync), NOT in-process: many suites call `process.exit()` or set
// `process.exitCode` (killing / confusing an in-process runner) and each wants isolated globals + temp files. Sequential,
// not parallel — deterministic, readable interleaved output (the per-pid tmp-bundle names already avoid collisions, so
// speed isn't the constraint; legibility is). Exit 1 iff any suite failed.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/crl-vscode/src
const pkgRoot = resolve(here, ".."); // packages/crl-vscode — child cwd + discovery root (derived from THIS file, never cwd)

// Roster: every src/*.test.mjs (alphabetical — suites are independent, so order is immaterial; this differs from the old
// hand-curated chain order, an accepted change) + the oracle behavior gate, which lives outside src/ and is appended
// explicitly. `run-tests.mjs` + `test-harness.mjs` don't match `*.test.mjs`, so the runner never includes itself/the harness.
const srcSuites = readdirSync(join(pkgRoot, "src"))
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .map((f) => join("src", f));
const suites = [...srcSuites, join("test", "oracle", "check.mjs")];

const results = [];
for (const suite of suites) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(pkgRoot, suite)], { cwd: pkgRoot, stdio: "inherit" });
  const ms = Date.now() - t0;
  // status is a number on a normal exit; it's null on spawn failure (r.error) or signal termination (r.signal, e.g. a
  // segfault) — both are FAILURES, never a silent pass.
  const ok = r.status === 0 && !r.error && !r.signal;
  results.push({ suite, ok, code: r.status, signal: r.signal, error: r.error, ms });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${"─".repeat(64)}`);
console.log(`Test summary: ${results.length - failed.length}/${results.length} suites passed`);
for (const r of results) {
  const why = r.ok ? "" : r.error ? ` (${r.error.message})` : r.signal ? ` (signal ${r.signal})` : ` (exit ${r.code})`;
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.suite}  ${r.ms}ms${why}`);
}
if (failed.length > 0) {
  console.error(`\n${failed.length} suite(s) FAILED: ${failed.map((r) => r.suite).join(", ")}`);
  process.exit(1);
}
console.log("All suites passed.");
