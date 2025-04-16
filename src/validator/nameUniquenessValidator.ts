import { File } from '../ast/types';

import { ValidationError } from './validator';

export class NameUniquenessValidator {
  validate(ast: File): ValidationError[] {
    const errors: ValidationError[] = [];

    // Track names by type
    const decisionNames = new Set<string>();
    const conceptNames = new Set<string>();
    const activityNames = new Set<string>();
    const terminologyNames = new Set<string>();

    for (const statement of ast.statements) {
      switch (statement.type) {
        case 'Decision':
          if (!statement.name?.trim()) {
            errors.push({
              message: 'Decision name cannot be empty',
              location: statement.location,
              severity: 'error',
            });
          } else if (decisionNames.has(statement.name)) {
            errors.push({
              message: `Duplicate decision name: ${statement.name}`,
              location: statement.location,
              severity: 'error',
            });
          }
          decisionNames.add(statement.name);
          break;

        case 'Concept':
          if (!statement.name?.trim()) {
            errors.push({
              message: 'Concept name cannot be empty',
              location: statement.location,
              severity: 'error',
            });
          } else if (conceptNames.has(statement.name)) {
            errors.push({
              message: `Duplicate concept name: ${statement.name}`,
              location: statement.location,
              severity: 'error',
            });
          }
          conceptNames.add(statement.name);
          break;

        case 'Activity':
          if (!statement.name?.trim()) {
            errors.push({
              message: 'Activity name cannot be empty',
              location: statement.location,
              severity: 'error',
            });
          } else if (activityNames.has(statement.name)) {
            errors.push({
              message: `Duplicate activity name: ${statement.name}`,
              location: statement.location,
              severity: 'error',
            });
          }
          activityNames.add(statement.name);
          break;

        case 'Terminology':
          if (!statement.name?.trim()) {
            errors.push({
              message: 'Terminology name cannot be empty',
              location: statement.location,
              severity: 'error',
            });
          } else if (terminologyNames.has(statement.name)) {
            errors.push({
              message: `Duplicate terminology name: ${statement.name}`,
              location: statement.location,
              severity: 'error',
            });
          }
          terminologyNames.add(statement.name);
          break;
      }
    }

    return errors;
  }
}
