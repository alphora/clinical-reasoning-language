import {
  File,
  DecisionBody,
  Action,
  Location,
  CodedByDefinition,
  Concept,
  Activity,
  Decision,
  Terminology,
  BlockBody,
  SingleAction,
  WhenBlock,
} from '../ast/types';

import { ValidationResult, ValidationWarning } from './validator';

interface UsageInfo {
  used: boolean;
  location: Location;
}

interface ExtendedFile extends File {
  decisions: Decision[];
  concepts: ExtendedConcept[];
  activities: ExtendedActivity[];
  terminologies: Terminology[];
  decisionBody: DecisionBody;
}

interface ExtendedConcept extends Concept {
  inferredBy?: string;
  codedBy?: CodedByDefinition[];
}

interface ExtendedActivity extends Activity {
  perform?: string;
}

interface ExtendedWhenBlock extends WhenBlock {
  type: 'WhenBlock';
  conceptName: string;
  body: BlockBody | SingleAction;
  location: Location;
  statements?: (ExtendedWhenBlock | { type: 'ActionStatement'; action: Action })[];
}

export class UnusedDeclarationsValidator {
  private decisionDeclarations: Map<string, UsageInfo> = new Map();
  private conceptDeclarations: Map<string, UsageInfo> = new Map();
  private activityDeclarations: Map<string, UsageInfo> = new Map();
  private terminologyDeclarations: Map<string, UsageInfo> = new Map();

  validate(file: File): ValidationResult {
    const extendedFile = file as ExtendedFile;
    this.collectDeclarations(extendedFile);
    this.processDecisionBody(extendedFile.decisionBody);
    this.processConcepts(extendedFile.concepts);
    this.processActivities(extendedFile.activities);

    const warnings: ValidationWarning[] = [];

    // Check for unused decisions
    this.decisionDeclarations.forEach((info, name) => {
      if (!info.used) {
        warnings.push({
          message: `Unused decision declaration: ${name} at line ${info.location.start.line}`,
          location: info.location,
        });
      }
    });

    // Check for unused concepts
    this.conceptDeclarations.forEach((info, name) => {
      if (!info.used) {
        warnings.push({
          message: `Unused concept declaration: ${name} at line ${info.location.start.line}`,
          location: info.location,
        });
      }
    });

    // Check for unused activities
    this.activityDeclarations.forEach((info, name) => {
      if (!info.used) {
        warnings.push({
          message: `Unused activity declaration: ${name} at line ${info.location.start.line}`,
          location: info.location,
        });
      }
    });

    // Check for unused terminologies
    this.terminologyDeclarations.forEach((info, name) => {
      if (!info.used) {
        warnings.push({
          message: `Unused terminology declaration: ${name} at line ${info.location.start.line}`,
          location: info.location,
        });
      }
    });

    return {
      isValid: warnings.length === 0,
      warnings,
      errors: [],
    };
  }

  private collectDeclarations(file: ExtendedFile): void {
    // Collect decision declarations
    file.decisions.forEach(decision => {
      this.decisionDeclarations.set(decision.name, {
        used: false,
        location: decision.location,
      });
    });

    // Collect concept declarations
    file.concepts.forEach(concept => {
      this.conceptDeclarations.set(concept.name, {
        used: false,
        location: concept.location,
      });
    });

    // Collect activity declarations
    file.activities.forEach(activity => {
      this.activityDeclarations.set(activity.name, {
        used: false,
        location: activity.location,
      });
    });

    // Collect terminology declarations
    file.terminologies.forEach(terminology => {
      this.terminologyDeclarations.set(terminology.name, {
        used: false,
        location: terminology.location,
      });
    });
  }

  private processDecisionBody(body: DecisionBody): void {
    body.statements.forEach(statement => {
      if (statement.type === 'WhenBlock') {
        const whenBlock = statement as ExtendedWhenBlock;
        // Mark concept as used when referenced in WhenBlock
        if (whenBlock.conceptName) {
          const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
          if (conceptInfo) {
            conceptInfo.used = true;
          }
        }
        this.processBlockBody(whenBlock.body);
      }
    });
  }

  private processBlockBody(body: BlockBody | SingleAction): void {
    if (body.type === 'BlockBody') {
      body.statements.forEach(statement => {
        if (statement.type === 'WhenBlock') {
          const whenBlock = statement as ExtendedWhenBlock;
          // Mark concept as used when referenced in WhenBlock
          if (whenBlock.conceptName) {
            const conceptInfo = this.conceptDeclarations.get(whenBlock.conceptName);
            if (conceptInfo) {
              conceptInfo.used = true;
            }
          }
          this.processBlockBody(whenBlock.body);
        } else if (statement.type === 'ActionStatement') {
          this.processAction(statement.action);
        }
      });
    } else if (body.type === 'SingleAction') {
      this.processAction(body.action);
    }
  }

  private processAction(action: Action): void {
    if (action.type === 'UseDecision') {
      // Only mark decisions as used when referenced by UseDecision
      const decisionInfo = this.decisionDeclarations.get(action.decisionName);
      if (decisionInfo) {
        decisionInfo.used = true;
      }
    } else if (action.type === 'DoActivity') {
      // Only mark activities as used when referenced by DoActivity
      const activityInfo = this.activityDeclarations.get(action.activityName);
      if (activityInfo) {
        activityInfo.used = true;
      }
    }
  }

  private processConcepts(concepts: ExtendedConcept[]): void {
    concepts.forEach(concept => {
      // Mark concept as used when referenced in inferredBy
      if (concept.inferredBy) {
        const conceptInfo = this.conceptDeclarations.get(concept.inferredBy);
        if (conceptInfo) {
          conceptInfo.used = true;
        }
      }

      // Mark terminology as used when referenced in CodedByDefinition
      if (concept.codedBy) {
        concept.codedBy.forEach((codedBy: CodedByDefinition) => {
          const terminologyInfo = this.terminologyDeclarations.get(codedBy.terminologyName);
          if (terminologyInfo) {
            terminologyInfo.used = true;
          }
        });
      }
    });
  }

  private processActivities(activities: ExtendedActivity[]): void {
    activities.forEach(activity => {
      // Mark terminology as used when referenced in perform
      if (activity.perform) {
        const terminologyInfo = this.terminologyDeclarations.get(activity.perform);
        if (terminologyInfo) {
          terminologyInfo.used = true;
        }
      }
    });
  }
}
