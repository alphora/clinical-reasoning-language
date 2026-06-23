// Validation-cockpit findings-panel CORE (vscode-free, unit-tested) — roadmap #156 slice 1 / T2.
// Two pure pieces, mirroring the renderScenarioHtml/scenarioWatch split (the vscode glue lives in provenancePanel.ts):
//   - discoverProvenance(celPath): structurally locate the provenance artifact + anchor for the active .cel, as a
//     DECISION RECORD (which artifact, why, ambiguity) — NOT a silent pick (that was the false-PASS risk in review).
//   - buildFindingsTree(model): project a CorrespondenceModel into a SHELL-AGNOSTIC tree (severity groups, a prominence
//     ENUM, and composed navigable descriptors) — no vscode types, so a future webview (C) can reuse it.
// Design authority + 2-round design-review log: .vibe-tools/discussions/112-findings-panel.md.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import type { CorrespondenceModel, FindingTarget } from "@smile-digital-health/crl";
import { canonicalize } from "@smile-digital-health/crl/language-services";

// ── discovery ────────────────────────────────────────────────────────────────

export type ProvenanceDiscovery =
  | {
      found: true;
      status: "ok" | "cel-mismatch" | "ambiguous";
      artifactPath: string;
      anchorPath: string;
      policyVersion?: string;
      warnings: string[];
      candidates: string[];
    }
  | { found: false; status: "none" | "error"; reason: string; candidates: string[]; warnings: string[] };

// Minimal structural view of the artifact JSON — discovery only reads these fields.
interface ArtifactLite {
  policyVersion?: string;
  anchorSource?: { textHash?: string };
  clusters?: { cel?: { file?: string }[] }[];
}

/** The policy `src/` dir is the first ancestor of the .cel whose basename is `src` and that has a `provenance/` child.
 *  Exported so the panel can scope its FileSystemWatcher to this policy (not the whole workspace). */
