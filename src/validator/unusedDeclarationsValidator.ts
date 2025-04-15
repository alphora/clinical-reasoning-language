import { File, DecisionBody, WhenBlock, BlockBody, Action, Location } from '../ast/types';

import { ValidationWarning } from './validator';

interface UsageInfo {
  used: boolean;
  location: Location;
}

export class UnusedDeclarationsValidator {
  validate(ast: File): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Track all declarations
    const decisions = new Map<string, UsageInfo>();
    const concepts = new Map<string, UsageInfo>();
    const activities = new Map<string, UsageInfo>();
    const terminologies = new Map<string, UsageInfo>();

    // First pass: collect all declarations
    for (const statement of ast.statements) {
      switch (statement.type) {
        case 'Decision':
          decisions.set(statement.name, { used: false, location: statement.location });
          break;
        case 'Concept':
          concepts.set(statement.name, { used: false, location: statement.location });
          break;
        case 'Activity':
          activities.set(statement.name, { used: false, location: statement.location });
          break;
        case 'Terminology':
          terminologies.set(statement.name, { used: false, location: statement.location });
          break;
      }
    }

    // Second pass: mark used declarations
    for (const statement of ast.statements) {
      if (statement.type === 'Decision') {
        this.processDecisionBody(statement.body, decisions, concepts, activities);
      } else if (statement.type === 'Concept') {
        if (statement.definition.type === 'CodedByDefinition') {
          const terminology = terminologies.get(statement.definition.terminologyName);
          if (terminology) {
            terminology.used = true;
          }
        } else if (
          statement.definition.type === 'InferredByDefinition' &&
          statement.definition.concept
        ) {
          const concept = concepts.get(statement.definition.concept);
          if (concept) {
            concept.used = true;
          }
        }
      }
    }

    // Generate warnings for unused declarations
    for (const [name, info] of decisions) {
      if (!info.used) {
        warnings.push({
          message: `Unused decision: ${name}`,
          location: info.location,
        });
      }
    }

    for (const [name, info] of concepts) {
      if (!info.used) {
        warnings.push({
          message: `Unused concept: ${name}`,
          location: info.location,
        });
      }
    }

    for (const [name, info] of activities) {
      if (!info.used) {
        warnings.push({
          message: `Unused activity: ${name}`,
          location: info.location,
        });
      }
    }

    for (const [name, info] of terminologies) {
      if (!info.used) {
        warnings.push({
          message: `Unused terminology: ${name}`,
          location: info.location,
        });
      }
    }

    return warnings;
  }

  private processDecisionBody(
    body: DecisionBody,
    decisions: Map<string, UsageInfo>,
    concepts: Map<string, UsageInfo>,
    activities: Map<string, UsageInfo>,
  ): void {
    for (const statement of body.statements) {
      if (statement.type === 'WhenBlock') {
        // Mark concept as used
        const concept = concepts.get(statement.conceptName);
        if (concept) {
          concept.used = true;
        }

        this.processWhenBlock(statement, decisions, concepts, activities);
      }
    }
  }

  private processWhenBlock(
    whenBlock: WhenBlock,
    decisions: Map<string, UsageInfo>,
    concepts: Map<string, UsageInfo>,
    activities: Map<string, UsageInfo>,
  ): void {
    if (whenBlock.body.type === 'BlockBody') {
      this.processBlockBody(whenBlock.body, decisions, concepts, activities);
    } else if (whenBlock.body.type === 'SingleAction') {
      this.processAction(whenBlock.body.action, decisions, activities);
    }
  }

  private processBlockBody(
    blockBody: BlockBody,
    decisions: Map<string, UsageInfo>,
    concepts: Map<string, UsageInfo>,
    activities: Map<string, UsageInfo>,
  ): void {
    for (const statement of blockBody.statements) {
      if (statement.type === 'WhenBlock') {
        this.processWhenBlock(statement, decisions, concepts, activities);
      } else if (statement.type === 'ActionStatement') {
        this.processAction(statement.action, decisions, activities);
      }
    }
  }

  private processAction(
    action: Action,
    decisions: Map<string, UsageInfo>,
    activities: Map<string, UsageInfo>,
  ): void {
    if (action.type === 'UseDecision') {
      const decision = decisions.get(action.decisionName);
      if (decision) {
        decision.used = true;
      }
    } else if (action.type === 'DoActivity') {
      const activity = activities.get(action.activityName);
      if (activity) {
        activity.used = true;
      }
    }
  }
}
