/**
 * File-level provenance validation — the shared implementation behind BOTH the `crl-validate-provenance` CLI bin and
 * the `validate_provenance` MCP tool (so they can't drift). Reads the three inputs, resolves the .cel's CRL closure,
 * builds the index, derives coverage, and runs the §9 validators. Throws on unreadable/invalid input — callers (CLI /
 * MCP handler) catch and present.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { effectiveCaseId } from "../cel/ast/caseId";
import type { CELCase } from "../cel/ast/types";
import { resolveCelImports } from "../cel/imports";

import type { ProvenanceArtifact } from "./artifact";
import { buildProvenanceIndex, type ProvenanceIndexDiagnostic } from "./indexer";
import { validateProvenance, type ProvenanceFinding } from "./validators";

export interface ValidateProvenanceFilesResult {
  policyId: string;
  policyVersion: string;
  diagnostics: ProvenanceIndexDiagnostic[];
  findings: ProvenanceFinding[];
  errorCount: number;
  manualReviewCount: number;
  warningCount: number;
  pass: boolean;
}

export function validateProvenanceFiles(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
): ValidateProvenanceFilesResult {
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

  const findings = validateProvenance(artifact, index, anchorText, { celCaseIds, frozenCaseIds });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    policyId: artifact.policyId,
    policyVersion: artifact.policyVersion,
    diagnostics: index.diagnostics,
    findings,
    errorCount,
    manualReviewCount: findings.filter((f) => f.severity === "manual-review").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    pass: errorCount === 0,
  };
}
