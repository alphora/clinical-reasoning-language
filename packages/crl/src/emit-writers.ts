/**
 * Shared filesystem writer for the two-lane CRL emit (CQL closure + FHIR
 * Definition resources). This is the SINGLE write path behind BOTH the
 * `crl-emit --target fhir-def` CLI and the `emit_crl` MCP tool's `out`
 * directory, so the two surfaces cannot drift — each calls `writeTwoLane`
 * after `emitCrlTwoLane` produces the (pure) result.
 *
 * The CQL and FHIR lanes MUST ship together: the emitted
 * `Library.content[0].attachment.url` points at the sibling
 * `../../cql/<name>.cql`, so writing one lane without the other ships
 * broken references. `writeTwoLane` writes both under one `outDir`
 * (`<out>/cql/` + `<out>/fhir/`).
 *
 * Not transactional: writes are per-file, CQL first then FHIR. On a
 * filesystem failure the throw carries an `EmitWriteError.partial` listing
 * what was written so far, and `<out>` may hold a partial deliverable — the
 * caller (CLI: exit non-zero; MCP: isError) surfaces that.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { writeFhirResources } from "./fhir-emitter";
import type { EmitCrlTwoLaneResult } from "./emit-two-lane";

/** Absolute paths written per lane, in emit order. */
export interface TwoLaneWritten {
  cql: string[];
  fhir: string[];
}

/**
 * Thrown on a filesystem failure during a two-lane write. `partial` lists
 * the absolute paths already written before the failure, so a caller can
 * report (or clean up) the partial deliverable.
 */
export class EmitWriteError extends Error {
  constructor(
    message: string,
    readonly partial: TwoLaneWritten,
  ) {
    super(message);
    this.name = "EmitWriteError";
  }
}

/**
 * Resolve `child` under `baseAbs` and verify it does not escape (a defensive
 * LEXICAL containment check — `safeOutputFilename` already rejects
 * separators/`..` upstream, but the writer is a public surface reachable over
 * MCP). Returns the absolute path; throws on traversal. (Lexical only — it does
 * not follow a pre-existing symlink out of the tree.)
 */
function containedPath(baseAbs: string, child: string, label: string): string {
  const basePrefix = baseAbs.endsWith(sep) ? baseAbs : baseAbs + sep;
  const abs = resolve(join(baseAbs, child));
  if (abs !== baseAbs && !abs.startsWith(basePrefix)) {
    throw new Error(
      `Path traversal blocked: resolved write target "${abs}" escapes "${baseAbs}" (${label})`,
    );
  }
  return abs;
}

/**
 * Write a two-lane emit result under `outDir`: CQL libraries to
 * `<outDir>/cql/<outputFilename>`, FHIR resources to
 * `<outDir>/fhir/<relativePath>` (via the shared `writeFhirResources`).
 * Returns the absolute paths written per lane, in emit order.
 *
 * Callers MUST gate on success (no hard errors, no filename collisions)
 * before calling — this function writes unconditionally. On a filesystem
 * failure it throws `EmitWriteError` carrying the partial write list.
 */
export function writeTwoLane(two: EmitCrlTwoLaneResult, outDir: string): TwoLaneWritten {
  const cqlOutDir = join(outDir, "cql");
  const fhirOutDir = join(outDir, "fhir");

  // Both lane dirs are created up front (matching the pre-extraction CLI): a
  // dir-creation failure then leaves NO files, rather than a populated `cql/`
  // beside a missing `fhir/`.
  const cql: string[] = [];
  const fhir: string[] = [];
  try {
    mkdirSync(cqlOutDir, { recursive: true });
    mkdirSync(fhirOutDir, { recursive: true });
  } catch (e) {
    throw new EmitWriteError(`output directory create failed: ${(e as Error).message}`, { cql, fhir });
  }

  try {
    const baseAbs = resolve(cqlOutDir);
    for (const entry of two.cqlLibraries) {
      const abs = containedPath(baseAbs, entry.outputFilename, `outputFilename "${entry.outputFilename}"`);
      writeFileSync(abs, entry.cql, "utf-8");
      cql.push(abs);
    }
  } catch (e) {
    throw new EmitWriteError(`CQL write failed: ${(e as Error).message}`, { cql, fhir });
  }

  try {
    // `fhir` is the accumulator — writeFhirResources reads only `.resources` and
    // pushes each written path into `fhir` AS it writes, so on a mid-loop failure
    // this holds the FHIR files that DID land on disk.
    writeFhirResources({ success: true, resources: two.fhir.resources }, fhirOutDir, fhir);
  } catch (e) {
    throw new EmitWriteError(
      `FHIR write failed after ${cql.length} CQL + ${fhir.length} FHIR file(s); "${outDir}" ` +
        `may hold a partial deliverable: ${(e as Error).message}`,
      { cql, fhir },
    );
  }

  return { cql, fhir };
}
