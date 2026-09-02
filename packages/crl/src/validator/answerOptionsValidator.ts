import type { CRL, Concept } from "../ast/types";
import { findPatternCalls } from "../template-match/referenceRoles";
import type { SourceContext } from "../imports/scopes";

import type { AnswerOptionsFinding, ValidationError } from "./validator";

// ⭐⭐ #189 gap 2 — `value from` NAMES A CODED QUESTION'S ANSWER OPTIONS, and this file polices the two ways
// that can be meaningless.
//
// MEASURED end-to-end before any of this was written: with no `value[x].binding` the generated questionnaire
// item carries NO options at all; with one it carries an inline `answerOption` coding per member, expanded
// from the emitted ValueSet. So the binding IS the dropdown, and a coded question without one is a question
// a user cannot answer.
//
// ⚠⚠ `value from` IS "OFFERED", NOT "ADMISSIBLE", and every rule here must stay inside that reading. An
// `ElementDefinition.binding` constrains FHIR conformance and NEVER evaluation — an out-of-set value still
// reaches CQL — so nothing in this file may be phrased as though CRL enforced the range. A genuine
// admissibility constraint would have to gate every value-producing leg (local assertions, CEL authoring,
// `$extract`, source candidates, producers, the CRE) and is filed as its own slice.
//
// ⚠ WHAT THIS FILE DELIBERATELY CANNOT CHECK: whether the concept's resource actually HAS a distinct
// `value[x]` answer slot. A `type is Condition` concept carries its identity ON its coding element and has no
// separate value carrier, so a binding would have nothing to land on. That is REGISTRY knowledge living in
// `emit/`, and no validator imports from there (a layering boundary this slice is not entitled to breach), so
// the emitter diagnoses that cell at the point it would otherwise silently emit nothing.

/**
 * ⭐ RULED (operator, 2026-09-01), on the absence posture: *"b)"* — a coded question with no answer set WARNS
 * now and ERRORS at the flip, following the `no-bare-scalar-code` precedent.
 *
 * RETIRE:189-validation-flip — `answer-options-missing` becomes an ERROR at the flip. Delete this note and
 * flip the severity when the 9 in-tree concepts have migrated; grep this marker to find what is owed.
 *
 * ⚠ WHY A WARNING AND NOT AN ERROR TODAY: the migration is real but small — MEASURED at 9 concepts of 634
 * carrying `value type is CodeableConcept` + `code is`, 5 of them with no representation at all. Erroring
 * before those 9 are migrated would reject content that is correct under the language as shipped.
 */
