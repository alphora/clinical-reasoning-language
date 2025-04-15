import {
  Action,
  ActivityType,
  BlockBody,
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

  public validate(ast: File): ValidationError[] {
    this.clear();
    this.collectDeclarations(ast);
    this.processDeclarations(ast);
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
          this.terminologyDeclarations.set(statement.name, {
            used: false,
            location: statement.location,
          });
          break;
      }
    }
  }

  private processDeclarations(ast: File): void {
    for (const statement of ast.statements) {
      switch (statement.type) {
        case DecisionType.type:
          this.processDecisionBody(statement.body);
          break;
        case 'Concept':
          if (
            statement.definition.type === 'InferredByDefinition' &&
            statement.definition.concept
          ) {
            const conceptInfo = this.conceptDeclarations.get(statement.definition.concept);
            if (conceptInfo) {
              conceptInfo.used = true;
            }
          }
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
  }

  private processDecisionBody(body: DecisionBody): void {
    console.log('[DEBUGGING] Processing decision body with statements:', body.statements);
    for (const statement of body.statements) {
      console.log('[DEBUGGING] Processing statement:', statement.type);
      if (statement.type === WhenBlockType.type) {
        this.processWhenBlock(statement);
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
    } else if (whenBlock.body.type === 'SingleAction') {
      console.log('[DEBUGGING] Processing single action');
      this.processAction(whenBlock.body.action);
    }
  }

  private processBlockBody(body: BlockBody): void {
    console.log('[DEBUGGING] Processing block body statements:', body.statements);
    for (const statement of body.statements) {
      console.log('[DEBUGGING] Processing block statement:', statement.type);
      if (statement.type === 'ActionStatement') {
        this.processAction(statement.action);
      }
    }
  }

  private processAction(action: Action): void {
    console.log('[DEBUGGING] Processing action:', action.type);
    if (action.type === 'DoActivity') {
      const activityInfo = this.activityDeclarations.get(action.activityName);
      if (activityInfo) {
        activityInfo.used = true;
      }
    } else if (action.type === 'UseDecision') {
      console.log('[DEBUGGING] Found UseDecision action with decision:', action.decisionName);
      const decisionInfo = this.decisionDeclarations.get(action.decisionName);
      if (decisionInfo) {
        decisionInfo.used = true;
      }
    }
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
          severity: 'error',
        });
      }
    }

    for (const [name, info] of this.conceptDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused concept: ${name}`,
          location: info.location,
          severity: 'error',
        });
      }
    }

    for (const [name, info] of this.activityDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused activity: ${name}`,
          location: info.location,
          severity: 'error',
        });
      }
    }

    for (const [name, info] of this.terminologyDeclarations) {
      if (!info.used) {
        errors.push({
          message: `Unused terminology: ${name}`,
          location: info.location,
          severity: 'error',
        });
      }
    }

    return errors;
  }
}
