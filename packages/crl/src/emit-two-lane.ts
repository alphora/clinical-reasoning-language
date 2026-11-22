import { emitFhirDefFromPath, isFhirDefError, isFhirDefWarning, type Capability } from "./fhir-emitter";
import type { emitCQLImports } from "./imports/emit";

import { emitDefinitionLanesFromPath } from "./fhir-emitter/closureOrchestrator";
import { ExternalBindingError, type ExternalBindingsV1, type SnapshotProvenance, type SupportSubset } from "./emit/externalBindings";

/** Unreleased v1 definition-assembly option. CRE/CEL do not consume external bindings. */
export interface EmitCrlTwoLaneOptions {
  date?: string;
  capability?: Capability;
  sourceOverlays?: ReadonlyMap<string, string>;
  externalBindings?: ExternalBindingsV1;
}

/** One emitted CQL library file (name + source) — a caller writes it to `<out>/cql/`. */
export interface TwoLaneCqlLibrary {
  outputFilename: string;
  cql: string;
}

export interface EmitCrlTwoLaneResult {
  externalAssembly?: { provenance: readonly SnapshotProvenance[]; canonicalBases: readonly string[]; inventory: SupportSubset; sourceEvaluation: "unsupported" };
  /** True iff BOTH lanes are free of hard errors AND no CQL filename collides. */
  success: boolean;
  /** The FHIR-Definition lane result (resources, unmatched, diagnostics, metadataErrors). */
  fhir: ReturnType<typeof emitFhirDefFromPath>;
  /** The layered CQL lane result (the closure the FHIR Libraries reference). */
  cql: ReturnType<typeof emitCQLImports>;
  /** The CQL library files to write under `<out>/cql/` (name + source). */
  cqlLibraries: TwoLaneCqlLibrary[];
  /** FHIR-lane-only blocking errors: fhir-def + metadata + import(error). Lets callers attribute by lane. */
  fhirHardErrors: unknown[];
  /** Aggregated BLOCKING errors across both lanes: fhirHardErrors + cql (when the CQL lane failed). */
  hardErrors: unknown[];
  /** Non-blocking warnings: fhir-def warnings + import(warning). */
  warnings: unknown[];
  /** CQL output filenames that >1 library would write to; non-empty ⇒ not success. */
  filenameCollisions: string[];
}

/**
 * Two-lane CRL emit — the FHIR Definition resources AND the layered CQL closure
 * they reference, from ONE `.crl`. This is the SINGLE shared composition behind
 * BOTH the `crl-emit --target fhir-def` CLI and the `emit_crl` MCP tool, so the
 * two cannot drift: each just calls this and then either writes the result to
 * disk (CLI) or returns it as JSON (MCP).
 *
 * Emitting one lane without the other ships broken references — the FHIR
 * `Library.content[0].attachment.url` points at the sibling `../../cql/<name>.cql`
 * (a prior review [critical]). This function is PURE (no disk writes / no
 * process exit): callers write `fhir.resources` to `<out>/fhir/` and
 * `cqlLibraries` to `<out>/cql/`, or serialize both.
 *
 * Error aggregation mirrors the CLI's `--target fhir-def` block exactly (the
 * behavior the run-emitter tests pin).
 */
export function emitCrlTwoLane(
  filePath: string,
  opts: EmitCrlTwoLaneOptions = {},
): EmitCrlTwoLaneResult {
  // REFACTOR:grounded (Medical Review): one candidate graph supplies both lanes.
  let lanes: ReturnType<typeof emitDefinitionLanesFromPath>;
  try { lanes = emitDefinitionLanesFromPath(filePath, {
    ...(opts.date !== undefined ? { date: opts.date } : {}),
    ...(opts.capability !== undefined ? { capability: opts.capability } : {}),
  }, opts.sourceOverlays, true, opts.externalBindings); }
  catch (error) {
    if (!(error instanceof ExternalBindingError)) throw error;
    const diagnostic = { type: "Validation" as const, kind: error.kind, message: error.message };
    return { success: false, fhir: { success: false, resources: [], errors: [diagnostic], unmatched: [], importDiagnostics: [], metadataErrors: [] },
      cql: { success: false, graph: { rootPath: filePath, resolvedLibraries: [], localLibraries: [], namespace: { concepts: new Map(), terminologies: new Map(), decisions: new Map(), activities: new Map(), parameters: new Map() }, diagnostics: [] }, importDiagnostics: [], cqlByLibrary: [], errors: [diagnostic] },
      cqlLibraries: [], fhirHardErrors: [diagnostic], hardErrors: [diagnostic], warnings: [], filenameCollisions: [] };
  }
  return definitionLanesResult(lanes);
}

/** Internal aggregation shared with original-context support capture; not an SDK entry point. */
export function definitionLanesResult(lanes: ReturnType<typeof emitDefinitionLanesFromPath>): EmitCrlTwoLaneResult {
  const { fhir } = lanes;
  const cql = lanes.cql!;

  // CQL filename-collision pre-check (two libraries writing the same file).
  const seen = new Set<string>();
  const filenameCollisions: string[] = [];
  for (const entry of cql.cqlByLibrary) {
    if (seen.has(entry.outputFilename)) filenameCollisions.push(entry.outputFilename);
    seen.add(entry.outputFilename);
  }

  const fhirHardErrors: unknown[] = [
    ...fhir.errors.filter(isFhirDefError),
    ...fhir.metadataErrors,
    ...fhir.importDiagnostics.filter((d) => d.severity === "error"),
  ];
  const hardErrors: unknown[] = [
    ...fhirHardErrors,
    ...(cql.success ? [] : (cql.errors ?? [])),
  ];
  const warnings: unknown[] = [
    ...fhir.errors.filter(isFhirDefWarning),
    ...fhir.importDiagnostics.filter((d) => d.severity === "warning"),
  ];

  const cqlLibraries = cql.cqlByLibrary.map((e) => ({
    outputFilename: e.outputFilename,
    cql: e.cql,
  }));

  // `success` requires BOTH lanes CLEAN — including no FHIR `unmatched` refs.
  // The FHIR orchestrator treats unmatched as failure (its own `success` is
  // false), and a caller gating on this flag must not accept a deliverable with
  // unresolved references, so fold `fhir.unmatched` into the predicate.
  const success =
    hardErrors.length === 0 &&
    cql.success &&
    filenameCollisions.length === 0 &&
    fhir.unmatched.length === 0;
  return { success, fhir, cql, cqlLibraries, fhirHardErrors, hardErrors, warnings, filenameCollisions,
    ...(lanes.externalAssembly ? { externalAssembly: { ...lanes.externalAssembly, sourceEvaluation: "unsupported" as const } } : {}) };
}
