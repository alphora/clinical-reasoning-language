import {
  ActivityType,
  Action,
  BlockBody,
  DecisionBody,
  DecisionType,
  File,
  Location,
  WhenBlock,
  WhenBlockType,
} from '../ast/types';

interface UsageInfo {
  used: boolean;
  location: Location;
}

export class UnusedDeclarationsValidator {
  private decisionDeclarations: Map<string, UsageInfo> = new Map();
  private conceptDeclarations: Map<string, UsageInfo> = new Map();
  private activityDeclarations: Map<string, UsageInfo> = new Map();
  private terminologyDeclarations: Map<string, UsageInfo> = new Map();

  public validate(ast: File): { isValid: boolean; warnings: string[] } {
    this.collectDeclarations(ast);
    this.processDeclarations(ast);
    return this.generateResults();
  }

  private collectDeclarations(ast: File): void {
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
    // Mark the concept as used
    const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
    if (conceptInfo) {
      conceptInfo.used = true;
    }

    // Process statements in the when block body
    if (whenBlock.body.type === 'BlockBody') {
      this.processBlockBody(whenBlock.body);
    }
  }

  private processBlockBody(body: BlockBody): void {
    for (const statement of body.statements) {
      if (statement.type === WhenBlockType.type) {
        this.processWhenBlock(statement);
      } else if (statement.type === 'ActionStatement') {
        this.processAction(statement.action);
      }
    }
  }

  private processAction(action: Action): void {
    let info: UsageInfo | undefined;
    switch (action.type) {
      case 'UseDecision':
        info = this.decisionDeclarations.get(action.decisionName);
        break;
      case 'DoActivity':
        info = this.activityDeclarations.get(action.activityName);
        break;
    }
    if (info) {
      info.used = true;
    }
  }

  private generateResults(): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    for (const [name, info] of this.decisionDeclarations) {
      if (!info.used) {
        warnings.push(`Unused decision: ${name} at line ${info.location.start.line}`);
      }
    }

    for (const [name, info] of this.conceptDeclarations) {
      if (!info.used) {
        warnings.push(`Unused concept: ${name} at line ${info.location.start.line}`);
      }
    }

    for (const [name, info] of this.activityDeclarations) {
      if (!info.used) {
        warnings.push(`Unused activity: ${name} at line ${info.location.start.line}`);
      }
    }

    for (const [name, info] of this.terminologyDeclarations) {
      if (!info.used) {
        warnings.push(`Unused terminology: ${name} at line ${info.location.start.line}`);
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }
}
