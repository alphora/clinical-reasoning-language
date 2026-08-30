import type { CRL, Concept, Location } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrativeStages, narrativeText } from "../template-match/matcher";
import {
  isProjectionOnly,
  isSelectionPattern,
  patternReturnShape,
  renameForDefinitionSlot,
} from "../template-match/patternCatalog";

import type { PipelineStageError, PipelineStageRule, ValidationError } from "./validator";

// #189 P2 (design D10) — THE PIPELINE STAGE RULES. Author-time ERRORS, deliberately not warnings.
//
// ⚠⚠ WHY ERRORS, AND WHY HERE. A `, then` pipeline is EXPLICIT author structure. Before this, a stage that
// matched nothing soft-compiled: `matchNarrative` returned `known: false` for the WHOLE narrative and the
// concept validated clean, so the goal fixture "validated clean while matching the wrong operation"
// (plan §2.10). That is the trap P2 exists to remove — and a fix that gave pipelines structure while leaving
// unmatched stages silent would let the trap survive INSIDE the fix.
//
// These rules live in their OWN validator rather than joining an existing one, because neither fits:
//   · `reductionShapeValidator` is WARNINGS-ONLY BY DESIGN — it validates one version ahead of the emit
//     flip, so every finding there is an intrinsic warning and `isValid` stays true. Putting an error there
//     would contradict its stated invariant.
//   · `representationShapeValidator` owns representation shape; a pipeline stage is narrative structure.
//
// ⚠ SCOPE: this is the STRUCTURE + SELECTION-adjacency layer. Full stage-kind is DERIVED PER OCCURRENCE in
// the shared resolver (design D9) from `(return shape × concept signature × terminal position)` — it is NOT
// a stored per-pattern fact, which is what dissolves the §7/§13 `AtLeast` contradiction. SELECTION is the
// one classification that IS context-free (picking one member of a space is that whatever the concept
// publishes), so it can be decided here without the resolver.

// REFACTOR:grounded — the selection rule here is re-derived from the target model, not from adjacent code:
// it now CALLS the catalog's `isSelectionPattern` rather than restating `returnShape === "instance"`, and the
// decision NOT to adopt the resolver's scope was measured against the corpus rather than assumed.
//
// ⭐ THE SWITCH (design R7). This file used to carry its own
// `isSelection(patternReturnShape(p) === "instance")` — the same rule the resolver derives, read a second
// time. It now CALLS the shared `isSelectionPattern`, so there is one reading and not two that agree by
// coincidence.
//
// ⚠ WHY THIS AND NOT `resolveConceptPipeline`. Delegating wholesale was MEASURED and rejected: the
// resolver's scope is every concept PROGRAM while this validator's is `, then` pipelines, so adopting it
// would have turned 185 of 219 in-tree programs into hard author errors — the resolver is fail-closed for a
// consumer that must not EXECUTE an unverified program, which is not this validator's obligation. R7 asks
// only for the duplicated selection derivation to go, and that is what went.
//
// ⚠ AND `deriveEffect` COULD NOT SERVE: it is reached only past the resolver's `stage.grounded` gate, while
// five in-tree selection patterns (`Last`, `LastOf`, `Earliest`, `First`, `FirstOf`) are ungrounded. Calling
// it here would have silently stopped `pipeline-selection-after-selection` firing for all five.

/** Whether the shared fact table knows this pattern at all. ⚠ FAIL CLOSED: an unknown pattern is a catalog
 *  gap, reported as such, never silently treated as "not a selection". */
function isClassified(pattern: string): boolean {
  return patternReturnShape(pattern) !== undefined;
}

interface Attribution {
  libraryName?: string;
  filePath?: string;
}

