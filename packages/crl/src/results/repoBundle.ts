/**
 * ⭐⭐ THE ENGINE'S REPOSITORY BUNDLE — definitions + one case's data, with CQL INLINED.
 *
 * ⚠ INLINING IS MANDATORY, AND THIS WAS MEASURED, NOT ASSUMED. The FHIR definition lane emits each
 * `Library` with `content[0] = { contentType: "text/cql", url: "../../cql/<Name>.cql" }` and NO `data`.
 * That is correct for an IG on disk, where the CQL sits beside it on the other lane. An in-memory
 * repository cannot resolve a relative file URL, so the engine fails with:
 *
 *     Condition expression <X> encountered exception:
 *       Cannot read the array length because "buf" is null
 *     Could not resolve identifier <Library> in the current library
 *
 * — errors that name the CQL expression and say nothing about the missing bytes. A first run against a
 * bundle built without inlining produced exactly that and looked like a CQL defect. With the CQL inlined
 * as base64 `content.data`, the same artifact applied clean and returned an answerable Questionnaire.
 */

import type { EmitResult } from "../cel/emitter";
import type { ProducerCaseInput } from "./caseInput";

interface FhirLike {
  resourceType: string;
  id?: string;
  content?: { contentType?: string; data?: string; url?: string }[];
  [k: string]: unknown;
}

export interface RepoBundleInputs {
  /** The emitted FHIR definition closure — PlanDefinitions, Libraries, SDs, CodeSystems, ValueSets. */
  definitions: readonly FhirLike[];
  /** `outputFilename` (e.g. `Foo.cql`) -> CQL source, from the CQL lane of the same emit. */
  cqlByLibraryFile: Readonly<Record<string, string>>;
  /** The ONE case whose data this repository carries. */
  caseInput: Pick<ProducerCaseInput, "resources" | "caseName">;
}

export interface RepoBundleResult {
  bundle: { resourceType: "Bundle"; type: "collection"; entry: { resource: FhirLike }[] };
  /** Libraries whose CQL was inlined. */
  inlined: string[];
  /**
   * Libraries that declare `text/cql` content with neither `data` nor a resolvable source.
   *
   * ⚠ NOT a warning to log and continue past: the engine's failure for these is an expression-level
   * exception that never mentions the missing content, so a silent skip here becomes a mystery there.
   */
  missingCql: string[];
}

/**
 * Build the repository for ONE case.
 *
 * ⚠ ONE CASE, not the suite. Each case has its own Patient compartment, and a repository carrying
 * several cases' resources lets one case's facts satisfy another's retrieves — a cross-case leak that
 * looks like a passing run.
 */
export function buildEngineRepoBundle(inputs: RepoBundleInputs): RepoBundleResult {
  const inlined: string[] = [];
  const missingCql: string[] = [];

  // Deep-copy: inlining mutates `content`, and the caller's emit result is reused across cases.
  const definitions = JSON.parse(JSON.stringify(inputs.definitions)) as FhirLike[];

  for (const r of definitions) {
    if (r.resourceType !== "Library") continue;
    for (const c of r.content ?? []) {
      if (c.contentType !== "text/cql" || c.data) continue;
      const src = inputs.cqlByLibraryFile[`${r.id}.cql`];
      if (src === undefined) {
        missingCql.push(String(r.id));
        continue;
      }
      c.data = Buffer.from(src, "utf8").toString("base64");
      // Drop the now-misleading relative URL: an in-memory repo cannot follow it, and leaving it invites
      // the next reader to believe the file is the source of truth for this bundle.
      delete c.url;
      inlined.push(String(r.id));
    }
  }

  return {
    bundle: {
      resourceType: "Bundle",
      type: "collection",
      entry: [
        ...definitions.map((resource) => ({ resource })),
        ...inputs.caseInput.resources.map((r) => ({ resource: r.body as unknown as FhirLike })),
      ],
    },
    inlined,
    missingCql,
  };
}

/** Convenience: index a CQL lane's libraries by output filename. */
export const cqlIndex = (
  libraries: readonly { outputFilename: string; cql: string }[],
): Record<string, string> =>
  Object.fromEntries(libraries.map((l) => [l.outputFilename, l.cql]));

/** All cases from an emit result, for a caller building one repository per case. */
export const emittedCaseCount = (emit: EmitResult): number => emit.emittedCases.length;
