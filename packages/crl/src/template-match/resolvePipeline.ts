// #189 P2 (design D6) — THE SHARED PIPELINE RESOLVER. One reading of a concept's program, for all lanes.
//
// ⚠⚠ WHAT THIS IS FOR. `matchNarrative` FOLDS a pipeline into ONE call by prepending each stage as the next
// stage's first argument, so `body mass index of "W" and "H", then most recent this` becomes
// `MostRecent(BodyMassIndex(W, H))` — stage 2 reducing stage 1's VALUE instead of the concept's space, which
// silently drops the asserted and recorded arms and does not even translate. That fold is the PATIENT
// (`REFACTOR:suspect`); this module is the ground truth that replaces it.
//
// ⭐ THE MODEL (operator, 2026-08-30):
//
//     TWO ARMS ADD TO A COLLECTION AND A THIRD ARM WORKS ON THAT COLLECTION STEPWISE (POTENTIALLY ADDING TO IT).
//
//   · `code is` ADDS its records.
//   · each `source representation`'s projection ADDS a candidate PER RETRIEVED RECORD.
//   · `definition is` is NOT a third contributor — it WORKS ON that collection, stepwise. Each stage is
//     handed what the previous produced; a PRODUCER adds its candidate to what it was given; the last
//     stage's reduction selects from the whole collection.
//
// ⚠ "The merge" is therefore not a mechanism to build. It is the last stage operating on a collection the
// other two arms already filled.
//
// ⚠ `this` in a stage ALWAYS denotes THE SPACE HANDED TO THAT STAGE — the previous stage's output. Never a
// scalar, and never an earlier pre-filter space (that cumulative misreading was drafted and caught twice).
//
// ⚠ SCOPE OF THIS SLICE. Resolution and classification only: no emit, and the fold stays alive for its
// existing emit consumers (removing it requires the lowering, so the sequencing is forced rather than
// chosen). Two fields the design calls for are DELIBERATELY ABSENT until a consumer needs them, rather than
// shipped speculative and untested: `resolvedInputs` (named-ref resolution, which must be an overlay on
// `call.args` and take a lane-neutral resolver callback — never a second namespace algorithm here) and the
// embedded S0 term list (`emit/effectiveRepresentation` is its authority; this module does not duplicate it).

import type { Concept, ConceptShape, Location } from "../ast/types";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import type { CanonicalPatternCall } from "./canonicalTypes";
import { matchNarrative, matchNarrativeStages } from "./matcher";
import { patternEntry } from "./patternCatalog";
import type { PipelineMalformation, PipelineStage } from "./pipeline";

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SHAPE VOCABULARY
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What flows between stages.
 *
 * ⚠ The catalog's 4-valued return shape CANNOT express this, which is why the transition check needs its own
 * vocabulary: "a space of records of the concept's `type is`" and "a Quantity" are both `"other"` to the
 * catalog. Without this distinction the typed transition gets built twice, differently — and recording a
 * producer's RAW value as its output would re-create the very collapse this module exists to remove
 * (`MostRecent` would appear to receive a scalar again).
 */
export type StageShape =
  /** A space of records of `recordType` — what `this` denotes, and what a reduction reduces. */
  | { kind: "space"; recordType: string }
  /** A bare computed value. Only ever a TERMINAL stage's output (see `StageEffect`). */
  | { kind: "value"; valueType: ConceptValueType | "unknown" };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE EFFECT — derived per OCCURRENCE, never stored (D9)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a stage does to the space it was handed.
 *
 * ⭐ DERIVED from `(return shape × what the pattern reads × the concept's signature × terminal position)` —
 * all four axes. An earlier draft used the first and a value-match only, and that under-implementation is
 * what made `AtLeast` look contradictory across two design sections: it is a PRODUCER in `Obese` because
 * that concept is record-spaced and the stage is non-terminal, and it would be a DIRECT publication as the
 * terminal stage of a `Scalar<boolean>` concept. Neither is a property of the pattern.
 */
export type StageEffect =
  /** Collapses the space to ONE member. */
  | "selection"
  /** Narrows the space, preserving elements. */
  | "filter"
  /** Computes a value from NAMED operands and adds it to the handed space as a constructed candidate. */
  | "producer"
  /** Computes the concept's PUBLISHED value directly. Terminal only — there is no space for it to join. */
  | "direct";

export interface ResolvedStage {
  index: number;
  location: Location;
  call: CanonicalPatternCall;
  effect: StageEffect;
  /** The space (or value) handed IN. Stage 0's input is the source space, S0. */
  inputShape: StageShape;
  /** What this stage hands ON — `Sᵢ` for a producer/filter, one member for a selection, a value for direct. */
  outputShape: StageShape;
  /**
   * Whether the stage's computed value must be CONSTRUCTED into a record of the concept's `type is`.
   *
   * ⚠ Derived, not independent: `constructs === (effect === "producer")`. Carried for the consumers'
   * convenience, and stated here so it cannot disagree with `effect`. P1's `resolveConstructor` says HOW;
   * this only says THAT.
   */
  constructs: boolean;
}

