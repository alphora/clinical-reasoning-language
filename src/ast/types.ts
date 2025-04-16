// Base AST Node interface
export interface ASTNode {
  type: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// CPGL represents the root of the AST
export interface CPGL extends ASTNode {
  type: 'CPGL';
  statements: Statement[];
  location: Location;
}
export const FileType = {
  type: 'CPGL' as const,
};

// Union type for all possible statements
export type Statement = Decision | Concept | Activity | Terminology;

// --------------------------- DECISION STATEMENT ----------------------------

// Decision node
export interface Decision extends ASTNode {
  type: 'Decision';
  name: string;
  body: DecisionBody;
  location: Location;
}
export const DecisionType = {
  type: 'Decision' as const,
};

// Decision body containing when blocks
export interface DecisionBody extends ASTNode {
  type: 'DecisionBody';
  statements: WhenBlock[];
  location: Location;
}
export const DecisionBodyType = {
  type: 'DecisionBody' as const,
};

// When block
export interface WhenBlock extends ASTNode {
  type: 'WhenBlock';
  conceptName: string;
  body: BlockBody | SingleAction;
  location: Location;
}
export const WhenBlockType = {
  type: 'WhenBlock' as const,
};

// When block body can be a block body or single action
export type WhenBlockBody = BlockBody | SingleAction;

// Block body containing multiple statements
export interface BlockBody extends ASTNode {
  type: 'BlockBody';
  qualifier?: string; // 'any' or 'all'
  statements: (WhenBlock | ActionStatement)[];
  location: Location;
}
export const BlockBodyType = {
  type: 'BlockBody' as const,
};

// Single action (do or use)
export interface SingleAction extends ASTNode {
  type: 'SingleAction';
  action: Action;
  location: Location;
}
export const SingleActionType = {
  type: 'SingleAction' as const,
};

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: 'ActionStatement';
  action: Action;
  location: Location;
}
export const ActionStatementType = {
  type: 'ActionStatement' as const,
};

// Do activity
export interface DoActivity extends ASTNode {
  type: 'DoActivity';
  activityName: string;
  location: Location;
}
export const DoActivityType = {
  type: 'DoActivity' as const,
};

// Use decision
export interface UseDecision extends ASTNode {
  type: 'UseDecision';
  decisionName: string;
  location: Location;
}
export const UseDecisionType = {
  type: 'UseDecision' as const,
};

// ------------------------- TERMINOLOGY STATEMENT --------------------------

// Terminology node
export interface Terminology extends ASTNode {
  type: 'Terminology';
  name: string;
  definition: TerminologyDefinition;
  location: Location;
}
export const TerminologyType = {
  type: 'Terminology' as const,
};

// Terminology definition can be a valueset, unknown, or system code
export type TerminologyDefinition =
  | TerminologyValueset
  | TerminologyUnknown
  | TerminologySystemCode;

// Terminology valueset
export interface TerminologyValueset extends ASTNode {
  type: 'TerminologyValueset';
  valuesetName: string;
  location: Location;
}
export const TerminologyValuesetType = {
  type: 'TerminologyValueset' as const,
};

// Terminology unknown
export interface TerminologyUnknown extends ASTNode {
  type: 'TerminologyUnknown';
  location: Location;
}
export const TerminologyUnknownType = {
  type: 'TerminologyUnknown' as const,
};

// Terminology system code
export interface TerminologySystemCode extends ASTNode {
  type: 'TerminologySystemCode';
  system: string;
  code: string;
  location: Location;
}
export const TerminologySystemCodeType = {
  type: 'TerminologySystemCode' as const,
};

// --------------------------- ACTIVITY STATEMENT ---------------------------

// Activity node
export interface Activity extends ASTNode {
  type: 'Activity';
  name: string;
  activityType: ActivityType;
  terminologyReference?: string;
  location: Location;
}
export const ActivityType = {
  type: 'Activity' as const,
};

// ---------------------------- CONCEPT STATEMENT ---------------------------

// Concept node
export interface Concept extends ASTNode {
  type: 'Concept';
  name: string;
  conceptType: ConceptType;
  valueType: ConceptValueType;
  definition: ConceptDefinition;
  provenance?: string;
  location: Location;
}
export const ConceptType = {
  type: 'Concept' as const,
};

// Concept definition can be coded by or inferred by
export type ConceptDefinition = CodedByDefinition | InferredByDefinition;

// Coded by definition
export interface CodedByDefinition extends ASTNode {
  type: 'CodedByDefinition';
  terminologyName: string;
  location: Location;
}
export const CodedByDefinitionType = {
  type: 'CodedByDefinition' as const,
};

// Inferred by definition
export interface InferredByDefinition extends ASTNode {
  type: 'InferredByDefinition';
  concept?: string;
  descriptiveLogic?: string;
  pattern?: string;
  location: Location;
}
export const InferredByDefinitionType = {
  type: 'InferredByDefinition' as const,
};

// Expression node for logical operations
export interface Expression extends ASTNode {
  type: 'Expression';
  operator: 'or' | 'and' | 'atom';
  left: Expression | string;
  right: Expression | string;
}
export const ExpressionType = {
  type: 'Expression' as const,
};

export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type Action = DoActivity | UseDecision;

export type ConceptType =
  | 'Communication'
  | 'CommunicationRequest'
  | 'Condition'
  | 'QuestionnaireTask'
  | 'QuestionnaireResponse'
  | 'MedicationRequest'
  | 'MedicationDispense'
  | 'MedicationAdministration'
  | 'MedicationStatement'
  | 'ImmunizationRequest'
  | 'Immunization'
  | 'ServiceRequest'
  | 'Procedure'
  | 'Observation';

export type ConceptValueType =
  | 'Quantity'
  | 'CodeableConcept'
  | 'string'
  | 'boolean'
  | 'integer'
  | 'Range'
  | 'Ratio'
  | 'SampledData'
  | 'time'
  | 'dateTime'
  | 'Period'
  | 'Attachment';

export type ActivityType =
  | 'CPGAdministerMedication'
  | 'CPGCollectInformation'
  | 'CPGCommunication'
  | 'CPGDispenseMedication'
  | 'CPGDocumentMedication'
  | 'CPGEnrollment'
  | 'CPGGenerateReport'
  | 'CPGHold'
  | 'CPGImmunization'
  | 'CPGMedicationRequest'
  | 'CPGProposeDiagnosis'
  | 'CPGRecordDetectedIssue'
  | 'CPGRecordInference'
  | 'CPGReportFlag'
  | 'CPGResume'
  | 'CPGServiceRequest'
  | 'CPGStop';
