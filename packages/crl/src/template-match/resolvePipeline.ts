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
// REFACTOR:grounded — re-derived from the target model. ⚠ ONE PART IS NOT: `isRecordSpaced` still routes
// through `assumedShapePreMigration`, so an UNDECLARED concept is guessed `Scalar` and can never classify a
// producer. The goal fixtures all declare `shape is`, so the classification is sound for them; the guess is
// tracked by `RETIRE:189-shape-declared` and the corpus sweep must be re-run when that rule ships.
//
// ⚠ SCOPE OF THIS SLICE. Resolution and classification only: no emit, and the fold stays alive for its
// existing emit consumers (removing it requires the lowering, so the sequencing is forced rather than
// chosen). Two fields the design calls for are DELIBERATELY ABSENT until a consumer needs them, rather than
// shipped speculative and untested: `resolvedInputs` (named-ref resolution, which must be an overlay on
// `call.args` and take a lane-neutral resolver callback — never a second namespace algorithm here) and the
// embedded S0 term list (`emit/effectiveRepresentation` is its authority; this module does not duplicate it).

import type {
  Concept,
  ConceptShape,
  Location,
  Reduction,
  ReductionConceptRef,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import type { CanonicalArg, CanonicalPatternCall } from "./canonicalTypes";
import { matchNarrative, matchNarrativeStages } from "./matcher";
import { isSelectionPattern, patternEntry } from "./patternCatalog";
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
  /**
   * A space of records of `recordType` — what `this` denotes, and what a reduction reduces.
   *
   * ⚠ `cardinality` is LOAD-BEARING, not decoration. Without it a selection's output and an unreduced space
   * are the same value, so terminal conformance cannot tell `shape is Record` (one) from `shape is RecordSet`
   * (many) and every reduction/shape pairing passes.
   */
  | { kind: "space"; recordType: string; cardinality: "one" | "many" }
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
  /**
   * What the stage consumes — carried because `effect` alone does not determine the lowering.
   *
   * ⚠ `direct` covers two OPPOSITE realizations: a terminal `AtLeast` computes from NAMED operands, a
   * terminal `ExistsOverSpace` computes from the FLOW. A consumer that had to re-look-up the catalog to tell
   * them apart would be a second reading of the fact this module exists to establish once. (Design R6: zero
   * args cannot stand in for reads-the-flow.)
   */
  reads: "flow" | "operands";
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
  | { kind: "value-stage-not-terminal"; index: number; location: Location; pattern: string }
  /** A grounded LIST-returning stage that MAPS rather than filters — it does not preserve the space. */
  | { kind: "stage-maps-not-filters"; index: number; location: Location; pattern: string }
  /**
   * The program's terminal output does not match what the concept declares it publishes.
   * ⚠ e.g. `shape is Record` + terminal `exists this`: the program publishes a boolean, the concept promises
   * a record.
   */
  | {
      kind: "terminal-shape-mismatch";
      location: Location;
      declared: ConceptShape;
      publishes: ConceptShape;
    }
  /**
   * ⚠ INTERNAL, and deliberately not silent. A structural reduction carries operands this slice cannot put
   * into a `CanonicalPatternCall` faithfully. Refusing beats building a lossy call — see `reductionAsCall`.
   */
  | { kind: "reduction-unrepresentable"; location: Location; detail: string };

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
    const built = reductionAsCall(def.reduction, concept.location);
    if ("unrepresentable" in built) {
      // ⚠ NOT `no-program`. The concept HAS a program; we cannot render it faithfully. Reporting "no
      // program" would tell a consumer the source space is the whole answer, which is a different and
      // wrong claim.
      return {
        kind: "invalid",
        diagnostics: [
          {
            kind: "reduction-unrepresentable",
            location: concept.location,
            detail: built.unrepresentable,
          },
        ],
      };
    }
    return finish([{ elements: [], index: 0, location: concept.location }], [built.call], sig);
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
    return finish(
      [{ elements: def.body.elements, index: 0, location: def.body.location }],
      [inDefinitionSlot(call)],
      sig,
    );
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
    staged.stages.map((s) => inDefinitionSlot(s.call!)),
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
  reduction: Reduction,
  location: Location,
): { call: CanonicalPatternCall } | { unrepresentable: string } {
  // ⚠⚠ THE TARGET IS NOT OPTIONAL. `ReductionTarget` is `ThisRecords | ReductionConceptRef`, so
  // `exists "X"` and `count "X" at least 2` name a space OTHER than `this` — and an earlier version of this
  // function returned `args: []` unconditionally, which made `exists "X"` resolve BYTE-IDENTICALLY to
  // `exists this`. That was latent only because every named-target form happened to be refused upstream; it
  // would have gone live the moment concept-level existence started resolving. It is the same silent-drop
  // family as the CRE's documented `most recent "X"` hole, reproduced in the module written to remove it.
  const targetArgs: CanonicalArg[] =
    reduction.target.type === "ReductionConceptRef"
      ? [conceptRefArg(reduction.target)]
      : [];

  switch (reduction.kind) {
    case "mostRecent":
      return { call: mk("MostRecent", targetArgs, location) };
    case "exists":
      // ⭐ NOT `Exists` — that is the REP-LOCAL projection. See the `ExistsOverSpace` entry in the catalog
      // for why the two cannot share a name.
      return { call: mk("ExistsOverSpace", targetArgs, location) };
    case "count":
      // ⚠ REFUSED, NOT LOWERED LOSSILY. `CountReduction.atLeast` is a bare integer and `CanonicalArg` has no
      // number member; encoding it as a unitless `QuantityArg` would be a lie, and dropping it would repeat
      // the defect above. `AtLeastN` is ungrounded so nothing resolves today either way — but relying on a
      // DOWNSTREAM refusal is precisely the coupling that breaks the day someone grounds it.
      return {
        unrepresentable:
          "`count … at least N` carries a numeric threshold that the canonical call cannot yet hold " +
          "(`CanonicalArg` has no number member). Grounding `AtLeastN` requires adding one first.",
      };
  }
}

