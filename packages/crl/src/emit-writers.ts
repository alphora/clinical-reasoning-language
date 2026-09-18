// REFACTOR:grounded - successful CRL emits replace their complete generated lanes.
import { join } from "node:path";
import { clearGeneratedDirectory, planGeneratedWrites, writeGeneratedFiles } from "./generated-output";
import { planFhirWrites } from "./fhir-emitter/writer";
import type { EmitCrlTwoLaneResult, TwoLaneCqlLibrary } from "./emit-two-lane";

export interface TwoLaneWritten { cql: string[]; fhir: string[] }

export class EmitWriteError extends Error {
  constructor(message: string, readonly partial: TwoLaneWritten) {
    super(message);
    this.name = "EmitWriteError";
  }
}

function planCqlWrites(libraries: ReadonlyArray<TwoLaneCqlLibrary>, directory: string) {
  return planGeneratedWrites(directory, libraries.map((entry) => ({ path: entry.outputFilename, bytes: entry.cql })));
}

/** Standalone CQL owns its complete generated CQL directory. */
export function writeCqlLibraries(libraries: ReadonlyArray<TwoLaneCqlLibrary>, directory: string): string[] {
  const plan = planCqlWrites(libraries, directory);
  clearGeneratedDirectory(directory);
  return writeGeneratedFiles(plan);
}

/** outDir is normally src: clear only cql/ and fhir/, never authored source siblings.
 * Preflight BOTH lanes before deleting either. No custom-file retention or rollback.
 * A filesystem failure reports the files written and may leave a partial deliverable.
 */
export function writeTwoLane(two: EmitCrlTwoLaneResult, outDir: string): TwoLaneWritten {
  const cqlDir = join(outDir, "cql"), fhirDir = join(outDir, "fhir");
  const partial: TwoLaneWritten = { cql: [], fhir: [] };
  try {
    if (two.hardErrors.length || two.filenameCollisions.length || two.cql.success === false) throw new Error("Cannot write CRL emission with hard errors or filename collisions");
    const cqlPlan = planCqlWrites(two.cqlLibraries, cqlDir);
    const fhirPlan = planFhirWrites({ success: true, resources: two.fhir.resources }, fhirDir);
    clearGeneratedDirectory(cqlDir);
    writeGeneratedFiles(cqlPlan, partial.cql);
    clearGeneratedDirectory(fhirDir);
    writeGeneratedFiles(fhirPlan, partial.fhir);
    return partial;
  } catch (error) {
    throw new EmitWriteError(`CRL output replacement failed; output may be partial: ${(error as Error).message}`, partial);
  }
}
