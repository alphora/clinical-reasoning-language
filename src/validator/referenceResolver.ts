import {
  CRL,
  Concept,
  CompositionExpression,
  InferredFromComposition,
  Inference,
  Location,
  Statement,
} from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Verifies that every concept reference in a concept's `inferred from` body
 * (bare ref OR composition refs) resolves to a declared `concept` or `inference`.
 *
 * Per CRL v0.5: concept + inference share a namespace, so a bare `inferred from "Foo".`
 * resolves correctly if either declaration exists. Unresolved refs are errors.
 *
 * Coded-from refs (`coded from "X"`) resolve to terminologies — handled separately.
 */
export class ReferenceResolver {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build the inferable namespace (concept + inference).
    const inferableNames = new Set<string>();
    for (const statement of ast.statements) {
      if (statement.type === "Concept" || statement.type === "Inference") {
        if (statement.name) inferableNames.add(statement.name);
      }
    }

    // Walk every concept's inferred-from body for refs.
    // (Terminology refs in `coded from` are out of scope here — they often
    // live in separate terminology files and need a multi-file validator.)
    for (const statement of ast.statements) {
      if (statement.type !== "Concept") continue;
      const concept = statement as Concept;

      if (concept.definition.type === "CodedFromDefinition") {
        continue; // terminology ref — not our concern
      }

      // InferredFromDefinition: bare ref OR composition.
      const body = concept.definition.body;
      if (body.type === "InferredFromBareRef") {
        if (!inferableNames.has(body.ref)) {
          errors.push({
            message: `Unresolved reference "${body.ref}" in concept "${concept.name}" (no concept or inference declared with this name)`,
            location: body.location,
            severity: "error",
          });
        }
      } else if (body.type === "InferredFromComposition") {
        this.walkComposition(
          (body as InferredFromComposition).expression,
          concept.name,
          inferableNames,
          errors,
        );
      }
    }

    return errors;
  }

  private walkComposition(
    expr: CompositionExpression,
    parentName: string,
    inferableNames: Set<string>,
    errors: ValidationError[],
  ): void {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const term of expr.terms) {
          this.walkComposition(term, parentName, inferableNames, errors);
        }
        break;
      case "SemNotExpression":
        this.walkComposition(expr.expression, parentName, inferableNames, errors);
        break;
      case "CompositionGroup":
        this.walkComposition(expr.expression, parentName, inferableNames, errors);
        break;
      case "CompositionRef":
        if (!inferableNames.has(expr.ref)) {
          errors.push({
            message: `Unresolved reference "${expr.ref}" in concept "${parentName}" (no concept or inference declared with this name)`,
            location: expr.location,
            severity: "error",
          });
        }
        break;
    }
  }
}