/** A named reduction target as the canonical ref arg its narrative twin would carry. */
function conceptRefArg(target: ReductionConceptRef): CanonicalArg {
  const library = getRefLibrary(target.ref);
  return {
    type: "ConceptRefArg",
    value: getRefName(target.ref),
    ...(library !== null ? { library } : {}),
    location: target.location,
  };
}

const mk = (pattern: string, args: CanonicalArg[], location: Location): CanonicalPatternCall => ({
  type: "CanonicalPatternCall",
  pattern,
  args,
  known: true,
  location,
});

/**
 * ⭐ THE SLOT-KEYED RENAME. `matcher.ts` is slot-blind — it emits `Exists` for the words `exists this`
 * wherever they appear — but the two constructs those words spell are different operations (see the
 * `ExistsOverSpace` catalog entry). This module ONLY ever reads a `definition is`, so every narrative it
 * matches is in the definition slot by construction, and the rename is sound here and nowhere else.
 *
 * ⚠ Doing this in `reductionAsCall` alone would key the split on the CODE PATH rather than the construct:
 * `definition is exists this` would resolve while `…, then exists this` refused, which is exactly the
 * two-spellings drift this module exists to remove. ⚠ `Matches` is deliberately absent — its comparand is
 * the representation's own `coded from`, so it has no concept-level counterpart.
 */
const DEFINITION_SLOT_RENAME: Readonly<Record<string, string>> = { Exists: "ExistsOverSpace" };

const inDefinitionSlot = (call: CanonicalPatternCall): CanonicalPatternCall => {
  const renamed = DEFINITION_SLOT_RENAME[call.pattern];
  return renamed === undefined ? call : { ...call, pattern: renamed };
};

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
  let shape: StageShape = { kind: "space", recordType: sig.recordType, cardinality: "many" };

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

    // ⚠ A grounded LIST-returning pattern that MAPS is not a filter. `preservesElements` was written onto
    // the catalog for exactly this and was read by NOBODY — so `returnShape === "list"` meant "filter"
    // unconditionally, and grounding a map like `ComponentOf` (the catalog's own worked counter-example,
    // `List<Quantity>` from Observations) would have recreated the collapse the field exists to prevent.
    if (entry.returnShape === "list" && entry.stage.preservesElements === false) {
      diagnostics.push({
        kind: "stage-maps-not-filters",
        index: stage.index,
        location: stage.location,
        pattern: call.pattern,
      });
      continue;
    }

    const effect = deriveEffect(call.pattern, entry.returnShape, entry.stage.reads, sig, terminal);
    if (typeof effect !== "string") {
      diagnostics.push({ ...effect, index: stage.index, location: stage.location, pattern: call.pattern });
      continue;
    }

    const inputShape: StageShape = shape;
    const outputShape: StageShape =
      effect === "selection"
        ? { kind: "space", recordType: sig.recordType, cardinality: "one" }
        : effect === "direct"
          ? { kind: "value", valueType: sig.valueType ?? "unknown" }
          : // ⭐ PRODUCER and FILTER hand on a SPACE, at the cardinality they were HANDED. Recording a
            // producer's RAW value here is exactly the collapse this module removes — the next stage would
            // appear to receive a scalar. ⚠ And re-asserting `"many"` would silently un-collapse a space a
            // prior selection had reduced to one.
            {
              kind: "space",
              recordType: sig.recordType,
              cardinality: inputShape.kind === "space" ? inputShape.cardinality : "many",
            };

    resolved.push({
      index: stage.index,
      location: stage.location,
      call,
      effect,
      reads: entry.stage.reads,
      inputShape,
      outputShape,
      constructs: effect === "producer",
    });
    shape = outputShape;
  }

  if (diagnostics.length > 0) return { kind: "invalid", diagnostics };

  // `stages` is never empty here: every arm that reaches `finish` supplies at least one stage.
  const mismatch = terminalConformance(shape, sig, stages[stages.length - 1].location);
  if (mismatch !== null) return { kind: "invalid", diagnostics: [mismatch] };

  return { kind: "resolved", stages: resolved, publishes: shape };
}

