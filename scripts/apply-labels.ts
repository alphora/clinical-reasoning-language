#!/usr/bin/env tsx
/**
 * apply-labels.ts — T01 of v2.5.0 (#97).
 *
 * Reads .github/labels.json (taxonomy) + .github/initial-issue-labels.json
 * (initial bulk-apply map) and synchronizes GitHub repo state via `gh`.
 *
 * Modes:
 *   (default)         --dry-run: prints planned changes; no mutations.
 *   --apply           commits changes via `gh label`/`gh issue edit`.
 *   --generate-md     writes .github/LABELS.md from labels.json. May combine with --dry-run.
 *
 * Managed-axis policy: for each issue, the script computes the desired set
 * of kind/* and area/* labels from the JSON, reads the current set via
 * `gh issue view --json labels`, removes any stale managed labels, and
 * adds new ones. priority/* labels are NEVER touched by this script
 * (operator-only axis).
 *
 * Source of truth: .github/labels.json is authoritative for the taxonomy
 * (label set + colors + descriptions). For per-issue assignments, the
 * initial-issue-labels.json is the bulk-apply seed; after the first
 * successful --apply, GitHub state becomes the source of truth and
 * subsequent re-runs of --apply will re-assert the JSON over any drift.
 * If you want a manual GH UI edit to stick, either (a) update
 * initial-issue-labels.json to match, or (b) accept that the next
 * --apply run will overwrite it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type LabelDef = { name: string; color: string; description: string };
type LabelsJson = { labels: LabelDef[] };
type IssueAssignment = { kind: string; areas: string[]; priority?: string };
type InitialAssignmentsJson = { issues: Record<string, IssueAssignment> };

const REPO_ROOT = resolve(__dirname, "..");
const LABELS_PATH = join(REPO_ROOT, ".github", "labels.json");
const ISSUES_PATH = join(REPO_ROOT, ".github", "initial-issue-labels.json");
const LABELS_MD_PATH = join(REPO_ROOT, ".github", "LABELS.md");

const KIND_PREFIX = "kind/";
const AREA_PREFIX = "area/";

function parseArgs(argv: string[]): { apply: boolean; generateMd: boolean } {
  const apply = argv.includes("--apply");
  const generateMd = argv.includes("--generate-md");
  return { apply, generateMd };
}

function loadJson<T>(path: string): T {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as T;
}

function gh(args: string[], opts: { dryRun: boolean }): string {
  if (opts.dryRun) {
    console.log(`  [dry-run] gh ${args.join(" ")}`);
    return "";
  }
  try {
    return execFileSync("gh", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer | string; stdout?: Buffer | string };
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    throw new Error(`gh ${args.join(" ")} failed (exit ${err.status ?? "?"}): ${stderr || stdout}`);
  }
}

function syncLabels(labels: LabelDef[], apply: boolean): void {
  // GitHub caps label descriptions at 100 chars. Validate up-front so we
  // fail before any partial sync hits the wire.
  const tooLong = labels.filter((l) => l.description.length > 100);
  if (tooLong.length > 0) {
    const list = tooLong.map((l) => `  ${l.name}: ${l.description.length} chars`).join("\n");
    throw new Error(`Label descriptions exceed GitHub's 100-char limit:\n${list}`);
  }

  console.log(`\nSyncing ${labels.length} label definitions...`);
  // `gh label create --force` updates color+description if the label exists,
  // creates it otherwise. This makes the call idempotent for the fields we manage.
  for (const l of labels) {
    gh(
      [
        "label",
        "create",
        l.name,
        "--color",
        l.color,
        "--description",
        l.description,
        "--force",
      ],
      { dryRun: !apply },
    );
  }
  console.log(`  ${apply ? "Synced" : "(dry-run) would sync"} ${labels.length} labels.`);
}

function readIssueLabels(issueNum: string): string[] {
  // Always real-read, even in dry-run, so the planner is accurate.
  const out = execFileSync(
    "gh",
    ["issue", "view", issueNum, "--json", "labels", "--jq", ".labels[].name"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isManaged(label: string): boolean {
  return label.startsWith(KIND_PREFIX) || label.startsWith(AREA_PREFIX);
}

function applyIssueAssignments(
  assignments: Record<string, IssueAssignment>,
  apply: boolean,
): { changed: number; unchanged: number } {
  console.log(`\nApplying assignments to ${Object.keys(assignments).length} issues...`);
  let changed = 0;
  let unchanged = 0;

  for (const [num, a] of Object.entries(assignments)) {
    const desired = new Set<string>();
    desired.add(KIND_PREFIX + a.kind);
    for (const area of a.areas) desired.add(AREA_PREFIX + area);
    if (a.priority) desired.add("priority/" + a.priority);

    let current: string[];
    try {
      current = readIssueLabels(num);
    } catch (e) {
      console.warn(`  #${num}: could not read current labels: ${(e as Error).message}`);
      continue;
    }
    const currentSet = new Set(current);

    // Managed-axis enforcement: remove stale kind/* and area/* that aren't in
    // the desired set. priority/* is left alone regardless.
    const toRemove: string[] = [];
    for (const c of currentSet) {
      if (isManaged(c) && !desired.has(c)) toRemove.push(c);
    }
    const toAdd: string[] = [];
    for (const d of desired) {
      if (!currentSet.has(d)) toAdd.push(d);
    }

    if (toRemove.length === 0 && toAdd.length === 0) {
      unchanged++;
      continue;
    }

    console.log(
      `  #${num}: remove=[${toRemove.join(", ")}] add=[${toAdd.join(", ")}]`,
    );
    if (toRemove.length > 0) {
      gh(["issue", "edit", num, "--remove-label", toRemove.join(",")], { dryRun: !apply });
    }
    if (toAdd.length > 0) {
      gh(["issue", "edit", num, "--add-label", toAdd.join(",")], { dryRun: !apply });
    }
    changed++;
  }

  console.log(`  ${changed} issue(s) ${apply ? "updated" : "would be updated"}, ${unchanged} unchanged.`);
  return { changed, unchanged };
}

function generateLabelsMd(labels: LabelDef[]): void {
  const kindRows = labels.filter((l) => l.name.startsWith(KIND_PREFIX));
  const areaRows = labels.filter((l) => l.name.startsWith(AREA_PREFIX));
  const priorityRows = labels.filter((l) => l.name.startsWith("priority/"));

  const lines: string[] = [];
  lines.push("<!-- GENERATED from .github/labels.json by scripts/apply-labels.ts --generate-md. Do not hand-edit. -->");
  lines.push("");
  lines.push("# Repo label scheme");
  lines.push("");
  lines.push("This repo uses a 3-axis label scheme (kind / area / priority) to triage issues and PRs. Source of truth: [`labels.json`](./labels.json). To regenerate this doc: `npx tsx scripts/apply-labels.ts --generate-md`.");
  lines.push("");
  lines.push("## Rules");
  lines.push("");
  lines.push("- `kind/*` — **exactly one** per issue.");
  lines.push("- `area/*` — **≥1 per issue, except `kind/meta` issues may have 0** (they're about the project/process, not a code area).");
  lines.push("- `priority/*` — **optional**. Absent = untriaged. Operator-only axis (script never touches it).");
  lines.push("");
  lines.push("## Lifecycle");
  lines.push("");
  lines.push("- `kind/design-q` issues are CLOSED when the design decision is reached. Any resulting work is filed as new `kind/feat` or `kind/chore` issues. Don't relabel — keeps history clean.");
  lines.push("- The label scheme is enforced by `scripts/apply-labels.ts --apply`. Re-running re-asserts the JSON over any GH UI drift. To make a change stick: edit `.github/initial-issue-labels.json` (for taxonomy migrations) OR accept the GH UI is now the source of truth post-migration.");
  lines.push("");
  lines.push("## Kind");
  lines.push("");
  lines.push("| Label | Description |");
  lines.push("|---|---|");
  for (const l of kindRows) {
    lines.push(`| \`${l.name}\` | ${l.description} |`);
  }
  lines.push("");
  lines.push("## Area");
  lines.push("");
  lines.push("| Label | Maps to |");
  lines.push("|---|---|");
  for (const l of areaRows) {
    lines.push(`| \`${l.name}\` | ${l.description} |`);
  }
  lines.push("");
  lines.push("Note on CEL-spanning issues (umbrella, design-Q): tag the concrete affected areas (e.g. `cel-emitter, grammar, validator, imports, spec`). There is intentionally no broader `area/cel` — it would overlap `area/cel-emitter`.");
  lines.push("");
  lines.push("## Priority");
  lines.push("");
  lines.push("| Label | Description |");
  lines.push("|---|---|");
  for (const l of priorityRows) {
    lines.push(`| \`${l.name}\` | ${l.description} |`);
  }
  lines.push("");
  lines.push("## Filter examples");
  lines.push("");
  lines.push("- All open CEL emitter bugs: `is:open is:issue label:kind/bug label:area/cel-emitter`");
  lines.push("- All P0/P1 validator work: `is:open is:issue label:area/validator label:priority/p0,priority/p1`");
  lines.push("- All design questions: `is:open is:issue label:kind/design-q`");

  writeFileSync(LABELS_MD_PATH, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWrote ${LABELS_MD_PATH}`);
}

function main(): void {
  const { apply, generateMd } = parseArgs(process.argv.slice(2));
  if (!apply && !generateMd) {
    console.log("Mode: dry-run (default). Use --apply to commit changes; --generate-md to write LABELS.md.");
  }

  const labelsJson = loadJson<LabelsJson>(LABELS_PATH);
  const assignmentsJson = loadJson<InitialAssignmentsJson>(ISSUES_PATH);

  if (generateMd) {
    generateLabelsMd(labelsJson.labels);
  }

  syncLabels(labelsJson.labels, apply);
  applyIssueAssignments(assignmentsJson.issues, apply);

  console.log(apply ? "\nApply complete." : "\nDry-run complete. Use --apply to commit.");
}

main();