/** Why a concept's program could not be resolved. Author-facing unless marked internal. */
export type PipelineDiagnostic =
  | { kind: "malformed"; problem: PipelineMalformation; location: Location }
  | { kind: "stage-unmatched"; index: number; location: Location }
  /** The pattern matched, but its STAGE behaviour is not grounded against the catalog realization. */
  | { kind: "stage-ungrounded"; index: number; location: Location; pattern: string }
  /** A rep-local projection used as a stage. */
  | { kind: "stage-projection-only"; index: number; location: Location; pattern: string }
  /** A value-computing stage whose value fits neither the concept's datum nor its published type. */
  | { kind: "value-incompatible"; index: number; location: Location; pattern: string; detail: string }
  /** A value-computing stage that cannot produce a candidate, used NON-terminally. */
  | { kind: "value-stage-not-terminal"; index: number; location: Location; pattern: string };

/**
 * The resolution of one concept's program.
 *
 * ⚠ A DISCRIMINATED RESULT, not a partially-populated pipeline. A `ResolvedPipeline` with holes in it invites
 * a consumer to execute semantics that were never established; making the failure a separate arm makes
 * running a broken program an explicit choice rather than an oversight.
 *
 * ⚠ "Failure is a value" covers AUTHOR errors. An internal catalog gap still THROWS
 * (`requireReturnShape`) — that is an invariant violation, not something to hand a consumer.
 */
export type PipelineResolution =
  /** The concept has no `definition is` at all — its program is just the source space. */
  | { kind: "no-program" }
  | { kind: "resolved"; stages: ResolvedStage[]; publishes: StageShape }
  | { kind: "invalid"; diagnostics: PipelineDiagnostic[] };

/** The concept facts the derivation needs. Passed explicitly so this module stays pure over the AST. */
interface ConceptSignature {
  shape: ConceptShape | undefined;
  /** The concept's `type is`, defaulted to the implicit-standard local Observation (charter §3). */
  recordType: string;
  /** The single declared value type, or `undefined` when the concept declares none. */
  valueType: ConceptValueType | undefined;
}

function signatureOf(concept: Concept): ConceptSignature {
  return {
    shape: concept.shape,
    recordType: concept.conceptType ?? "Observation",
    valueType: concept.valueTypes?.length === 1 ? concept.valueTypes[0] : undefined,
  };
}

/** Is the concept RECORD-SPACED — i.e. is there a space for a constructed candidate to join? */
function isRecordSpaced(sig: ConceptSignature): boolean {
  const shape = assumedShapePreMigration(sig.shape);
  return shape === "Record" || shape === "RecordSet";
}

/**
 * Resolve ONE concept's program into ordered, classified stages.
 *
 * ⭐ NORMALIZES BOTH SPELLINGS. `definition is most recent this` builds a structural `ReductionDefinition`,
 * while the same words after a `, then` are narrative elements — and the goal's `Height` and `Weight` are
 * the structural form. A resolver that read only narratives would resolve NEITHER, leave every consumer a
 * parallel path, and keep the one-renderer invariant hand-enforced.
 */
export function resolveConceptPipeline(concept: Concept): PipelineResolution {
  const def = concept.definition;
  if (def === undefined) return { kind: "no-program" };

  const sig = signatureOf(concept);

  // ── The STRUCTURAL spelling: a bare reduction is a ONE-STAGE pipeline over the source space. ──────────
  if (def.type === "ReductionDefinition") {
    const call = reductionAsCall(def.reduction, concept.location);
    if (call === null) return { kind: "no-program" }; // a form this slice does not classify
    return finish([{ elements: [], index: 0, location: concept.location }], [call], sig);
  }

  if (def.type !== "DefinitionIsDefinition") return { kind: "no-program" };

  // ── The NARRATIVE spelling: one stage, or n separated by `, then`. ────────────────────────────────────
  const staged = matchNarrativeStages(def.body);
  if (staged.kind === "malformed") {
    return {
      kind: "invalid",
      diagnostics: [{ kind: "malformed", problem: staged.problem, location: staged.location }],
    };
  }
  if (staged.kind === "not-a-pipeline") {
    const call = matchNarrative(def.body);
    if (!call.known) {
      return {
        kind: "invalid",
        diagnostics: [{ kind: "stage-unmatched", index: 0, location: def.body.location }],
      };
    }
    return finish([{ elements: def.body.elements, index: 0, location: def.body.location }], [call], sig);
  }

  const diagnostics: PipelineDiagnostic[] = [];
  for (const { stage, call } of staged.stages) {
    if (call === null) {
      diagnostics.push({ kind: "stage-unmatched", index: stage.index, location: stage.location });
    }
  }
  if (diagnostics.length > 0) return { kind: "invalid", diagnostics };

  return finish(
    staged.stages.map((s) => s.stage),
    staged.stages.map((s) => s.call!),
    sig,
  );
}

/**
 * A structural `Reduction` rendered as the canonical call its narrative twin produces.
 *
 * ⭐ THE POINT OF THIS FUNCTION is that `definition is most recent this` and `…, then most recent this` must
 * resolve IDENTICALLY. Two spellings of one operation that classify differently is exactly the drift the
 * shared resolver exists to remove — and it is already a live defect in the CRE, whose refusal keys on the
 * AST node kind, so a NAMED `most recent "X"` bypasses it and evaluates silently false.
 */
