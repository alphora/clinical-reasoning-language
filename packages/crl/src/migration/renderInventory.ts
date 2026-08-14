// #189 emit-flip · T4 — pure renderer: an InventoryReport → the committed inventory Markdown
// (docs/emit-189-migration-inventory.md). No I/O, no git, no clock — the runner supplies provenance
// so this stays deterministic and unit-testable.

import * as path from "node:path";

import type {
  InventoryReport,
  MigrationTarget,
  NonTargetEntry,
  FileCategory,
  EdgeEvidence,
} from "./migrationInventory";

export interface RenderProvenance {
  /** The exact command that produced the report (for reproduction). */
  command: string;
  /** The git commit the scanner ran at (the runner resolves it; "unknown" if unavailable). */
  commit: string;
  /** The absolute repo root, for rendering paths repo-relative. */
  repoRoot: string;
}

const INCLUDED_SECTIONS: { category: FileCategory; heading: string; blurb: string }[] = [
  {
    category: "canonical-content",
    heading: "Canonical content (in-repo)",
    blurb:
      "Production content authored in THIS repo. Real production content is EXTERNAL " +
      "(per-repo, e.g. `hcsc-content`) — see the external-content follow-up; in-repo this section is " +
      "normally empty.",
  },
  {
    category: "corpus",
    heading: "Corpus (worked examples)",
    blurb: "The `tests/fixtures/corpus` worked examples (cms22/cms69) — migrated with the flip.",
  },
  {
    category: "example-harness",
    heading: "Example harness",
    blurb: "The `examples/` libraries (e.g. WHO IMMZ) — migrated with the flip.",
  },
  {
    category: "golden-source",
    heading: "Golden source",
    blurb:
      "CRL whose EMIT is pinned by a golden. A golden pinning OLD bare-code emit is REGENERATED at " +
      "the flip, not hand-migrated — see each row's migration note.",
  },
  {
    category: "clean-fixture",
    heading: "Clean fixtures",
    blurb: "Valid test fixtures (validator/imports/emitter) that carry migration targets.",
  },
];

