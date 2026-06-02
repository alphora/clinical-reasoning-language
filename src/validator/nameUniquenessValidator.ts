import { CRL } from "../ast/types";

import { ValidationError } from "./validator";

/**
 * Enforces name uniqueness across CRL declarations.
 *
 * Per CRL v0.7: `concept` is the sole "inferable" declaration kind. Concepts
 * with different body kinds (`coded from`, `defined as`, `definition is`) still
 * share the concept namespace because they're all referenced by quoted name.
 * Decisions, activities, and terminologies have their own namespaces
 * (referenced via distinct keywords).
 */
export class NameUniquenessValidator {
  validate(ast: CRL): ValidationError[] {
    const errors: ValidationError[] = [];

    const decisionNames = new Set<string>();
    const activityNames = new Set<string>();
    const terminologyNames = new Set<string>();
    const conceptNames = new Set<string>();

    for (const statement of ast.statements) {
      switch (statement.type) {
        case "Decision":
          if (!statement.name?.trim()) {
            errors.push({
              kind: "empty-name",
              message: "Decision name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (decisionNames.has(statement.name)) {
            errors.push({
              kind: "duplicate-name",
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
              kind: "empty-name",
              message: "Concept name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (conceptNames.has(statement.name)) {
            errors.push({
              kind: "duplicate-name",
              message: `Duplicate concept name: ${statement.name}`,
              location: statement.location,
              severity: "error",
            });
          }
          conceptNames.add(statement.name);
          break;

        case "Activity":
          if (!statement.name?.trim()) {
            errors.push({
              kind: "empty-name",
              message: "Activity name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (activityNames.has(statement.name)) {
            errors.push({
              kind: "duplicate-name",
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
              kind: "empty-name",
              message: "Terminology name cannot be empty",
              location: statement.location,
              severity: "error",
            });
          } else if (terminologyNames.has(statement.name)) {
            errors.push({
              kind: "duplicate-name",
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
