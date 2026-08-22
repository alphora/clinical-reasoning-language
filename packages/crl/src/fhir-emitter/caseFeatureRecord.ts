// #189 2d P2 — per-concept case-feature RECORD resolution.
//
// The single pure function the case-feature lane calls to answer, for ONE concept: "is this a gatherable
// case-feature, and if so, what natural resource + records-define does it emit?" It composes the T1 descriptor
// deriver (`deriveEffectiveRepresentations`) with the records-twin name rule (`recordsTwinDefineName`) and maps the
// deriver's outcomes onto the case-feature lane's vocabulary. Charter §4 (`docs/CRL-NORTH-STAR.md`): a case-feature
// is typed by the concept's OWN natural resource (Condition/MedicationRequest/Observation/…), never forced to
// Observation; only NON-EPHEMERAL local `code is` records are case-features; the boolean is ephemeral CQL; the
// `cpg-featureExpression` targets the RECORDS-retrieve define — the `"<X> Records"` twin for a `ThisRecords`
// reduction, or the concept's own name `"<X>"` for a RecordSet publisher / age both-rep (no twin) — NOT the
// boolean `"<X>"` result.
//
// WIRED (#189 2d): `closureOrchestrator` calls this per collected case-feature concept; a `record` → SD + input,
// `supplied-patient` → read (no SD), a reject → loud. The deriver REJECTS a bare-scalar `code is`
// (`unsupported-reduction-form`), so this yields a `record` only for a MIGRATED concept (`code is` + a reduction,
// or a `shape is RecordSet` publisher).

import type { Concept } from "../ast/types";
import { recordsTwinDefineName } from "../cql-emitter/lowerLocalCodes";
import { deriveEffectiveRepresentations } from "../emit/effectiveRepresentation";
import type {
  EffectiveRepresentationDescriptor,
  OwningLibraryMetadata,
} from "../emit/effectiveRepresentation";

/** The `local-exact` descriptor arm — narrowed for a resolved gatherable record. */
export type LocalExactDescriptor = Extract<EffectiveRepresentationDescriptor, { arm: "local-exact" }>;

/** Why a concept is NOT a gatherable case-feature record (never a partial/forced emit — fail loud, charter §4). */
export type CaseFeatureRecordSkip =
  // The natural resource has no `caseFeatureProfileShape` / `resourceEmitRow` row (the deriver's
  // `unsupported-resource`) — a genuinely unmodeled resource, mapped to the case-feature diagnostic.
  | { kind: "unsupported-resource"; resourceType: string; detail: string }
  // Patient supplies its own resource (charter §2 uncoded arm) — READ, never gathered via a case-feature SD.
  | { kind: "supplied-patient" }
  // A purely-sourced concept (no local `code is`) — E1/#257 sourced-representation, deferred (design §10, D2).
  | { kind: "deferred-sourced" }
  // Any other deriver rejection (bare-scalar `unsupported-reduction-form` pre-migration, malformed, not-admitted,
  // …) — the concept is not (yet) a valid case-feature; carry the deriver's own diagnostic kind + detail.
  | { kind: "not-a-record"; derivationKind: string; detail: string };

/** A gatherable case-feature record: its natural-resource descriptor + the records-define the featureExpression
 *  targets. `recordsDefineId` is a bare CQL define identifier in the concept's OWNING LocalPrimitives library. */
export type CaseFeatureRecord = {
  kind: "record";
  descriptor: LocalExactDescriptor;
  /** the `"<X> Records"` twin define name (SINGLE SOURCE: `recordsTwinDefineName`). */
  recordsDefineId: string;
};

export type CaseFeatureRecordResolution = CaseFeatureRecord | CaseFeatureRecordSkip;

/**
 * Resolve whether `concept` is a gatherable case-feature RECORD and, if so, its natural resource + records-define.
 *
 * Pure over (concept, owning-library metadata). Composes:
 *   - `deriveEffectiveRepresentations` (the single descriptor authority; already gated to the 5-resource registry —
 *     an unmodeled resource returns `unsupported-resource`, a bare-scalar returns `unsupported-reduction-form`);
 *   - `recordsTwinDefineName` (the single twin-name rule) for the featureExpression target.
 *
 * A `local-exact` descriptor → a `record` (Condition/Observation/MedicationRequest/…). The `uncoded` (Patient) arm →
 * `supplied-patient` (no SD). A `deferred` (pure-sourced) outcome → `deferred-sourced`. A deriver error → the mapped
 * skip. NEVER returns a forced-Observation fallback (that is the hack #189 deletes).
 */
export function resolveCaseFeatureRecord(
  concept: Concept,
  owningLib: OwningLibraryMetadata,
): CaseFeatureRecordResolution {
  const outcome = deriveEffectiveRepresentations(concept, owningLib);

  if (outcome.status === "error") {
    if (outcome.error.kind === "unsupported-resource") {
      return {
        kind: "unsupported-resource",
        resourceType: outcome.error.resourceType ?? "(unknown)",
        detail: outcome.error.detail,
      };
    }
    return { kind: "not-a-record", derivationKind: outcome.error.kind, detail: outcome.error.detail };
  }

  if (outcome.status === "deferred") {
    // Purely-sourced (no local `code is`) — E1/#257.
    return { kind: "deferred-sourced" };
  }

  // status === "derived": prefer the LOCAL gatherable record; Patient/uncoded is supplied (no SD).
  const local = outcome.descriptors.find((d): d is LocalExactDescriptor => d.arm === "local-exact");
  if (local) {
    // REFACTOR:grounded (charter §4) — the `cpg-featureExpression` must target the define that ACTUALLY holds
    // the records retrieve. That define depends on the lowering:
    //   - a `ThisRecords` reduction (`exists this` / `count this` / `most recent this`) synthesizes a SEPARATE
    //     `"<X> Records"` retrieve twin, with the reduction result published under `"<X>"` — so target the twin;
    //   - EVERY OTHER local-exact concept (a `shape is RecordSet` publisher, an age/both-rep concept whose local
    //     `code is` is the human-asserted answer record) publishes its retrieve directly under its OWN name
    //     `"<X>"` (no twin) — so target the concept name. Assuming a `"<X> Records"` twin for these DANGLES.
    const reduction =
      concept.definition?.type === "ReductionDefinition" ? concept.definition.reduction : undefined;
    const hasRecordsTwin = reduction !== undefined && reduction.target.type === "ThisRecords";
    return {
      kind: "record",
      descriptor: local,
      recordsDefineId: hasRecordsTwin ? recordsTwinDefineName(concept.name) : concept.name,
    };
  }
  const uncoded = outcome.descriptors.find((d) => d.arm === "uncoded");
  if (uncoded) return { kind: "supplied-patient" };

  // A `derived` outcome with neither a local-exact nor an uncoded arm has no gatherable record (e.g. only a
  // deferred source arm survived). Treat as not-a-record rather than manufacture one.
  return {
    kind: "not-a-record",
    derivationKind: "no-local-arm",
    detail: `concept "${concept.name}" derived no local-exact or uncoded arm (deferred-only)`,
  };
}
