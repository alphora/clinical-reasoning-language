import { CRL } from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Enforces name uniqueness across CRL declarations.
 *
 * Per CRL v0.5: `concept` and `inference` share a single namespace because
 * both are referenced by quoted name from `inferred from` bodies and from
 * the composition layer. A duplicate name across these kinds would make
 * `inferred from "Foo"` ambiguous. Decisions, activities, and terminologies
 * still have their own namespaces (referenced via distinct keywords).
 */
export class NameUniquenessValidator {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    const decisionNames = new Set<string>();
    const activityNames = new Set<string>();
    const terminologyNames = new Set<string>();
    // Shared namespace: concept + inference. The map tracks which kind
    // declared the name first so the diagnostic can mention both kinds.
    const inferableNames = new Map<string, "Concept" | "Inference">();

    for (const statement of ast.statements) {
      switch (statement.type) {
        case "Decision":
          if (!statement.name?.trim()) {
            errors.push({
              message: "Decision name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (decisionNames.has(statement.name)) {
            errors.push({
              message: `Duplicate decision name: ${statement.name}`,
              location: statement.location,
              severity: "error",
            });
          }
          decisionNames.add(statement.name);
          break;

        case "Concept":
          if (!statement.name?.trim()) {
            errors.push({
              message: "Concept name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (inferableNames.has(statement.name)) {
            const priorKind = inferableNames.get(statement.name);
            errors.push({
              message:
                priorKind === "Concept"
                  ? `Duplicate concept name: ${statement.name}`
                  : `Name collision: concept "${statement.name}" conflicts with prior inference of the same name (concept and inference share a namespace)`,
              location: statement.location,
              severity: "error",
            });
          }
          inferableNames.set(statement.name, "Concept");
          break;

        case "Inference":
          if (!statement.name?.trim()) {
            errors.push({
              message: "Inference name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (inferableNames.has(statement.name)) {
            const priorKind = inferableNames.get(statement.name);
            errors.push({
              message:
                priorKind === "Inference"
                  ? `Duplicate inference name: ${statement.name}`
                  : `Name collision: inference "${statement.name}" conflicts with prior concept of the same name (concept and inference share a namespace)`,
              location: statement.location,
              severity: "error",
            });
          }
          inferableNames.set(statement.name, "Inference");
          break;

        case "Activity":
          if (!statement.name?.trim()) {
            errors.push({
              message: "Activity name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (activityNames.has(statement.name)) {
            errors.push({
              message: `Duplicate activity name: ${statement.name}`,
              location: statement.location,
              severity: "error",
            });
          }
          activityNames.add(statement.name);
          break;

        case "Terminology":
          if (!statement.name?.trim()) {
            errors.push({
              message: "Terminology name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (terminologyNames.has(statement.name)) {
            errors.push({
              message: `Duplicate terminology name: ${statement.name}`,
              location: statement.location,
              severity: "error",
            });
          }
          terminologyNames.add(statement.name);
          break;
      }
    }

    return errors;
  }
}
