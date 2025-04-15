import { File, Activity, Concept } from '../ast/types';
import { ACTION_FHIR_TYPES, CASEFEATURE_FHIR_TYPES, FHIR_VALUE_TYPES } from '../grammar/fhirTypes';

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
          this.validateConcept(statement, errors);
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
          this.validateActivity(statement, errors);
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

  private validateActivity(activity: Activity, errors: ValidationError[]): void {
    if (!activity.activityType?.trim()) {
      errors.push({
        message: 'Activity type cannot be empty',
        location: activity.location,
        severity: 'error',
      });
    } else if (!ACTION_FHIR_TYPES.has(activity.activityType)) {
      errors.push({
        message: `Invalid FHIR type for activity: ${activity.activityType}`,
        location: activity.location,
        severity: 'error',
      });
    }
  }

  private validateConcept(concept: Concept, errors: ValidationError[]): void {
    if (!concept.conceptType?.trim()) {
      errors.push({
        message: 'Concept type cannot be empty',
        location: concept.location,
        severity: 'error',
      });
    } else if (!CASEFEATURE_FHIR_TYPES.has(concept.conceptType)) {
      errors.push({
        message: `Invalid FHIR type for concept: ${concept.conceptType}`,
        location: concept.location,
        severity: 'error',
      });
    }

    if (!concept.valueType?.trim()) {
      errors.push({
        message: 'Value type cannot be empty',
        location: concept.location,
        severity: 'error',
      });
    } else if (!FHIR_VALUE_TYPES.has(concept.valueType)) {
      errors.push({
        message: `Invalid FHIR value type for concept: ${concept.valueType}`,
        location: concept.location,
        severity: 'error',
      });
    }
  }
}
