import type { ActivityType } from "../grammar/activityTypes";
import type { ConceptType } from "../grammar/conceptTypes";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import type { ParameterType } from "../grammar/parameterTypes";

// Base AST Node interface
export interface ASTNode {
  type: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// CRL represents the root of the AST.
//
// v2.1.0: `library` is REQUIRED. The parser rejects files without a
// `library "Foo".` line; the AST type carries it as a required field.
// Every CRL file declares its library identity — the "anonymous file"
// mode that existed in v2.0.0 is gone.
export interface CRL extends ASTNode {
  type: "CRL";
  header?: string;
  library: LibraryDeclaration;
  includes: Include[];
  statements: Statement[];
  location: Location;
}

// Union type for all possible statements. v2.2: parameter declarations
// land as the fifth top-level kind (issue #59). Reference resolution +
// per-library uniqueness for parameters are Todo 2; emit is Todo 3;
// extension UI is Todo 4.
export type Statement = Decision | Concept | Activity | Terminology | Parameter;

// File-level library identity declaration. Required in v2.1.0.
// npm packaging IS the version system — no version field on the AST node.
export interface LibraryDeclaration extends ASTNode {
  type: "LibraryDeclaration";
  name: string;
  location: Location;
}

// File-level dependency on an EXTERNAL library (one shipped in a node_modules
// package's `crl.libraries`). Local sibling libraries in the same project
// auto-resolve via the `"Lib"."X"` qualifier syntax — no `include` line
// needed for them.
//
// `alias` is populated only when the source carried `include "Foo" as "Bar".`.
// Emergency aliasing only — used when a local library name collides with the
// package library name. References inside this file use the alias
// (`"Bar"."X"`) to disambiguate from the local "Foo".
export interface Include extends ASTNode {
  type: "Include";
  name: string;
  alias?: string;
  location: Location;
}

// v2.1.0 qualified-reference shape.
//
// A reference to a concept/decision/activity/terminology may be:
//   - BARE — just the declaration name; resolves to same-file declarations.
//     Carried as a plain `string` on AST nodes for backward compatibility.
//   - QUALIFIED — `"Lib"."X"` source syntax; resolves to the named library.
//     Carried as a `QualifiedReference` object on AST nodes.
//
// Use the helpers `getRefName`, `getRefLibrary`, `isQualifiedRef` to read
// ref fields uniformly. Most consumers want only the bare name; they can use
// `getRefName(ref)` and ignore the library part.
export interface QualifiedReference extends ASTNode {
  type: "QualifiedReference";
  libraryName: string;
  name: string;
  location: Location;
}

export type ReferenceName = string | QualifiedReference;

/** True when the reference carries an explicit library qualifier. */
export function isQualifiedRef(ref: ReferenceName): ref is QualifiedReference {
  return typeof ref !== "string";
}

/** The declaration-side name (the second `"..."` of a qualified ref, or the bare name). */
export function getRefName(ref: ReferenceName): string {
  return typeof ref === "string" ? ref : ref.name;
}

/** The library qualifier, or null for a bare reference. */
export function getRefLibrary(ref: ReferenceName): string | null {
  return typeof ref === "string" ? null : ref.libraryName;
}

/** Human-readable form, e.g. `"Shared"."Foo"` or just `"Foo"`. */
export function refDisplay(ref: ReferenceName): string {
  return typeof ref === "string" ? `"${ref}"` : `"${ref.libraryName}"."${ref.name}"`;
}

// --------------------------- DECISION STATEMENT ----------------------------

// Decision node
export interface Decision extends ASTNode {
  type: "Decision";
  name: string;
  body: DecisionBody;
  location: Location;
}

// Block combination qualifier. Over branches: `first` = ordered first-match,
// `all` = every matching branch. Over actions: `any` = offer one, `all` = do all.
// (`any` over branches and `first` over actions are rejected by the validator,
// not the grammar.)
export type BlockQualifier = "first" | "any" | "all";

// A branch is a `when` block or the `otherwise` catch-all.
export type BranchBlock = WhenBlock | OtherwiseBlock;

// A block member is a branch or a bare action. A block is homogeneous (all
// branches XOR all actions) — enforced by the grammar.
export type BlockMember = BranchBlock | ActionStatement;

// Decision body: a block of branches with an optional combination qualifier.
export interface DecisionBody extends ASTNode {
  type: "DecisionBody";
  qualifier?: BlockQualifier;
  statements: BranchBlock[];
  location: Location;
}

// When block
export interface WhenBlock extends ASTNode {
  type: "WhenBlock";
  conceptName: ReferenceName;
  body: WhenBlockBody;
  location: Location;
}

// Otherwise (catch-all) branch — no condition. Legal only as the last member of
// a `first:` block (validator-enforced).
export interface OtherwiseBlock extends ASTNode {
  type: "OtherwiseBlock";
  body: WhenBlockBody;
  location: Location;
}

// When/otherwise block body can be a block body or action statement
export type WhenBlockBody = BlockBody | ActionStatement;

// Block body containing multiple statements (homogeneous: branches XOR actions)
export interface BlockBody extends ASTNode {
  type: "BlockBody";
  qualifier?: BlockQualifier;
  statements: BlockMember[];
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
  activityName: ReferenceName;
  location: Location;
}

// Use decision
export interface UseDecision extends ASTNode {
  type: "UseDecision";
  decisionName: ReferenceName;
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

// --------------------------- PARAMETER STATEMENT ---------------------------

// Runtime parameter declaration (issue #59). 0..* per library; the name
// is quoted. The `paramType` field is conceptually a `ConceptType |
// ConceptValueType` (per-context resource OR data type), exposed at
// runtime as `string` via the generated wrapper.
//
// Reference resolution / per-library uniqueness / ref-slot acceptance
// are Todo 2. CQL emit (`parameter "Name" Type` OR `context Patient` /
// `context Practitioner` per CQL spec) is Todo 3.
export interface Parameter extends ASTNode {
  type: "Parameter";
  name: string;
  parameterType: ParameterType;
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
  terminologyReference?: ReferenceName;
  activityTypeValue?: string;
  location: Location;
}

export interface ActivityBecause extends ASTNode {
  type: "ActivityBecause";
  rationale: string;
  location: Location;
}

// ---------------------------- CONCEPT STATEMENT ---------------------------

// Concept node (v0.7)
// - conceptType (`type is X.`) is OPTIONAL for composition/predicate body
//   kinds (deduced from body refs when omitted); REQUIRED for asserted body
//   (valuesets don't carry FHIR-type info).
// - valueTypes (`value type is X.`) is OPTIONAL and 0..*; lazily required
//   when something depends on it, then deduced from type's default.
export interface Concept extends ASTNode {
  type: "Concept";
  name: string;
  conceptType?: ConceptType;
  valueTypes: ConceptValueType[];
  // The concept's own local code (`- code is `…`.`). System = the package's
  // local domain (implicit). Present => locally assertable; absent => read-only.
  code?: string;
  // Optional: a concept may be representations-only (no top-level definition).
  definition?: ConceptDefinition;
  // `possible representation:` entries (ADR 0001 §3). May be empty.
  representations: Representation[];
  meta?: string[];
  evidence?: string;
  location: Location;
}

// Concept definition has 3 kinds per v0.7:
//   - CodedFromDefinition    : `coded from "Valueset"`    (asserted; ref is a valueset)
//   - DefinedAsDefinition    : `defined as (...)`         (composition over concept refs)
//   - DefinitionIsDefinition : `definition is <narrative>` (catalog-matchable predicate)
export type ConceptDefinition =
  | CodedFromDefinition
  | DefinedAsDefinition
  | DefinitionIsDefinition;

// Coded from definition — binds to a NAMED terminology / value set (an external
// source). The concept's own local code lives on `Concept.code` (ADR 0001 §2).
export interface CodedFromDefinition extends ASTNode {
  type: "CodedFromDefinition";
  terminologyName: ReferenceName;
  location: Location;
}

// A `possible representation:` — an anonymous concept that inherits the
// enclosing concept's fields except those it overrides (ADR 0001 §3). A
// NON-LOCAL (external) source shape: `type` + a named `coded from`.
export interface Representation extends ASTNode {
  type: "Representation";
  conceptType?: ConceptType;
  valueTypes: ConceptValueType[];
  terminologyName?: ReferenceName; // named coded-from
  location: Location;
}

// Concept reference — bare quoted name. Resolves to a concept at validation
// time (single namespace).
export interface ConceptReference extends ASTNode {
  type: "ConceptReference";
  name: string;
}

// --------------------------- DEFINED AS (v0.7) ---------------------------
//
// A concept's `defined as` body has two shapes:
//   1. Bare reference to a named concept
//   2. Parenthesized composition with sem-or / sem-and / sem-not operators
//
// Composition operates on bare refs only. Narrative lives in concept bodies
// with `definition is`.

export interface DefinedAsDefinition extends ASTNode {
  type: "DefinedAsDefinition";
  body: DefinedAsBareRef | DefinedAsComposition;
}

export interface DefinedAsBareRef extends ASTNode {
  type: "DefinedAsBareRef";
  ref: ReferenceName;
}

export interface DefinedAsComposition extends ASTNode {
  type: "DefinedAsComposition";
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
  ref: ReferenceName;
}

export interface CompositionGroup extends ASTNode {
  type: "CompositionGroup";
  expression: CompositionExpression;
}

// --------------------------- DEFINITION IS DEFINITION (v0.7) --------------
//
// `definition is <narrative>.` body — a clinical predicate matched against the
// catalog. The narrative phrase is a single sequence of narrative elements.
// A predicate-kind concept is `concept "X": - type is Y. - definition is <narrative>.`

export interface DefinitionIsDefinition extends ASTNode {
  type: "DefinitionIsDefinition";
  body: NarrativeClause;
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
  value: ReferenceName;
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