export class PipelineStageValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const errors: ValidationError[] = [];
    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, errors);
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt, {}, errors);
      }
    }
    return errors;
  }

  private err(
    rule: PipelineStageRule,
    conceptName: string,
    message: string,
    location: Location,
    attribution: Attribution,
  ): PipelineStageError {
    return {
      kind: "pipeline-stage",
      rule,
      conceptName,
      message,
      location,
      severity: "error",
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };
  }

  private checkConcept(concept: Concept, attribution: Attribution, errors: ValidationError[]): void {
    // Every narrative a concept can carry: the concept-level derivation AND each representation's
    // projection. Both can be authored as pipelines, and a stage rule covering only one would leave the
    // trap open in the other.
    if (concept.definition?.type === "DefinitionIsDefinition") {
      this.checkNarrative(concept, concept.definition.body, "`definition is`", "definition", attribution, errors);
    }
    for (const rep of concept.representations ?? []) {
      if (rep.valueProjection) {
        this.checkNarrative(
          concept,
          rep.valueProjection.body,
          "`value projection is`",
          "projection",
          attribution,
          errors,
        );
      }
    }
  }

  private checkNarrative(
    concept: Concept,
    body: Parameters<typeof matchNarrativeStages>[0],
    where: string,
    slot: "definition" | "projection",
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
    // ⭐⭐ THE SLOT DECIDES WHAT THE WORDS MEAN, and this body serves BOTH slots. `matcher.ts` is slot-blind:
    // it emits `Exists` for `exists this` wherever it appears. Without this rename the validator called
    // `definition is most recent this, then exists this` a rep-local projection in a pipeline — while the
    // resolver, which DOES rename, classified the same source clean. One commit, two readings, and the
    // author-facing message even told them the computation "belongs in a concept-level `definition is`"
    // while reporting on one. Both panel arms found it independently.
    const patternIn = (p: string): string => (slot === "definition" ? renameForDefinitionSlot(p) : p);
    const result = matchNarrativeStages(body);
    if (result.kind === "not-a-pipeline") return;

    if (result.kind === "malformed") {
      const fix: Record<typeof result.problem, string> = {
        "leading-then": "a pipeline cannot START with `then` — write the first stage before it",
        "doubled-then": "two `then` delimiters with no stage between them — remove one, or write the stage",
        "dangling-then": "a trailing `then` with no stage after it — write the stage, or remove the `then`",
      };
      errors.push(
        this.err(
          "pipeline-malformed",
          concept.name,
          `Concept "${concept.name}": the ${where} pipeline is malformed — ${fix[result.problem]}.`,
          result.location,
          attribution,
        ),
      );
      return; // Do not run stage checks on a pipeline that has no stages.
    }

    // ⚠ Report EVERY unmatched stage, not just the first: a pipeline with two typos should not need two
    // round-trips.
    for (const { stage, call } of result.stages) {
      if (call === null) {
        errors.push(
          this.err(
            "pipeline-stage-unmatched",
            concept.name,
            `Concept "${concept.name}": stage ${stage.index + 1} of the ${where} pipeline ` +
              `(\`${narrativeText(stage.elements)}\`) matches no known form. Each stage between \`then\` ` +
              `delimiters must be a complete operation on its own — a stage missing its operand ` +
              `(\`, then at least 30 'kg/m2'\`) is the common cause; name what it operates on, or \`this\`.`,
            stage.location,
            attribution,
          ),
        );
        continue;
      }
      // ⭐ A PROJECTION-ONLY pattern used as a pipeline STAGE — in ANY position, including the first.
      //
      // ⚠ This lives here because only this validator sees the stages. `matchNarrative` FOLDS a pipeline into
      // the terminal stage's pattern, so `definition is matches this, then most recent this` looks like
      // `MostRecent` to any consumer reading the folded call — and MEASURED, both that and
      // `value projection is exists this, then most recent this` validated completely clean. The later-stage
      // case was previously caught only by an ARITY proxy (the fold injects an operand into a zero-operand
      // contract), which by construction could never see stage 1.
      if (isProjectionOnly(patternIn(call.pattern))) {
        errors.push(
          this.err(
            "pipeline-stage-projection-only",
            concept.name,
            `Concept "${concept.name}": \`${call.pattern.toLowerCase()} this\` is a REP-LOCAL projection ` +
              `over ONE representation's own datum, so it is the WHOLE \`value projection is …\` or nothing ` +
              `— it cannot be stage ${stage.index + 1} of a \`, then\` pipeline. A computation over other ` +
              `named declarations belongs in a concept-level \`definition is\`.`,
            stage.location,
            attribution,
          ),
        );
        continue;
      }
      if (!isClassified(patternIn(call.pattern))) {
        // FAIL CLOSED. A matched-but-unclassified pattern is OUR gap, not the author's — say so, and do not
        // let it pass as "not a selection".
        errors.push(
          this.err(
            "pipeline-stage-unclassified",
            concept.name,
            `internal: stage ${stage.index + 1} of "${concept.name}"'s ${where} matched pattern ` +
              `\`${call.pattern}\`, which has no entry in the return-shape catalog. The stage cannot be ` +
              `classified, so its pipeline position cannot be checked. This is a catalog gap to fill, not ` +
              `an authoring error.`,
            stage.location,
            attribution,
          ),
        );
      }
    }
    // SELECTION -> SELECTION. ⚠ SELECTION -> FILTER STAYS LEGAL: `highest this, then within last 6 months
    // this` and the reverse give different, both-meaningful answers. An earlier design forbade it by reading
    // a section HEADING ("a selection must be terminal") whose BODY retracted exactly that.
    //
    // ⚠ SKIP ONLY THE AFFECTED PAIR, never the whole pipeline. An earlier version returned globally as soon
    // as ANY stage was unmatched, which suppressed independently-checkable violations elsewhere:
    // `most recent "A", then most recent this, then wibble this` reported only the typo and stayed silent
    // about the two selections in stages 1–2. A pair is unjudgeable only when one of ITS OWN stages is
    // unresolved or unclassified — anything else is a verdict we can and should give.
    for (let i = 1; i < result.stages.length; i++) {
      const prev = result.stages[i - 1].call;
      const here = result.stages[i];
      if (prev === null || here.call === null) continue; // this pair is unjudgeable
      if (!isClassified(patternIn(prev.pattern)) || !isClassified(patternIn(here.call.pattern))) continue;
      if (isSelectionPattern(patternIn(prev.pattern)) && isSelectionPattern(patternIn(here.call.pattern))) {
        errors.push(
          this.err(
            "pipeline-selection-after-selection",
            concept.name,
            `Concept "${concept.name}": stage ${here.stage.index + 1} of the ${where} pipeline ` +
              `(\`${narrativeText(here.stage.elements)}\`) selects one record from a space the previous ` +
              `stage had already collapsed to one. Selecting from a single record is a no-op — keep the ` +
              `selection you meant and remove the other. (A FILTER after a selection is legal; two ` +
              `selections are not.)`,
            here.stage.location,
            attribution,
          ),
        );
      }
    }
  }
}
