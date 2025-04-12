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

// Union type for all possible statements
export type Statement = Decision | Terminology | Activity | Concept;

// Decision node
export interface Decision extends ASTNode {
  type: 'Decision';
  name: string;
  whenClauses: WhenClause[];
}

// When clause
export interface WhenClause extends ASTNode {
  type: 'WhenClause';
  condition: string;
  qualifier?: 'any' | 'all';
  body: WhenClauseBody;
}

// When clause body can be a single action or a block
export type WhenClauseBody = SingleAction | BlockBody;

// Single action (do or use)
export interface SingleAction extends ASTNode {
  type: 'SingleAction';
  action: DoAction | UseAction;
}

// Block body containing multiple statements
export interface BlockBody extends ASTNode {
  type: 'BlockBody';
  qualifier?: 'any' | 'all';
  statements: BlockStatement[];
}

// Block statement can be a when clause or an action
export type BlockStatement = WhenClause | ActionStatement;

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: 'ActionStatement';
  action: DoAction | UseAction;
}

// Do action
export interface DoAction extends ASTNode {
  type: 'DoAction';
  name: string;
}

// Use action
export interface UseAction extends ASTNode {
  type: 'UseAction';
  decisionName: string;
}

// Terminology node
export interface Terminology extends ASTNode {
  type: 'Terminology';
  name: string;
  definition: TerminologyDefinition;
}

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

// Terminology unknown
export interface TerminologyUnknown extends ASTNode {
  type: 'TerminologyUnknown';
}

// Terminology system code
export interface TerminologySystemCode extends ASTNode {
  type: 'TerminologySystemCode';
  system: string;
  code: string;
}

// Activity node
export interface Activity extends ASTNode {
  type: 'Activity';
  name: string;
  activityType: string;
  of?: string; // Optional reference to another concept
}

// Concept node
export interface Concept extends ASTNode {
  type: 'Concept';
  name: string;
  conceptType: string;
  valueType: string;
  provenance?: string;
  definition: ConceptDefinition;
}

// Concept definition can be coded by or inferred by
export type ConceptDefinition = CodedByDefinition | InferredByDefinition;

// Coded by definition
export interface CodedByDefinition extends ASTNode {
  type: 'CodedByDefinition';
  terminologyName: string;
}

// Inferred by definition
export interface InferredByDefinition extends ASTNode {
  type: 'InferredByDefinition';
  pattern?: string;
  concept?: string;
  expression?: Expression;
}

// Expression node for logical operations
export interface Expression extends ASTNode {
  type: 'Expression';
  operator: 'or' | 'and' | 'atom';
  left: Expression | string;
  right: Expression | string;
}
