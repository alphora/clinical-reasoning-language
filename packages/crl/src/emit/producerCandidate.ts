// #189 — RESOLVING a producer stage into everything the emit needs to build its CANDIDATE.
//
// ⭐ THE MODEL (operator): *"TWO ARMS ADD TO A COLLECTION AND A THIRD ARM WORKS ON THAT COLLECTION STEPWISE
// (POTENTIALLY ADDING TO IT)."* The two arms are the local `code is` records and the source representation's.
// A `definition is` PRODUCER stage is how a third arm ADDS: it computes a value from NAMED operands, that
// value is constructed into a record of the concept's own `type is`, and the constructed candidate joins the
// space the terminal selection works on.
//
// ⚠⚠ RESOLUTION HAPPENS HERE, AT LOWERING — NOT AT RENDER TIME, and that split is the point.
//
// Everything a candidate needs (which constructor, which value wrapper, each operand's recency element) is a
// fact about the CONCEPT AND ITS SIBLINGS, and lowering is where the whole-library view exists. A renderer
// that looked these up itself would be a second reading of facts established here, which is the drift this
// refactor exists to remove. So this module answers "what candidate?" and the renderer only answers "what
// text?".
//
// ⚠ IT REFUSES RATHER THAN GUESSES. Design D1 is "detect before emission, never rely on a translator error":
// an operand of the wrong shape, a cross-library operand, an unsupported resource — each returns a typed
// refusal here, where it can carry an author-facing message, instead of emitting CQL that dies in the
// translator with a message about a generated function nobody wrote.
//
// REFACTOR:grounded — derived from the goal (`fixtures/obesity/`), the charter, and panel round 1
// (`.vibe-tools/discussions/525-189-producer-stage-wiring-plan-r1.md`); not from adjacent emitter code.

import type { Concept } from "../ast/types";
import type { CanonicalArg, CanonicalPatternCall } from "../template-match/canonicalTypes";
import type { ResolvedStage } from "../template-match/resolvePipeline";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import { resolveConstructor } from "./recordConstructor";
import type { ConstructorSignature } from "./recordConstructor";
import { resourceEmitRow } from "./resourceEmitRegistry";

/** One operand's recency stamp source, resolved from the OPERAND CONCEPT'S registry row. */
export interface OperandStamp {
  /** Index into the stage call's `args` — the renderer renders the ref itself, via its own arg renderer,
   *  so reference qualification has exactly ONE implementation. */
  argIndex: number;
  /** The operand concept's name, for diagnostics. */
  conceptName: string;
  /** The operand resource's recency element, from ITS row — never the enclosing concept's. */
  sortExpr: string;
  /** Whether that element is a polymorphic choice needing an `as FHIR.dateTime` cast. */
  cast: "dateTime" | "none";
}

/** Everything the emit needs to render ONE producer stage's constructed candidate. */
export interface ProducerCandidateSpec {
  /** 0-based index of the producer stage in the concept's resolved program. */
  stageIndex: number;
  /** The stage's call, rendered by the emitter's own pattern renderer. */
  call: CanonicalPatternCall;
  /**
   * The RESOLVED constructor signature, carried WHOLE.
   *
   * ⚠ Whole, not just its `functionName`: the emitter must both CALL the constructor and DEFINE it
   * (`renderRecordConstructor` takes a signature), and re-resolving it at render time would be a second
   * reading of a fact settled here — which is how the emitted function and the call to it get to disagree
   * about a parameter.
   */
  signature: ConstructorSignature;
  /** How to bring the producer's SYSTEM-typed result to the constructor's FHIR-typed parameter. */
  valueWrap: "quantity" | "boolean" | "none";
  /** The concept's own local code — what the constructed candidate is coded as. */
  code: { system: string; code: string };
  /** The case-feature profile url stamped into `meta.profile`. */
  profile: string;
  /** §5b — the components whose stamps determine this candidate's. Literal operands are absent. */
  operandStamps: readonly OperandStamp[];
}

export interface ProducerCandidateRefusal {
  kind: string;
  message: string;
}

export type ProducerCandidateResolution =
  | { kind: "resolved"; specs: readonly ProducerCandidateSpec[] }
  | { kind: "refused"; refusal: ProducerCandidateRefusal };

