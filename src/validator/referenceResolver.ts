import type {
  CRL,
  Concept,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  Terminology,
} from "../ast/types";
import { getRefName } from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Verifies that references in concept bodies resolve correctly per their
 * declared kind:
 *
 *   - `coded from "X"` body: "X" must reference a declared `terminology "X":`
 *     (either valueset-defined OR system+code-defined — both are valid).
 *     The point is the ref kind: it has to be a terminology, not a concept
 *     or decision or anything else.
 *   - `defined as` body: refs must resolve to declared concepts.
 *   - `definition is` body narrative: NConceptRef elements + refs inside
 *     in-arg disjunctions/conjunctions must resolve to declared concepts.
 *
 * Magic runtime refs like "Measurement Period" aren't in the local namespace
 * today; they'll resolve once `imports` + `parameter` declarations land
 * (see issues/crl/todo/imports/ and issues/crl/todo/parameters/).
 */
export class ReferenceResolver {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    const conceptNames = new Set<string>();
    const terminologyNames = new Set<string>();

    for (const statement of ast.statements) {
      if (statement.type === "Concept" && statement.name) {
        conceptNames.add(statement.name);
      } else if (statement.type === "Terminology" && statement.name) {
        terminologyNames.add(statement.name);
      }
    }

    for (const statement of ast.statements) {
      if (statement.type !== "Concept") continue;
      const concept = statement as Concept;

      switch (concept.definition.type) {
        case "CodedFromDefinition": {
          const termRef = concept.definition.terminologyName;
          const termName = getRefName(termRef);
          if (!termName) break;
          if (!terminologyNames.has(termName)) {
            errors.push({
              message: `Undeclared terminology "${termName}" in concept "${concept.name}" (no terminology block declares this name)`,
              location: concept.definition.location,
              severity: "error",
            });
          }
          continue;
        }

        case "DefinedAsDefinition": {
          const body = concept.definition.body;
          if (body.type === "DefinedAsBareRef") {
            const refName = getRefName(body.ref);
            if (!conceptNames.has(refName)) {
              errors.push({
                message: `Unresolved reference "${refName}" in concept "${concept.name}" (no concept declared with this name)`,
                location: body.location,
                severity: "error",
              });
            }
          } else if (body.type === "DefinedAsComposition") {
            this.walkComposition(
              (body as DefinedAsComposition).expression,
              concept.name,
              conceptNames,
              errors,
            );
          }
          break;
        }

        case "DefinitionIsDefinition":
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
      case "CompositionRef": {
        const refName = getRefName(expr.ref);
        if (!conceptNames.has(refName)) {
          errors.push({
            message: `Unresolved reference "${refName}" in concept "${parentName}" (no concept declared with this name)`,
            location: expr.location,
            severity: "error",
          });
        }
        break;
      }
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
      case "NConceptRef": {
        const refName = getRefName(el.value);
        if (!conceptNames.has(refName)) {
          errors.push({
            message: `Unresolved reference "${refName}" in concept "${parentName}" (no concept declared with this name)`,
            location: el.location,
            severity: "error",
          });
        }
        break;
      }
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
      case "NConceptRef": {
        const refName = getRefName(av.value);
        if (!conceptNames.has(refName)) {
          errors.push({
            message: `Unresolved reference "${refName}" in concept "${parentName}" (no concept declared with this name)`,
            location: av.location,
            severity: "error",
          });
        }
        break;
      }
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
