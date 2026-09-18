// REFACTOR:grounded - replace the complete generated FHIR directory after preflight.
import { clearGeneratedDirectory, planGeneratedWrites, writeGeneratedFiles } from "../generated-output";
import type { FhirDefEmitResult } from "./types";

export function planFhirWrites(emit: FhirDefEmitResult, outDir: string) {
  if (!emit.success) throw new Error("Cannot write unsuccessful FHIR emission");
  return planGeneratedWrites(outDir, emit.resources.map((r) => ({
    path: r.relativePath, bytes: JSON.stringify(r.resource, null, 2) + "\n",
  })));
}

/** outDir is the generated FHIR directory, not the project or src directory.
 * Invalid input preserves previous output. Filesystem failures may leave partial output.
 * sink records each completed write. Custom files in this directory are removed too.
 */
export function writeFhirResources(emit: FhirDefEmitResult, outDir: string, sink?: string[]): string[] {
  const plan = planFhirWrites(emit, outDir);
  clearGeneratedDirectory(outDir);
  return writeGeneratedFiles(plan, sink);
}