/**
 * ⭐ TWO KINDS, because a KIND IS A CLAIM and consumers filter on it (`obesityTarget.test.ts`'s blocker
 * ratchet does exactly that).
 *
 * `emit-reduction-not-active` carries a specific promise, stated by the sentinel this slice replaced: *"this
 * is unbuilt work, not an illegal form: do not re-author the concept to avoid it."* That is right for a
 * flow-reading producer or a RecordSet operand — real shapes whose lowering does not exist yet.
 *
 * ⚠ It is exactly WRONG for a typo'd operand name, where re-authoring is the entire fix. Charter §0a's
 * lesson is that blurring "the language cannot express this" with "the schedule has not reached this" is the
 * documented spin mechanism; an author told not to re-author their typo is stuck.
 */
export const PRODUCER_BUILD_DEBT_KIND = "emit-reduction-not-active";
export const PRODUCER_AUTHOR_ERROR_KIND = "emit-mixed-code-and-definition";

export interface ProducerCandidateInputs {
  /** The concept whose merge the candidates join. */
  concept: Concept;
  /** Its PRODUCER stages, in order, from the shared `resolveConceptPipeline`. */
  producerStages: readonly ResolvedStage[];
  /** Every concept in the SAME library, by name — the operand resolution's universe. */
  siblingsByName: ReadonlyMap<string, Concept>;
  /** The concept's local code (system = the synthetic local codesystem urn). */
  code: { system: string; code: string };
  /** The case-feature SD canonical url, ALREADY COMPOSED by the shared authority (`slug.ts`). ⚠ Passed in,
   *  never derived here — the two lanes must read one composition, and this module is not it. */
  profile: string;
  /** The concept's OWN library name, so a qualifier naming it reads as LOCAL rather than cross-library. */
  owningLibraryName: string;
}

/** A stage arg that names a concept, with its position. Literals (`30 'kg/m2'`) are not operands for
 *  stamping — a threshold has no recency, and including it would make the stamp unconditionally null. */
function conceptRefArgs(call: CanonicalPatternCall): { argIndex: number; arg: CanonicalArg }[] {
  const out: { argIndex: number; arg: CanonicalArg }[] = [];
  call.args.forEach((arg, argIndex) => {
    if (arg.type === "ConceptRefArg") out.push({ argIndex, arg });
  });
  return out;
}

/**
 * ⚠⚠ THE STAMPED COMPONENTS MUST BE THE COMPONENTS THAT DETERMINE THE VALUE, and a walk that silently skips
 * an argument kind breaks that equality without saying so.
 *
 * `CanonicalArg` is a six-way union. `NestedPatternArg`, `DisjunctionArg` and `ConjunctionArg` all CARRY
 * concept references, and `emitArg` renders a nested pattern by recursing — so if a grounded producer ever
 * binds one, its VALUE would include those refs while its STAMP excluded them. A candidate stamped by a
 * strict subset of its determinants takes a confident recency place it has not earned: the same defect class
 * the `Max`-ignores-nulls fix removed, arriving through the argument model instead of the null model.
 *
 * Today's grounded producers bind only concept refs and literals. This makes the day that changes a LOUD
 * failure rather than a quiet mis-stamp — the same standard applied to a flow-reading producer.
 */
const SIMPLE_ARG_TYPES = new Set(["ConceptRefArg", "QuantityArg", "EnumArg"]);

/**
 * Resolve every producer stage into a candidate spec, or refuse with one author-facing message.
 *
 * ⚠ TOTAL and REFUSING: every shape this does not cover returns `refused`, never a partial spec. A partial
 * spec is how a derivation silently vanishes from a successful emit, which is the failure mode this whole
 * slice exists to make impossible.
 */
