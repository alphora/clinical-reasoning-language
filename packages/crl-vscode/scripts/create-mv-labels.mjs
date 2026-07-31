#!/usr/bin/env node
// Create/update the Medical-Validation flag labels (`mv:*`) in a GitHub content repo, DERIVED from the CRL flag vocabulary
// (`allFlagLabels()` in @smile-digital-health/crl — the single source of truth for names/colors/descriptions). Run this once
// per content repo so a flag's born-together issue lands with OUR label color + description instead of GitHub's default grey.
//
//   node packages/crl-vscode/scripts/create-mv-labels.mjs <owner>/<repo> [--dry-run]
//
// Requires the GitHub CLI (`gh`) authenticated with push access to <owner>/<repo>. `--force` updates a label that already
// exists (idempotent). Adding/renaming a Type in flagVocab automatically flows here — re-run to sync.
import { execFileSync } from "node:child_process";
import { allFlagLabels } from "@smile-digital-health/crl";

const repo = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
  console.error("usage: create-mv-labels.mjs <owner>/<repo> [--dry-run]");
  process.exit(2);
}

const labels = allFlagLabels();
console.log(`${dryRun ? "[dry-run] " : ""}${labels.length} MV labels → ${repo}`);
for (const l of labels) {
  const args = ["label", "create", l.name, "--color", l.color, "--description", l.description, "--force", "-R", repo];
  console.log(`  ${l.name}  #${l.color}`);
  if (!dryRun) execFileSync("gh", args, { stdio: ["ignore", "ignore", "inherit"] });
}
console.log(dryRun ? "[dry-run] nothing created" : `done — ${labels.length} labels synced to ${repo}`);
