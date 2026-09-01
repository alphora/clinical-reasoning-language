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
import type { ResolvedFeatureExpressionTarget } from "./structureDefinition";
import { recordsTwinDefineName } from "../cql-emitter/lowerLocalCodes";
import { deriveEffectiveRepresentations } from "../emit/effectiveRepresentation";
import { resolveRecencyValueConcept, isPureQuestionConcept } from "../template-match/recencyValueConcept";
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

/**
 * ⭐⭐ WHERE A CASE FEATURE'S `cpg-featureExpression` POINTS — a (layer, define, resultKind) TRIPLE.
 *
 * ⚠⚠ THIS REPLACED A BARE `recordsDefineId: string`, WHICH BAKED IN TWO THINGS AT ONCE. It named a define
 * AND silently assumed the LocalPrimitives layer (the library identity travelled as a separate argument,
 * hard-wired by the caller). Disc 531/532, both arms: that is the seam that makes the merge un-targetable,
 * which is why a computed or sourced value can never pre-fill its own question.
 */
export type FeatureExpressionTarget = {
  /**
   * The LAYER the define lives in, as a ROLE — resolved to a library identity by the caller, which is the
   * only place that knows the manifest. `local-primitives` = answered records only; `inferences` = the
   * merged space (local ∪ source ∪ constructed candidates).
   */
  layer: "local-primitives" | "inferences";
  /** The bare CQL define identifier (`text/cql-identifier`). SINGLE SOURCE for a twin: `recordsTwinDefineName`. */
  define: string;
  /**
   * ⭐ The CQL TYPE OF THE TARGET DEFINE — NOT the concept's declared `shape is`, and the two genuinely
   * diverge: a pure question's `"<X> Records"` twin is a LIST define serving a SCALAR concept.
   *
   * ⚠⚠ MEASURED WHY THIS MATTERS (`tmp/NOTES-repeating-group-populate-executed.md`): a `record-list`
   * target populates fine with ONE member and, at TWO, the item VANISHES from the QuestionnaireResponse
   * with `POPULATE [ERROR] … multiple values for a non repeating group`. So today EVERY featureExpression
   * target is a `record-list`, and that is exactly the latent defect.
   *
   * ⚠ It is NOT a refusal. A many-target is emitted today (a `shape is RecordSet` publisher targets its own
   * set define) and charter §3 says a coded RecordSet history IS answerable — the missing `repeats` on the
   * generated group is filed BUILD DEBT. A type that could not express it would convert "not built yet"
   * into "not allowed", which is the §0a deferral-dressed-as-rejection.
   */
  resultKind: "record" | "record-list";
};

/** A gatherable case-feature record: its natural-resource descriptor + where its featureExpression points. */
export type CaseFeatureRecord = {
  kind: "record";
  descriptor: LocalExactDescriptor;
  target: FeatureExpressionTarget;
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
    // #189 Piece 1 (disc 506) — a both-rep RECENCY-VALUE concept (`code is` + `most recent this` + a `coded from`
    // source rep) HAS a `ThisRecords` reduction, but `lowerLocalCodes` does NOT synthesize a `"<X> Records"` twin
    // for it — it publishes the local records retrieve under its OWN name `"<X>"` in LocalPrimitives (the both-rep
    // same-name convention, exactly the case the comment above names). So target the concept name, not the twin
    // (targeting `"<X> Records"` DANGLES — the Inv-2(d) integrity check catches it).
    const isRecencyValueBothRep = resolveRecencyValueConcept(concept).kind === "recency-value";
    // ⭐ #189 null/pause T5 step 2b — a PURE QUESTION now splits the same way a `ThisRecords` reduction does:
    // `lowerLocalCodes` publishes its answer records as `"<X> Records"` in LocalPrimitives and its THREE-STATE
    // determination (`"<X> Records".answeredValue()`) as `"<X>"` in Inferences. So the `cpg-featureExpression`
    // must target the TWIN. It has no `ReductionDefinition` — a question is a bare `code is` — so the reduction
    // test above cannot see it. MEASURED: without this every question's SD dangled (Inv 2(d) caught all four in
    // the `guard-define` fixture), because `"<X>"` in LocalPrimitives no longer exists.
    const isQuestion = isPureQuestionConcept(concept);
    const hasRecordsTwin =
      isQuestion || (reduction !== undefined && reduction.target.type === "ThisRecords" && !isRecencyValueBothRep);
    return {
      kind: "record",
      descriptor: local,
      target: {
        // T1 is a PURE REFACTOR: every target stays exactly where it was. The `inferences` layer exists in
        // the type but is not produced yet — T4 introduces it, per disc 532's build order.
        layer: "local-primitives",
        define: hasRecordsTwin ? recordsTwinDefineName(concept.name) : concept.name,
        // ⚠ EVERY current target is a RETRIEVE define, so every one is a LIST — both the `"<X> Records"`
        // twin and the same-name publish. That is not an oversight being recorded; it IS the measured
        // latent defect (probe 2), now visible in the type instead of implicit in the emit.
        resultKind: "record-list",
      },
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


/**
 * ⭐ Resolve a `FeatureExpressionTarget`'s LAYER ROLE to a real library identity.
 *
 * ⚠⚠ FAILS LOUD, BY DESIGN, AND THIS IS THE POINT OF THE FUNCTION. The previous spelling passed
 * `localSourceReferenceSuffix ?? ""` and relied on the emitter's empty-suffix throw one call deeper — so a
 * MISSING MANIFEST ENTRY surfaced as a generic internal-invariant message naming neither the layer nor why
 * it was wanted. An empty identity builds a ROOT-pointing canonical, which is a silently dangling
 * featureExpression: it resolves at neither translator-load nor emit (Inv 2(c)/2(d)).
 *
 * The map is passed in rather than read here because only the orchestrator holds the manifest — this stays
 * pure over (target, identities).
 */
export function resolveFeatureExpressionTarget(
  target: FeatureExpressionTarget,
  conceptName: string,
  identities: Partial<Record<FeatureExpressionTarget["layer"], string | undefined>>,
): ResolvedFeatureExpressionTarget {
  const librarySuffix = identities[target.layer];
  if (librarySuffix === undefined || librarySuffix === "") {
    throw new Error(
      `internal invariant violated: case-feature "${conceptName}" targets its \`cpg-featureExpression\` at ` +
        `define "${target.define}" in the "${target.layer}" layer, but that layer has no library identity in ` +
        `the manifest. The caller must confirm the layer's Library is emitted BEFORE resolving a target — ` +
        `an absent identity would build a root-pointing canonical, i.e. a silently dangling featureExpression.`,
    );
  }
  return { librarySuffix, define: target.define, resultKind: target.resultKind };
}