export class AnswerOptionsValidator {
  public validate(ast: CRL, sources?: SourceContext[]): ValidationError[] {
    const out: ValidationError[] = [];
    const concepts: Concept[] = sources
      ? sources.flatMap(({ stmt }) => (stmt.type === "Concept" ? [stmt] : []))
      : ast.statements.flatMap((stmt) => (stmt.type === "Concept" ? [stmt as Concept] : []));

    // ⭐⭐ WHICH CONCEPTS ARE THE SUBJECT OF AN `in qualifying` PREDICATE — computed ONCE, because the
    // marker requirement is a property of USE, not of the declaration (operator ruling, 2026-09-02).
    //
    // ⚠ THE WALK IS RECURSIVE, VIA `findPatternCalls`, AND THAT IS NOT OPTIONAL. `matchNarrative` FOLDS a
    // pipeline into a `NestedPatternArg`, so a reader that only inspects top-level args misses a membership
    // buried in a stage. That exact bug appeared in THREE separate readers earlier in #189, which is why the
    // shared authority exists. Do not hand-roll this walk.
    const predicatedOn = new Set<string>();
    for (const c of concepts) {
      if (c.definition?.type !== "DefinitionIsDefinition") continue;
      for (const call of findPatternCalls(c.definition.body, "Membership")) {
        if (!call.args.some((a) => a.type === "SubsetRefArg")) continue;
        const subj = call.args.find((a) => a.type === "ConceptRefArg");
        if (subj && "value" in subj) predicatedOn.add(String(subj.value));
      }
    }

    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(
            stmt,
            { libraryName: scope.currentLibrary, filePath: scope.filePath },
            out,
            predicatedOn,
          );
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt as Concept, {}, out, predicatedOn);
      }
    }
    return out;
  }

  private checkConcept(
    concept: Concept,
    attribution: { libraryName?: string; filePath?: string },
    out: ValidationError[],
    /** Concepts that ARE the subject of an `in qualifying` predicate — see `validate`. */
    predicatedOn: ReadonlySet<string>,
  ): void {
    // ⚠ EXACTLY ONE value type, and it must be the coded one. `includes(...)` was too loose: a multi-typed
    // concept has no single answer carrier (`answerCarrier` requires one), so the absence warning would tell
    // an author to add a line the emitter then REFUSES for want of a slot — warn-to-add, error-on-add, a loop
    // an AI author walks (Claude arm, code review r13).
    const isCoded = concept.valueTypes.length === 1 && concept.valueTypes[0] === "CodeableConcept";
    // Charter §3: *"A question IS an answerable. One property: a local `code is`."* Without one there is no
    // answer slot to offer options for — the concept is read-only and gets no case-feature SD at all.
    const isAnswerable = concept.code !== undefined && concept.code !== "";

    const attrib = {
      ...(attribution.libraryName ? { libraryName: attribution.libraryName } : {}),
      ...(attribution.filePath ? { filePath: attribution.filePath } : {}),
    };

    if (concept.valueFrom !== undefined) {
      if (!isAnswerable) {
        out.push({
          kind: "answer-options-unanswerable",
          conceptName: concept.name,
          message:
            `Concept "${concept.name}" declares \`value from\` but has no local \`code is\`, so it is not ` +
            `answerable and no question is ever asked of it. Answer options describe what a USER may pick; ` +
            `a read-only concept has no answer slot to offer them for. Add \`code is\`, or drop the line.`,
          location: concept.valueFrom.location,
          severity: "error",
          ...attrib,
        } as AnswerOptionsFinding);
        return;
      }
      if (!isCoded) {
        const declared = concept.valueTypes.length > 0 ? concept.valueTypes.join(", ") : "none";
        out.push({
          kind: "answer-options-not-coded",
          conceptName: concept.name,
          message:
            `Concept "${concept.name}" declares \`value from\` but its value type is \`${declared}\`, not ` +
            `\`CodeableConcept\`. Answer options are a set of CODES; there is nothing for them to bind to on ` +
            `a non-coded value. Declare \`value type is CodeableConcept\`, or drop the line.`,
          location: concept.valueFrom.location,
          severity: "error",
          ...attrib,
        } as AnswerOptionsFinding);
      }
      // ⭐⭐ #189 — INLINE OPTIONS. Everything below applies ONLY to the inline form; a terminology
      // reference has its own declaration with its own rules.
      if (concept.valueFrom.kind === "inline") {
        const options = concept.valueFrom.options;

        // A display is what a CLINICIAN READS in the generated questionnaire. The grammar cannot require it
        // (an option line is shared with the marker-less form), and it must NEVER be derived by title-casing
        // the code — that manufactures clinician-facing text the author never wrote.
        for (const o of options) {
          if (o.display.trim() !== "") continue;
          out.push({
            kind: "answer-options-missing-display",
            conceptName: concept.name,
            message:
              `Option \`${o.code}\` on concept "${concept.name}" has an empty \`display\`. The display is the ` +
              `text a clinician reads when picking this answer; it cannot be derived from the code without ` +
              `inventing wording the author never wrote. Give it one.`,
            location: o.location,
            severity: "error",
            ...attrib,
          } as AnswerOptionsFinding);
        }

        // Two options with one code are two rows of the SAME answer: whichever the emitter wrote last would
        // silently define the other's display and marker.
        const seen = new Map<string, number>();
        for (const o of options) seen.set(o.code, (seen.get(o.code) ?? 0) + 1);
        for (const [code, n] of seen) {
          if (n < 2) continue;
          out.push({
            kind: "answer-options-duplicate-code",
            conceptName: concept.name,
            message:
              `Concept "${concept.name}" declares option \`${code}\` ${n} times. One code is one answer; ` +
              `duplicates would collapse into a single option whose display and marker depend on line order.`,
            location: concept.valueFrom.location,
            severity: "error",
            ...attrib,
          } as AnswerOptionsFinding);
        }

        // ⭐⭐ THE MARKER IS REQUIRED IFF THE CONCEPT IS PREDICATED ON (operator ruling, 2026-09-02).
        // `predicatedOn` is computed once in `validate` — see the recursion note there.
        if (predicatedOn.has(concept.name)) {
          // A silent default would let a KE add an option, have a patient answer it honestly, and get a
          // determinate `false -> deny` — the UNRECOVERABLE class, since a pause is recoverable but a
          // spurious `false` looks like a decision. Adding an option must not compile until it is classified.
          for (const o of options) {
            if (o.qualifying !== undefined) continue;
            out.push({
              kind: "answer-options-missing-marker",
              conceptName: concept.name,
              message:
                `Option \`${o.code}\` on concept "${concept.name}" has no \`qualifying\` / \`not qualifying\` ` +
                `marker, and this concept IS the subject of an \`in qualifying\` predicate — so every option ` +
                `must say what it does. An unmarked option would silently count as NOT qualifying, turning an ` +
                `honest answer into a determinate denial. Mark it.`,
              location: o.location,
              severity: "error",
              ...attrib,
            } as AnswerOptionsFinding);
          }

          const marked = options.filter((o) => o.qualifying !== undefined);
          if (marked.length > 0 && marked.every((o) => o.qualifying === false)) {
            out.push({
              kind: "answer-options-none-qualifying",
              conceptName: concept.name,
              message:
                `No option on concept "${concept.name}" is \`qualifying\`, so \`in qualifying\` can never be ` +
                `true and the qualifying value set is empty. Either the markers are inverted or the predicate ` +
                `is dead.`,
              location: concept.valueFrom.location,
              severity: "error",
              ...attrib,
            } as AnswerOptionsFinding);
          } else if (marked.length > 1 && marked.every((o) => o.qualifying === true)) {
            out.push({
              kind: "answer-options-all-qualifying",
              conceptName: concept.name,
              message:
                `Every option on concept "${concept.name}" is \`qualifying\`, so \`in qualifying\` is false ` +
                `only for a code that was never offered. If a user should be able to answer in a way that ` +
                `does NOT qualify — a "none of the listed" option — the set is missing it.`,
              location: concept.valueFrom.location,
              severity: "warning",
              ...attrib,
            } as AnswerOptionsFinding);
          }
        }
      }

      return;
    }

    // ⭐ THE ABSENCE POSTURE. A coded, answerable question with no `value from` emits a `choice` item with no
    // options — the defect this slice exists to close, and it is invisible unless you run `$populate`.
    if (isCoded && isAnswerable) {
      out.push({
        kind: "answer-options-missing",
        conceptName: concept.name,
        message:
          `Concept "${concept.name}" is a coded question (\`value type is CodeableConcept\` + \`code is\`) ` +
          `with no \`value from\`, so the generated questionnaire offers NO options and the user cannot ` +
          `answer it. If this concept's value is a stored code a user picks, add ` +
          `\`value from "<terminology>"\` naming the codes to offer. (If its truth is instead the RECORD'S ` +
          `PRESENCE, it has no answer slot and wants no options — the emitter will say so.) ` +
          `⚠ NOT the same set as a \`coded from\` on a representation unless you mean it: that scopes which ` +
          `external records represent this concept, and authoring them alike filters non-members out of the ` +
          `retrieve, collapsing a determinate answer into "unknown".`,
        location: concept.location,
        severity: "warning",
        ...attrib,
      } as AnswerOptionsFinding);
    }
  }
}