export function renderInventoryMarkdown(report: InventoryReport, prov: RenderProvenance): string {
  const rel = (p: string): string => path.relative(prov.repoRoot, p).replace(/\\/g, "/");
  const out: string[] = [];
  const push = (s = ""): void => void out.push(s);

  push("# #189 emit-flip — migration inventory (this repo)");
  push();
  push(
    "Generated flip-safety inventory: every buildable in-repo site the #189 emit flip (design of record " +
      "`docs/emit-consistency-189-design.md` §9 step 4) turns from a validation WARNING into a hard " +
      "ERROR. This is the enumeration that keeps the flip from breaking anything silently. The census " +
      "walks the WHOLE repo, skipping the `node_modules/ dist/ build/ tmp/ .git/ coverage/` directories " +
      "and any hidden (dot-prefixed) directory; build-failed and excluded files are accounted for in " +
      "their own sections below. Production content lives in separate repos and is each content KE's " +
      "responsibility (see the external-content section).",
  );
  push();
  push("> **This is a generated artifact — do not hand-edit.** Re-run the scanner to refresh it.");
  push(">");
  push(`> - Command: \`${prov.command}\``);
  push(`> - Commit: \`${prov.commit}\``);
  push(`> - Census root: \`${rel(report.root) || "."}\``);
  push();

  // -- Scan integrity ---------------------------------------------------------------------------
  push("## Scan integrity");
  push();
  if (report.failures.length === 0) {
    push("✅ **Clean.** Closed-set equation holds; no dead exclusion rule; reconciliation passed.");
  } else {
    push("❌ **INVALID — the scan found integrity failures (the inventory below is NOT trustworthy):**");
    push();
    for (const f of report.failures) push(`- ${f}`);
  }
  push();
  push(
    `- Reconciliation (oracle ↔ authoritative single-file validator, \`no-bare-scalar-code\`): ` +
      `${report.reconcile.ok ? "✅ agree" : `❌ ${report.reconcile.divergences.length} divergence(s)`}`,
  );
  push();

  // -- Closed-set accounting --------------------------------------------------------------------
  push("## Closed-set accounting");
  push();
  push("`discovered = included ∪ excluded ∪ build-failed` (pairwise-disjoint; every `.crl` under the census root).");
  push();
  push("| Category | Files |");
  push("| --- | ---: |");
  const c = report.counts;
  push(`| **discovered** | ${c.discovered} |`);
  push(`| included — canonical-content | ${c.byCategory["canonical-content"]} |`);
  push(`| included — corpus | ${c.byCategory.corpus} |`);
  push(`| included — example-harness | ${c.byCategory["example-harness"]} |`);
  push(`| included — golden-source | ${c.byCategory["golden-source"]} |`);
  push(`| included — clean-fixture | ${c.byCategory["clean-fixture"]} |`);
  push(`| **included (total)** | ${c.included} |`);
  push(`| excluded (manifest) | ${c.excluded} |`);
  push(`| build-failed | ${c.buildFailed} |`);
  push();
  const buildFailed = report.census.filter((e) => e.category === "build-failed");
  if (buildFailed.length > 0) {
    push("**Build-failed files** (lex/parse/build failure — no current emit for the flip to break, but " +
      "listed so a reader can confirm each is intentional; fix or manifest-exclude with a reason):");
    push();
    for (const e of buildFailed) push(`- \`${rel(e.filePath)}\` — ${escapeInline(e.reason ?? "parse failure")}`);
    push();
  }

  // -- Migration targets ------------------------------------------------------------------------
  push("## Migration targets — bare scalar `code is` (`no-bare-scalar-code`)");
  push();
  push(
    `${report.targets.length} concept(s). Each publishes its raw local code as a boolean existence today; ` +
      "the flip requires an explicit reduction (design §3). Migration class is the rule's own suggested " +
      "action, conditioned on value type then representation count. A single-rep `value-read` row may " +
      "carry a **blocker** when `most recent this` is not mechanically applicable — the effective " +
      "resource's value element is valueless (e.g. Condition) or does not admit the value type " +
      "(design §8). A missing `type is` is NOT a blocker (it defaults to Observation).",
  );
  push();
  for (const { category, heading, blurb } of INCLUDED_SECTIONS) {
    const rows = report.targets.filter((t) => categoryOfTarget(t, report) === category);
    if (rows.length === 0) continue;
    push(`### ${heading}`);
    push();
    push(`_${blurb}_`);
    push();
    for (const t of rows) push(renderTarget(t, rel));
    push();
  }
  if (report.targets.length === 0) push("_None found._");
  push();

  // -- Excluded-family targets ------------------------------------------------------------------
  push("## Targets inside excluded (intentional-error) fixtures");
  push();
  push(
    `${report.excludedTargets.length} bare-scalar target(s) sit inside excluded fixture families. They are ` +
      "NOT reconciled (their cluster fails validation for its own intentional reason), but the flip adds a " +
      "`no-bare-scalar-code` error to these fixtures too — so at T5/T6 their **expected validation output " +
      "changes**. That churn MAY surface as CI test failures, but a fixture test can assert only its own " +
      "intended error and keep passing — so treat these rows as an explicit T5/T6 worklist (migrate, or " +
      "record the expected new diagnostic), not a guaranteed-loud signal.",
  );
  push();
  if (report.excludedTargets.length === 0) {
    push("_None._");
  } else {
    for (const e of report.excludedTargets) {
      push(
        `- \`${e.decl.conceptName}\` — \`${rel(e.decl.filePath)}:${e.decl.line}\` · ${e.migrationClass} · ` +
          `family: ${escapeInline(e.familyReason)}`,
      );
    }
  }
  push();

  // -- Non-target census ------------------------------------------------------------------------
  push("## Audited non-target census (local-coded concepts that are NOT targets)");
  push();
  push("Every local-coded concept the flip does NOT break, classified — so exemptions are visible, not absent.");
  push();
  push("| Reason | Count |");
  push("| --- | ---: |");
  for (const reason of NON_TARGET_ORDER) {
    const n = report.nonTargets.filter((e) => e.reason === reason).length;
    push(`| ${reason} | ${n} |`);
  }
  push();
  for (const reason of NON_TARGET_ORDER) {
    const rows = report.nonTargets.filter((e) => e.reason === reason);
    if (rows.length === 0) continue;
    push(`<details><summary><code>${reason}</code> — ${rows.length} (migration: ${escapeInline(rows[0].note)})</summary>`);
    push();
    for (const e of rows) {
      push(`- \`${rel(e.decl.filePath)}:${e.decl.line}\` — \`${e.decl.conceptName}\` (${e.decl.libraryName ?? "?"})`);
    }
    push();
    push("</details>");
    push();
  }

  // -- Secondary section ------------------------------------------------------------------------
  push("## Secondary — other flip-enforced warning→error kinds");
  push();
  push(
    "Best-effort census of the OTHER validation warnings the flip also hardens (design §2/§7), from an " +
      "EXPLICIT closed rule set. NOT reconciled (only `no-bare-scalar-code` has an oracle). Deliberately " +
      "excluded: `shape-marker-not-emit-active` (deleted at the flip), `count-threshold-trivial` (does not " +
      "flip), `use-site-operand-untyped` (owned by #257, not this flip).",
  );
  push();
  if (report.secondaryWarnings.length === 0) {
    push("_None found in-repo._");
  } else {
    const byRule = new Map<string, typeof report.secondaryWarnings>();
    for (const w of report.secondaryWarnings) {
      const list = byRule.get(w.rule) ?? [];
      list.push(w);
      byRule.set(w.rule, list);
    }
    push("| Rule | Count |");
    push("| --- | ---: |");
    for (const [rule, list] of [...byRule].sort((a, b) => a[0].localeCompare(b[0]))) {
      push(`| \`${rule}\` | ${list.length} |`);
    }
  }
  push();

  // -- Known-not-enumerable ---------------------------------------------------------------------
  push("## Known-not-enumerable (declared) — zero-signal flip blockers");
  push();
  push(
    "The flip also errors on classes NO shipped diagnostic can enumerate from a warning harvest " +
      "(design §8 + the validator's own deferral headers). T4 DECLARES them (undeclared would read as " +
      "presumed-enumerated); structurally enumerating them is an owned T5/T7 obligation:",
  );
  push();
  push(
    "- **`value-type-must-match-a-real-element`** — a value-reading reduction whose value type has no real " +
      "FHIR element on its resource. T4 pre-surfaces the mechanically-detectable slice as a per-target " +
      "**blocker** (via the T3a `fhirValueModel` cross-check); the residue is T7-wired.",
  );
  push("- **`most recent this` on a valueless representation** — same T3a cross-check; also surfaced as a blocker.");
  push(
    "- **`type is`-vs-operand agreement** — a `most recent \"X\"` selecting from a `RecordSet<R>` whose `R` " +
      "disagrees with the concept's `type is` (reductionShapeValidator.ts:318-327 — \"left for the flip step\").",
  );
  push(
    "- **RecordSet + scalar-narrative orphan** — a `RecordSet` reduced by an orphaned scalar narrative " +
      "selection with no warning carrier today (reductionShapeValidator.ts:59-62).",
  );
  push(
    "- **cross-library named reduction operand** — `resolveConcept` is self-scope-only " +
      "(referenceResolver.ts:520-524), so a foreign-qualified `exists \"OtherLib\".\"X\"` over a non-RecordSet " +
      "operand emits NO warning today — absent from both the target and secondary censuses.",
  );
  push(
    "- **residual guard hole** — the non-boolean guard case the validator flags as reachable-but-unhardened " +
      "(useSiteTypeValidator.ts:639-641).",
  );
  push();

  // -- Validator-message discrepancy ------------------------------------------------------------
  push("## Validator-message discrepancy (a flip consideration)");
  push();
  push(
    "For a bare-scalar concept with **no single value type** (none declared, or more than one), the shipped " +
      "`no-bare-scalar-code` message currently suggests `add \\`definition is exists this\\`` (treating an " +
      "undefined value type as boolean, reductionShapeValidator.ts:388-390). This inventory instead " +
      "classifies it `value-type-unresolved` and the KE guide says **declare a single value type first** — " +
      "the charter-correct step (North Star §3: the declared value type decides the owed reduction; a copied " +
      "`exists this` would manufacture a boolean). **The validator's suggested-action text should be " +
      "corrected at the flip** so the shipped message and this guidance agree. (In-repo this class is " +
      "currently empty.)",
  );
  push();

  // -- External-content follow-up ---------------------------------------------------------------
  push("## External content — delegated to each content repo's KE");
  push();
  push(
    "Production content lives in SEPARATE repos (e.g. `hcsc-content`, one artifact per branch pre-ship; " +
      "`main` accretes artifact folders once shipped). **This scanner does NOT scan or migrate external " +
      "content** — each content repo's KE migrates their own, using:",
  );
  push();
  push("- The migration guide: `docs/emit-189-migration-guide.md` (the four migration cases + prerequisites).");
  push("- A CRL package version at or past the flip release (so the reduction forms emit instead of erroring).");
  push();
  push(
    "The flip's RELEASE coordination (don't enforce until known content owners have migrated) is a " +
      "communication/versioning step owned by the operator — NOT an in-repo gate.",
  );
  push();

  // -- T7 gate (in-repo) ------------------------------------------------------------------------
  push("## T7 staleness gate (in-repo)");
  push();
  push(
    "T5/T6 change content + goldens before the flip. At T7, **re-run the scanner and diff against this " +
      "committed inventory** — a stale artifact is the silent breakage T4 exists to prevent. The scanner " +
      "type-checks + tests in CI (an internal-API change breaks it loudly), and **T7 must run the scanner " +
      "in CI** (the runner's exclusion-manifest dead-rule check only fires when the script actually runs).",
  );
  push();

  return out.join("\n");
}

