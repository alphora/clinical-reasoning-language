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
export type Statement = Decision | Concept | Activity | Terminology | Parameter | Criterion;

// File-level library identity declaration. Required in v2.1.0.
// npm packaging IS the version system — no version field on the AST node.
export interface LibraryDeclaration extends ASTNode {
  type: "LibraryDeclaration";
  name: string;
  /** #203 Todo 2: library-scope `@tag` metadata (raw backtick bodies; the `@tag` parse is the validator's job).
   *  Omitted when the `library` declaration carries no `- meta is` lines. */
  meta?: MetaEntry[];
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

/**
 * Same-library qualified-ref normalization — the SINGLE authority (was duplicated across the FHIR
 * emitter's closureOrchestrator/decision lanes and the inference walk). Idempotent: a bare ref → bare
 * ref; a qualified ref whose library matches `libraryName` byte-for-byte → its bare name; a qualified
 * ref with a different library → unchanged (a genuine cross-library ref).
 *
 * `libraryName` MUST be `ast.library.name` (the declared CRL library name), not the slug — matches the
 * validator's referenceResolver semantics.
 */
export function normalizeLocalRef(ref: ReferenceName, libraryName: string): ReferenceName {
  if (!isQualifiedRef(ref)) return ref;
  if (getRefLibrary(ref) === libraryName) return getRefName(ref);
  return ref;
}

// --------------------------- DECISION STATEMENT ----------------------------

// Decision node
export interface Decision extends ASTNode {
  type: "Decision";
  name: string;
  body: DecisionBody;
  /** #203 Todo 2: decision-scope `@tag` metadata (raw backtick bodies; the `@tag` parse is the validator's job).
   *  Omitted when the decision body carries no leading `- meta is` lines. */
  meta?: MetaEntry[];
  location: Location;
}

// --------------------------- CRITERION STATEMENT ---------------------------
//
// #224 ii: a named, reusable decision-guard sub-expression. `criterion "X": - when
// ( <cond> ).` — the body is the SAME `BranchCondition` grammar as a `when` guard
// (`and`/`or`/`not` over concept/criterion refs; #224 iii.3). A criterion is
// AUTHORING-DRY: it inline-EXPANDS into the guard DNF and has NO FHIR mapping of
// its own (the emitter emits nothing for it). A `when`/criterion-body ref to a
// criterion is a distinct `BranchConditionCriterionRef` (below), replaced by this
// `condition` at the criterion-expansion seam.
export interface Criterion extends ASTNode {
  type: "Criterion";
  name: string;
  condition: BranchCondition;
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

// A decision branch guard: a boolean expression over concept refs (`and`/`or`,
// `not`, parens). Introduced with #224 decision-layer boolean guards.
// Every node carries its own `location` so per-operand diagnostics, find-refs,
// and duplicate-operand (`"A" and "A"`) identity work without a fallback to the
// whole `when` line.
//
// #224 iii.2: `not` is a distinct `BranchConditionNot` member. Negation DOES lower —
// but never to one compound CQL boolean: a single negated literal has a CQL carrier
// (`not Coalesce(...)`, iii.1) and any composition is pushed to negation-normal-form
// (`toNNF`, branchCondition.ts) then DNF'd into arms of single SIGNED literals, each
// emitting its own `PlanDefinition.action.condition`. See `BranchConditionLiteral`.
export type BranchCondition =
  | BranchConditionRef
  | BranchConditionAnd
  | BranchConditionOr
  | BranchConditionCriterionRef
  | BranchConditionNot;

// #224 ii.1b: provenance stamped on the BOUNDARY-ROOT of a criterion substitution
// during `expandCriteria` — the criterion whose (expanded) body this subtree is, plus
// the location of the criterion REF that was replaced. Emit IGNORES it (expansion is
// byte-identical to hand-inlined); it exists for rendering the author's criterion name
// at the boundary (A7) and for source correspondence. Present ONLY on expanded output,
// never on a source AST. For coincident boundaries (a bare-alias chain `X → Y → A`,
// whose boundary-roots are the same physical node) the OUTERMOST criterion wins (the
// author wrote `X`), so the stamp overwrites unconditionally.
export interface SourcedFromCriterion {
  name: string;
  refLocation: Location;
}

export interface BranchConditionRef extends ASTNode {
  type: "BranchConditionRef";
  ref: ReferenceName;
  location: Location;
  sourcedFromCriterion?: SourcedFromCriterion;
}

// #224 ii: a guard atom that references a named `criterion` (NOT a concept). The
// parser produces a `BranchConditionRef` for every bare atom; the criterion-
// CLASSIFICATION pass rewrites a ref whose name resolves to a criterion into this
// distinct node. Making it a distinct union member is the TRIPWIRE: the criterion-
// EXPANSION seam replaces it with the criterion's condition, and every SEMANTIC
// consumer (eval / DNF / emit) treats an un-expanded `BranchConditionCriterionRef`
// as a hard error — so a missed expansion is a loud throw, never a silent
// misresolved concept. SOURCE-side consumers (validation, find-refs, structure)
// handle it directly. `sourcedFromCriterion` (ii.1b) is stamped on the expanded
// Ref/And/Or nodes that REPLACE this one — never on `BranchConditionCriterionRef`
// itself, since an expanded tree contains none.
export interface BranchConditionCriterionRef extends ASTNode {
  type: "BranchConditionCriterionRef";
  ref: ReferenceName;
  location: Location;
  // #224 ii.1b: type-enforce "a criterion ref never carries an expansion marker" — an
  // expanded tree contains no criterion ref. `?: never` also makes `sourcedFromCriterion`
  // a known (absent) property across the whole `BranchCondition` union, so a consumer can
  // read it off any member without a type narrow.
  sourcedFromCriterion?: never;
}

export interface BranchConditionAnd extends ASTNode {
  type: "BranchConditionAnd";
  operands: BranchCondition[]; // invariant: length >= 2
  location: Location;
  sourcedFromCriterion?: SourcedFromCriterion; // #224 ii.1b — see SourcedFromCriterion
}

export interface BranchConditionOr extends ASTNode {
  type: "BranchConditionOr";
  operands: BranchCondition[]; // invariant: length >= 2
  location: Location;
  sourcedFromCriterion?: SourcedFromCriterion; // #224 ii.1b — see SourcedFromCriterion
}

// #224 iii.2: a UNARY negation over a single operand. In a SOURCE tree the operand may
// be any `BranchCondition` (`not "A"`, `not ("A" or "B")`, `not "Criterion"`, `not not
// "A"`). `toNNF` (branchCondition.ts) pushes negation to the leaves via De Morgan, so a
// NORMALIZED tree only ever has a `Not` DIRECTLY over a `BranchConditionRef` (a signed
// literal — see `BranchConditionNegatedLiteral`). `sourcedFromCriterion` may sit on a
// `Not` when a criterion's expanded body root is a negation (MarkableCondition,
// criterionExpansion.ts); the NNF marker-transfer rule moves it onto the rewritten root.
export interface BranchConditionNot extends ASTNode {
  type: "BranchConditionNot";
  operand: BranchCondition; // unary; exactly one. May be undefined-ish only on a malformed editor buffer.
  location: Location;
  sourcedFromCriterion?: SourcedFromCriterion; // #224 ii.1b — see SourcedFromCriterion
}

// #224 iii.2: a `Not` STATICALLY guaranteed to wrap a single concept ref — the only
// shape a negation may take in a DNF arm (post-`toNNF`). The intersection puts the
// "negation is a single atom" invariant in the type system: emit reads `lit.operand.ref`
// without a runtime narrow. `branchConditionDNF` asserts this at the `Not` case.
export type BranchConditionNegatedLiteral = BranchConditionNot & { operand: BranchConditionRef };

// #224 iii.2: a DNF ARM ATOM — a positive concept ref OR a negated single-ref literal.
// `branchConditionDNF` returns `BranchConditionLiteral[][]`. A positive-only guard yields
// only `BranchConditionRef` atoms (byte-identical to the pre-iii.2 `BranchConditionRef[][]`
// output — zero golden drift); a negated literal carries its own located `Not` node.
export type BranchConditionLiteral = BranchConditionRef | BranchConditionNegatedLiteral;

// When block. The guard is a `BranchCondition` expression (was a single
// `conceptName: ReferenceName` before #224). Read guard refs ONLY through the
// helpers in `ast/branchCondition.ts` — never re-walk the union inline.
export interface WhenBlock extends ASTNode {
  type: "WhenBlock";
  condition: BranchCondition;
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

// A per-action guard on a menu item: `unless "C"` drops the item when C holds;
// `only when "C"` includes it only when C holds. An applicability polarity
// (lowered at emit time, unless -> not), NOT a sem-* composition operator.
// Legal only on action-block members (any:/all:), never on an inline
// `when … then <action>` or `otherwise` (grammar-enforced).
export type ActionGuardPolarity = "unless" | "only-when";

export interface ActionGuard extends ASTNode {
  type: "ActionGuard";
  polarity: ActionGuardPolarity;
  conceptName: ReferenceName;
  location: Location;
}

// Action statement (do or use)
export interface ActionStatement extends ASTNode {
  type: "ActionStatement";
  action: Action;
  guard?: ActionGuard;
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
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this; do not
   * touch the parser). Carries the shared `codesystem` DECLARATION name to use
   * for lowered concept-level local codes (`code is`). The slice-4b lowering
   * pass (`lowerLocalCodes`) sets ONE shared domain name (e.g. "<Library> Local
   * Codes") on EVERY synthetic terminology's system line so the emitter can
   * collapse the N otherwise-distinct "<Concept> System" codesystem decls (all
   * sharing one URL) into ONE shared `codesystem <name>: '<url>'` + N codes.
   *
   * When ABSENT (the normal hand-authored case) the emitter falls back to its
   * historical `"<emitName> System"` codesystem decl name — current behavior.
   * `name` is only the codesystem DECLARATION identifier; the per-concept
   * terminology `name` (used for code identifiers / retrieve refs) is unchanged.
   */
  name?: string;
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

/**
 * The re-exportable SOURCE layers an Interface re-export concept can republish
 * from — the closed value set of `Concept.__interfaceSourceLayer`. A subset of
 * the layered-emit `Layer` values (only the source-typed determinations are
 * re-exportable). Declared here (not in `cql-emitter/layeredEmit.ts`) to avoid an
 * `ast → cql-emitter` import cycle; `buildInterfaceReexports` only ever assigns
 * one of these (its F3 guard rejects every other layer).
 */
export type InterfaceSourceLayer = "LocalSource" | "RecordSource" | "Inferred";

// A representation's explicit `value element is <path>.` — the FHIR model-info property path
// of its datum, plus the path's own source location so Todo 2's validator can anchor a
// "path X not on type Y" diagnostic at the `value element is` line. Shared by `Concept`
// (the local representation's explicit value element) and `Representation` (a posrep's) so the
// two carry an identical, non-drifting shape.
export interface ValueElement {
  path: string;
  location: Location;
}

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
  /**
   * The concept's LOCAL representation's explicit `value element` path — present only
   * when the author DEVIATES from the implicit-standard `Observation.value` (design of
   * record §"Shape rules"; the standard shape is unwritten but Todo-2-checked). Carries
   * its own location so a "path X not on type Y" diagnostic anchors at the
   * `value element is` line, not the whole concept. Grammar-permissive: a `value element`
   * without a `code is`/`type` parses here and is rejected by Todo 2.
   */
  valueElement?: ValueElement;
  // Optional: a concept may be representations-only (no top-level definition).
  definition?: ConceptDefinition;
  // `possible representation:` entries (ADR 0001 §3). May be empty.
  representations: Representation[];
  meta?: MetaEntry[];
  evidence?: string;
  location: Location;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this; do not touch
   * the parser). Marks a concept synthesized by the layered CQL emit's Interface
   * synthesis (`layeredEmit.ts`) — a re-export `define "X": <policyId>-<srcLayer>."X"`
   * that lives in the `<policyId>-Interface` library and re-publishes a
   * decision/action-guard concept from its OWN source layer. `classifyStatementLayer`
   * returns `"Interface"` for a concept carrying this marker; `buildNameLayerMaps`
   * EXCLUDES it (its body is PRE-QUALIFIED so the re-qualifier is never consulted,
   * and registering it would self-collide with the source-layer concept of the
   * same name). Absent on every hand-authored concept.
   */
  __interfaceReexport?: boolean;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). The SOURCE
   * layer (`"LocalSource"` / `"RecordSource"` / `"Inferred"`) an Interface
   * re-export concept (`__interfaceReexport`) re-publishes from. The case-feature
   * CQL emit reads it to pick the Interface define body:
   *   - `"Inferred"`     → `Inferred."X".satisfied()`
   *   - `"LocalSource"`  → `LocalSource."X".asTruths().satisfied()`
   *   - `"RecordSource"` → plain re-export `RecordSource."X"` (legacy, non-truth-set lane).
   * Set by `buildInterfaceReexports`. Absent on every other concept.
   *
   * Fix 4 [nit] — typed as the closed `InterfaceSourceLayer` union (not bare
   * `string`) so the `emitConceptBody` switch arms and the
   * `buildInterfaceReexports` producer are compiler-checked for typos (a stray
   * `"LocalSouce"` would no longer slip through).
   */
  __interfaceSourceLayer?: InterfaceSourceLayer;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). Marks the
   * INFERRED half of a both-representation (`code is` + `defined as`) concept that
   * `lowerLocalCodes` SPLIT into a LocalSource retrieve twin + this Inferred twin.
   * The case-feature Inferred emit must FOLD IN the direct local-source retrieve,
   * emitting `LocalSource."X".asTruths() union (<the original defined-as inference>)`.
   * The string value is the concept's own name; the emit synthesizes the explicit
   * `<localSourceLibrary>."X"` qualified leaf (NOT a bare same-name ref, which would
   * be ambiguous against — or self-recurse into — the Inferred twin). Absent on
   * every other concept.
   */
  __bothRepFoldInLocalSource?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). The
   * MERGE POLICY for a both-representation split (set on the Inferred twin
   * ALONGSIDE `__bothRepFoldInLocalSource`). Decided at lowering/match time so
   * the emitter branches on the marker rather than pattern-sniffing the body:
   *   - `"union"`   — the historical `code is` + `defined as` fold-in
   *     (`LocalSource."X".asTruths() union (<inference>)`). Every existing
   *     both-rep is "union"; behavior is unchanged.
   *   - `"recency"` — the `code is` + `definition is age today <cmp> <Q>`
   *     patient-age merge (`<cmp>` = a sanctioned age comparator, #215):
   *     RECENCY-SELECT between the newest valid local Observation and the live
   *     computed age, then lift back to a truth-set.
   * Absent on non-both-rep concepts.
   */
  __bothRepMerge?: "union" | "recency";
  /**
   * SYNTHETIC-EMITTER-ONLY. For a `"recency"` both-rep Inferred twin, the
   * threshold of the `age today <cmp> <Q>` computed arm, as an already-emitted CQL
   * quantity literal (e.g. `18 'years'` / `6 'months'`, #257 T2). Carried so the
   * recency emit renders `CRLCommon.<op>(CRLCommon.<computeFn>(), <this>)` without
   * re-matching the narrative. Set in LOCK-STEP with `__bothRepRecencyOp` and
   * `__recencyComputeFn`. Absent unless `__bothRepMerge === "recency"`.
   */
  __bothRepRecencyThreshold?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY. For a `"recency"` both-rep Inferred twin, the age
   * COMPARATOR op (#215): `"AtLeast"` (≥, `at least`), `"AtMost"` (≤, `at most`),
   * or `"Below"` (<, `under` / `younger than`). Set in LOCK-STEP with
   * `__bothRepRecencyThreshold` and `__recencyComputeFn`; the recency emit renders
   * `CRLCommon.<this>(CRLCommon.<computeFn>(), <threshold>)`. Absent unless
   * `__bothRepMerge === "recency"`.
   */
  __bothRepRecencyOp?: AgeRecencyOp;
  /**
   * SYNTHETIC-EMITTER-ONLY. #257 (age slice) T1 — the stable id of the built
   * recency-projection override backing this twin (`age-today-over-patient-birthdate`).
   * Set in LOCK-STEP with the recency markers when lowering resolves a `code is` +
   * age `source representation` (`resolveRecencyProjection`). The recency emit looks the
   * override up (`recencyOverrideById`) to render its CQL helper — so age is ONE caller of
   * the override mechanism, not a hardcoded engine branch. (The compute fn is NOT on the
   * override; it is per-unit — carried on `__recencyComputeFn`, #257 T2.) Absent unless
   * `__bothRepMerge === "recency"`.
   */
  __recencyOverrideId?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY. #257 (age slice) T2 — the no-arg CRLCommon compute fn for this
   * recency twin's computed arm: `"AgeAt"` (whole YEARS) or `"AgeInMonths"` (whole MONTHS). The
   * matcher CHOSE it from the projection's threshold unit (the ONLY choice point); the recency emit
   * renders `CRLCommon.<this>()` so the compute fn matches the threshold's unit through the
   * unit-blind comparator overload (#215) — never re-derived from the unit at emit. Set in
   * LOCK-STEP with `__bothRepRecencyThreshold`/`__bothRepRecencyOp`. Absent unless
   * `__bothRepMerge === "recency"`.
   */
  __recencyComputeFn?: AgeComputeFn;
  /**
   * SYNTHETIC-EMITTER-ONLY. #257 (age slice) T1 — marks a concept whose top-level
   * `definition` was SYNTHESIZED by lowering from a posrep's `value projection` (the age
   * migration), NOT authored. The `definition is age today` retirement (validator +
   * emit-boundary guard) must NEVER fire on such a definition: the narrative is
   * compiler-internal (a projection re-homed as a definition to satisfy the current
   * Inferred classification / `emitDefinitionIs` path), not an authorable surface form. A
   * vestige to remove when posrep emit is first-class (#257). Absent on every authored
   * concept, so a scan of the AUTHORED AST (validation + the pre-lowering retirement scan)
   * never encounters it.
   */
  __synthesizedFromPosrep?: boolean;
}

/** The sanctioned patient-age comparator ops (#215), carried as canonical
 * pattern names: `AtLeast` (≥), `AtMost` (≤), `Below` (< — `under`/`younger than`). */
export type AgeRecencyOp = "AtLeast" | "AtMost" | "Below";

/** The sanctioned age-today COMPUTE fns (#257 T2), carried as no-arg CRLCommon pattern
 * names: `AgeAt` (whole YEARS) and `AgeInMonths` (whole MONTHS). Each MUST pair with a
 * threshold of the matching unit — the matcher pairs them and the shared
 * `sanctionedAgeTodayOp` classifier rejects a mismatch (`AgeAt()` + months, `AgeInMonths()`
 * + years), which would miscompile through the unit-blind comparator overload (#215). The
 * marker `__recencyComputeFn` and `AgeProjectionArgs.computeFn` are the shape twins. */
export type AgeComputeFn = "AgeAt" | "AgeInMonths";

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
  /**
   * SYNTHETIC-EMITTER-ONLY. Overrides the FHIR resource type of the EMITTED
   * retrieve (`[<resource>: <ref>]`). The CRL parser/builder NEVER set this —
   * hand-authored `coded from` always leaves it `undefined`. It is set ONLY by
   * the `lowerLocalCodes` pass, which forces `"Observation"` for the synthetic
   * local-source retrieve (every `code is` query is an Observation/boolean
   * determination) WITHOUT disturbing the concept's author-declared `type is`
   * (`Concept.conceptType`), which the Phase-2/3 Provider/Payer inferred
   * transform still needs. When absent, the emitter keeps the historical
   * `conceptType ?? "Observation"` behavior, so hand-authored `coded from`
   * emit is byte-identical.
   */
  retrieveResourceType?: string;
  location: Location;
}

// A `source representation:` (posrep) — an anonymous SELF-DESCRIBING representation of
// the same clinical concept from a NON-LOCAL (external) source shape. Per the converged
// model (representation-model.md refinement 5) a posrep does NOT inherit the enclosing
// concept's fields — it is always fully explicit. The grammar/AST stay PERMISSIVE (fields
// optional so a partial posrep still parses/builds); Todo 2's validator REJECTS an
// incomplete posrep. A posrep carries `type` + `value element` + `value type`, an optional
// named `coded from`, and an optional rep-level `value projection is` PROJECTOR (its own term).
export interface Representation extends ASTNode {
  type: "Representation";
  conceptType?: ConceptType;
  valueTypes: ConceptValueType[];
  terminologyName?: ReferenceName; // named coded-from
  /**
   * The FHIR model-info property path of this rep's datum (`Observation.value`,
   * `Patient.birthDate`, `ImagingStudy.started`). Path + its own location so Todo 2's
   * validator anchors a "path X not on type Y" diagnostic at the `value element is` line.
   * Present only when the posrep authored one (grammar-permissive; the validator requires
   * it on a posrep). A single-segment path lexes and is rejected by Todo 2.
   */
  valueElement?: ValueElement;
  /**
   * Rep-level `value projection is` PROJECTOR — projects THIS representation's own datum to
   * the concept's value (a type-crossing transformation, e.g. `age today at least 18 years`
   * over `Patient.birthDate`: `dateTime` datum -> `boolean` concept value). Its OWN term and
   * OWN node (`ValueProjection`), DISTINCT from `Concept.definition` (a concept-level
   * `definition is` calculation over CONCEPTS): the node class itself carries the meaning, so
   * no placement-based discrimination is needed. Because the keyword is distinct, a misplaced
   * concept-level `definition is` can no longer silently bind here (it is a parse error) — the
   * only remaining shape defect is a value projection that references another concept (it is
   * datum-local), which the validator rejects.
   */
  valueProjection?: ValueProjection;
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
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition;
}

export interface DefinedAsBareRef extends ASTNode {
  type: "DefinedAsBareRef";
  ref: ReferenceName;
}

// `defined as exists ("Concept")` — explicit existence over a SINGLE concept (present →
// true, absent → false; closed-world). The third `DefinedAsDefinition.body` member,
// parallel to DefinedAsBareRef so downstream switches stay trivially
// exhaustiveness-checked. TOP-LEVEL ONLY (not a composition atom) — the design of record
// says promote a source to its own concept instead of nesting existence. `ref` preserves
// a qualified reference's location. Consumers that walk `defined as` references (reference
// resolution, cycle detection, emit closure, project index, provenance) MUST treat this
// like a bare ref so the referenced concept is tracked.
export interface DefinedAsExists extends ASTNode {
  type: "DefinedAsExists";
  ref: ReferenceName;
}

/**
 * Guard for `defined as exists (...)` code paths that do NOT lower it. The construct PARSES and
 * builds — its reference is tracked by every reference walker (resolution, cycles, emit closure,
 * project index, provenance). STANDARD-lane CQL lowering landed in #265 (`emitDefinedAs` →
 * `exists (<X>)`; CMS69's `Active Pregnancy Diagnosis` is the first consumer). The paths that STILL
 * call this — the case-feature truth-set ("inferred") emit lane and the run_decision/CEL evaluator —
 * do not yet lower existence (tracked in #270); they call this to fail LOUD rather than misread the
 * node. Originally the safety net the design review (disc 394, gpt56 point #1) required once the
 * `DefinedAsDefinition.body` union was widened.
 */
export function definedAsExistsNotLowered(where: string): never {
  throw new Error(
    "`defined as exists` is not lowered on this path (" +
      where +
      ") — STANDARD-lane CQL lowering landed in #265, but the case-feature truth-set lane and the " +
      "run_decision evaluator do not yet lower existence (#270). The construct parses and its " +
      "reference is tracked like a bare ref.",
  );
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

// `value projection is <narrative>` — the REP-LEVEL projector (concept-model redesign). Its
// own node (not a reused `DefinitionIsDefinition`) so the construct is self-describing: a
// `ValueProjection` IS a rep-level datum-to-concept-value projection by identity, no
// field-placement discrimination. Same narrative grammar as `definition is`, distinct keyword.
// Lives ONLY on `Representation.valueProjection`. A projection is datum-local, so its narrative
// must NOT reference other concepts (the validator rejects that).
export interface ValueProjection extends ASTNode {
  type: "ValueProjection";
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

// #154/#203 shape (b): a metadata annotation line. `text` = the inner backtick body (`@tag: …`); `location` = the
// FULL `- meta is `…`.` source line span (the MetaLineContext), so the MV cockpit can rewrite the exact line and
// diagnostics can anchor at it. `text` is deliberately NOT `source-at-location` — write-back reads the full line
// via `location`, never by re-wrapping `text`.
export interface MetaEntry {
  text: string;
  location: Location;
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
