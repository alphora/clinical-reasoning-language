import {
  Action,
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
    this.collectDeclarations(ast);
    this.processDeclarations(ast);
    return this.generateResults();
  }

  private collectDeclarations(ast: File): void {
    for (const statement of ast.statements) {
      if (statement.type === DecisionType.type) {
        this.decisionDeclarations.set(statement.name, {
          used: false,
          location: statement.location,
        });
      }
    }
  }

  private processDeclarations(ast: File): void {
    for (const statement of ast.statements) {
      if (statement.type === DecisionType.type) {
        this.processDecisionBody(statement.body);
      }
    }
  }

  private processDecisionBody(body: DecisionBody): void {
    for (const statement of body.statements) {
      if (statement.type === WhenBlockType.type) {
        this.processWhenBlock(statement);
      }
    }
  }

  private processWhenBlock(whenBlock: WhenBlock): void {
    this.conceptDeclarations.set(whenBlock.conceptName, {
      used: true,
      location: whenBlock.location,
    });

    if (whenBlock.body.type === 'BlockBody') {
      this.processBlockBody(whenBlock.body);
    } else if (whenBlock.body.type === 'SingleAction') {
      this.processAction(whenBlock.body.action);
    }
  }

  private processBlockBody(body: BlockBody): void {
    for (const statement of body.statements) {
      if (statement.type === 'ActionStatement') {
        this.processAction(statement.action);
      }
    }
  }

  private processAction(action: Action): void {
    if (action.type === 'DoActivity') {
      this.activityDeclarations.set(action.activityName, {
        used: true,
        location: action.location,
      });
    } else if (action.type === 'UseDecision') {
      this.decisionDeclarations.set(action.decisionName, {
        used: true,
        location: action.location,
      });
    }
  }

  private generateResults(): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const [name, info] of this.decisionDeclarations) {
      if (!info.used) {
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
