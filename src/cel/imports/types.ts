import type { CEL } from "../ast/types";
import type { Registry, RegistryEntry, ImportDiagnostic } from "../../imports/types";
import type { CRLError } from "../../types/errors";

/**
 * Resolved-graph for a CEL file. Built by `resolveCelImports`; consumed by the
 * CEL validator (Todo 4) and the FHIR emitter (Todo 5).
 */
export interface ResolvedCelGraph {
  /** Absolute canonical path of the .cel file. */
  filePath: string;
  /** Parsed CEL AST. Absent on parse failure (see celParseErrors). */
  cel?: CEL;
  /** Project root (the directory containing the nearest package.json). Absent when not found. */
  projectRoot?: string;
  /** The CRL registry built from the project closure. Absent when project root not found. */
  crlRegistry?: Registry;
  /** CRL RegistryEntry matching the `covers` declaration's library name. Absent when unresolved or no covers. */
  coversTarget?: RegistryEntry;
  /** Lex/parse diagnostics from buildCEL. */
  celParseErrors: CRLError[];
  /** Bridge diagnostics: project-root-not-found, unresolved-covers, covers-missing-but-cases-present, plus CRL-side pass-through. */
  diagnostics: CelImportDiagnostic[];
}

export type CelImportDiagnostic =
  | ProjectRootNotFoundDiagnostic
  | UnresolvedCoversDiagnostic
  | CoversMissingButCasesPresentDiagnostic
  | CrlImportPassthroughDiagnostic;

export interface ProjectRootNotFoundDiagnostic {
  kind: "project-root-not-found";
  severity: "error";
  fromPath: string;
}

export interface UnresolvedCoversDiagnostic {
  kind: "unresolved-covers";
  severity: "error";
  coversName: string;
  filePath: string;
}

export interface CoversMissingButCasesPresentDiagnostic {
  kind: "covers-missing-but-cases-present";
  severity: "error";
  filePath: string;
}

/** Pass-through of CRL-side ImportDiagnostic so consumers see one stream. */
export interface CrlImportPassthroughDiagnostic {
  kind: "crl-import";
  severity: "error" | "warning";
  underlying: ImportDiagnostic;
}
