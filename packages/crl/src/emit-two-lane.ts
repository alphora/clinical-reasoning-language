import { emitFhirDefFromPath, isFhirDefError, isFhirDefWarning, type Capability } from "./fhir-emitter";
import { emitCQLImports } from "./imports/emit";

/** One emitted CQL library file (name + source) — a caller writes it to `<out>/cql/`. */
export interface TwoLaneCqlLibrary {
  outputFilename: string;
  cql: string;
}

export interface EmitCrlTwoLaneResult {
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
  opts: { date?: string; capability?: Capability } = {},
): EmitCrlTwoLaneResult {
  const fhir = emitFhirDefFromPath(filePath, {
    ...(opts.date !== undefined ? { date: opts.date } : {}),
    ...(opts.capability !== undefined ? { capability: opts.capability } : {}),
  });
  const cql = emitCQLImports(filePath);

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
  return { success, fhir, cql, cqlLibraries, fhirHardErrors, hardErrors, warnings, filenameCollisions };
}