function reductionAsCall(
  reduction: { kind: string },
  location: Location,
): CanonicalPatternCall | null {
  const pattern =
    reduction.kind === "mostRecent"
      ? "MostRecent"
      : reduction.kind === "exists"
        ? "Exists"
        : reduction.kind === "count"
          ? "AtLeastN"
          : reduction.kind === "highest"
            ? "Highest"
            : reduction.kind === "lowest"
              ? "Lowest"
              : null;
  if (pattern === null) return null;
  return { type: "CanonicalPatternCall", pattern, args: [], known: true, location };
}

/** Classify each stage in order, threading the shape from one to the next. */
function finish(
  stages: PipelineStage[],
  calls: CanonicalPatternCall[],
  sig: ConceptSignature,
): PipelineResolution {
  const diagnostics: PipelineDiagnostic[] = [];
  const resolved: ResolvedStage[] = [];

  // S0 — the source space. `emit/effectiveRepresentation` is the authority on its CONTENTS; the resolver
  // only needs its SHAPE, which is a space of the concept's own record type.
  let shape: StageShape = { kind: "space", recordType: sig.recordType };

  for (const [i, call] of calls.entries()) {
    const stage = stages[i];
    const terminal = i === calls.length - 1;
    const entry = patternEntry(call.pattern);

    if (entry === undefined || entry.slot === "projection-only") {
      diagnostics.push(
        entry?.slot === "projection-only"
          ? { kind: "stage-projection-only", index: stage.index, location: stage.location, pattern: call.pattern }
          : { kind: "stage-ungrounded", index: stage.index, location: stage.location, pattern: call.pattern },
      );
      continue;
    }
    if (!entry.stage.grounded) {
      // ⚠ FAIL CLOSED. Having a return shape is NOT grounding: the catalog is total over return shapes, so
      // without this every pattern would be classifiable as a stage — including maps like `ComponentOf`,
      // which returns `List<Quantity>` and preserves neither element identity nor type.
      diagnostics.push({
        kind: "stage-ungrounded",
        index: stage.index,
        location: stage.location,
        pattern: call.pattern,
      });
      continue;
    }

    const effect = deriveEffect(entry.returnShape, entry.stage.reads, sig, terminal);
    if (typeof effect !== "string") {
      diagnostics.push({ ...effect, index: stage.index, location: stage.location, pattern: call.pattern });
      continue;
    }

    const inputShape = shape;
    const outputShape: StageShape =
      effect === "selection"
        ? { kind: "space", recordType: sig.recordType } // one member, still of the concept's record type
        : effect === "direct"
          ? { kind: "value", valueType: sig.valueType ?? "unknown" }
          : // ⭐ PRODUCER and FILTER hand on a SPACE. Recording a producer's RAW value here is exactly the
            // collapse this module removes — the next stage would appear to receive a scalar.
            { kind: "space", recordType: sig.recordType };

    resolved.push({
      index: stage.index,
      location: stage.location,
      call,
      effect,
      inputShape,
      outputShape,
      constructs: effect === "producer",
    });
    shape = outputShape;
  }

  if (diagnostics.length > 0) return { kind: "invalid", diagnostics };
  return { kind: "resolved", stages: resolved, publishes: shape };
}

/**
 * ⭐ THE EFFECT DERIVATION — all four axes.
 *
 * Returns the effect, or a diagnostic shape (without the per-stage fields the caller supplies).
 */
function deriveEffect(
  returnShape: string,
  reads: "flow" | "operands",
  sig: ConceptSignature,
  terminal: boolean,
): StageEffect | { kind: "value-incompatible"; detail: string } | { kind: "value-stage-not-terminal" } {
  if (returnShape === "instance") return "selection";
  if (returnShape === "list") return "filter";

  // A VALUE-computing stage — `boolean` or `other`. What it becomes depends on the concept, not the pattern.
  const matchesDatum = sig.valueType !== undefined;

  // ⭐ PRODUCER presupposes a RECORD SPACE. "Joins the space as a constructed candidate" is meaningless in a
  // Scalar concept — and calling it a producer there would make its output a space and then fail terminal
  // conformance against `Scalar`: a spurious author-time error on a legal form.
  if (isRecordSpaced(sig) && reads === "operands") {
    if (!matchesDatum) {
      return {
        kind: "value-incompatible",
        detail: `the stage computes a value but the concept declares no single value type for it to become`,
      };
    }
    return "producer";
  }

  // Not record-spaced: the value IS the published result — but only as the LAST stage.
  // ⚠ A non-terminal value stage would hand a SCALAR to the next stage, contradicting the rule that `this`
  // always denotes a space. That is an author-time error, not a silently-tolerated shape.
  if (!terminal) return { kind: "value-stage-not-terminal" };
  if (!matchesDatum) {
    return {
      kind: "value-incompatible",
      detail: `the stage computes a value but the concept declares no single value type to publish it as`,
    };
  }
  return "direct";
}
