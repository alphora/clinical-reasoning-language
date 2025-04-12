// Base AST Node interface
export interface ASTNode {
  type: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// File represents the root of the AST
export interface File extends ASTNode {
  type: 'File';
  statements: Statement[];
}
export const FileType = {
  type: 'File' as const,
};

// Union type for all possible statements
export type Statement = Decision | Terminology | Activity | Concept;

// --------------------------- DECISION STATEMENT ----------------------------

// Decision node
export interface Decision extends ASTNode {
  type: 'Decision';
  name: string;
  body: DecisionBody;
}
export const DecisionType = {
  type: 'Decision' as const,
};

// Decision body containing when blocks
export interface DecisionBody extends ASTNode {
  type: 'DecisionBody';
  statements: WhenBlock[];
}
export const DecisionBodyType = {
  type: 'DecisionBody' as const,
};

// When block
export interface WhenBlock extends ASTNode {
  type: 'WhenBlock';
  condition: string;
  body: WhenBlockBody;
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
}
export const BlockBodyType = {
  type: 'BlockBody' as const,
};

// Single action (do or use)
export interface SingleAction extends ASTNode {
  type: 'SingleAction';
  action: DoActivity | UseDecision;
}
export const SingleActionType = {
  type: 'SingleAction' as const,
};

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: 'ActionStatement';
  action: DoActivity | UseDecision;
}
export const ActionStatementType = {
  type: 'ActionStatement' as const,
};

// Do activity
export interface DoActivity extends ASTNode {
  type: 'DoActivity';
  activityName: string;
}
export const DoActivityType = {
  type: 'DoActivity' as const,
};

// Use decision
export interface UseDecision extends ASTNode {
  type: 'UseDecision';
  decisionName: string;
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
}
export const TerminologyValuesetType = {
  type: 'TerminologyValueset' as const,
};

// Terminology unknown
export interface TerminologyUnknown extends ASTNode {
  type: 'TerminologyUnknown';
}
export const TerminologyUnknownType = {
  type: 'TerminologyUnknown' as const,
};

// Terminology system code
export interface TerminologySystemCode extends ASTNode {
  type: 'TerminologySystemCode';
  system: string;
  code: string;
}
export const TerminologySystemCodeType = {
  type: 'TerminologySystemCode' as const,
};

// --------------------------- ACTIVITY STATEMENT ---------------------------

// Activity node
export interface Activity extends ASTNode {
  type: 'Activity';
  name: string;
  activityType: string;
  terminologyReference?: string;
}
export const ActivityType = {
  type: 'Activity' as const,
};

// ---------------------------- CONCEPT STATEMENT ---------------------------

// Concept node
export interface Concept extends ASTNode {
  type: 'Concept';
  name: string;
  conceptType: string;
  valueType: string;
  provenance?: string;
  definition: ConceptDefinition;
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
}
export const CodedByDefinitionType = {
  type: 'CodedByDefinition' as const,
};

// Inferred by definition
export interface InferredByDefinition extends ASTNode {
  type: 'InferredByDefinition';
  pattern?: string;
  concept?: string;
  descriptiveLogic?: string;
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
