/**
 * Filesystem writer for FHIR Definition emit results.
 *
 * Per pitch interpretation A: `outDir` is caller-controlled; the writer
 * lays out resource-type subdirectories within it (ValueSet/,
 * ActivityDefinition/, PlanDefinition/) but does NOT create a `fhir/`
 * parent. The recommended project convention (`project/cql/` sibling to
 * `project/fhir/`) is enforced by the caller's --out-dir choice.
 *
 * Throws plain `Error` on filesystem failure — the caller (CLI / MCP
 * tool in Todo 4) catches at the boundary and surfaces.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import type { FhirDefEmitResult } from "./types";

/**
 * Write every resource in an emit result to disk under `outDir`. Returns
 * the list of absolute paths written, in input order. Creates resource-
 * type subdirectories as needed. Pretty-prints JSON with 2-space indent.
 *
 * Round-2 review (gpt55 important #5): a LEXICAL traversal guard.
 * `EmittedResource.relativePath` is constructed internally by the emit
 * functions today, but the writer is part of the public surface and is
 * exposed via CLI / MCP. A buggy relativePath containing `..` (or an
 * absolute path) could write outside `outDir`; we resolve both and verify
 * the resolved write target stays under the resolved outDir. (This is a
 * lexical check — it does not follow a pre-existing symlink out of the
 * tree.) Throws `Error` on violation — caller catches at the CLI / MCP
 * boundary.
 *
 * `sink`, when provided, is used as the accumulator: each written path is
 * pushed into it AS it is written, so a caller that wraps this in a
 * try/catch can read the partial list on a mid-loop failure.
 */
export function writeFhirResources(
  emit: FhirDefEmitResult,
  outDir: string,
  sink?: string[],
): string[] {
  const written: string[] = sink ?? [];
  const baseAbs = resolve(outDir);
  const basePrefix = baseAbs.endsWith(sep) ? baseAbs : baseAbs + sep;
  for (const r of emit.resources) {
    const abs = resolve(join(baseAbs, r.relativePath));
    if (abs !== baseAbs && !abs.startsWith(basePrefix)) {
      throw new Error(
        `Path traversal blocked: resolved write target "${abs}" escapes outDir "${baseAbs}" (relativePath: "${r.relativePath}")`,
      );
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify(r.resource, null, 2) + "\n", "utf8");
    written.push(abs);
  }
  return written;
}
