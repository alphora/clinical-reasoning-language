import type { CRL, Concept } from "../ast/types";
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
    if (sources) {
      for (const { stmt, scope } of sources) {
        if (stmt.type === "Concept") {
          this.checkConcept(stmt, { libraryName: scope.currentLibrary, filePath: scope.filePath }, out);
        }
      }
    } else {
      for (const stmt of ast.statements) {
        if (stmt.type === "Concept") this.checkConcept(stmt as Concept, {}, out);
      }
    }
    return out;
  }

  private checkConcept(
    concept: Concept,
    attribution: { libraryName?: string; filePath?: string },
    out: ValidationError[],
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
