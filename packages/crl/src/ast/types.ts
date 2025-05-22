import type { ActivityType } from "../grammar/activityTypes";
import type { ConceptType } from "../grammar/conceptTypes";
import type { ConceptValueType } from "../grammar/conceptValueTypes";

// Base AST Node interface
export interface ASTNode {
  type: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// CRL represents the root of the AST
export interface CRL extends ASTNode {
  type: "CRL";
  statements: Statement[];
  location: Location;
  header?: string;
}

// Union type for all possible statements
export type Statement = Decision | Concept | Activity | Terminology;

// --------------------------- DECISION STATEMENT ----------------------------

// Decision node
export interface Decision extends ASTNode {
  type: "Decision";
  name: string;
  body: DecisionBody;
  location: Location;
}

// Decision body containing when blocks
export interface DecisionBody extends ASTNode {
  type: "DecisionBody";
  statements: WhenBlock[];
  location: Location;
}

// When block
export interface WhenBlock extends ASTNode {
  type: "WhenBlock";
  conceptName: string;
  body: WhenBlockBody;
  location: Location;
}

// When block body can be a block body or action statement
export type WhenBlockBody = BlockBody | ActionStatement;

// Block body containing multiple statements
export interface BlockBody extends ASTNode {
  type: "BlockBody";
  qualifier?: string; // 'any' or 'all'
  statements: (WhenBlock | ActionStatement)[];
  location: Location;
}

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: "ActionStatement";
  action: Action;
  location: Location;
}

// Recommend activity
export interface RecommendActivity extends ASTNode {
  type: "RecommendActivity";
  activityName: string;
  location: Location;
}

// Use decision
export interface UseDecision extends ASTNode {
  type: "UseDecision";
  decisionName: string;
  location: Location;
}

// ------------------------- TERMINOLOGY STATEMENT --------------------------

// Terminology node
export interface Terminology extends ASTNode {
  type: "Terminology";
  name: string;
  body: TerminologyBodyLine[];
  location: Location;
}

// Union type for all possible lines in a terminology body
export type TerminologyBodyLine = TerminologyValueset | TerminologySystem | TerminologyCode;

// Terminology valueset line
export interface TerminologyValueset extends ASTNode {
  type: "TerminologyValueset";
  valuesetName: string;
  location: Location;
}

// Terminology system line
export interface TerminologySystem extends ASTNode {
  type: "TerminologySystem";
  system: string;
  location: Location;
}

// Terminology code line (can be multiple per system)
export interface TerminologyCode extends ASTNode {
  type: "TerminologyCode";
  code: string;
  location: Location;
}

// --------------------------- ACTIVITY STATEMENT ---------------------------

// Activity node
export interface Activity extends ASTNode {
  type: "Activity";
  name: string;
  body: ActivityBody;
  location: Location;
}

export interface ActivityBody extends ASTNode {
  type: "ActivityBody";
  request: ActivityRequest;
  withClause?: ActivityWith;
  becauseClause?: ActivityBecause;
  location: Location;
}

export interface ActivityRequest extends ASTNode {
  type: "ActivityRequest";
  activityType: ActivityType;
  doNotPerform?: boolean;
  location: Location;
}

export interface ActivityWith extends ASTNode {
  type: "ActivityWith";
  terminologyReference?: string;
  activityTypeValue?: string;
  location: Location;
}

export interface ActivityBecause extends ASTNode {
  type: "ActivityBecause";
  rationale: string;
  location: Location;
}

// ---------------------------- CONCEPT STATEMENT ---------------------------

// Concept node
export interface Concept extends ASTNode {
  type: "Concept";
  name: string;
  conceptType: ConceptType;
  valueType: ConceptValueType;
  definition: ConceptDefinition;
  meta?: string[];
  evidence?: string;
  location: Location;
}

// Concept definition can be coded from or inferred from
export type ConceptDefinition = CodedFromDefinition | InferredFromDefinition;

// Coded from definition
export interface CodedFromDefinition extends ASTNode {
  type: "CodedFromDefinition";
  terminologyName: string;
  location: Location;
}

// Inferred from definition
// concept reference
export interface ConceptReference extends ASTNode {
  type: "ConceptReference";
  name: string;
}

// instead of a binary-only LogicalExpression, split AND/OR into n‑ary:
export interface InformalAnd extends ASTNode {
  type: "AndExpression";
  terms: InferredFromExpression[]; // two or more
}

export interface InformalOr extends ASTNode {
  type: "OrExpression";
  terms: InferredFromExpression[]; // two or more
}

export interface NotExpression extends ASTNode {
  type: "NotExpression";
  expression: InferredFromExpression;
}

// any node that can appear in a logical narrative
export type InferredFromExpression =
  | ConceptReference
  | InformalAnd
  | InformalOr
  | GroupExpression
  | NotExpression;

// these are the parens
export interface GroupExpression extends ASTNode {
  type: "GroupExpression";
  expression: InferredFromExpression;
}

// inferred-from nodes
export interface InferredFromConcept extends ASTNode {
  type: "InferredFromDefinitionConcept";
  concept: string;
  patterns?: string[];
}

export interface InferredFromDefinition extends ASTNode {
  type: "InferredFromDefinition";
  body: InferredFromConcept | InferredFromExpression;
}

export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type Action = RecommendActivity | UseDecision;

export type { ActivityType } from "../grammar/activityTypes";
export type { ConceptType } from "../grammar/conceptTypes";
export type { ConceptValueType } from "../grammar/conceptValueTypes";
export { activityTypes } from "../grammar/activityTypes";
export { conceptTypes } from "../grammar/conceptTypes";
export { conceptValueTypes } from "../grammar/conceptValueTypes";
