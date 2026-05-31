import type {
  CRL,
  Concept,
  CompositionExpression,
  InferredFromComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
} from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Verifies that concept references in concept bodies resolve to declared
 * concepts.
 *
 * Per CRL v0.6 typed reference resolution:
 *   - In a `coded from` body: refs are valueset names (handled by a separate
 *     validator/multi-file resolver — not enforced here).
 *   - In an `inferred from` body: refs are concept names (must resolve).
 *   - In a `logic is` body: refs in the narrative (NConceptRef elements + refs
 *     inside in-arg disjunctions/conjunctions) are concept names (must resolve).
 *
 * Magic runtime refs like "Measurement Period" aren't in the local namespace
 * today; they'll resolve once `imports` + `parameter` declarations land
 * (see issues/crl/todo/imports/ and issues/crl/todo/parameters/). For now,
 * narrative refs that look like runtime parameters will be flagged as
 * unresolved — accept this until imports land.
 */
export class ReferenceResolver {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    const conceptNames = new Set<string>();
    for (const statement of ast.statements) {
      if (statement.type === "Concept" && statement.name) {
        conceptNames.add(statement.name);
      }
    }

    for (const statement of ast.statements) {
      if (statement.type !== "Concept") continue;
      const concept = statement as Concept;

      switch (concept.definition.type) {
        case "CodedFromDefinition":
          // valueset refs — out of scope here
          continue;

        case "InferredFromDefinition": {
          const body = concept.definition.body;
          if (body.type === "InferredFromBareRef") {
            if (!conceptNames.has(body.ref)) {
              errors.push({
                message: `Unresolved reference "${body.ref}" in concept "${concept.name}" (no concept declared with this name)`,
                location: body.location,
                severity: "error",
              });
            }
          } else if (body.type === "InferredFromComposition") {
            this.walkComposition(
              (body as InferredFromComposition).expression,
              concept.name,
              conceptNames,
              errors,
            );
          }
          break;
        }

        case "LogicIsDefinition":
          this.walkNarrative(
            concept.definition.body,
            concept.name,
            conceptNames,
            errors,
          );
          break;
      }
    }

    return errors;
  }

  private walkComposition(
    expr: CompositionExpression,
    parentName: string,
    conceptNames: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.walkComposition(term, parentName, conceptNames, errors);
        }
        break;
      case "SemNotExpression":
        this.walkComposition(expr.expression, parentName, conceptNames, errors);
        break;
      case "CompositionGroup":
        this.walkComposition(expr.expression, parentName, conceptNames, errors);
        break;
      case "CompositionRef":
        if (!conceptNames.has(expr.ref)) {
          errors.push({
            message: `Unresolved reference "${expr.ref}" in concept "${parentName}" (no concept declared with this name)`,
            location: expr.location,
            severity: "error",
          });
        }
        break;
    }
  }

  private walkNarrative(
    clause: NarrativeClause,
    parentName: string,
    conceptNames: Set<string>,
    errors: ValidationError[],
  ): void {
    for (const el of clause.elements) {
      this.walkNarrativeElement(el, parentName, conceptNames, errors);
    }
  }

  private walkNarrativeElement(
    el: NarrativeElement,
    parentName: string,
    conceptNames: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (el.type) {
      case "NConceptRef":
        if (!conceptNames.has(el.value)) {
          errors.push({
            message: `Unresolved reference "${el.value}" in concept "${parentName}" (no concept declared with this name)`,
            location: el.location,
            severity: "error",
          });
        }
        break;
      case "NDisjunction":
        for (const av of el.disjuncts) {
          this.walkArgValue(av, parentName, conceptNames, errors);
        }
        break;
      case "NConjunction":
        for (const av of el.conjuncts) {
          this.walkArgValue(av, parentName, conceptNames, errors);
        }
        break;
      // NWord, Quantity — not references
    }
  }

  private walkArgValue(
    av: ArgValue,
    parentName: string,
    conceptNames: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (av.type) {
      case "NConceptRef":
        if (!conceptNames.has(av.value)) {
          errors.push({
            message: `Unresolved reference "${av.value}" in concept "${parentName}" (no concept declared with this name)`,
            location: av.location,
            severity: "error",
          });
        }
        break;
      case "NDisjunction":
        for (const inner of av.disjuncts) {
          this.walkArgValue(inner, parentName, conceptNames, errors);
        }
        break;
      case "NConjunction":
        for (const inner of av.conjuncts) {
          this.walkArgValue(inner, parentName, conceptNames, errors);
        }
        break;
      // Quantity — not a reference
    }
  }
}
