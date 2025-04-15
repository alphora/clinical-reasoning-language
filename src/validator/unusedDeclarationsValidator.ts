import {
  Action,
  ActivityType,
  BlockBody,
  Decision,
  DecisionBody,
  DecisionType,
  File,
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
  private readonly ast: File | null;

  constructor(ast?: File) {
    this.ast = ast || null;
  }

  public validate(ast?: File): ValidationError[] {
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

  private collectDeclarations(ast: File): void {
    for (const statement of ast.statements) {
      switch (statement.type) {
        case DecisionType.type:
          console.log('[DEBUGGING] Collecting decision:', statement.name);
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
          console.log('[DEBUGGING] Collecting terminology:', statement.name);
          this.terminologyDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
      }
    }
  }

  private processDeclarations(ast: File): void {
    console.log('[DEBUGGING] Starting processDeclarations');
    console.log(
      '[DEBUGGING] Initial terminology declarations:',
      Array.from(this.terminologyDeclarations.entries()),
    );
    for (const statement of ast.statements) {
      switch (statement.type) {
        case DecisionType.type:
          // Process the decision body for all decisions
          console.log('[DEBUGGING] Processing decision:', statement.name);
          this.processDecisionBody(statement.body, statement.name);
          break;
        case 'Concept':
          // Mark terminology as used when referenced in CodedByDefinition
          if (
            statement.definition.type === 'CodedByDefinition' &&
            statement.definition.terminologyName
          ) {
            console.log(
              '[DEBUGGING] Found CodedByDefinition referencing terminology:',
              statement.definition.terminologyName,
            );

            const terminologyInfo = this.terminologyDeclarations.get(
              statement.definition.terminologyName,
            );
            if (terminologyInfo) {
              console.log(
                '[DEBUGGING] Marking terminology as used:',
                statement.definition.terminologyName,
              );
              terminologyInfo.used = true;
            } else {
              console.log(
                '[DEBUGGING] Terminology not found in declarations:',
                statement.definition.terminologyName,
              );
            }

            // Mark the concept itself as used since it's being defined
            const conceptInfo = this.conceptDeclarations.get(statement.name);
            if (conceptInfo) {
              console.log('[DEBUGGING] Marking concept as used:', statement.name);
              conceptInfo.used = true;
            }
          }
          break;
      }
    }

    // Process concept references in InferredByDefinition after all declarations are collected
    console.log('[DEBUGGING] Processing InferredByDefinition references');
    for (const statement of ast.statements) {
      if (
        statement.type === 'Concept' &&
        statement.definition.type === 'InferredByDefinition' &&
        statement.definition.concept
      ) {
        console.log(
          '[DEBUGGING] Found InferredByDefinition referencing concept:',
          statement.definition.concept,
        );
        // Mark the referenced concept as used
        const referencedConceptInfo = this.conceptDeclarations.get(statement.definition.concept);
        if (referencedConceptInfo) {
          console.log(
            '[DEBUGGING] Marking referenced concept as used:',
            statement.definition.concept,
          );
          referencedConceptInfo.used = true;
        } else {
          console.log(
            '[DEBUGGING] Referenced concept not found in declarations:',
            statement.definition.concept,
          );
        }
        // Mark the concept containing the InferredByDefinition as used
        const conceptInfo = this.conceptDeclarations.get(statement.name);
        if (conceptInfo) {
          console.log(
            '[DEBUGGING] Marking concept with InferredByDefinition as used:',
            statement.name,
          );
          conceptInfo.used = true;
        }
      }
    }

    console.log(
      '[DEBUGGING] Final terminology declarations:',
      Array.from(this.terminologyDeclarations.entries()),
    );
    console.log(
      '[DEBUGGING] After processDeclarations, decision declarations:',
      Array.from(this.decisionDeclarations.entries()),
    );
  }

  private processDecisionBody(body: DecisionBody, containingDecisionName?: string): void {
    console.log('[DEBUGGING] Processing decision body with statements:', body.statements);

    // If this decision body contains any statements, mark the containing decision as used
    if (containingDecisionName && body.statements.length > 0) {
      const decisionInfo = this.decisionDeclarations.get(containingDecisionName);
      if (decisionInfo) {
        console.log('[DEBUGGING] Marking containing decision as used:', containingDecisionName);
        decisionInfo.used = true;
      }
    }

    for (const statement of body.statements) {
      console.log('[DEBUGGING] Processing statement:', statement.type);
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
    console.log('[DEBUGGING] Processing when block with concept:', whenBlock.conceptName);
    const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
    if (conceptInfo) {
      conceptInfo.used = true;
    }

    if (whenBlock.body.type === 'BlockBody') {
      console.log('[DEBUGGING] Processing block body');
      this.processBlockBody(whenBlock.body);
    } else if (whenBlock.body.type === 'SingleAction' && this.isAction(whenBlock.body.action)) {
      console.log('[DEBUGGING] Processing single action');
      this.processAction(whenBlock.body.action);
    }
  }

  private processBlockBody(body: BlockBody): void {
    console.log('[DEBUGGING] Processing block body statements:', body.statements);
    for (const statement of body.statements) {
      console.log('[DEBUGGING] Processing block statement:', statement.type);
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
    console.log('[DEBUGGING] Processing action:', action);
    if (action.type === 'DoActivity') {
      console.log('[DEBUGGING] Found DoActivity action for:', action.activityName);
      const activityInfo = this.activityDeclarations.get(action.activityName);
      if (activityInfo) {
        console.log('[DEBUGGING] Marked activity as used:', action.activityName);
        activityInfo.used = true;
      }
    } else if (action.type === 'UseDecision') {
      console.log('[DEBUGGING] Found UseDecision action for:', action.decisionName);
      const decisionInfo = this.decisionDeclarations.get(action.decisionName);
      console.log('[DEBUGGING] Decision info for', action.decisionName, ':', decisionInfo);
      if (decisionInfo) {
        console.log('[DEBUGGING] Marked decision as used:', action.decisionName);
        decisionInfo.used = true;
      }
      const referencedDecision = this.findDecision(action.decisionName);
      console.log('[DEBUGGING] Found referenced decision:', referencedDecision);
      if (referencedDecision) {
        this.processDecisionBody(referencedDecision.body);
      }
      console.log(
        '[DEBUGGING] Current decision declarations:',
        Array.from(this.decisionDeclarations.entries()),
      );
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

    console.log(
      '[DEBUGGING] Decision declarations:',
      Array.from(this.decisionDeclarations.entries()),
    );

    for (const [name, info] of this.decisionDeclarations) {
      if (!info.used) {
        console.log('[DEBUGGING] Found unused decision:', name);
        errors.push({
          message: `Unused decision: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    console.log(
      '[DEBUGGING] Checking concept declarations:',
      Array.from(this.conceptDeclarations.entries()),
    );
    for (const [name, info] of this.conceptDeclarations) {
      if (!info.used) {
        console.log('[DEBUGGING] Found unused concept:', name);
        errors.push({
          message: `Unused concept: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    console.log(
      '[DEBUGGING] Checking activity declarations:',
      Array.from(this.activityDeclarations.entries()),
    );
    for (const [name, info] of this.activityDeclarations) {
      if (!info.used) {
        console.log('[DEBUGGING] Found unused activity:', name);
        errors.push({
          message: `Unused activity: ${name}`,
          location: info.location,
          severity: 'warning',
        });
      }
    }

    console.log(
      '[DEBUGGING] Checking terminology declarations:',
      Array.from(this.terminologyDeclarations.entries()),
    );
    for (const [name, info] of this.terminologyDeclarations) {
      if (!info.used) {
        console.log('[DEBUGGING] Found unused terminology:', name);
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
