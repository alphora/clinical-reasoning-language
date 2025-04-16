import {
  Action,
  ActivityType,
  BlockBody,
  Decision,
  DecisionBody,
  DecisionType,
  CPGL,
  Location,
  WhenBlock,
  WhenBlockType,
} from '../ast/types';

import { ValidationError } from './validator';

interface UsageInfo {
  used: boolean;
  location: Location;
}

export class UnusedDeclarationsValidator {
  private readonly decisionDeclarations: Map<string, UsageInfo> = new Map();
  private readonly conceptDeclarations: Map<string, UsageInfo> = new Map();
  private readonly activityDeclarations: Map<string, UsageInfo> = new Map();
  private readonly terminologyDeclarations: Map<string, UsageInfo> = new Map();
  private readonly ast: CPGL | null;

  constructor(ast?: CPGL) {
    this.ast = ast || null;
  }

  public validate(ast?: CPGL): ValidationError[] {
    this.clear();
    const targetAst = ast || this.ast;
    if (!targetAst) {
      throw new Error('No AST provided to validate');
    }
    this.collectDeclarations(targetAst);
    this.processDeclarations(targetAst);
    return this.generateResults();
  }

  private clear(): void {
    this.decisionDeclarations.clear();
    this.conceptDeclarations.clear();
    this.activityDeclarations.clear();
    this.terminologyDeclarations.clear();
  }

  private collectDeclarations(ast: CPGL): void {
    for (const statement of ast.statements) {
      switch (statement.type) {
        case DecisionType.type:
          this.decisionDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
        case 'Concept':
          this.conceptDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
        case ActivityType.type:
          this.activityDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
        case 'Terminology':
          this.terminologyDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
      }
    }
  }

  private processDeclarations(ast: CPGL): void {
    for (const statement of ast.statements) {
      switch (statement.type) {
        case DecisionType.type:
          // Process the decision body for all decisions
          this.processDecisionBody(statement.body, statement.name);
          break;
        case 'Concept':
          // Mark terminology as used when referenced in CodedByDefinition
          if (
            statement.definition.type === 'CodedByDefinition' &&
            statement.definition.terminologyName
          ) {
            const terminologyInfo = this.terminologyDeclarations.get(
              statement.definition.terminologyName,
            );
            if (terminologyInfo) {
              terminologyInfo.used = true;
            }
          }
          break;
      }
    }

    // Process concept references in InferredByDefinition after all declarations are collected
    for (const statement of ast.statements) {
      if (
        statement.type === 'Concept' &&
        statement.definition.type === 'InferredByDefinition' &&
        statement.definition.concept
      ) {
        // Mark the referenced concept as used
        const referencedConceptInfo = this.conceptDeclarations.get(statement.definition.concept);
        if (referencedConceptInfo) {
          referencedConceptInfo.used = true;
        }
        // Mark the concept containing the InferredByDefinition as used
        const conceptInfo = this.conceptDeclarations.get(statement.name);
        if (conceptInfo) {
          conceptInfo.used = true;
        }
      }
    }
  }

  private processDecisionBody(body: DecisionBody, containingDecisionName?: string): void {
    // If this decision body contains any statements, mark the containing decision as used
    if (containingDecisionName && body.statements.length > 0) {
      const decisionInfo = this.decisionDeclarations.get(containingDecisionName);
      if (decisionInfo) {
        decisionInfo.used = true;
      }
    }

    for (const statement of body.statements) {
      if (statement.type === WhenBlockType.type) {
        this.processWhenBlock(statement);
      } else if (statement.type === 'ActionStatement') {
        if ('action' in statement && this.isAction(statement.action)) {
          this.processAction(statement.action);
        }
      }
    }
  }

  private processWhenBlock(whenBlock: WhenBlock): void {
    const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
    if (conceptInfo) {
      conceptInfo.used = true;
    }

    if (whenBlock.body.type === 'BlockBody') {
      this.processBlockBody(whenBlock.body);
    } else if (whenBlock.body.type === 'SingleAction' && this.isAction(whenBlock.body.action)) {
      this.processAction(whenBlock.body.action);
    }
  }

  private processBlockBody(body: BlockBody): void {
    for (const statement of body.statements) {
      if (
        statement.type === 'ActionStatement' &&
        'action' in statement &&
        this.isAction(statement.action)
      ) {
        this.processAction(statement.action);
      } else if (statement.type === WhenBlockType.type) {
        this.processWhenBlock(statement);
      }
    }
  }

  private processAction(action: Action): void {
    if (action.type === 'DoActivity') {
      const activityInfo = this.activityDeclarations.get(action.activityName);
      if (activityInfo) {
        activityInfo.used = true;
      }
    } else if (action.type === 'UseDecision') {
      const decisionInfo = this.decisionDeclarations.get(action.decisionName);
      if (decisionInfo) {
        decisionInfo.used = true;
      }
      const referencedDecision = this.findDecision(action.decisionName);
      if (referencedDecision) {
        this.processDecisionBody(referencedDecision.body);
      }
    }
  }

  private findDecision(name: string): Decision | undefined {
    if (!this.ast) {
      return undefined;
    }
    for (const statement of this.ast.statements) {
      if (statement.type === DecisionType.type && statement.name === name) {
        return statement;
      }
    }
    return undefined;
  }

  private isAction(action: unknown): action is Action {
    return (
      typeof action === 'object' &&
      action !== null &&
      'type' in action &&
      (action.type === 'DoActivity' || action.type === 'UseDecision')
    );
  }

  private generateResults(): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [name, info] of this.decisionDeclarations) {
      if (!info.used) {
        console.log('] Found unused decision:', name);
        errors.push({
          message: `Unused decision: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    for (const [name, info] of this.conceptDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused concept: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    for (const [name, info] of this.activityDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused activity: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    for (const [name, info] of this.terminologyDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused terminology: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    return errors;
  }
}
