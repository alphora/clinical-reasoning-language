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
export type Statement = Decision | Concept | Activity | Terminology | Inference;

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

// Concept reference — bare quoted name. Resolves to a Concept OR Inference
// at validation time (shared namespace per v0.5).
export interface ConceptReference extends ASTNode {
  type: "ConceptReference";
  name: string;
}

// --------------------------- INFERRED FROM (v0.5) -------------------------
//
// A concept's `inferred from` body has two shapes:
//   1. Bare reference to a named concept or inference
//   2. Parenthesized composition with sem-or / sem-and / sem-not operators
//
// Composition operates on bare refs only. Narrative lives in `inference`
// declarations, not in concept bodies.

export interface InferredFromDefinition extends ASTNode {
  type: "InferredFromDefinition";
  body: InferredFromBareRef | InferredFromComposition;
}

export interface InferredFromBareRef extends ASTNode {
  type: "InferredFromBareRef";
  ref: string;
}

export interface InferredFromComposition extends ASTNode {
  type: "InferredFromComposition";
  expression: CompositionExpression;
}

// Composition expression tree. Operators are "semantic boolean" — operands
// are typed refs (concept or inference), not booleans. See
// project_sem-composition-operators memory.
export type CompositionExpression =
  | SemOrExpression
  | SemAndExpression
  | SemNotExpression
  | CompositionRef
  | CompositionGroup;

export interface SemOrExpression extends ASTNode {
  type: "SemOrExpression";
  terms: CompositionExpression[]; // two or more (n-ary)
}

export interface SemAndExpression extends ASTNode {
  type: "SemAndExpression";
  terms: CompositionExpression[]; // two or more (n-ary)
}

export interface SemNotExpression extends ASTNode {
  type: "SemNotExpression";
  expression: CompositionExpression;
}

export interface CompositionRef extends ASTNode {
  type: "CompositionRef";
  ref: string;
}

export interface CompositionGroup extends ASTNode {
  type: "CompositionGroup";
  expression: CompositionExpression;
}

// --------------------------- INFERENCE (v0.5) -----------------------------
//
// Names a narrative predicate. Body is a single narrative phrase. Optional
// meta/evidence lines mirror Concept body. Inference is referenced from
// concepts via shared namespace; no `type`/`valuetype` declared (predicate,
// not typed entity).

export interface Inference extends ASTNode {
  type: "Inference";
  name: string;
  meta?: string[];
  evidence?: string;
  body: NarrativeClause;
  location: Location;
}

// Narrative structure. NDisjunction / NConjunction are flattened into
// NarrativeElement directly (no wrapper). NSingleton is collapsed in
// the AST builder — `("X")` becomes just the inner NConceptRef.

export interface NarrativeClause extends ASTNode {
  type: "NarrativeClause";
  elements: NarrativeElement[]; // structural stream for Todo 3 template-match
  location: Location;
}

export type NarrativeElement =
  | NConceptRef
  | NWord
  | Quantity
  | NDisjunction
  | NConjunction;

export interface NConceptRef extends ASTNode {
  type: "NConceptRef";
  value: string;
  location: Location;
}

export interface NWord extends ASTNode {
  type: "NWord";
  value: string;
  location: Location;
}

// Unified quantity node — used by both narrative-position and arg-value-position.
// Unit is REQUIRED (no bare numbers; design choice for clinical-correctness).
export interface Quantity extends ASTNode {
  type: "Quantity";
  value: number;
  unit: string;
  location: Location;
}

// In-arg disjunction: `("A" or "B")`. Constructs a Disjunction<T> value as a
// pattern argument. Lowercase `or` per catalog convention (not boolean).
export interface NDisjunction extends ASTNode {
  type: "NDisjunction";
  disjuncts: ArgValue[];
  location: Location;
}

// In-arg conjunction: `("A" and "B")`. Symmetric to NDisjunction.
// Catalog v0.5.5 added Conjunction<T> type to match.
export interface NConjunction extends ASTNode {
  type: "NConjunction";
  conjuncts: ArgValue[];
  location: Location;
}

// ArgValue reuses NConceptRef and Quantity to avoid duplicate AV* nodes.
// argValue accepts refs/quantities/nested-groups only — no inner narrative
// (grammar restriction; extract complex disjuncts to named inferences).
export type ArgValue =
  | NConceptRef
  | Quantity
  | NDisjunction
  | NConjunction;

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