export function resolveProducerCandidates(inputs: ProducerCandidateInputs): ProducerCandidateResolution {
  const { concept, producerStages, siblingsByName, code, profile, owningLibraryName } = inputs;
  /** Unbuilt lowering — the form is legal and the author must NOT work around it. */
  const refuse = (message: string): ProducerCandidateResolution => ({
    kind: "refused",
    refusal: { kind: PRODUCER_BUILD_DEBT_KIND, message },
  });
  /** The author must change something — a name that resolves to nothing, a missing declaration. */
  const refuseAuthor = (message: string): ProducerCandidateResolution => ({
    kind: "refused",
    refusal: { kind: PRODUCER_AUTHOR_ERROR_KIND, message },
  });

  const resourceType = concept.conceptType;
  if (resourceType === undefined) {
    return refuseAuthor(
      `Concept "${concept.name}" runs a producer stage but declares no \`type is\` resource, so there is no ` +
        `record for its computed value to be constructed into. Declare the resource the determination is.`,
    );
  }
  if (profile.trim() === "") {
    // ⚠ NOT a defensive check. `policyId` is OPTIONAL on the emit options and normalizes to `""`, so a
    // direct/test caller reaches here with an empty base and would stamp an `unnamed` profile canonical onto
    // a real candidate — silently disagreeing with the FHIR lane's case-feature SD url. Panel round 1.
    return refuse(
      `Concept "${concept.name}" runs a producer stage, whose constructed candidate must be stamped with the ` +
        `case-feature StructureDefinition url the FHIR lane emits — but no policy id was supplied, so that ` +
        `url cannot be composed. This is an emit-configuration gap (package.json \`name\`), not an authoring ` +
        `error.`,
    );
  }

  const specs: ProducerCandidateSpec[] = [];
  for (const stage of producerStages) {
    // ⚠ THE FLAT UNION IS ONLY CORRECT FOR AN OPERAND-READING PRODUCER, so assert it rather than assume it.
    // A producer that read the FLOW would consume the space handed to it, and unioning its result into that
    // same space would emit something the CRE — which evaluates the program STEPWISE off the same resolver —
    // does not agree with. The grammar cannot currently produce one; this makes the day it can a loud
    // failure instead of a silent divergence. (Panel round 1, Claude arm #9.)
    if (stage.reads !== "operands") {
      return refuse(
        `Concept "${concept.name}": producer stage ${stage.index} (\`${stage.call.pattern}\`) reads ` +
          `\`${stage.reads}\`, not its named operands. A flow-reading producer consumes the space it is ` +
          `handed, so its candidate cannot simply join that space — it needs a stepwise lowering that does ` +
          `not exist yet.`,
      );
    }

    const valueType = concept.valueTypes.length === 1 ? concept.valueTypes[0] : undefined;
    const ctor = resolveConstructor(resourceType, valueType);
    if (ctor.kind !== "resolved") {
      return refuse(
        `Concept "${concept.name}": a producer stage's value must be constructed into a ` +
          `\`${resourceType}\` record, and that constructor cannot be built (${ctor.reason}: ${ctor.detail}).`,
      );
    }
    const sig = ctor.signature;

    // ⚠ VALUE MODE AND EXISTENCE MODE TAKE DIFFERENT SECOND PARAMETERS, and wrapping the wrong one is a
    // silent mis-emit. `existence` mode's guard parameter is a RAW `System.Boolean` (`established`), so it
    // takes NO FHIR wrapper; `value` mode's takes the FHIR type of the declared value. The goal never
    // exercises existence mode, which is exactly why an unconditional boolean wrapper would have shipped
    // broken. (Panel round 1, Claude arm #6.)
    let valueWrap: ProducerCandidateSpec["valueWrap"];
    if (sig.valueMode === "existence") {
      valueWrap = "none";
    } else if (valueType === "Quantity") {
      valueWrap = "quantity";
    } else if (valueType === "boolean") {
      valueWrap = "boolean";
    } else {
      return refuse(
        `Concept "${concept.name}": a producer stage computes a \`${valueType ?? "(undeclared)"}\`, and the ` +
          `System-to-FHIR conversion for that value type at a constructor's landing site is not established ` +
          `yet. Quantity and boolean are.`,
      );
    }

    // ── OPERAND RESOLUTION ────────────────────────────────────────────────────────────────────────────
    // ⚠ The catalog grounds each producer against a SINGLETON-RECORD overload (`BodyMassIndex(weight
    // Observation, height Observation)`, `AtLeast(rec Observation, target System.Quantity)`). An operand
    // that publishes something else binds a DIFFERENT overload or none at all — and `componentStampCql`'s
    // record read needs the same guarantee. So the shape is checked here, before any text is rendered.
    const complexArg = stage.call.args.find((a) => !SIMPLE_ARG_TYPES.has(a.type));
    if (complexArg !== undefined) {
      return refuse(
        `Concept "${concept.name}": producer stage ${stage.index} (\`${stage.call.pattern}\`) takes a ` +
          `\`${complexArg.type}\` argument. Which of its nested concept references DETERMINE the computed ` +
          `value — and so must contribute to its §5b recency stamp — is not established, and stamping a ` +
          `candidate from a subset of its determinants would give it a recency place it has not earned.`,
      );
    }

    const operandStamps: OperandStamp[] = [];
    for (const { argIndex, arg } of conceptRefArgs(stage.call)) {
      if (arg.type !== "ConceptRefArg") continue; // narrowing; `conceptRefArgs` filters
      // ⚠ A qualifier naming THIS library is LOCAL. `"Current Library"."Weight"` is an ordinary same-library
      // reference that CRL normalizes elsewhere (`normalizeLocalRef`), and rejecting it as cross-library would
      // refuse a legal authoring the rest of the language accepts. Only a qualifier that survives
      // normalization is foreign.
      if (arg.library !== undefined && arg.library !== null && arg.library !== owningLibraryName) {
        return refuse(
          `Concept "${concept.name}": producer stage ${stage.index} reads the cross-library operand ` +
            `\`${arg.library}."${arg.value}"\`. Resolving another library's record shape and recency element ` +
            `is deferred — the member-existence lane defers cross-library referents for the same reason.`,
        );
      }
      const operand = siblingsByName.get(arg.value);
      if (operand === undefined) {
        return refuseAuthor(
          `Concept "${concept.name}": producer stage ${stage.index} names the operand "${arg.value}", which ` +
            `is not a concept in this library.`,
        );
      }
      const operandShape = assumedShapePreMigration(operand.shape);
      if (operandShape !== "Record") {
        return refuse(
          `Concept "${concept.name}": producer stage ${stage.index} reads operand "${arg.value}", which ` +
            `publishes \`shape is ${operandShape ?? "(undeclared)"}\`. This calculation is grounded against ` +
            `a SINGLE RECORD per operand — a set has no one value to compute from and no one timestamp to ` +
            `carry, and how to pair two histories is an open question, not an omission.`,
        );
      }
      const operandResource = operand.conceptType;
      if (operandResource === undefined) {
        return refuseAuthor(
          `Concept "${concept.name}": producer stage ${stage.index} reads operand "${arg.value}", which ` +
            `declares no \`type is\` resource, so its recency element is unknown.`,
        );
      }
      const row = resourceEmitRow(operandResource);
      if (row === undefined || row.recency === undefined) {
        return refuse(
          `Concept "${concept.name}": producer stage ${stage.index} reads operand "${arg.value}" ` +
            `(\`${operandResource}\`), whose recency element is not established in the emit registry. §5b ` +
            `stamps a derived candidate from its components' timestamps, so an operand without one cannot ` +
            `contribute.`,
        );
      }
      // ⚠⚠ THE GROUNDED OVERLOAD IS TYPED, so "publishes a Record" is not enough. `CRLCommon` grounds
      // `BodyMassIndex(weight Observation, height Observation)` and `AtLeast(rec Observation, target
      // System.Quantity)` — both read `rec.value as Quantity` off an OBSERVATION. Two `Condition` operands
      // would pass a shape-only check and then have NO CQL overload (a translator failure, which design D1
      // forbids); an Observation whose declared datum is `string` would pass, translate, and quietly return
      // null through the `as Quantity` cast — turning an ESTABLISHED computation into a pause, which is worse.
      //
      // Checked against the catalog's own realization types rather than a list invented here, so a new
      // grounded overload widens this by widening the catalog.
      const operandDatum = operand.valueTypes.length === 1 ? operand.valueTypes[0] : undefined;
      if (operandResource !== "Observation" || operandDatum !== "Quantity") {
        return refuse(
          `Concept "${concept.name}": producer stage ${stage.index} reads operand "${arg.value}" ` +
            `(\`type is ${operandResource}\`, \`value type is ${operandDatum ?? "(none/multiple)"}\`). The ` +
            `grounded realization of \`${stage.call.pattern}\` reads a Quantity value off an Observation; no ` +
            `overload covers this operand, so the emitted CQL would either fail to translate or read null ` +
            `through a failed cast and silently drop the candidate.`,
        );
      }
      // ⚠ THE OPERAND'S OWN ROW, never the enclosing concept's. An all-Observation fixture makes the wrong
      // plumbing pass green; a threshold over a Condition-typed operand (`recordedDate`, cast `none`) is the
      // case that breaks it. (Panel round 1, Claude arm #4.)
      operandStamps.push({
        argIndex,
        conceptName: arg.value,
        sortExpr: row.recency.sortExpr,
        cast: row.recency.cast,
      });
    }

    if (operandStamps.length === 0) {
      // §5b with no components yields a null stamp, so the constructor would drop every candidate. That is
      // an emit that always produces nothing while reporting success — refuse instead.
      return refuse(
        `Concept "${concept.name}": producer stage ${stage.index} (\`${stage.call.pattern}\`) has no concept ` +
          `operand to take a recency stamp from, so every candidate it built would be dropped as undated.`,
      );
    }

    specs.push({
      stageIndex: stage.index,
      call: stage.call,
      signature: sig,
      valueWrap,
      code,
      profile,
      operandStamps,
    });
  }

  return { kind: "resolved", specs };
}
