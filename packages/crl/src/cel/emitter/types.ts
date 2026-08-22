import type { Location } from "../ast/types";

/** A single emitted FHIR resource as a JSON-shaped object. */
export interface EmittedResource {
  resourceType: string;
  id: string;
  /** Directory the writer should place this under, relative to out-dir. */
  outputPath: string;
  /** Full FHIR resource body as a JSON-shaped JS object. */
  body: Record<string, unknown>;
}

/** Per-case grouping of emitted resources. */
export interface EmittedCase {
  /** Slugified case name. */
  caseSlug: string;
  /** Slugified library name. */
  librarySlug: string;
  /** Resources emitted for this case (Patient + 1-per-fact-reference). */
  resources: EmittedResource[];
}

export interface EmitDiagnostic {
  kind: EmitDiagnosticKind;
  message: string;
  severity: "error" | "warning";
  caseSlug?: string;
  factName?: string;
  location?: Location;
  filePath?: string;
}

export type EmitDiagnosticKind =
  /** A fact's `defined by` couldn't derive a bare FHIR type — case is skipped per pitch v4. */
  | "unsupported-yet"
  /** A `result is` line was parsed but not emitted (deferred to #70/metric). */
  | "result-deferred"
  /** Pre-condition for emit failed (parse error, unresolved covers, etc.) — case skipped. */
  | "precondition-failed"
  /** #189 T3b — a local `code is` fact could not derive its `{system, code}` (no canonicalBase, no covers
   *  closure, empty concept code, or url composition threw). The fact is SKIPPED, never emitted coding-less
   *  (a coding-less instance is silently dropped by `$apply` → wrong PA determination). */
  | "local-coding-derivation-failed"
  /** #189 T3b — a LOCAL-concept fact ALSO carries its own authored `code` token. The code must derive from the
   *  concept; §5 forbids silently preferring one, so the fact is SKIPPED with this error. */
  | "local-authored-code-conflict";

export interface EmitResult {
  /** Cases that emitted at least one resource (per-case atomic). */
  emittedCases: EmittedCase[];
  /** Diagnostics across all cases. unsupported-yet warnings cause exit-nonzero in the CLI. */
  diagnostics: EmitDiagnostic[];
}

export interface EmitOptions {
  /**
   * Output directory root. Resources are written under
   * <outDir>/patient/<library-slug>/<case-slug>/<FHIR Type>/<resource-id>.json
   * per pitch v4 success signal. Required when calling `emitCelToFhirAndWrite`.
   */
  outDir?: string;
  /**
   * If true, in-memory emit only — no files written. Useful for tests and for
   * the future CEL extension preview. Defaults to false; if `outDir` is set,
   * defaults remain false (writes happen).
   */
  dryRun?: boolean;
}
