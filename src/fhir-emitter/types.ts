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
 *   missing-package-version                         error    package.json has no `version`. CRMI requires `version` 1..1 at the shareable floor.
 *   invalid-emit-date                              error    `--date`/`opts.date`/`crl.date` is not a parseable date.
 *   invalid-source-date-epoch                      error    `SOURCE_DATE_EPOCH` env is not a non-negative integer of epoch seconds (rejects ms-shaped values).
 *   missing-publishable-date                       error    Publishable+ emit with no resolvable date (no --date/SOURCE_DATE_EPOCH/crl.date). Reproducibility is not opt-in.
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
  /**
   * Reproducible-emit managed publication date (`crl.date`, ISO). Authoritative
   * source for the FHIR `date` when emitting at publishable+. Undefined when not
   * declared; the date-resolution chain then falls back to env/clock.
   */
  crlDate?: string;
  /**
   * Targeted FHIR IG dependency versions (`crl.fhirDependencies`, e.g.
   * `{ "hl7.fhir.uv.cpg": "2.0.0", "hl7.fhir.uv.crmi": "2.0.0-ballot" }`). Provenance / the FHIR-package assembly
   * manifest's deps — NEVER stamped onto an emitted resource.
   */
  fhirDependencies?: Record<string, string>;
}

/**
 * CRMI artifact capability levels (cumulative; shareable is the floor).
 * Drives, as one gate: `meta.profile`, the `cqf-knowledgeCapability` list, and
 * whether `date` is emitted (publishable+ per CRMI). `version` is required
 * at the shareable floor → always emitted on definitional FHIR.
 */
export type Capability = "shareable" | "computable" | "publishable" | "executable";

export const CAPABILITY_ORDER: readonly Capability[] = [
  "shareable",
  "computable",
  "publishable",
  "executable",
];

/** Cumulative capability list up to and including `level` (lattice order). */
export function capabilitiesUpTo(level: Capability): Capability[] {
  return CAPABILITY_ORDER.slice(0, CAPABILITY_ORDER.indexOf(level) + 1);
}

/** True when `level` is at or above publishable (i.e., `date` must be emitted). */
export function isPublishablePlus(level: Capability): boolean {
  return CAPABILITY_ORDER.indexOf(level) >= CAPABILITY_ORDER.indexOf("publishable");
}

export type CrmiProfileResource = "valueset" | "library" | "activitydefinition" | "plandefinition";

const CRMI_SD_BASE = "http://hl7.org/fhir/uv/crmi/StructureDefinition";

// CRMI 2.0.0-ballot: which capability levels actually publish a
// `crmi-<level><resource>` StructureDefinition (verified from the
// hl7.fhir.uv.crmi#2.0.0-ballot package; identical to 1.0.0). `meta.profile`
// canonicals are unversioned, so the emitted URLs are version-independent.
const CRMI_PROFILE_LEVELS: Record<CrmiProfileResource, readonly Capability[]> = {
  valueset: ["shareable", "computable", "publishable"],
  library: ["shareable", "computable", "publishable", "executable"],
  activitydefinition: ["shareable", "publishable"],
  plandefinition: ["shareable", "publishable"],
};

/**
 * CRMI capability profiles for a resource, **additive** up to `level`: profiles
 * accumulate as capability progresses (a publishable resource claims shareable +
 * computable + publishable — whichever exist for the resource — not just the top
 * one), mirroring the cumulative `cqf-knowledgeCapability` list.
 */
export function crmiCapabilityProfiles(resource: CrmiProfileResource, level: Capability): string[] {
  const available = CRMI_PROFILE_LEVELS[resource];
  return capabilitiesUpTo(level)
    .filter((c) => available.includes(c))
    .map((c) => `${CRMI_SD_BASE}/crmi-${c}${resource}`);
}

export type RepresentationLevel = "narrative" | "semi-structured" | "structured" | "executable";

const FHIR_CORE_EXT_BASE = "http://hl7.org/fhir/StructureDefinition";
const KNOWLEDGE_CAPABILITY_EXT = `${FHIR_CORE_EXT_BASE}/cqf-knowledgeCapability`;
const KNOWLEDGE_REPRESENTATION_EXT = `${FHIR_CORE_EXT_BASE}/cqf-knowledgeRepresentationLevel`;

/**
 * `cqf-knowledgeCapability` (cumulative, per the CRMI shareable-profile
 * `mustSupport` on EVERY artifact type — so emitted on all definitional
 * resources, not just PlanDefinition) plus an optional
 * `cqf-knowledgeRepresentationLevel`. Both are the FHIR-core `cqf-` extensions
 * (NOT the CPG IG's `cpg-` variants): the CRMI shareable-profile `knowledgeCapability`
 * slice binds the `cqf-knowledgeCapability` URL, so `cqf-` is the conformant choice
 * for CRMI-targeted emit. Independent of the CRMI IG version.
 *
 * The capability codes are ORTHOGONAL to lifecycle-profile existence (CRMI binds
 * the extension `0..* mustSupport`, no fixed code): the list may include e.g.
 * `computable` even though no `crmi-computableplandefinition` profile exists. Do
 * NOT reconcile this list with `crmiCapabilityProfiles`.
 */
export function knowledgeExtensions(
  level: Capability,
  representationLevel?: RepresentationLevel,
): Array<{ url: string; valueCode: string }> {
  const ext: Array<{ url: string; valueCode: string }> = capabilitiesUpTo(level).map((c) => ({
    url: KNOWLEDGE_CAPABILITY_EXT,
    valueCode: c,
  }));
  if (representationLevel) {
    ext.push({ url: KNOWLEDGE_REPRESENTATION_EXT, valueCode: representationLevel });
  }
  return ext;
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
 * Emit options.
 *
 * Reproducible-emit date resolution (resolved ONCE at the `emitFhirDefFromPath`
 * boundary, then carried internally): `date` → `SOURCE_DATE_EPOCH` env →
 * `crl.date` (package.json) → `clock()` → wall clock. The resolved value is
 * injected as `clock: () => resolved`, so the per-resource emitters stay
 * unchanged. `clock` remains the test/override seam.
 *
 * `capability` selects the CRMI capability level (default `publishable`). It
 * drives, on every definitional resource, the additive `meta.profile` set
 * (`crmiCapabilityProfiles` — accumulates the lifecycle profiles that EXIST for
 * the resource up to the level) and the `date` element (emitted at publishable+).
 * It also drives the cumulative `cqf-knowledgeCapability` list (emitted on every
 * definitional resource — `knowledgeExtensions`). Note these are not perfectly
 * symmetric: the `knowledgeCapability` codes are orthogonal to profile existence
 * (CRMI binds them `0..* mustSupport`, no fixed code), so a PlanDefinition can
 * claim `computable` capability even though no `crmi-computableplandefinition`
 * profile exists.
 */
export interface EmitOptions {
  /** Test/override seam: returns the emit-time date. */
  clock?: () => Date;
  /** Explicit publication date override (ISO string or Date). Highest precedence. */
  date?: string | Date;
  /** CRMI capability level. Default `publishable`. */
  capability?: Capability;
}
