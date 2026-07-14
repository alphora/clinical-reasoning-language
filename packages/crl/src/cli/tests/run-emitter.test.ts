/**
 * CLI dispatch matrix integration test (Todo 4 of #73, round-5 gpt55).
 *
 * Spawns `npx tsx src/cli/run-emitter.ts ...` and validates the
 * exit code + stderr matrix for the supported flag combinations.
 * Uses small corpus fixtures that already emit clean for both lanes
 * (cms22 / cc-screening) so exits can be deterministically verified.
 *
 * Spawned subprocess (not jest in-process) so the actual CLI entrypoint
 * — including `process.exit()` codes and stdio routing — is exercised.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CLI = join(REPO_ROOT, "src", "cli", "run-emitter.ts");
const CC_SCREENING = join(
  REPO_ROOT,
  "src/tests/fixtures/cpg-roundtrip/cc-screening-cognitive-support/cc-screening.crl",
);
const CMS22 = join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.crl");
const CMS22_CEL = join(REPO_ROOT, "src/tests/fixtures/corpus/cms22/cms22-strategy.cel");

function runCli(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  // Use npx tsx via shell — tsx isn't a direct dep so we can't import its
  // loader as a bare module from the test harness. Shell overhead is ~1s
  // per run; acceptable for the small dispatch matrix.
  const result = spawnSync("npx", ["tsx", CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 60_000,
    shell: true,
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function makeOutDir(label: string): { outDir: string; cleanup: () => void } {
  const outDir = mkdtempSync(join(tmpdir(), `crl-emit-test-${label}-`));
  return {
    outDir,
    cleanup: () => {
      try {
        rmSync(outDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}

describe("CLI dispatch matrix — .cel input + --target combos (round-5 [important])", () => {
  it("`.cel + --target fhir-def` exits 1 with cli-cel-fhir-def-incompatible message", () => {
    const r = runCli(["--path", CMS22_CEL, "--target", "fhir-def", "--out-dir", "/tmp/unused"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("cli-cel-fhir-def-incompatible");
  });

  it("`.cel + --target cql` exits 1 with cli-cel-cql-incompatible message (round-5 symmetry fix)", () => {
    const r = runCli(["--path", CMS22_CEL, "--target", "cql", "--out-dir", "/tmp/unused"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("cli-cel-cql-incompatible");
  });
});

describe("CLI dispatch matrix — --help flag (v2.4.1)", () => {
  it("`--help` exits 0 with usage reference on stdout", () => {
    const r = runCli(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("crl-emit");
    expect(r.stdout).toContain("--target");
    expect(r.stdout).toContain("EXIT CODES");
  });

  it("`-h` is an alias for --help", () => {
    const r = runCli(["-h"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("USAGE:");
  });
});

describe("CLI dispatch matrix — flag validation", () => {
  it("`--target invalid-value` exits 1 with usage error", () => {
    const r = runCli(["--path", CMS22, "--target", "json", "--out-dir", "/tmp/unused"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--target must be");
  });

  it("`--target` with no value exits 1", () => {
    const r = runCli(["--path", CMS22, "--target", "--out-dir", "/tmp/unused"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("--target requires a value");
  });
});

describe("CLI dispatch matrix — `.crl + --target fhir-def` two-lane contract (round-5 [critical] fix)", () => {
  // The contract verified here: EITHER both <out-dir>/cql/*.cql AND
  // <out-dir>/fhir/<rt>/*.json write atomically, OR neither does.
  // cc-screening + cms22 both exercise the failure path because their
  // concept bodies use placeholder/unmatched narratives that the
  // CRLCommon catalog rejects — exactly the case where partial
  // emission would have shipped broken Library.content URLs.

  it("cc-screening: CQL lane fails (placeholder narratives) → exit 1, neither <out-dir>/cql NOR <out-dir>/fhir written", () => {
    const { outDir, cleanup } = makeOutDir("cc-fail");
    try {
      // --date so the FHIR lane passes its (publishable) date gate; this test
      // isolates the CQL-lane failure as the atomic-abort trigger.
      const r = runCli([
        "--path",
        CC_SCREENING,
        "--target",
        "fhir-def",
        "--out-dir",
        outDir,
        "--date",
        "2020-01-01T00:00:00.000Z",
      ]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("cql-emit");
      expect(existsSync(join(outDir, "cql"))).toBe(false);
      expect(existsSync(join(outDir, "fhir"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  // T13 / #94 made cms22 emit cleanly — the original fail-fast test
  // premise no longer holds. Repurposed: assert atomic write SUCCESS
  // (both lanes written together) when both lanes can emit.
  it("cms22: both lanes succeed → exit 0 or 2 (warnings), BOTH <out-dir>/cql AND <out-dir>/fhir written", () => {
    const { outDir, cleanup } = makeOutDir("cms22-success");
    try {
      const r = runCli(["--path", CMS22, "--target", "fhir-def", "--out-dir", outDir]);
      expect([0, 2]).toContain(r.exitCode);
      expect(existsSync(join(outDir, "cql"))).toBe(true);
      expect(existsSync(join(outDir, "fhir"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("`--capability executable` → exit 1 (unsupported), neither lane written", () => {
    const { outDir, cleanup } = makeOutDir("exec-reject");
    try {
      const r = runCli([
        "--path",
        CMS22,
        "--target",
        "fhir-def",
        "--out-dir",
        outDir,
        "--date",
        "2020-01-01T00:00:00.000Z",
        "--capability",
        "executable",
      ]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("executable-capability-unsupported");
      expect(existsSync(join(outDir, "cql"))).toBe(false);
      expect(existsSync(join(outDir, "fhir"))).toBe(false);
    } finally {
      cleanup();
    }
  });
});

describe("CLI dispatch matrix — output layout convention", () => {
  it("CLI fhir-def branch resolves Library.content URLs against <out-dir>/cql/", () => {
    // Spot-check the math: closureOrchestrator emits
    // `Library.content[0].url = "../../cql/<name>.cql"`. Relative to
    // `<out-dir>/fhir/Library/<id>.json` that's `<out-dir>/cql/<name>.cql`.
    // This documents the assumption baked into the CLI's two-lane
    // write target.
    const fhirLibPath = join("any-out-dir", "fhir", "Library", "x.json");
    const relUrl = "../../cql/MyLib.cql";
    // Path arithmetic identity: dirname(fhirLibPath) + "/" + relUrl normalizes to
    // <out-dir>/cql/MyLib.cql
    const { dirname, normalize } = require("node:path") as typeof import("node:path");
    const resolved = normalize(join(dirname(fhirLibPath), relUrl));
    expect(resolved.replace(/\\/g, "/")).toBe("any-out-dir/cql/MyLib.cql");
  });
});

// Suppress unused-import warning for readFileSync — kept for future shape tests
// when a clean two-lane CRL fixture lands.
void readFileSync;
