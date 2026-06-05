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
 */

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