/**
 * ⭐ TERMINAL CONFORMANCE — does the program publish what the concept promises?
 *
 * ⚠⚠ THIS CHECK WAS OWED BY THE DESIGN (R9) AND DID NOT EXIST, while the producer arm's own comment already
 * spoke of "failing terminal conformance against `Scalar`" as though it did. Without it a `shape is Record`
 * concept ending in `exists this` resolved CLEAN while publishing a boolean, and a `Scalar` concept ending in
 * a bare selection resolved clean while publishing a space.
 */
function terminalConformance(
  publishes: StageShape,
  sig: ConceptSignature,
  location: Location,
): (PipelineDiagnostic & { kind: "terminal-shape-mismatch" }) | null {
  // ⚠⚠ ONLY ON A DECLARED SHAPE, and this is not timidity — it is the difference between checking the
  // author's claim and checking OUR guess. `assumedShapePreMigration` answers `Scalar` for an undeclared
  // concept, so running the check through it MEASURED nine in-tree concepts as mismatches — every one of
  // them an undeclared `definition is most recent this` that publishes a record, i.e. the transitional
  // default being wrong, not the author. Reporting that as an author error is the same mistake as
  // surfacing `stage-ungrounded` (our catalog gap) from an author-facing validator.
  //
  // ⚠ This is therefore INCOMPLETE BY DESIGN until `shape-not-declared` ships. RETIRE:189-shape-declared —
  // when that rule lands and the corpus migrates, drop the guard so the check becomes total, and RE-RUN the
  // corpus sweep: the effect arms move with it.
  if (sig.shape === undefined) return null;
  const declared = assumedShapePreMigration(sig.shape);
  const actual: ConceptShape =
    publishes.kind === "value" ? "Scalar" : publishes.cardinality === "one" ? "Record" : "RecordSet";
  if (declared === actual) return null;
  return { kind: "terminal-shape-mismatch", location, declared, publishes: actual };
}

/**
 * ⭐ THE EFFECT DERIVATION — all four axes.
 *
 * Returns the effect, or a diagnostic shape (without the per-stage fields the caller supplies).
 */
function deriveEffect(
  pattern: string,
  returnShape: string,
  reads: "flow" | "operands",
  sig: ConceptSignature,
  terminal: boolean,
): StageEffect | { kind: "value-incompatible"; detail: string } | { kind: "value-stage-not-terminal" } {
  // ⭐ THE SHARED READING. Not `returnShape === "instance"` re-typed here — the literal function the
  // validator also calls, which is what makes R7's "one truth" true rather than asserted.
  if (isSelectionPattern(pattern)) return "selection";
  if (returnShape === "list") return "filter";

  // A VALUE-computing stage — `boolean` or `other`. What it becomes depends on the concept, not the pattern.
  //
  // ⚠ THIS WAS A PRESENCE CHECK (`sig.valueType !== undefined`) AND THAT IS NOT A TYPE CHECK: it let
  // `shape is Scalar` + `value type is Quantity` + `exists this` resolve as a `direct` publication of a
  // boolean into a Quantity. A boolean-returning pattern is checkable exactly, so check it.
  //
  // ⚠ `"other"` STAYS A PRESENCE CHECK, and I am saying so rather than implying more: the catalog records
  // `"other"` for Period, Quantity, Interval and DateTime alike, so it cannot distinguish
  // `BodyMassIndex → Quantity` from a Period-returning pattern. Tightening it needs a concrete result type
  // per pattern, which is a catalog change, not a resolver one.
  const matchesDatum =
    returnShape === "boolean" ? sig.valueType === "boolean" : sig.valueType !== undefined;

  // ⭐ PRODUCER presupposes a RECORD SPACE. "Joins the space as a constructed candidate" is meaningless in a
  // Scalar concept — and calling it a producer there would make its output a space and then fail terminal
  // conformance against `Scalar`: a spurious author-time error on a legal form.
  if (isRecordSpaced(sig) && reads === "operands") {
    if (!matchesDatum) {
      return {
        kind: "value-incompatible",
        detail:
          returnShape === "boolean"
            ? `the stage computes a boolean, but the concept declares \`value type is ${sig.valueType ?? "(none)"}\` for the candidate it would construct`
            : `the stage computes a value but the concept declares no single value type for it to become`,
      };
    }
    return "producer";
  }

  // ⚠ REACHED BY TWO DIFFERENT CASES, and an earlier comment here claimed only one ("Not record-spaced"),
  // which was FALSE for the second: a RECORD-spaced concept whose stage reads the FLOW (`exists this`) falls
  // through the producer arm above, because a flow-reader consumes the space rather than adding to it. In
  // both cases the value IS the published result and there is nothing for it to join — but only as the LAST
  // stage, and whether the concept may publish a value at all is settled by `terminalConformance`, not here.
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
