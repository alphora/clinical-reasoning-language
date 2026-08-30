// #189 P2 — RETIRE:189-value-element-grammar — delete this file together with the `valueElementLine`
// production in `CRLParser.g4`. Its whole job is to prove the trigger for that deletion has fired.
//
// ⚠ WHY THIS EXISTS. `value element is` was retired and the corpus migrated in one transaction — and the
// migration MISSED FILES. It swept `packages/**` and stopped, leaving `harness/**` (tracked, and a live
// `$apply` oracle) still authoring the retired form. `docs/emit-189-migration-inventory.md` had LISTED the
// missed files by path and line: the inventory was right and the execution was scoped wrong.
//
// Nothing caught it, and nothing could have — the grammar still PARSES `value element is` (the production
// drops only once nothing authors it), so a stale file validates clean. It stayed invisible for a week and
// was found by a human reading `.crl` files. This test is the gate that would have failed instead.
//
// It enumerates via `git ls-files`, so it covers the WHOLE repo rather than one package — which is the
// specific failure being prevented — and gitignored scratch (`tmp/**`) is correctly out of scope.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import { describe, it, expect } from "vitest";

const CRL_ROOT = path.resolve(__dirname, "..", "..", ".."); // packages/crl
const REPO_ROOT = path.resolve(CRL_ROOT, "..", ".."); // monorepo root

/** Every TRACKED `.crl` in the repo, repo-relative. */
function trackedCrlFiles(): string[] {
  return execSync("git ls-files -- *.crl", { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("retired authoring forms — corpus-wide", () => {
  it("finds tracked .crl files to scan (guards against a silently-empty scan)", () => {
    // A gate that scans nothing passes forever. Assert the enumeration actually worked before trusting
    // the assertions below — the corpus is ~200 files, so any collapse toward zero is a broken scan.
    expect(trackedCrlFiles().length).toBeGreaterThan(50);
  });

  it("no tracked .crl authors the RETIRED `value element is`", () => {
    const offenders: string[] = [];
    for (const rel of trackedCrlFiles()) {
      const src = readFileSync(path.join(REPO_ROOT, rel), "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (line.includes("value element is")) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
    // The message carries the fix, because the reader of a failure here is migrating a file, not
    // debugging a test: a posrep is `type is` + optional `coded from` (+ optional `value projection is`).
    // The value element and value type are DERIVED — from the FHIR value-read model and from the
    // concept's own `value type is` respectively. Deleting the two lines IS the migration.
    expect(
      offenders,
      `\`value element is\` is RETIRED. Delete the line (and any sibling \`value type is\` on the same ` +
        `source representation): the read path comes from the FHIR value-read model and the value type ` +
        `from the concept. Offenders:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no tracked .crl authors the RETIRED concept-level `definition is age today`", () => {
    // The sibling retirement, and the one that had ROTTED FURTHEST: `patient-age-upper.crl` carried it
    // long after the validator began rejecting it (`age-predicate-unsupported`), so that harness policy
    // was simply broken. Patient age is a `source representation` over Patient with a `value projection`.
    const offenders: string[] = [];
    for (const rel of trackedCrlFiles()) {
      const src = readFileSync(path.join(REPO_ROOT, rel), "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        if (/^\s*-\s*definition is age today\b/.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      `concept-level \`definition is age today …\` is RETIRED. Patient age is a \`source representation\`:\n` +
        `      - type is Patient.\n      - value projection is age today <cmp> <N> years.\n` +
        `Offenders:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
