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
}
export const FileType = {
  type: "CRL" as const,
};

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
export const DecisionType = {
  type: "Decision" as const,
};

// Decision body containing when blocks
export interface DecisionBody extends ASTNode {
  type: "DecisionBody";
  statements: WhenBlock[];
  location: Location;
}
export const DecisionBodyType = {
  type: "DecisionBody" as const,
};

// When block
export interface WhenBlock extends ASTNode {
  type: "WhenBlock";
  conceptName: string;
  body: BlockBody | SingleAction;
  location: Location;
}
export const WhenBlockType = {
  type: "WhenBlock" as const,
};

// When block body can be a block body or single action
export type WhenBlockBody = BlockBody | SingleAction;

// Block body containing multiple statements
export interface BlockBody extends ASTNode {
  type: "BlockBody";
  qualifier?: string; // 'any' or 'all'
  statements: (WhenBlock | ActionStatement)[];
  location: Location;
}
export const BlockBodyType = {
  type: "BlockBody" as const,
};

// Single action (do or use)
export interface SingleAction extends ASTNode {
  type: "SingleAction";
  action: Action;
  location: Location;
}
export const SingleActionType = {
  type: "SingleAction" as const,
};

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: "ActionStatement";
  action: Action;
  location: Location;
}
export const ActionStatementType = {
  type: "ActionStatement" as const,
};

// Do activity
export interface DoActivity extends ASTNode {
  type: "DoActivity";
  activityName: string;
  location: Location;
}
export const DoActivityType = {
  type: "DoActivity" as const,
};

// Use decision
export interface UseDecision extends ASTNode {
  type: "UseDecision";
  decisionName: string;
  location: Location;
}
export const UseDecisionType = {
  type: "UseDecision" as const,
};

// ------------------------- TERMINOLOGY STATEMENT --------------------------

// Terminology node
export interface Terminology extends ASTNode {
  type: "Terminology";
  name: string;
  definition: TerminologyDefinition;
  location: Location;
}
export const TerminologyType = {
  type: "Terminology" as const,
};

// Terminology definition can be a valueset, free text, or system code
export type TerminologyDefinition =
  | TerminologyValueset
  | TerminologyFreeText
  | TerminologySystemCode;

// Terminology valueset
export interface TerminologyValueset extends ASTNode {
  type: "TerminologyValueset";
  valuesetName: string;
  location: Location;
}
export const TerminologyValuesetType = {
  type: "TerminologyValueset" as const,
};

// Terminology free text (markdown, etc.)
export interface TerminologyFreeText extends ASTNode {
  type: "TerminologyFreeText";
  value: string;
  location: Location;
}
export const TerminologyFreeTextType = {
  type: "TerminologyFreeText" as const,
};

// Terminology system code
export interface TerminologySystemCode extends ASTNode {
  type: "TerminologySystemCode";
  system: string;
  code: string;
  location: Location;
}
export const TerminologySystemCodeType = {
  type: "TerminologySystemCode" as const,
};

// --------------------------- ACTIVITY STATEMENT ---------------------------

// Activity node
export interface Activity extends ASTNode {
  type: "Activity";
  name: string;
  request: ActivityType;
  terminologyReference?: string;
  activityTypeValue?: string;
  rationale?: string;
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
export const CodedFromDefinitionType = {
  type: "CodedFromDefinition" as const,
};

// Inferred from definition
// concept reference
export interface ConceptReference extends ASTNode {
  type: "ConceptReference";
  name: string;
}
export const ConceptReferenceType = {
  type: "ConceptReference" as const,
};

// instead of a binary-only LogicalExpression, split AND/OR into n‑ary:
export interface InformalAnd extends ASTNode {
  type: "AndExpression";
  terms: InferredFromExpression[]; // two or more
}
export const InformalAndType = {
  type: "AndExpression" as const,
};

export interface InformalOr extends ASTNode {
  type: "OrExpression";
  terms: InferredFromExpression[]; // two or more
}
export const InformalOrType = {
  type: "OrExpression" as const,
};
export interface NotExpression extends ASTNode {
  type: "NotExpression";
  expression: InferredFromExpression;
}
export const NotExpressionType = {
  type: "NotExpression" as const,
};

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
export const GroupExpressionType = {
  type: "GroupExpression" as const,
};

// inferred-from nodes
export interface InferredFromConcept extends ASTNode {
  type: "InferredFromDefinitionConcept";
  concept: string;
  pattern?: string;
}
export const InferredFromConceptType = {
  type: "InferredFromDefinitionConcept" as const,
};

export interface InferredFromDefinition extends ASTNode {
  type: "InferredFromDefinition";
  body: InferredFromConcept | InferredFromExpression;
}
export const InferredFromDefinitionType = {
  type: "InferredFromDefinition" as const,
};

export interface Location {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type Action = DoActivity | UseDecision;

export type { ActivityType } from "../grammar/activityTypes";
export type { ConceptType } from "../grammar/conceptTypes";
export type { ConceptValueType } from "../grammar/conceptValueTypes";
export { activityTypes } from "../grammar/activityTypes";
export { conceptTypes } from "../grammar/conceptTypes";
export { conceptValueTypes } from "../grammar/conceptValueTypes";
