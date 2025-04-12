import { File, Statement, Decision, WhenClause } from '../ast/types';
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

    // Validate decision references
    this.validateDecisionReferences(ast);

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

  private findDecisionLocation(ast: File, decisionName: string): { line: number; column: number } {
    for (const statement of ast.statements) {
      if (statement.type === 'Decision' && statement.name === decisionName) {
        return statement.location.start;
      }
    }
    return { line: 1, column: 1 };
  }

  private isValidCondition(condition: string): boolean {
    // Basic validation - can be expanded based on requirements
    return condition.trim().length > 0;
  }

  private validateAction(action: Statement & { type: 'Action' }): void {
    // Check action name format
    if (!this.isValidName(action.name)) {
      throw new ValidationError(
        `Invalid action name: "${action.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
        action.location.start,
      );
    }

    // Check FHIR type if provided
    if (action.fhirType && !this.isValidActionFHIRType(action.fhirType)) {
      throw new ValidationError(
        `Invalid FHIR type for action "${action.name}": "${action.fhirType}"`,
        action.location.start,
      );
    }
  }

  private validateCaseFeature(caseFeature: Statement & { type: 'CaseFeature' }): void {
    // Check case feature name format
    if (!this.isValidName(caseFeature.name)) {
      throw new ValidationError(
        `Invalid case feature name: "${caseFeature.name}". Names must start with a letter and contain only letters, numbers, and underscores.`,
        caseFeature.location.start,
      );
    }

    // Check FHIR type if provided
    if (caseFeature.fhirType && !this.isValidCaseFeatureFHIRType(caseFeature.fhirType)) {
      throw new ValidationError(
        `Invalid FHIR type for case feature "${caseFeature.name}": "${caseFeature.fhirType}"`,
        caseFeature.location.start,
      );
    }

    // Check URL if provided
    if (caseFeature.url && !this.isValidUrl(caseFeature.url)) {
      throw new ValidationError(
        `Invalid URL for case feature "${caseFeature.name}": "${caseFeature.url}"`,
        caseFeature.location.start,
      );
    }

    // Check value type if provided
    if (caseFeature.valueType && !FHIR_VALUE_TYPES.has(caseFeature.valueType)) {
      throw new ValidationError(
        `Invalid value type for case feature "${caseFeature.name}": "${caseFeature.valueType}"`,
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

  private isValidActionFHIRType(type: string): boolean {
    return ACTION_FHIR_TYPES.has(type);
  }

  private isValidCaseFeatureFHIRType(type: string): boolean {
    return CASEFEATURE_FHIR_TYPES.has(type);
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

    // Check for action cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectActionCycles = (actionName: string): void => {
      if (visited.has(actionName)) {
        return;
      }

      visited.add(actionName);
      recursionStack.add(actionName);

      const dependencies = this.actionDependencies.get(actionName);
      if (dependencies) {
        for (const dep of dependencies) {
          if (recursionStack.has(dep)) {
            throw new ValidationError(
              `Cyclic action dependency detected: ${actionName} -> ${dep}`,
              this.findActionLocation(ast, actionName),
            );
          }
          detectActionCycles(dep);
        }
      }

      recursionStack.delete(actionName);
    };

    // Check for cycles starting from each action
    for (const actionName of this.actionDependencies.keys()) {
      detectActionCycles(actionName);
    }
  }

  private buildActionDependencies(decision: Decision): void {
    for (const whenClause of decision.whenClauses) {
      this.processWhenClauseActions(whenClause, decision);
    }
  }

  private processWhenClauseActions(whenClause: WhenClause, decision: Decision): void {
    for (const action of whenClause.actions) {
      const actionName = action.action;
      this.initializeActionDependencies(actionName);
      this.addDependenciesFromUseClauses(actionName, decision);
    }
  }

  private initializeActionDependencies(actionName: string): void {
    if (!this.actionDependencies.has(actionName)) {
      this.actionDependencies.set(actionName, new Set<string>());
    }
  }

  private addDependenciesFromUseClauses(actionName: string, decision: Decision): void {
    for (const useClause of decision.useClauses) {
      const depDecision = this.decisionCache.get(useClause.decisionName);
      if (depDecision) {
        this.addDependenciesFromDecision(actionName, depDecision);
      }
    }
  }

  private addDependenciesFromDecision(actionName: string, depDecision: Decision): void {
    for (const depWhenClause of depDecision.whenClauses) {
      for (const depAction of depWhenClause.actions) {
        this.actionDependencies.get(actionName)?.add(depAction.action);
      }
    }
  }

  private findActionLocation(ast: File, actionName: string): { line: number; column: number } {
    for (const statement of ast.statements) {
      if (statement.type === 'Action' && statement.name === actionName) {
        return statement.location.start;
      }
    }
    return { line: 1, column: 1 };
  }
}
