/**
 * CRL → FHIR Definition emitter types.
 *
 * The lane closes #73. Pitch [055] confirms CPG IG (cqf-recommendations)
 * conformance as the spec for every emitted resource. Metadata sourced
 * from `package.json` + a `crl` block — see `metadata.ts`. Output dir is
 * caller-controlled; recommended layout is `project/cql/` sibling to
 * `project/fhir/` with this lane writing to whatever `--out-dir` the
 * caller chooses (interpretation A in the pitch).
 *
 * Per Todo-1-discussion-057 Δ8: emit-time `date` is deterministic via
 * the optional `clock` injection. Per Δ9: envelope mirrors v2.2.6
 * `emit_cql`'s `EmitResult` shape (success + errors + unmatched), only
 * the result-payload name diverges (`resources[]` vs `result: string`)
 * because FHIR emit produces N resources while CQL emit produces one
 * library text. Per Δ10: errors are `CRLError`-typed using new `kind`
 * variants documented in this file's NEW_CRL_ERROR_KINDS comment.
 */

import type { Location } from "../ast/types";
import type { CRLError } from "../types/errors";

/**
 * NEW_CRL_ERROR_KINDS (Δ10) — `CRLError.kind` values introduced by this
 * lane. `CRLError.kind` is already an unconstrained `string?` field so
 * no shape change is needed on the error type; this comment documents
 * the new values for callers (e.g. the MCP tool description and
 * future caller-side filtering).
 *
 *   missing-canonical-url-base                     error    package.json lacks `crl.canonicalBase`. Strict-refuse-to-emit.
 *   missing-description                            error    Library + package.json description both empty after defaulting.
 *   slug-collision                                 error    Two CRL declarations slugify to the same FHIR id.
 *   non-ascii-slug-fallback                        warning  A non-empty CRL name slugified to "unnamed" (non-ASCII strip).
 *   malformed-crl-metadata                         error    `crl.useContext` / `crl.jurisdiction` has wrong shape.
 *   unreadable-package-json                        error    Filesystem error reading package.json.
 *   empty-terminology                              warning  Terminology body has neither `valueset is` nor `system is`+`code is`.
 *   circular-decision-reference                    error    Dependency-graph cycle among decisions. (Todo 3)
 *   empty-strategy-entrypoint                      error    Closure has no root decision (every decision is referenced; acyclic graph, no root). (Todo 3)
 *   decision-cascade-suppressed                    error    A decision (root or sub) would emit with zero surviving top-level actions due to cascade suppression. (Todo 3 — round-6 renamed from strategy-root-cascade-suppressed for accuracy: same disposition fires for sub-decisions, not just strategies)
 *   unresolved-reference-cascade-suppression       warning  Non-root parent action suppressed because all children were suppressed. (Todo 3)
 *   closure-resource-collision                     error    Two emitted resources within the closure produce the same `<resourceType>/<id>.json` relative path. (Todo 4)
 *   unresolved-library-reference                   error    An emitted resource's `library[]` URL doesn't resolve to an emitted Library. (Todo 4)
 *   unresolved-related-artifact                    error    An emitted Library's `relatedArtifact[depends-on]` URL is under canonicalBase but doesn't resolve to an emitted resource. (Todo 4)
 *   unresolved-definition-target                   error    An emitted PlanDef's `action.definitionCanonical` doesn't resolve to an emitted PlanDef/ActivityDef. (Todo 4)
 *   cli-cel-fhir-def-incompatible                  error    CLI: `.cel` input + `--target fhir-def` flag. (Todo 4)
 */

/**
 * Todo 4 severity classifier. CRLError.kind is unconstrained string so
 * the CLI needs a deterministic warning/error split. Maintain explicitly.
 *
 * Any CRLError whose kind is NOT in this set is treated as a hard error.
 */
export const FHIR_DEF_WARNING_KINDS: ReadonlySet<string> = new Set([
  "non-ascii-slug-fallback",
  "empty-terminology",
  "unresolved-reference-cascade-suppression",
]);

export function isFhirDefWarning(error: CRLError): boolean {
  return error.kind !== undefined && FHIR_DEF_WARNING_KINDS.has(error.kind);
}

export function isFhirDefError(error: CRLError): boolean {
  return !isFhirDefWarning(error);
}

/**
 * CPG-IG-shareable knowledge-artifact metadata. Δ7: ONE per closure
 * (sourced from `graph.projectRoot/package.json`), not per library.
 */
export interface CpgMetadata {
  // npm-standard fields:
  version: string;
  name: string;
  title: string;
  description: string;
  publisher: string;
  contact: ContactPoint[];
  // CRL-specific (package.json `crl` block):
  canonicalBase: string;
  status: "draft" | "active" | "retired" | "unknown";
  experimental: boolean;
  jurisdiction: CodeableConcept[];
  useContext: UsageContext[];
}

export interface ContactPoint {
  system: "url" | "email" | "phone";
  value: string;
}

export interface CodeableConcept {
  coding: Array<{ system: string; code: string; display?: string }>;
  text?: string;
}

export interface UsageContext {
  code: { system: string; code: string };
  valueCodeableConcept: CodeableConcept;
}

/**
 * A single emitted FHIR resource. `relativePath` is appended under the
 * caller-provided `outDir` by the writer.
 */
export interface EmittedResource {
  resourceType: "ValueSet" | "ActivityDefinition" | "PlanDefinition" | "Library";
  relativePath: string;
  resource: Record<string, unknown>;
  /**
   * Todo 4: closure-level collision-attribution support. Each per-library
   * emitter populates these so Invariant 1's `closure-resource-collision`
   * error can name the source declaration + AST location for each collider.
   * Optional for backward compat with existing tests.
   *
   * For Recommendation PlanDefs (1:1 generated from an `activity` declaration),
   * sourceKind = "Recommendation" and sourceName = the activity's CRL name
   * (NOT a synthesized "<name> Recommendation" string).
   */
  sourceKind?: "Terminology" | "Library" | "Activity" | "Recommendation" | "Decision";
  sourceName?: string;
  location?: Location;
}

/**
 * Δ9 — Envelope shape parallel to v2.2.6 `emit_cql`. `success` is
 * forced to `false` whenever `errors[]` (with severity error) or
 * `unmatched[]` is non-empty. `resources[]` is still populated for
 * partial inspection so callers can debug.
 */
export interface FhirDefEmitResult {
  success: boolean;
  resources: EmittedResource[];
  errors?: CRLError[];
  unmatched?: UnmatchedReference[];
}

/**
 * Δ9 — A reference that couldn't be resolved during FHIR-def emit.
 * Todo 1's only case is `empty-terminology` (body shape problem); Todo
 * 2/3 add `unresolved-activity` and `unresolved-decision` when
 * `recommend activity "X"` / `use decision "Y"` references can't be
 * resolved against the closure.
 */
export interface UnmatchedReference {
  kind:
    | "empty-terminology"
    | "unresolved-activity"
    | "unresolved-concept"
    | "unresolved-decision"
    | "unresolved-terminology"
    | "unsupported-with-text"
    | "unsupported-communication-with-terminology"
    | "unsupported-questionnaire-with";
  text: string;
  line?: number;
  column?: number;
}

/**
 * Δ8 — Emit options. `clock` is injected so tests get deterministic
 * timestamps. Default `() => new Date()` matches the natural emit-time
 * behavior.
 */
export interface EmitOptions {
  clock?: () => Date;
}
