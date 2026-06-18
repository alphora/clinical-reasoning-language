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
 * Round-2 review (gpt55 important #5): guards against path traversal.
 * `EmittedResource.relativePath` is constructed internally by the emit
 * functions today, but the writer is part of the public surface and
 * Todo 4 will expose it via CLI / MCP. A malicious or buggy relativePath
 * containing `..` (or an absolute path) could write outside `outDir`;
 * we resolve both and verify the resolved write target stays under
 * the resolved outDir. Throws `Error` on violation — caller catches at
 * the CLI / MCP boundary.
 */
export function writeFhirResources(emit: FhirDefEmitResult, outDir: string): string[] {
  const written: string[] = [];
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
