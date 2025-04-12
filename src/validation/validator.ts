import {
  ASTNode,
  Decision,
  WhenBlock,
  Activity,
  Concept,
  Terminology,
  DoActivity,
  UseDecision,
  BlockBody,
  SingleAction,
  File,
} from '../ast/types';
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
      this.validateNode(statement);
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
        // Collect dependencies from when blocks
        for (const whenBlock of statement.body.statements) {
          this.collectDependenciesFromWhenBlock(whenBlock, dependencies);
        }
        this.decisionGraph.set(statement.name, dependencies);
      }
    }
  }

  private collectDependenciesFromWhenBlock(whenBlock: WhenBlock, dependencies: Set<string>): void {
    if (this.isBlockBody(whenBlock.body)) {
      for (const action of whenBlock.body.statements) {
        if (action.type === 'ActionStatement' && action.action.type === 'UseDecision') {
          dependencies.add(action.action.decisionName);
        }
      }
    } else if (
      whenBlock.body.type === 'SingleAction' &&
      whenBlock.body.action.type === 'UseDecision'
    ) {
      dependencies.add(whenBlock.body.action.decisionName);
    }
  }

  private validateNode(node: ASTNode): void {
    switch (node.type) {
      case 'Decision':
        this.validateDecision(node as Decision);
        break;
      case 'Activity':
        this.validateActivity(node as Activity);
        break;
      case 'Concept':
        this.validateConcept(node as Concept);
        break;
      case 'Terminology':
        this.validateTerminology(node as Terminology);
        break;
      default:
        throw new ValidationError(`Unknown node type: ${node.type}`, node.location.start);
    }
  }

  private validateDecision(decision: Decision): void {
    if (!decision.name || !decision.name.trim()) {
      throw new ValidationError('Decision name cannot be empty', decision.location.start);
    }

    if (!decision.body || !decision.body.statements || decision.body.statements.length === 0) {
      throw new ValidationError(
        'Decision must have at least one when block',
        decision.location.start,
      );
    }

    for (const whenBlock of decision.body.statements) {
      this.validateWhenBlock(whenBlock);
    }
  }

  private validateWhenBlock(whenBlock: WhenBlock): void {
    if (!whenBlock.conceptName || whenBlock.conceptName.length === 0) {
      throw new ValidationError(
        'When block must have a concept reference',
        whenBlock.location.start,
      );
    }

    if (this.isBlockBody(whenBlock.body)) {
      for (const action of whenBlock.body.statements) {
        if (action.type === 'WhenBlock') {
          this.validateWhenBlock(action);
        } else if (action.type === 'ActionStatement') {
          this.validateAction(action.action);
        }
      }
    } else {
      this.validateAction(whenBlock.body.action);
    }
  }

  private isBlockBody(body: BlockBody | SingleAction): body is BlockBody {
    return 'statements' in body;
  }

  private validateAction(action: DoActivity | UseDecision): void {
    if (action.type === 'DoActivity') {
      if (!action.activityName.trim()) {
        throw new ValidationError('Activity name cannot be empty', action.location.start);
      }
    } else if (action.type === 'UseDecision') {
      if (!action.decisionName.trim()) {
        throw new ValidationError('Decision name cannot be empty', action.location.start);
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

  private validateDecisionReferences(ast: File): void {
    // Check that all referenced decisions exist
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        for (const whenBlock of statement.body.statements) {
          this.validateDecisionReferencesInWhenBlock(whenBlock);
        }
      }
    }
  }

  private validateDecisionReferencesInWhenBlock(whenBlock: WhenBlock): void {
    if (this.isBlockBody(whenBlock.body)) {
      for (const action of whenBlock.body.statements) {
        if (action.type === 'ActionStatement' && action.action.type === 'UseDecision') {
          if (!this.decisionNames.has(action.action.decisionName)) {
            throw new ValidationError(
              `Referenced decision "${action.action.decisionName}" does not exist`,
              action.action.location.start,
            );
          }
        }
      }
    } else if (
      whenBlock.body.type === 'SingleAction' &&
      whenBlock.body.action.type === 'UseDecision'
    ) {
      if (!this.decisionNames.has(whenBlock.body.action.decisionName)) {
        throw new ValidationError(
          `Referenced decision "${whenBlock.body.action.decisionName}" does not exist`,
          whenBlock.body.action.location.start,
        );
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

    // Detect cycles in action dependencies
    for (const [actionName] of this.actionDependencies) {
      this.visitedDecisions.clear();
      this.detectActionCycles(actionName, ast);
    }
  }

  private detectActionCycles(actionName: string, ast: File): void {
    if (this.visitedDecisions.has(actionName)) {
      throw new ValidationError(
        `Circular dependency detected in action references: ${actionName}`,
        this.findActionLocation(ast, actionName),
      );
    }

    this.visitedDecisions.add(actionName);
    const dependencies = this.actionDependencies.get(actionName);
    if (dependencies) {
      for (const dependency of dependencies) {
        this.detectActionCycles(dependency, ast);
      }
    }
    this.visitedDecisions.delete(actionName);
  }

  private buildActionDependencies(decision: Decision): void {
    for (const whenBlock of decision.body.statements) {
      this.processWhenBlockActions(whenBlock, decision);
    }
  }

  private processWhenBlockActions(whenBlock: WhenBlock, decision: Decision): void {
    if (this.isBlockBody(whenBlock.body)) {
      for (const action of whenBlock.body.statements) {
        if (action.type === 'ActionStatement') {
          this.processAction(action.action, decision);
        }
      }
    } else {
      this.processAction(whenBlock.body.action, decision);
    }
  }

  private processAction(action: DoActivity | UseDecision, decision: Decision): void {
    if (action.type === 'DoActivity') {
      this.initializeActionDependencies(action.activityName);
      this.actionDependencies.get(decision.name)?.add(action.activityName);
    }
  }

  private initializeActionDependencies(actionName: string): void {
    if (!this.actionDependencies.has(actionName)) {
      this.actionDependencies.set(actionName, new Set<string>());
    }
  }

  private findActionLocation(ast: File, actionName: string): { line: number; column: number } {
    for (const statement of ast.statements) {
      if (statement.type === 'Activity' && statement.name === actionName) {
        return statement.location.start;
      }
    }
    return { line: 1, column: 1 };
  }

  private validateActivity(activity: Activity): void {
    if (!activity.name || !activity.name.trim()) {
      throw new ValidationError('Activity name cannot be empty', activity.location.start);
    }
    if (!activity.activityType || !activity.activityType.trim()) {
      throw new ValidationError('Activity type cannot be empty', activity.location.start);
    }
    if (!ACTION_FHIR_TYPES.has(activity.activityType)) {
      throw new ValidationError(
        `Invalid FHIR type for activity: ${activity.activityType}`,
        activity.location.start,
      );
    }
  }

  private validateConcept(concept: Concept): void {
    if (!concept.name || !concept.name.trim()) {
      throw new ValidationError('Concept name cannot be empty', concept.location.start);
    }
    if (!concept.conceptType || !concept.conceptType.trim()) {
      throw new ValidationError('Concept type cannot be empty', concept.location.start);
    }
    if (!CASEFEATURE_FHIR_TYPES.has(concept.conceptType)) {
      throw new ValidationError(
        `Invalid FHIR type for concept: ${concept.conceptType}`,
        concept.location.start,
      );
    }
    if (!concept.valueType || !concept.valueType.trim()) {
      throw new ValidationError('Value type cannot be empty', concept.location.start);
    }
    if (!FHIR_VALUE_TYPES.has(concept.valueType)) {
      throw new ValidationError(
        `Invalid FHIR value type for concept: ${concept.valueType}`,
        concept.location.start,
      );
    }
  }

  private validateTerminology(terminology: Terminology): void {
    if (!terminology.name || !terminology.name.trim()) {
      throw new ValidationError('Terminology name cannot be empty', terminology.location.start);
    }
    if (!terminology.definition) {
      throw new ValidationError('Terminology must have a definition', terminology.location.start);
    }
  }
}
