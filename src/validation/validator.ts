import type { Decision, File, Statement, WhenClause } from '../ast/types';
import { ACTION_FHIR_TYPES, CASEFEATURE_FHIR_TYPES, FHIR_VALUE_TYPES } from '../grammar/fhirTypes';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly location: {
      line: number;
      column: number;
    },
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ASTValidator {
  private readonly decisionNames: Set<string> = new Set();
  private readonly decisionGraph: Map<string, Set<string>> = new Map();
  private readonly maxDecisionDepth = 10; // Maximum allowed depth for decision nesting
  private readonly actionDependencies: Map<string, Set<string>> = new Map();
  private readonly visitedDecisions: Set<string> = new Set();
  private readonly decisionCache: Map<string, Decision> = new Map();

  validate(ast: File): void {
    // Reset state
    this.decisionNames.clear();
    this.decisionGraph.clear();
    this.actionDependencies.clear();
    this.visitedDecisions.clear();
    this.decisionCache.clear();

    // First pass: collect all decision names and build dependency graph
    this.collectDecisionInfo(ast);

    // Validate each statement
    for (const statement of ast.statements) {
      this.validateStatement(statement);
    }

    // Validate decision references and check for cycles
    this.validateDecisionReferences(ast);
    this.detectCycles(ast);

    // Validate action dependencies
    this.validateActionDependencies(ast);
  }

  private collectDecisionInfo(ast: File): void {
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.decisionNames.add(statement.name);
        this.decisionCache.set(statement.name, statement);

        const dependencies = new Set<string>();
        for (const useClause of statement.useClauses) {
          dependencies.add(useClause.decisionName);
        }
        this.decisionGraph.set(statement.name, dependencies);
      }
    }
  }

  private validateStatement(statement: Statement): void {
    switch (statement.type) {
      case 'Decision':
        this.validateDecision(statement);
        break;
      case 'Action':
        this.validateAction(statement);
        break;
      case 'CaseFeature':
        this.validateCaseFeature(statement);
        break;
    }
  }

  private validateDecision(decision: Decision): void {
    // Check decision name format
    if (!this.isValidName(decision.name)) {
      throw new ValidationError(
        `Invalid decision name: "${decision.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
        decision.location.start,
      );
    }

    // Check for duplicate decision names
    const duplicateCount = [...this.decisionGraph.keys()].filter(
      name => name === decision.name,
    ).length;
    if (duplicateCount > 1) {
      throw new ValidationError(
        `Duplicate decision name: "${decision.name}"`,
        decision.location.start,
      );
    }

    // Check that decision has at least one when clause
    if (decision.whenClauses.length === 0) {
      throw new ValidationError(
        `Decision "${decision.name}" must have at least one when clause`,
        decision.location.start,
      );
    }

    // Check for mutually exclusive conditions
    this.validateConditions(decision);

    // Validate each when clause
    for (const whenClause of decision.whenClauses) {
      this.validateWhenClause(whenClause);
    }

    // Check for duplicate actions within the same decision
    this.validateUniqueActions(decision);
  }

  private validateConditions(decision: Decision): void {
    const conditions = new Set<string>();
    for (const whenClause of decision.whenClauses) {
      const normalizedCondition = whenClause.condition.toLowerCase().trim();
      if (conditions.has(normalizedCondition)) {
        throw new ValidationError(
          `Duplicate condition in decision "${decision.name}": "${whenClause.condition}"`,
          whenClause.location.start,
        );
      }
      conditions.add(normalizedCondition);

      // Check for mutually exclusive conditions
      if (
        conditions.has(`not ${normalizedCondition}`) ||
        (normalizedCondition.startsWith('not ') && conditions.has(normalizedCondition.substring(4)))
      ) {
        throw new ValidationError(
          `Mutually exclusive conditions found in decision "${decision.name}": "${whenClause.condition}"`,
          whenClause.location.start,
        );
      }
    }
  }

  private validateUniqueActions(decision: Decision): void {
    const actions = new Set<string>();
    for (const whenClause of decision.whenClauses) {
      for (const action of whenClause.actions) {
        const normalizedAction = action.action.toLowerCase().trim();
        if (actions.has(normalizedAction)) {
          throw new ValidationError(
            `Duplicate action in decision "${decision.name}": "${action.action}"`,
            action.location.start,
          );
        }
        actions.add(normalizedAction);
      }
    }
  }

  private validateWhenClause(whenClause: WhenClause): void {
    // Check that condition is not empty
    if (!whenClause.condition.trim()) {
      throw new ValidationError('When clause condition cannot be empty', whenClause.location.start);
    }

    // Check condition format
    if (!this.isValidCondition(whenClause.condition)) {
      throw new ValidationError(
        `Invalid condition format: "${whenClause.condition}". Conditions must be in a valid format.`,
        whenClause.location.start,
      );
    }

    // Check that when clause has at least one action
    if (whenClause.actions.length === 0) {
      throw new ValidationError(
        'When clause must have at least one action',
        whenClause.location.start,
      );
    }

    // Validate each action
    for (const action of whenClause.actions) {
      if (!action.action.trim()) {
        throw new ValidationError('Action cannot be empty', action.location.start);
      }
    }
  }

  private detectCycles(ast: File): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCyclesDFS = (decisionName: string, depth = 0): void => {
      // Check for maximum depth
      if (depth > this.maxDecisionDepth) {
        throw new ValidationError(
          `Decision tree exceeds maximum depth of ${this.maxDecisionDepth}`,
          this.findDecisionLocation(ast, decisionName),
        );
      }

      // Check for cycles
      if (recursionStack.has(decisionName)) {
        throw new ValidationError(
          `Cyclic reference detected involving decision "${decisionName}"`,
          this.findDecisionLocation(ast, decisionName),
        );
      }

      if (visited.has(decisionName)) {
        return;
      }

      visited.add(decisionName);
      recursionStack.add(decisionName);

      const dependencies = this.decisionGraph.get(decisionName) || new Set();
      for (const dep of dependencies) {
        detectCyclesDFS(dep, depth + 1);
      }

      recursionStack.delete(decisionName);
    };

    // Start DFS from each decision that hasn't been visited
    for (const decisionName of this.decisionNames) {
      if (!visited.has(decisionName)) {
        detectCyclesDFS(decisionName);
      }
    }
  }

  private findDecisionLocation(ast: File, decisionName: string): { line: number; column: number } {
    for (const statement of ast.statements) {
      if (statement.type === 'Decision' && statement.name === decisionName) {
        return statement.location.start;
      }
    }
    return { line: 0, column: 0 }; // Fallback
  }

  private isValidCondition(condition: string): boolean {
    // Add condition format validation rules
    // For now, just check it's not too long and doesn't contain invalid characters
    const maxConditionLength = 100;
    const invalidChars = /[<>{}[\]\\]/;
    return condition.length <= maxConditionLength && !invalidChars.test(condition);
  }

  private validateAction(action: Statement & { type: 'Action' }): void {
    if (!this.isValidName(action.name)) {
      throw new ValidationError(
        `Invalid action name: "${action.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
        action.location.start,
      );
    }

    if (action.fhirType && !ACTION_FHIR_TYPES.has(action.fhirType)) {
      throw new ValidationError(
        `Invalid FHIR type for action: "${action.fhirType}". Valid FHIR types for actions are: ${Array.from(ACTION_FHIR_TYPES).join(', ')}`,
        action.location.start,
      );
    }
  }

  private validateCaseFeature(caseFeature: Statement & { type: 'CaseFeature' }): void {
    if (!this.isValidName(caseFeature.name)) {
      throw new ValidationError(
        `Invalid case feature name: "${caseFeature.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
        caseFeature.location.start,
      );
    }

    if (caseFeature.fhirType && !CASEFEATURE_FHIR_TYPES.has(caseFeature.fhirType)) {
      throw new ValidationError(
        `Invalid FHIR type for case feature: "${caseFeature.fhirType}". Valid FHIR types for case features are: ${Array.from(CASEFEATURE_FHIR_TYPES).join(', ')}`,
        caseFeature.location.start,
      );
    }

    if (caseFeature.valueType && !FHIR_VALUE_TYPES.has(caseFeature.valueType)) {
      throw new ValidationError(
        `Invalid FHIR value type for case feature: "${caseFeature.valueType}". Valid FHIR value types are: ${Array.from(FHIR_VALUE_TYPES).join(', ')}`,
        caseFeature.location.start,
      );
    }
  }

  private validateDecisionReferences(ast: File): void {
    // Check that all referenced decisions exist
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        for (const useClause of statement.useClauses) {
          if (!this.decisionNames.has(useClause.decisionName)) {
            throw new ValidationError(
              `Referenced decision "${useClause.decisionName}" does not exist`,
              useClause.location.start,
            );
          }
        }
      }
    }
  }

  private isValidName(name: string): boolean {
    return /^[a-zA-Z]\w*$/.test(name);
  }

  private isValidFHIRType(type: string, isAction: boolean): boolean {
    return isAction ? ACTION_FHIR_TYPES.has(type) : CASEFEATURE_FHIR_TYPES.has(type);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private validateActionDependencies(ast: File): void {
    // Build action dependency graph
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.buildActionDependencies(statement);
      }
    }

    // Check for circular dependencies in actions
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectActionCycles = (actionName: string): void => {
      if (recursionStack.has(actionName)) {
        throw new ValidationError(
          `Circular dependency detected in actions involving "${actionName}"`,
          this.findActionLocation(ast, actionName),
        );
      }

      if (visited.has(actionName)) {
        return;
      }

      visited.add(actionName);
      recursionStack.add(actionName);

      const dependencies = this.actionDependencies.get(actionName) || new Set();
      for (const dep of dependencies) {
        detectActionCycles(dep);
      }

      recursionStack.delete(actionName);
    };

    for (const actionName of this.actionDependencies.keys()) {
      if (!visited.has(actionName)) {
        detectActionCycles(actionName);
      }
    }
  }

  private buildActionDependencies(decision: Decision): void {
    for (const whenClause of decision.whenClauses) {
      const actions = whenClause.actions;
      for (let i = 0; i < actions.length - 1; i++) {
        const currentAction = actions[i].action;
        const nextAction = actions[i + 1].action;

        if (!this.actionDependencies.has(currentAction)) {
          this.actionDependencies.set(currentAction, new Set());
        }
        this.actionDependencies.get(currentAction)!.add(nextAction);
      }
    }
  }

  private findActionLocation(ast: File, actionName: string): { line: number; column: number } {
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        for (const whenClause of statement.whenClauses) {
          for (const action of whenClause.actions) {
            if (action.action === actionName) {
              return action.location.start;
            }
          }
        }
      }
    }
    return { line: 0, column: 0 };
  }
}