const NON_TARGET_ORDER: NonTargetEntry["reason"][] = [
  "explicit-reduction-or-derivation",
  "value-projection-reduction-exempt",
  "legal-recordset-publication",
  "both-rep-churn",
  "other",
];

function categoryOfTarget(t: MigrationTarget, report: InventoryReport): FileCategory {
  const entry = report.census.find((e) => e.filePath === t.decl.filePath);
  return entry?.category ?? "canonical-content";
}

function renderTarget(t: MigrationTarget, rel: (p: string) => string): string {
  const lines: string[] = [];
  const vt = t.decl.valueTypes.length ? t.decl.valueTypes.join("|") : "(none)";
  lines.push(
    `- **\`${t.decl.conceptName}\`** — \`${rel(t.decl.filePath)}:${t.decl.line}\` · ` +
      `lib \`${t.decl.libraryName ?? "?"}\` · value type \`${vt}\``,
  );
  lines.push(`  - **Migration (${t.migrationClass}):** ${escapeInline(t.migrationStep)}`);
  if (t.roles.length === 0) {
    lines.push("  - **Consumed by:** _(unreferenced in-repo)_");
  } else {
    lines.push(`  - **Consumed by (${t.roles.length}):**`);
    for (const r of dedupeRoles(t.roles)) {
      lines.push(
        `    - \`${r.edgeKind}\` ← ${r.ownerKind} \`${r.ownerName}\` ` +
          `(\`${rel(r.filePath)}:${r.line}\`, as ${escapeInline(r.referentRef)})`,
      );
    }
  }
  if (t.blockers.length > 0) {
    lines.push("  - **⚠ Migration blockers:**");
    for (const b of t.blockers) lines.push(`    - ${escapeInline(b)}`);
  }
  return lines.join("\n");
}

/** Stable de-dup of identical edge evidence (same site can be walked once; guards against accidental
 *  double-count without hiding genuinely distinct referrers). */
function dedupeRoles(roles: EdgeEvidence[]): EdgeEvidence[] {
  const seen = new Set<string>();
  const out: EdgeEvidence[] = [];
  for (const r of roles) {
    const k = `${r.edgeKind}|${r.filePath}|${r.line}|${r.ownerName}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Neutralize pipe/newline so a message can't break a table row or the list structure. */
function escapeInline(s: string): string {
  return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}
