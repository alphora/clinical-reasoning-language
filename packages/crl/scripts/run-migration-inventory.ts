// #189 emit-flip · T4 — thin runner for the migration-inventory scanner. Uncompiled dev tooling
// (scripts/ is not in the package tsconfig or the npm `files` list, so it never ships). All the
// API-coupled logic + rendering + the exclusion manifest live in `src/migration/` where they
// type-check and are unit-tested; this file only wires argv → scanner → doc.
//
//   Probe (summary to stderr, writes nothing):   npx ts-node scripts/run-migration-inventory.ts
//   Refresh the committed doc:                    npx ts-node scripts/run-migration-inventory.ts --write
//
// Exit code is non-zero when the scan is INVALID (integrity failures) — so the T7 staleness gate and
// CI can depend on it. NOTE (panel R1 Claude #9): the exclusion-manifest dead-rule check only fires
// when this script actually runs — the T7 gate MUST run it in CI.

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as path from "node:path";

import { runInventory } from "../src/migration/migrationInventory";
import { renderInventoryMarkdown } from "../src/migration/renderInventory";
import { THIS_REPO_EXCLUSIONS } from "../src/migration/repoExclusions";

// The monorepo root — the census walks the WHOLE repo (panel R1: "every in-repo site", not just
// packages/crl). `listCrlFilesDeep` skips node_modules/dist/tmp/.git/coverage.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "emit-189-migration-inventory.md");

function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const write = process.argv.includes("--write");
  const report = runInventory({ root: REPO_ROOT, exclusions: THIS_REPO_EXCLUSIONS });

  const c = report.counts;
  const log = (s: string): void => {
    process.stderr.write(s + "\n");
  };
  log(`census root: ${REPO_ROOT}`);
  log(`discovered=${c.discovered} included=${c.included} excluded=${c.excluded} buildFailed=${c.buildFailed}`);
  log(`  by category: ${JSON.stringify(c.byCategory)}`);
  log(
    `targets=${report.targets.length}  excludedTargets=${report.excludedTargets.length}  ` +
      `nonTargets=${report.nonTargets.length}  secondary=${report.secondaryWarnings.length}`,
  );
  log(`reconcile ok=${report.reconcile.ok} divergences=${report.reconcile.divergences.length}`);
  log(`targets with blockers=${report.targets.filter((t) => t.blockers.length > 0).length}`);
  if (report.failures.length) {
    log(`FAILURES (${report.failures.length}):`);
    for (const f of report.failures) log(`  - ${f}`);
  }

  if (write) {
    const md = renderInventoryMarkdown(report, {
      command: "npx ts-node packages/crl/scripts/run-migration-inventory.ts --write",
      commit: gitCommit(),
      repoRoot: REPO_ROOT,
    });
    writeFileSync(DOC_PATH, md + "\n", "utf-8");
    log(`wrote ${DOC_PATH}`);
  } else {
    log("(probe only — pass --write to refresh the committed doc)");
  }

  process.exit(report.failures.length === 0 ? 0 : 1);
}

main();
