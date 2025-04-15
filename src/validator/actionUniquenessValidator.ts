import { File, DecisionBody, WhenBlock, BlockBody, ActionStatement } from '../ast/types';

import { ValidationError } from './validator';

export class ActionUniquenessValidator {
  validate(ast: File): ValidationError[] {
    const errors: ValidationError[] = [];

    // Process each decision statement
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.validateDecisionBody(statement.body, errors);
      }
    }

    return errors;
  }

  private validateDecisionBody(body: DecisionBody, errors: ValidationError[]): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        this.validateWhenBlock(statement, errors);
      }
    }
  }

  private validateWhenBlock(whenBlock: WhenBlock, errors: ValidationError[]): void {
    if (whenBlock.body.type === 'BlockBody') {
      this.validateBlockBody(whenBlock.body, errors);
    } else if (whenBlock.body.type === 'SingleAction') {
      // Single actions are unique by definition
      return;
    }
  }

  private validateBlockBody(blockBody: BlockBody, errors: ValidationError[]): void {
    const doStatements = new Set<string>();
    const useStatements = new Set<string>();

    for (const statement of blockBody.statements) {
      if (statement.type === 'WhenBlock') {
        this.validateWhenBlock(statement, errors);
      } else if (statement.type === 'ActionStatement') {
        this.validateActionStatement(statement, doStatements, useStatements, errors);
      }
    }
  }

  private validateActionStatement(
    statement: ActionStatement,
    doStatements: Set<string>,
    useStatements: Set<string>,
    errors: ValidationError[],
  ): void {
    const action = statement.action;
    if (action.type === 'DoActivity') {
      if (doStatements.has(action.activityName)) {
        errors.push({
          message: `Duplicate do statement: ${action.activityName}`,
          location: action.location,
          severity: 'error',
        });
      }
      doStatements.add(action.activityName);
    } else if (action.type === 'UseDecision') {
      if (useStatements.has(action.decisionName)) {
        errors.push({
          message: `Duplicate use statement: ${action.decisionName}`,
          location: action.location,
          severity: 'error',
        });
      }
      useStatements.add(action.decisionName);
    }
  }
}
