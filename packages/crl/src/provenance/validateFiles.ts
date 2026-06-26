/**
 * File-level provenance resolution + validation — the shared implementation behind the `crl-validate-provenance` CLI
 * bin, the `validate_provenance` MCP tool, AND the correspondence view-model (so none can drift). `resolveProvenance`
 * does the read-files → resolve-CRL-closure → build-index → derive-coverage → run-§9-validators pipeline ONCE and
 * returns every intermediate the consumers need (the validator projection threw the index/coverage/anchorText away).
 * Throws on unreadable/invalid input — callers (CLI / MCP handler / cockpit) catch and present.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { effectiveCaseId } from "../cel/ast/caseId";
import type { CELCase } from "../cel/ast/types";
import { resolveCelImports } from "../cel/imports";
import type { ResolvedCelGraph } from "../cel/imports/types";

import type { AnchorSourceMeta, ProvenanceArtifact } from "./artifact";
import { deriveCoverage, type CoverageReport } from "./coverage";
import {
  buildProvenanceIndex,
  type ProvenanceIndex,
  type ProvenanceIndexDiagnostic,
} from "./indexer";
import {
  validateProvenance,
  WAIVER_KINDS,
  type ProvenanceFinding,
  type ProvenanceValidationMode,
} from "./validators";

/** Every intermediate of the provenance pipeline — consumed by both the validator projection and the cockpit model. */
export interface ResolveProvenanceResult {
  artifact: ProvenanceArtifact;
  anchor: { filePath: string; text: string; meta: AnchorSourceMeta };
  graph: ResolvedCelGraph;
  index: ProvenanceIndex;
  coverage: CoverageReport;
  findings: ProvenanceFinding[];
  celCaseIds: Map<string, Set<string>>;
  frozenCaseIds: Map<string, Set<string>>;
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  /** Count of attribution-class findings (the coverage backlog). In worklist mode these are graded "warning"; in final mode they are at native severity. */
  worklistCount: number;
  /** Count of WAIVER-kind findings (the judge-lens escape hatches) — FINAL mode only (worklist skips them); all manual-review. */
  waiverCount: number;
  /** Of `waiverCount`, the ones flagged `scrutiny:"scrutinize"` (the Judge must adjudicate); the rest are routine rubber-stamps. */
  waiverScrutinizeCount: number;
  pass: boolean;
}

export function resolveProvenance(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
  mode: ProvenanceValidationMode = "final",
): ResolveProvenanceResult {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as ProvenanceArtifact;
  const anchorText = readFileSync(anchorPath, "utf8");
  const graph = resolveCelImports(celPath);
  const index = buildProvenanceIndex(graph);

  // caseId sets from the resolved .cel, keyed by both basename and absolute path (the artifact's CelNodeRef.file may use either).
  const cases = (graph.cel?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
  const effective = new Set(cases.map((c, i) => effectiveCaseId(c, i)));
  const frozen = new Set(
    cases.filter((c) => c.caseId !== undefined).map((c) => c.caseId as string),
  );
  const celCaseIds = new Map([
    [basename(celPath), effective],
    [graph.filePath, effective],
  ]);
  const frozenCaseIds = new Map([
    [basename(celPath), frozen],
    [graph.filePath, frozen],
  ]);

  const coverage = deriveCoverage(artifact, index, anchorText);
  const findings = validateProvenance(artifact, index, anchorText, {
    celCaseIds,
    frozenCaseIds,
    mode,
  });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    artifact,
    anchor: { filePath: anchorPath, text: anchorText, meta: artifact.anchorSource },
    graph,
    index,
    coverage,
    findings,
    celCaseIds,
    frozenCaseIds,
    errorCount,
    manualReviewCount: findings.filter((f) => f.severity === "manual-review").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    worklistCount: findings.filter((f) => f.class === "attribution").length,
    waiverCount: findings.filter((f) => WAIVER_KINDS.has(f.kind)).length,
    // Constrain to WAIVER_KINDS (not just scrutiny==="scrutinize") so a stray non-waiver scrutiny can never push this
    // above waiverCount and make the CLI's derived routine count (waiverCount - waiverScrutinizeCount) go negative.
    waiverScrutinizeCount: findings.filter((f) => WAIVER_KINDS.has(f.kind) && f.scrutiny === "scrutinize")
      .length,
    // pass stays errorCount===0: in worklist mode the attribution backlog is "warning" → doesn't fail.
    pass: errorCount === 0,
  };
}

export interface ValidateProvenanceFilesResult {
  policyId: string;
  policyVersion: string;
  diagnostics: ProvenanceIndexDiagnostic[];
  findings: ProvenanceFinding[];
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  /** Count of attribution-class findings (the coverage backlog) — the KE's "remaining work" tally; warning-graded in worklist mode. */
  worklistCount: number;
  /** Count of WAIVER-kind findings (the judge-lens escape hatches to adjudicate) — FINAL mode only; all manual-review. */
  waiverCount: number;
  /** Of `waiverCount`, the ones flagged `scrutiny:"scrutinize"` (the Judge must adjudicate); the rest are routine rubber-stamps. */
  waiverScrutinizeCount: number;
  pass: boolean;
}

/** Thin projection of `resolveProvenance` — the findings + counts surface for the CLI and the `validate_provenance` MCP tool. */
export function validateProvenanceFiles(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
  mode: ProvenanceValidationMode = "final",
): ValidateProvenanceFilesResult {
  const r = resolveProvenance(artifactPath, celPath, anchorPath, mode);
  return {
    policyId: r.artifact.policyId,
    policyVersion: r.artifact.policyVersion,
    diagnostics: r.index.diagnostics,
    findings: r.findings,
    errorCount: r.errorCount,
    manualReviewCount: r.manualReviewCount,
    warningCount: r.warningCount,
    worklistCount: r.worklistCount,
    waiverCount: r.waiverCount,
    waiverScrutinizeCount: r.waiverScrutinizeCount,
    pass: r.pass,
  };
}
