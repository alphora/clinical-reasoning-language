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
  /**
   * #189 CEL-writer T3b (disc 490). filePaths of the include-walked closure seeded from `coversTarget` — the CEL
   * analog of the CQL/FHIR lane's `graph.resolvedLibraries` (both are `walkIncludes(seed, registry)`). The
   * instance emitter's derive-local uses it as the `primarySeedPaths` for the shared local-domain resolver, so a
   * local fact's `{system, code}` byte-matches the CQL retrieve's CodeSystem by construction. Absent when there
   * is no covers target (derive-local then fails loudly — no silent fallback, disc 490 [critical]).
   *
   * ⚠ By-construction byte-match holds ONLY when the covered library IS the project's emit entry (disc 490
   * Fable #1): `graph.resolvedLibraries` on the definition lane is the walk from the EMIT ENTRY, and the two
   * walks coincide only then. Covering a non-entry library is outside the guarantee for now.
   */
  resolvedLibraryPaths?: ReadonlySet<string>;
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
