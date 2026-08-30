import type { CRL, Concept, Location } from "../ast/types";
import type { SourceContext } from "../imports/scopes";
import { matchNarrativeStages, narrativeText } from "../template-match/matcher";
import { PATTERN_RETURN_SHAPE } from "../cql-emitter/patternReturnShape";

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

/** The patterns that COLLAPSE a space to one member. Context-free: a selection is a selection wherever it
 *  sits. Derived from the shared fact table, never re-listed — a second list would drift. */
function isSelection(pattern: string): boolean {
  return PATTERN_RETURN_SHAPE[pattern] === "instance";
}

/** Whether the shared fact table knows this pattern at all. ⚠ FAIL CLOSED: an unknown pattern is a catalog
 *  gap, reported as such, never silently treated as "not a selection". */
function isClassified(pattern: string): boolean {
  return Object.prototype.hasOwnProperty.call(PATTERN_RETURN_SHAPE, pattern);
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
      this.checkNarrative(concept, concept.definition.body, "`definition is`", attribution, errors);
    }
    for (const rep of concept.representations ?? []) {
      if (rep.valueProjection) {
        this.checkNarrative(concept, rep.valueProjection.body, "`value projection is`", attribution, errors);
      }
    }
  }

  private checkNarrative(
    concept: Concept,
    body: Parameters<typeof matchNarrativeStages>[0],
    where: string,
    attribution: Attribution,
    errors: ValidationError[],
  ): void {
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
    // round-trips. And do not run the adjacency check across an unresolved stage — its kind is unknown, so
    // any verdict about the pair would be invented.
    let sawUnmatched = false;
    for (const { stage, call } of result.stages) {
      if (call === null) {
        sawUnmatched = true;
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
      if (!isClassified(call.pattern)) {
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
    if (sawUnmatched) return;

    // SELECTION -> SELECTION. ⚠ SELECTION -> FILTER STAYS LEGAL: `highest this, then within last 6 months
    // this` and the reverse give different, both-meaningful answers. An earlier design forbade it by reading
    // a section HEADING ("a selection must be terminal") whose BODY retracted exactly that.
    for (let i = 1; i < result.stages.length; i++) {
      const prev = result.stages[i - 1].call!;
      const here = result.stages[i];
      if (isSelection(prev.pattern) && isSelection(here.call!.pattern)) {
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