export function findPolicySrc(celPath: string): string | undefined {
  let dir = dirname(celPath);
  for (;;) {
    if (basename(dir) === "src" && existsSync(join(dir, "provenance"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function listFiles(dir: string, suffix: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(suffix))
      .map((f) => join(dir, f))
      .sort(); // STABLE order (no version ranking — round 2)
  } catch {
    return [];
  }
}

/** Does an artifact's cluster cel-refs reference the active .cel? Abs/path refs canonical-compared; bare names by basename. */
function referencesCel(a: ArtifactLite, celPath: string, policySrc: string): boolean {
  const celAbs = canonicalize(celPath);
  const celBase = basename(celPath).toLowerCase();
  for (const cl of a.clusters ?? [])
    for (const cr of cl.cel ?? []) {
      const f = cr.file;
      if (!f) continue;
      if (isAbsolute(f) || f.includes("/") || f.includes("\\")) {
        if (canonicalize(isAbsolute(f) ? f : resolve(policySrc, f)) === celAbs) return true;
      } else if (f.toLowerCase() === celBase) return true;
    }
  return false;
}

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** Resolve the anchor: the single `anchor-source/*.txt`, or — when >1 — the one whose hash matches the artifact's textHash. */
function resolveAnchor(anchorDir: string, artifact: ArtifactLite): { anchorPath?: string; warning?: string } {
  const txts = listFiles(anchorDir, ".txt");
  if (txts.length === 0) return { warning: "no anchor-source/*.txt found" };
  if (txts.length === 1) return { anchorPath: txts[0] };
  const want = artifact.anchorSource?.textHash;
  if (want) {
    for (const t of txts) {
      try {
        if (sha256(readFileSync(t, "utf8")) === want) return { anchorPath: t };
      } catch {
        /* unreadable candidate — skip */
      }
    }
  }
  return { anchorPath: txts[0], warning: `multiple anchor-source files; using ${basename(txts[0])} (no textHash match)` };
}

export function discoverProvenance(celPath: string): ProvenanceDiscovery {
  try {
    const src = findPolicySrc(celPath);
    if (!src) return { found: false, status: "none", reason: "not inside a policy src/ dir with a provenance/ folder", candidates: [], warnings: [] };
    const candidates = listFiles(join(src, "provenance"), ".provenance.json");
    if (candidates.length === 0)
      return { found: false, status: "none", reason: "no provenance artifact for this policy", candidates: [], warnings: [] };

    const warnings: string[] = [];
    const parsed: { path: string; a: ArtifactLite }[] = [];
    for (const p of candidates) {
      try {
        parsed.push({ path: p, a: JSON.parse(readFileSync(p, "utf8")) as ArtifactLite });
      } catch (e) {
        warnings.push(`ignored unparseable ${basename(p)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (parsed.length === 0) return { found: false, status: "error", reason: "no parseable provenance artifact", candidates, warnings };

    const matches = parsed.filter((p) => referencesCel(p.a, celPath, src));
    let chosen: { path: string; a: ArtifactLite };
    let status: "ok" | "ambiguous" | "cel-mismatch";
    if (matches.length === 1) {
      chosen = matches[0];
      status = "ok";
    } else if (matches.length > 1) {
      chosen = matches[0]; // already stable-sorted by path
      status = "ambiguous";
      warnings.push(
        `multiple artifacts reference this .cel; using ${basename(chosen.path)} (candidates: ${matches.map((m) => basename(m.path)).join(", ")})`,
      );
    } else {
      chosen = parsed[0]; // none reference the active .cel
      status = "cel-mismatch";
      warnings.push("no artifact references the open .cel; showing the first found");
    }

    const { anchorPath, warning } = resolveAnchor(join(src, "anchor-source"), chosen.a);
    if (warning) warnings.push(warning);
    if (!anchorPath) return { found: false, status: "error", reason: "could not resolve an anchor-source file", candidates, warnings };

    return { found: true, status, artifactPath: chosen.path, anchorPath, policyVersion: chosen.a.policyVersion, warnings, candidates };
  } catch (e) {
    return { found: false, status: "error", reason: e instanceof Error ? e.message : String(e), candidates: [], warnings: [] };
  }
}

// ── tree (shell-agnostic) ──────────────────────────────────────────────────────

export interface Zbr {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}
const ZERO: Zbr = { startLine: 0, startCol: 0, endLine: 0, endCol: 0 };

export type Prominence = "error" | "manual-review" | "warning" | "soft" | "info";
export type Pane = "source" | "crl" | "cel" | "anchor";
export type NavTarget =
  | { pane: Pane; navigable: true; filePath: string; range: Zbr }
  | { pane: Pane; navigable: false; reason: string };

export interface FindingNode {
  id: string;
  label: string;
  kind: string;
  prominence: Prominence;
  targets: NavTarget[];
}
export interface FindingsGroup {
  id: "notices" | "diagnostics" | "error" | "manual-review" | "warning";
  label: string;
  nodes: FindingNode[];
}

/** Diagnostic source → the pane its file belongs to (drives only the leaf icon; reveal uses filePath regardless). */
const DIAG_PANE: Record<CorrespondenceModel["diagnostics"][number]["source"], Pane> = {
  "cel-parse": "cel",
  "cel-import": "cel",
  "provenance-index": "crl",
  artifact: "source",
};
export interface FindingsSummary {
  errors: number;
  manualReview: number;
  warnings: number;
  mustLinkTotal: number;
  mustLinkImplemented: number;
  clean: boolean;
  policyVersion: string;
}
export interface FindingsTree {
  groups: FindingsGroup[];
  summary: FindingsSummary;
}

/** Compose a navigable descriptor from a model FindingTarget (the model's source/anchor targets carry NO filePath). */
function toNav(t: FindingTarget, anchorFilePath: string): NavTarget {
  if (t.pane === "anchor") return { pane: "anchor", navigable: true, filePath: anchorFilePath, range: ZERO };
  if (t.pane === "source") {
    if (t.resolution === "resolved" && t.displayRange)
      return { pane: "source", navigable: true, filePath: anchorFilePath, range: t.displayRange };
    return { pane: "source", navigable: false, reason: t.reason ?? "unresolved source span" };
  }
  // crl | cel
  if (t.resolution === "resolved" && t.location)
    return { pane: t.pane, navigable: true, filePath: t.location.filePath, range: t.location.range };
  return { pane: t.pane, navigable: false, reason: t.reason ?? `unresolved ${t.pane} reference` };
}

/** `notices` (e.g. discovery warnings: ambiguity, cel-mismatch, dropped-unparseable) surface as an info group on top. */
export function buildFindingsTree(model: CorrespondenceModel, notices: string[] = []): FindingsTree {
  const anchorFilePath = model.anchor.filePath;

  const noticeNodes: FindingNode[] = notices.map((message, i) => ({
    id: `notice:${i}`,
    label: message,
    kind: "discovery",
    prominence: "info",
    targets: [],
  }));

  const diagnostics: FindingNode[] = model.diagnostics.map((d, i) => ({
    id: `diag:${d.source}:${i}`,
    label: d.message,
    kind: `${d.source}:${d.kind}`,
    prominence: d.severity === "warning" ? "warning" : "error",
    targets: d.filePath
      ? [{ pane: DIAG_PANE[d.source], navigable: true, filePath: d.filePath, range: (d.range as Zbr) ?? ZERO }]
      : [],
  }));

  const bySeverity: Record<"error" | "manual-review" | "warning", FindingNode[]> = {
    error: [],
    "manual-review": [],
    warning: [],
  };
  for (const af of model.findings) {
    const sev = af.finding.severity;
    bySeverity[sev].push({
      id: af.id,
      label: af.finding.message,
      kind: af.finding.kind,
      prominence: af.finding.kind === "mn-keyword-soft" ? "soft" : sev,
      targets: af.targets.map((t) => toNav(t, anchorFilePath)),
    });
  }

  const groups: FindingsGroup[] = [];
  if (noticeNodes.length) groups.push({ id: "notices", label: "Notices", nodes: noticeNodes });
  // Diagnostics first — a build/parse/import issue outranks findings.
  if (diagnostics.length) groups.push({ id: "diagnostics", label: "Diagnostics", nodes: diagnostics });
  if (bySeverity.error.length) groups.push({ id: "error", label: "Errors", nodes: bySeverity.error });
  if (bySeverity["manual-review"].length)
    groups.push({ id: "manual-review", label: "Manual review", nodes: bySeverity["manual-review"] });
  if (bySeverity.warning.length) groups.push({ id: "warning", label: "Warnings", nodes: bySeverity.warning });

  const { errorCount, manualReviewCount, warningCount, mustLinkDecisionsTotal, mustLinkDecisionsImplemented } =
    model.rollup;
  return {
    groups,
    summary: {
      errors: errorCount,
      manualReview: manualReviewCount,
      warnings: warningCount,
      mustLinkTotal: mustLinkDecisionsTotal,
      mustLinkImplemented: mustLinkDecisionsImplemented,
      clean: errorCount === 0 && manualReviewCount === 0, // NOT rollup.pass (which ignores manual-review)
      policyVersion: model.policyVersion,
    },
  };
}

/** The one-line headline for the panel (TreeView.message). Never claims clean when manual-review > 0. */
export function headline(s: FindingsSummary, ambiguousVersion?: boolean): string {
  const coverage = `coverage ${s.mustLinkImplemented}/${s.mustLinkTotal}`;
  const v = ambiguousVersion && s.policyVersion ? ` · v${s.policyVersion}` : "";
  if (s.clean) return `✓ clean · ${coverage}${v}`;
  return `✗ ${s.errors} error(s) · ${s.manualReview} manual-review · ${s.warnings} warning(s) · ${coverage}${v}`;
}
