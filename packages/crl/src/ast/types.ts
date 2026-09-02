import type { ActivityType } from "../grammar/activityTypes";
import type { ConceptType } from "../grammar/conceptTypes";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
import type { ConceptShape } from "../grammar/conceptShapes";
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
// AUTHORING-DRY: it has no FHIR mapping of its own. It lowers to ONE boolean CQL
// `define` (#236 — the tree→DAG collapse), which guards REFERENCE by name; the
// inline expansion into the guard DNF is the case-feature/atom-closure reading of
// it, not its emitted form. A `when`/criterion-body ref to a criterion is a
// distinct `BranchConditionCriterionRef` (below), replaced by this `condition` at
// the criterion-expansion seam.
//
// ⚠ The emitter also SYNTHESIZES criteria the author never wrote: a compound branch
// guard whose negation cannot lower to conditions on one action is emitted as its
// own criterion and excluded by name (`ast/guardDefines.ts`).
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

export interface BranchConditionRef extends ASTNode {
  type: "BranchConditionRef";
  ref: ReferenceName;
  location: Location;
}

// #224 ii: a guard atom that references a named `criterion` (NOT a concept). The parser
// produces a `BranchConditionRef` for every bare atom; the criterion-CLASSIFICATION pass
// rewrites a ref whose name resolves to a criterion into this distinct node. #236: a
// criterion ref is a first-class signed LITERAL — it lowers to a REFERENCED boolean define
// (CQL/FHIR) and is evaluated by REFERENCE (CRE), never inline-expanded. Making it a
// distinct union member keeps a CONCEPT-ONLY collector from silently absorbing it as a
// concept: such collectors (`branchConditionConceptRefsStrict`) throw loudly. SOURCE-side
// consumers (validation, find-refs, structure, DNF, arm-count, CRE eval) handle it directly.
export interface BranchConditionCriterionRef extends ASTNode {
  type: "BranchConditionCriterionRef";
  ref: ReferenceName;
  location: Location;
}

export interface BranchConditionAnd extends ASTNode {
  type: "BranchConditionAnd";
  operands: BranchCondition[]; // invariant: length >= 2
  location: Location;
}

export interface BranchConditionOr extends ASTNode {
  type: "BranchConditionOr";
  operands: BranchCondition[]; // invariant: length >= 2
  location: Location;
}

// #224 iii.2: a UNARY negation over a single operand. In a SOURCE tree the operand may
// be any `BranchCondition` (`not "A"`, `not ("A" or "B")`, `not "Criterion"`, `not not
// "A"`). `toNNF` (branchCondition.ts) pushes negation to the leaves via De Morgan, so a
// NORMALIZED tree only ever has a `Not` DIRECTLY over a `BranchConditionRef` or a
// `BranchConditionCriterionRef` (a signed literal — see `BranchConditionNegatedLiteral`).
export interface BranchConditionNot extends ASTNode {
  type: "BranchConditionNot";
  operand: BranchCondition; // unary; exactly one. May be undefined-ish only on a malformed editor buffer.
  location: Location;
}

// #224 iii.2: a `Not` STATICALLY guaranteed to wrap a single concept ref — the only
// shape a negation may take in a DNF arm (post-`toNNF`). The intersection puts the
// "negation is a single atom" invariant in the type system: emit reads `lit.operand.ref`
// without a runtime narrow. `branchConditionDNF` asserts this at the `Not` case.
export type BranchConditionNegatedLiteral = BranchConditionNot & { operand: BranchConditionRef };

// #236/#274: a `Not` STATICALLY guaranteed to wrap a single CRITERION ref — the negated
// counterpart of a criterion literal. Post-#236 a criterion ref is a first-class signed
// DNF literal (referenced as a named define, not inline-expanded), so `not <criterion>` is
// one arm: `not Coalesce("crit", false)`. NOTE: this shares `.type === "BranchConditionNot"`
// with `BranchConditionNegatedLiteral`, so the two negated literals discriminate at the
// OPERAND level (`operand.type`), NOT by a switch on the node's own `.type` — a consumer
// that must tell concept-negation from criterion-negation narrows on `lit.operand.type`.
export type BranchConditionNegatedCriterionLiteral = BranchConditionNot & {
  operand: BranchConditionCriterionRef;
};

// #224 iii.2 / #236: a DNF ARM ATOM — a positive concept ref, a negated single concept-ref,
// a positive CRITERION ref, or a negated single criterion-ref. `branchConditionDNF` returns
// `BranchConditionLiteral[][]`. A positive concept-only guard yields only `BranchConditionRef`
// atoms (byte-identical to the pre-iii.2 output — zero golden drift). A criterion literal
// (#236) lowers to ONE `text/cql-identifier` condition referencing the criterion's boolean
// define — NEVER its inline expansion — so a criterion contributes ONE arm regardless of its
// body's shape (the tree→DAG collapse that fixes the #236 blow-up). Since criterion and
// concept literals share no `.type` in the positive case but a negated literal is a
// `BranchConditionNot` in BOTH cases, so a consumer discriminates on the wrapped operand's `.type`.
export type BranchConditionLiteral =
  | BranchConditionRef
  | BranchConditionNegatedLiteral
  | BranchConditionCriterionRef
  | BranchConditionNegatedCriterionLiteral;

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
export type InterfaceSourceLayer = "LocalPrimitives" | "ExternalPrimitives" | "Inferences";

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
/**
 * One term of a `record-union` twin's space (#189 P2). A term names WHICH emitted define supplies part of
 * the concept's records, and WHICH LAYER it lives in — the layer decides the include qualifier, and
 * getting it wrong emits a cross-family reference.
 *
 * `constructed` is P2's new arm: a producer stage's value, built into a record of the concept's `type is`
 * by a generated constructor (design P1). It carries no define of its own — the expression is rendered at
 * the union site — so it is identified by the stage that produced it.
 */
export type RecordUnionTerm =
  /** A LocalPrimitives retrieve — the local `code is` arm. */
  | { kind: "local-primitives"; define: string }
  /** An ExternalPrimitives retrieve — a `source representation` whose `type is` MATCHES the concept's. */
  | { kind: "external-primitives"; define: string }
  /** A PRODUCER stage's constructed candidate, identified by its 0-based stage index. */
  | { kind: "constructed"; stageIndex: number };

export interface Concept extends ASTNode {
  type: "Concept";
  name: string;
  conceptType?: ConceptType;
  valueTypes: ConceptValueType[];
  /**
   * The concept's declared PUBLISHED-value cardinality (`- shape is Scalar|Record|RecordSet.`,
   * #189). Scalar ⇒ the concept publishes a single reduced value (a reduction is owed);
   * Record ⇒ a single selected record; RecordSet ⇒ the set of records.
   *
   * ⭐ `undefined` means THE AUTHOR DID NOT DECLARE ONE — it is NOT a synonym for `Scalar`.
   *
   * ⚠ This field used to be REQUIRED, with the builder normalizing an omitted `shape is` to
   * `"Scalar"` "so no consumer re-interprets undefined". That normalization DESTROYED the
   * distinction between "the author declared Scalar" and "the author said nothing", and the
   * distinction is load-bearing: a case-feature `cpg-featureExpression` needs ONE record, a
   * Scalar cannot be one, so the emitter SYNTHESIZED a records define to bridge the gap — a
   * reduction no author wrote (charter §4.0: emit translates CRL, it does not invent CRL
   * expression). The emitter could not raise the honest author-time error instead, because by
   * then the fact it needed to report had already been normalized away.
   *
   * So consumers MUST distinguish the two. An undeclared shape is an author-time question
   * ("which does this publish?"), never a silent default.
   */
  shape?: ConceptShape;
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
  /**
   * ⭐⭐ The concept's ANSWER OPTION SET (`- value from "VS".`) — the coded values a user is OFFERED for
   * this question. Emits the case-feature SD's `value[x].binding`, which the questionnaire generator expands
   * into inline `answerOption` codings.
   *
   * ⚠ CONCEPT-LEVEL, NOT rep-local, and that is the whole point: 5 of the 9 affected concepts have NO
   * representation at all to hang it on, and post-multi-rep a rep-local spelling could not say which
   * representation's set wins.
   *
   * ⚠⚠ A DIFFERENT AXIS FROM `coded from`, which scopes the RETRIEVE. Naming the same set for both is
   * legal but usually wrong — it filters non-members out of the retrieve, so a record carrying an unoffered
   * code vanishes into the same empty set as no record, collapsing a determinate `false` into `unknown`.
   *
   * ⚠ OFFERED, not ADMISSIBLE. This does NOT constrain what the concept may hold: an `ElementDefinition`
   * binding governs FHIR conformance, never evaluation, so a value outside the set still reaches CQL. A
   * genuine admissibility constraint would have to gate every value-producing leg (local, CEL, $extract,
   * source candidates, producers, the CRE) and is filed as its own slice. MEASURED: the generated dropdown is
   * byte-identical at every binding strength, so strength buys nothing here.
   */
  valueFrom?: { terminologyName: ReferenceName; location: Location };
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
   * layer (`"LocalPrimitives"` / `"ExternalPrimitives"` / `"Inferences"`) an Interface
   * re-export concept (`__interfaceReexport`) re-publishes from. The case-feature
   * CQL emit reads it to pick the Interface define body:
   *   - `"Inferences"`     → `Inferences."X".satisfied()`
   *   - `"LocalPrimitives"`  → `LocalPrimitives."X".asTruths().satisfied()`
   *   - `"ExternalPrimitives"` → plain re-export `ExternalPrimitives."X"` (legacy, non-truth-set lane).
   * Set by `buildInterfaceReexports`. Absent on every other concept.
   *
   * Fix 4 [nit] — typed as the closed `InterfaceSourceLayer` union (not bare
   * `string`) so the `emitConceptBody` switch arms and the
   * `buildInterfaceReexports` producer are compiler-checked for typos (a stray
   * `"LocalSouce"` would no longer slip through).
   */
  __interfaceSourceLayer?: InterfaceSourceLayer;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). #189 Slice-C
   * boundary 1 — the TOTALITY mode of an Interface re-export whose source layer is
   * `"Inferences"`, deciding how the façade collapses it to the decision's boolean
   * surface:
   *   - `"total-boolean"` → the source Inferences concept is a REDUCTION that publishes
   *     a TOTAL boolean (`exists`/`Count`/a `Coalesce(...)`-guarded `most recent`), so
   *     the re-export is a BARE re-export `<Inferences>."X"` (a plain CQL Boolean has no
   *     `.satisfied()` method — calling it would be ill-typed).
   *   - `"truth-set"` (or ABSENT) → the source Inferences concept is a `defined as`
   *     truth-set determination, collapsed with `<Inferences>."X".satisfied()` (the
   *     legacy lane).
   * Set at SYNTHESIS time in `buildInterfaceReexports` (which can see the source
   * concept's definition + declared shape); the façade emit (`emitConceptBody`)
   * cannot re-derive it because its per-layer `conceptByName` is layer-isolated.
   * Only meaningful when `__interfaceSourceLayer === "Inferences"`. Absent on every
   * other concept.
   */
  __interfaceReexportMode?: "total-boolean" | "truth-set" | "record-boolean-value";
  /**
   * SYNTHETIC-EMITTER-ONLY. ⭐ #189 — the PROVEN boolean carrier a `record-boolean-value` façade reads
   * (`emit/recordBooleanGuard.ts`), resolved at synthesis and set in lock-step with that mode.
   *
   * ⚠ Carried rather than re-derived: the Interface emitter's `conceptByName` is layer-isolated and cannot
   * see the source concept, which is the same reason the mode itself is decided at synthesis.
   */
  __recordBooleanCarrier?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY (#189 null/pause). Marks a PURE QUESTION concept (set at `lowerLocalCodes`, where the
   * AUTHORED shape is still visible; the Interface re-export copies it) — a locally-coded boolean determination nothing can compute, hence UNKNOWN until answered.
   * Its body emits the THREE-STATE `answeredValue()` read instead of the `asTruths().satisfied()` collapse,
   * which folds "no answer record" and "answered false" into one `false`. Set in `buildInterfaceReexports`
   * (the Interface emitter is layer-isolated and cannot see the source concept's definition).
   */
  __pureQuestion?: true;
  /**
   * SYNTHETIC-EMITTER-ONLY (#189 null/pause, T5 step 2b). Marks the INFERENCES TWIN of a pure question — the
   * define that carries its THREE-STATE read (`<LocalPrimitives twin>.answeredValue()`).
   *
   * REFACTOR:grounded — re-derived from the charter ("composition is strong Kleene, and totality belongs at
   * the arm, never per operand") and from RUNNING the emitter on both the layered and the direct paths, not
   * from the adjacent truth-set lane.
   *
   * ⭐ WHY THE TWIN EXISTS AT ALL. A pure question has no `definition is`/`defined as`, so before 2b it emitted
   * only a LocalPrimitives RETRIEVE, and the three-state read lived exclusively on the Interface façade. A
   * `defined as` COMPOSITION is an Inference, and `LAYER_ORDER` forbids Inferences referencing Interface — so
   * a composition over a question resolved its leaf to the retrieve (a `List<FHIR.Observation>`, not a
   * Boolean) and could only be lowered by the truth-set collapse this slice deletes. Giving the question a
   * first-class Inferences define makes the qualifier resolve the leaf to a Boolean with NO change to the
   * composition renderer (`compositionLeafPolicy.concept` is `(qualified) => qualified`), and the Interface
   * facade then re-exports that define BARE — one read, one place, every consumer.
   *
   * ⭐ THE INVARIANT, and it is load-bearing: a `__pureQuestionRead` concept ALWAYS carries a
   * `DefinedAsDefinition` whose body is a `DefinedAsBareRef` naming its records twin. The marker and that ref
   * are set together in `lowerLocalCodes`, and `emitPureQuestionRead` throws if they disagree. The ref is real
   * rather than a compiler-private field precisely so the shared cross-layer/cross-library requalification
   * applies to it unchanged — the marker changes only how the ref is RENDERED (`.answeredValue()` appended
   * instead of a bare alias).
   *
   * ⚠ It must also declare `Scalar` + a single `boolean` value type — `answeredValue()` returns a Boolean, so
   * a differently-declared concept would publish a shape its author never wrote (charter §3/§4, no magic).
   * `lowerLocalCodes` only ever sets the marker via `isPureQuestionConcept`, which enforces both; the emit
   * asserts it again because `emitCQLFromAST` is a validator-free public entry.
   *
   * Its LocalPrimitives half carries `__loweringRole: "records-impl"` and this determination carries
   * `"public-determination"` — the same split `code is` + `definition is exists this` already uses.
   */
  __pureQuestionRead?: true;
  /**
   * SYNTHETIC-EMITTER-ONLY (#189 O3). Marks an Interface re-export whose Inferences SOURCE is a
   * both-representation RECENCY MERGE of an ANSWERABLE determination — i.e. a merge that is deliberately
   * THREE-STATE (no outer `Coalesce`), because a determination NO arm establishes is UNKNOWN, not false.
   *
   * ⚠ The re-export EMITS the same bare `Inferences."X"` as a total-boolean façade — bare is what propagates
   * the null — so this marker exists to correct the LEDGER, not the text: without it the façade enrolls
   * `total("facade-delegated")` over a now-three-state operand and the whole-boundary proof fails with
   * "composite is not provably total". Exactly the `__pureQuestion` pattern, for the merge family, and set at
   * the same synthesis site for the same reason (the Interface emitter is layer-isolated).
   */
  __interfaceThreeStateMerge?: true;
  /**
   * SYNTHETIC-EMITTER-ONLY (#189). On an Inferences twin whose concept carried a local `code is` AND a
   * `definition is <selection> "<Named>"`: the name of its LocalPrimitives records twin, so the reduction is
   * applied to `this` ∪ the named set rather than the named set alone.
   *
   * ⭐ That union IS the semantics, not an optimisation: "a reduction over a NAMED set also reduces the
   * concept's OWN records" (operator, 2026-08-29) — which is what makes a coded concept's own assertions
   * compete with the records it reduces. Without it, `Greatest Weight`'s answer slot would be written and
   * never read.
   */
  __reductionLocalUnion?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). Marks the
   * INFERRED half of a both-representation (`code is` + `defined as`) concept that
   * `lowerLocalCodes` SPLIT into a LocalPrimitives retrieve twin + this Inferences twin.
   * The case-feature Inferences emit must FOLD IN the direct local-source retrieve,
   * emitting `LocalPrimitives."X".asTruths() union (<the original defined-as inference>)`.
   * The string value is the concept's own name; the emit synthesizes the explicit
   * `<localSourceLibrary>."X"` qualified leaf (NOT a bare same-name ref, which would
   * be ambiguous against — or self-recurse into — the Inferences twin). Absent on
   * every other concept.
   */
  __bothRepFoldInLocalPrimitives?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY (#189 P2). The ORDERED TERMS of a `record-union` twin's space.
   *
   * The union used to be implicit — exactly TWO terms whose define names the emitter DERIVED
   * (`<foldIn>` and `<foldIn> Source`). That is fine while a concept has exactly a local arm and one
   * posrep, and it cannot express the space P2 needs:
   *
   *   local `code is` retrieve  ∪  n posrep retrieves  ∪  n constructed candidates
   *
   * (design P2-D3's four-term taxonomy — a posrep whose `type is` differs from the concept's is
   * PROJECTED into a constructed candidate, not unioned raw, or the space is type-incoherent).
   *
   * So the terms are LISTED rather than derived. Order is the authored order and is preserved; the union
   * itself is commutative, but the emitted text is a golden and must be stable.
   *
   * ⚠ Set in LOCK-STEP with `__bothRepMerge === "record-union"`. The emitter throws on a marker without
   * terms rather than falling back to the derived pair — a silent fallback would re-hide exactly the
   * implicitness this replaces.
   */
  __recordUnionTerms?: readonly RecordUnionTerm[];
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). The
   * MERGE POLICY for a both-representation split (set on the Inferences twin
   * ALONGSIDE `__bothRepFoldInLocalPrimitives`). Decided at lowering/match time so
   * the emitter branches on the marker rather than pattern-sniffing the body:
   *   - `"union"`   — the historical `code is` + `defined as` fold-in
   *     (`LocalPrimitives."X".asTruths() union (<inference>)`). Every existing
   *     both-rep is "union"; behavior is unchanged.
   *   - `"recency"` — the `code is` + `definition is age today <cmp> <Q>`
   *     patient-age merge (`<cmp>` = a sanctioned age comparator, #215):
   *     RECENCY-SELECT between the newest valid local Observation and the live
   *     computed age, then lift back to a truth-set.
   *   - `"recency-value"` — the #189 Piece 1 GENERAL both-rep value merge
   *     (`code is` + `definition is most recent this` + a `coded from` `source
   *     representation`, e.g. `Covered Device`): a `Scalar<value-type>`-or-null
   *     recency merge (`crossRepRecencyMergeExpr`) between the newest local record's
   *     value and the newest source record's value. NON-boolean (unlike `"recency"`),
   *     so it is NOT a total-scalar-boolean; the interface fold reads member-EXISTENCE
   *     over the LP/EP retrieves, not this merge. Descriptors on `__recencyValueDescriptors`.
   * Absent on non-both-rep concepts.
   */
  /**
   * `"record-union"` (#189) — a `code is` + ONE simple `coded from` `source representation`, `shape is
   * RecordSet`, NO definition. The Inferences twin publishes the UNION of the local records and the source
   * records (charter §3: "a concept unions the records from all its representations"). Distinct from
   * `"union"`, which is the BOOLEAN truth-set fold (`.asTruths() union …`); a record-valued concept has no
   * truth-set, so it emits a plain `union` of the two retrieves.
   */
  __bothRepMerge?: "union" | "recency" | "recency-value" | "record-union";
  /**
   * SYNTHETIC-EMITTER-ONLY. For a `"recency"` both-rep Inferences twin, the
   * threshold of the `age today <cmp> <Q>` computed arm, as an already-emitted CQL
   * quantity literal (e.g. `18 'years'` / `6 'months'`, #257 T2). Carried so the
   * recency emit renders `CRLCommon.<op>(CRLCommon.<computeFn>(), <this>)` without
   * re-matching the narrative. Set in LOCK-STEP with `__bothRepRecencyOp` and
   * `__recencyComputeFn`. Absent unless `__bothRepMerge === "recency"`.
   */
  __bothRepRecencyThreshold?: string;
  /**
   * SYNTHETIC-EMITTER-ONLY. For a `"recency"` both-rep Inferences twin, the age
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
   * Inferences classification / `emitDefinitionIs` path), not an authorable surface form. A
   * vestige to remove when posrep emit is first-class (#257). Absent on every authored
   * concept, so a scan of the AUTHORED AST (validation + the pre-lowering retirement scan)
   * never encounters it.
   */
  __synthesizedFromPosrep?: boolean;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). #189 Slice B2a — the resolved
   * `local-exact` effective-representation descriptor (`emit/effectiveRepresentation.ts`
   * `EffectiveRepresentationDescriptor`), derived from the ORIGINAL authored concept in
   * `lowerLocalCodes` (BEFORE `code` is cleared) and attached to the retargeted `most recent this`
   * reduction concept so `emitConceptBody` renders the select-newest sort (`recency`) + value read
   * (`valueElement`/`datumValueType`) from ONE source of truth. Typed `unknown` DELIBERATELY: the AST
   * layer must not depend on the emit layer (`effectiveRepresentation` imports FROM `ast/types`); the
   * emit read site casts to `EffectiveRepresentationDescriptor`. This is the general §4.2 attachment
   * (Slice C broadens it to the full `DerivationOutcome` on both twins). Absent on every other concept.
   */
  __effectiveDescriptor?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). #189 Piece 1 (disc 506) — the resolved
   * `[local-exact, source]` effective-representation descriptors of a `"recency-value"` both-rep merge twin, derived
   * from the ORIGINAL authored concept in `lowerLocalCodes` (BEFORE `code`/`representations` are cleared for layer
   * classification) and attached to the Inferences merge twin so the merge emit renders both arms' value read
   * (`valueElement`/`datumValueType`) + recency select (`recency`) from ONE source of truth. Shape at runtime is
   * `{ local: EffectiveRepresentationDescriptor; source: EffectiveRepresentationDescriptor }`. Typed `unknown`
   * DELIBERATELY (same convention as `__effectiveDescriptor`): the AST layer must not depend on the emit layer
   * (`effectiveRepresentation` imports FROM `ast/types`); the emit read site casts. Absent unless
   * `__bothRepMerge === "recency-value"`.
   */
  /**
   * SYNTHETIC-EMITTER-ONLY (#189). What a both-representation recency MERGE twin publishes — the concept's
   * DECLARED `shape is`, carried onto the twin so the emit does not re-derive it:
   *   `"value"`  — `shape is Scalar`: the newest record's VALUE (a `Scalar<T>` or null).
   *   `"record"` — `shape is Record`: the newest RECORD, selected over the UNION of the arms.
   * ⚠ The two emit DIFFERENT expressions, and a record-shaped descriptor carries NO `valueElement`, so a twin
   * that lost this marker would emit `where O.undefined is FHIR.undefined` — untranslatable CQL under
   * `success: true`. Set in lock-step with `__recencyValueDescriptors` at lowering;
   * `resolveRecencyValueConcept().publishes` is the single authority for it.
   */
  __recencyMergePublishes?: "value" | "record";
  __recencyValueDescriptors?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). ⭐ #189 — the PRODUCER stages of a
   * both-representation merge, RESOLVED at lowering into everything the emit needs to construct each
   * candidate (`emit/producerCandidate.ts` `ProducerCandidateSpec[]`).
   *
   * ⚠ CARRIED BECAUSE THE AUTHORED PIPELINE DOES NOT SURVIVE LOWERING: the merge twin replaces `definition`
   * with a synthetic `most recent <self>`, so a `<producer>, then most recent this` concept would otherwise
   * reach the emitter with no trace of its producer and silently union only its two retrieve arms.
   *
   * Set in lock-step with the `constructed` entries in `__recordUnionTerms` — the terms say WHAT is in the
   * space, these say HOW each constructed member is built.
   */
  __recencyProducerSpecs?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY. ⭐ #189 — the PROJECTED source arm's construction spec
   * (`emit/producerCandidate.ts` `ProjectedSourceSpec`), set in lock-step with a `source-projected`
   * descriptor. Present only when the concept's `source representation` carries a `value projection`.
   */
  __projectedSourceSpec?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY. ⭐⭐ #189 — the BOUNDARY TRANSFORM's spec (`emit/producerCandidate.ts`
   * `BoundaryTransformSpec`): how to normalise this concept's PUBLISHED record into its case feature.
   *
   * ⚠ PRESENCE IS THE GATE. It is set ONLY when the concept publishes a RECORD and its space holds an
   * UNPROJECTED `external-primitives` term — the one arm that can put a non-conforming record in the space.
   * Everything else (the local retrieve, producer candidates, a projected source arm) conforms BY
   * CONSTRUCTION, so a transform there would emit a check whose else-branch is provably dead.
   */
  __boundaryTransformSpec?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY. ⭐⭐ #189 — the HETEROGENEOUS source arm's construction spec
   * (`emit/producerCandidate.ts` `ValueReadSourceSpec`): how to turn each source record of a DIFFERENT
   * resource type into a record of the concept's own, carrying the source's datum as its value.
   *
   * ⚠ Set only when the source resource differs from the concept's. A same-type arm unions directly — it
   * is already the right shape — and a `value projection` arm takes `__projectedSourceSpec` instead.
   */
  __valueReadSourceSpec?: unknown;
  /**
   * SYNTHETIC-EMITTER-ONLY (the CRL parser/builder NEVER sets this). #189 Slice C boundary 2 (2a) — the
   * LOWERING ROLE of a concept the lowering passes produced/retargeted, so the totality-ledger enrollment
   * (`emitConcept`) picks its obligation SOURCE without marker-sniffing (disc 439 crit #1/#2):
   *   - `"records-impl"`         — a reduction-lane records twin `"X Records"` (a RecordSet retrieve; no
   *                                boolean define) → manufactured `not-applicable`.
   *   - `"source-impl"`          — the LocalPrimitives retrieve HALF of a both-representation split (its
   *                                determination is the sibling Inferences twin) → manufactured `not-applicable`.
   *   - `"public-determination"` — the emitted PUBLIC determination (a retargeted reduction, a pure `code is`
   *                                lowered form, a both-rep Inferences twin, a standalone age posrep) → inherits
   *                                the AUTHORED obligation (`EmitOptions.authoredObligations`, keyed by name).
   *   - `"interface-facade"`     — a `buildInterfaceReexports` façade → manufactured obligation (a
   *                                `…satisfied()` façade is intrinsically total; a bare total-boolean
   *                                re-export delegates to its source reduction).
   * ABSENT ⇒ an authored concept no pass mutated (the none-lane fast-path returns the input untouched); such
   * a concept is classified in place at enrollment. This is a STRING union so `ast/types` gains no emit-layer
   * import (the obligation TYPE lives in `emit/booleanTotality`; only the emit read site references it).
   * (A dedicated `age-helper` role is deferred to 2b — patient-age determinations currently tag
   * `public-determination` and inherit the authored age obligation; no separate helper define is synthesized.)
   */
  __loweringRole?: "records-impl" | "source-impl" | "public-determination" | "interface-facade";
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
  | DefinitionIsDefinition
  | ReductionDefinition;

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
   * ⚠ RETIRED on a representation. Accepted only until the corpus finishes migrating; the grammar drops it
   * with the last fixture.
   *
   * This used to say "the validator requires it on a posrep" — Rule A.1, which is gone. A source
   * representation carries `type is <Resource>.` and, when the resource has a coded retrieve,
   * `coded from "<VS>".` — nothing else. The GOAL settles it: `fixtures/obesity/` declares four source
   * representations across three authoring options and not one carries a value element or a value type.
   *
   * Which element carries the datum is MODEL INFO (`fhirValueModel.valueReadElementsAdmitting`), and its
   * type is the CONCEPT's. Requiring the author to name it is what once forced them to state something
   * FALSE — `value element is Condition.code.` + `value type is boolean.` on an existence rep, asserting
   * that element yields a boolean when it yields a CodeableConcept.
   *
   * ⚠ Do NOT re-add a consumer. The last one (`effectiveRepresentation`'s source arm) made that arm dead by
   * construction: it demanded a field the author could no longer supply, so it could only ever defer.
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
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition | DefinedAsBooleanComposition;
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

export interface DefinedAsComposition extends ASTNode {
  type: "DefinedAsComposition";
  expression: CompositionExpression;
}

// `defined as ("A" and "B")` — BOOLEAN composition over SEPARATE boolean facts (design of record
// `tmp/DESIGN-concept-boolean-composition.md`; T1). REUSES the neutral `BranchCondition` family (the same
// `and`/`or`/`not` a `when` guard uses) under this WRAPPER, which marks the CONCEPT attachment point: the T3
// lowering produces ONE compound total boolean and never shares the decision DNF/cockpit path. Built via the
// shared `branchConditionFrom` (inherits chain-flatten, single-ref-stays-ref, and the mixed-`and`/`or`
// rejection). Criterion refs are NOT classified at this site (concept-only). Every `defined as` reference
// walker (resolution, cycles, emit closure, project index, provenance, inference-order) MUST collect ALL
// concept refs in the `expression` tree (via `branchConditionConceptRefsStrict`) so operands are tracked like
// refs — this is a TREE, not a single ref. #189 Slice 0b LOWERS it to one compound total boolean `and`/`or`/
// `not` (`emitCQL.emitBooleanComposition`), gated on every operand being a proven-total scalar boolean.
export interface DefinedAsBooleanComposition extends ASTNode {
  type: "DefinedAsBooleanComposition";
  expression: BranchCondition;
}

/** The diagnostic kind for the #189 emit sentinel — a `ReductionDefinition` that reached emit while
 * reductions are still validate-only. A filterable kind (mirrors `emit-mixed-code-and-definition`) so
 * tooling and the reductionShapeValidator's migration prompt can name the exact error a reduction hits. */
export const EMIT_REDUCTION_NOT_ACTIVE_KIND = "emit-reduction-not-active";

/** The KE-facing message for the emit-reduction-not-active sentinel raised on the DEEP emit paths
 * (the no-`code is` reduction). The `code is` + reduction site in `lowerLocalCodes` raises its own
 * more specific message but the SAME kind (`EMIT_REDUCTION_NOT_ACTIVE_KIND`) — so the KIND never
 * drifts even though the two prose messages differ. `where` names the reaching context. Deliberately
 * does NOT claim the reduction "validated cleanly" — a direct `emitCQL` call does not run
 * `ReductionShapeValidator`, so this message must not assert a pipeline stage that may not have run. */
export function reductionNotActiveMessage(where: string): string {
  return (
    "`definition is` reduction (exists / most recent / count) is accepted by the grammar for " +
    "validate-only migration but CANNOT yet be emitted (" +
    where +
    ") — emit activates at the flip (#189)."
  );
}

/** Base for a TYPED emit error that carries a filterable `kind` + an optional source `location`, so a
 * lane's top-level `catch` surfaces it as a STRUCTURED `Validation` diagnostic (with the kind) rather
 * than a bare `type: "Exception"` with only a message. The deep emit paths run validator-free (direct
 * `emitCQL`/MCP/CLI callers), so a coherence/threshold defect a reduction hits at emit must fail loud
 * with a specific kind, not a generic exception. */
export abstract class StructuredEmitError extends Error {
  abstract readonly kind: string;
  readonly location?: Location;
  constructor(message: string, location?: Location) {
    super(message);
    this.location = location;
  }
}

/** The #189 emit sentinel as a TYPED error — a `ReductionDefinition` reached a deep emit path while
 * reductions are still validate-only for its form. */
export class ReductionNotActiveError extends StructuredEmitError {
  readonly kind = EMIT_REDUCTION_NOT_ACTIVE_KIND;
  constructor(where: string, location?: Location) {
    super(reductionNotActiveMessage(where), location);
    this.name = "ReductionNotActiveError";
  }
}

/** A reduction whose RESULT concept's declared shape/value-type contradicts the Scalar boolean an
 * `exists`/`count` reduction publishes (charter: never emit a value shape the declaration denies). The
 * `code is` + `this` path is guarded in `lowerLocalCodes`; this typed error is the NAMED-operand path's
 * mirror (`emitConceptBody`), which is validator-free. */
export class ReductionShapeIncoherentError extends StructuredEmitError {
  readonly kind = "emit-reduction-shape-incoherent";
  constructor(message: string, location?: Location) {
    super(message, location);
    this.name = "ReductionShapeIncoherentError";
  }
}

/** A `count … at least N` with N < 1 — trivially true (every set has ≥ N members). An AUTHOR error at
 * emit (never a "not yet emittable" form), so it must not surface the not-active sentinel. */
export class CountThresholdTrivialError extends StructuredEmitError {
  readonly kind = "emit-count-threshold-trivial";
  constructor(message: string, location?: Location) {
    super(message, location);
    this.name = "CountThresholdTrivialError";
  }
}

/** #189 Slice B2a — a lowered `most recent this` concept reached the emit read site with a missing or
 * malformed `__effectiveDescriptor` (or a descriptor/declaration the boolean value read cannot honor).
 * `lowerLocalCodes` guarantees a well-formed descriptor on valid input, so this fires only on a
 * hand-built AST fed to the public `emitCQLFromAST` — surfaced with a filterable kind (matching the
 * lowering-side `emit-most-recent-derivation`) rather than a bare `type: "Exception"`. */
export class MostRecentDerivationError extends StructuredEmitError {
  readonly kind = "emit-most-recent-derivation";
  constructor(message: string, location?: Location) {
    super(message, location);
    this.name = "MostRecentDerivationError";
  }
}

/** #189 Slice-C boundary 1 — a `defined as` truth-set composition (union/intersect/except) references a
 * REDUCTION operand, which publishes a TOTAL boolean rather than a truth-set. The truth-set lane renders
 * siblings as `.asTruths()` lists and set-combines them, so a bare-boolean reduction operand yields
 * ill-typed CQL (`<boolean> union <List<Boolean>>`) the translator rejects at load. Composing `defined as`
 * over TOTAL booleans is a boundary-2 change; until then this fires a CRL-level diagnostic instead of
 * emitting CQL that fails downstream. Only reachable once the reduction flip classifies reductions Inferences
 * (before it, a reduction-bearing library stayed on the per-CRL path and never layered its compositions). */
export class ReductionInCompositionError extends StructuredEmitError {
  readonly kind = "emit-reduction-in-composition";
  constructor(message: string, location?: Location) {
    super(message, location);
    this.name = "ReductionInCompositionError";
  }
}

/**
 * Guard for emit / emit-adjacent code paths that reach a `ReductionDefinition` (#189). In the
 * grammar+validation slice reductions PARSE + VALIDATE but are NOT emittable: emit stays on the
 * old path until the atomic flip activates reductions. Every lane that could otherwise silently
 * misemit (or fall through a `never`-checked switch) calls this to FAIL LOUD instead — throwing the
 * typed `ReductionNotActiveError` so the lane's `catch` surfaces the `emit-reduction-not-active`
 * kind (IMPL 3). The `code is` + reduction case is caught earlier + structured by `lowerLocalCodes`
 * (it never reaches a deep throw); this chokepoint covers the no-`code is` reduction paths.
 */
export function reductionNotEmittable(where: string, location?: Location): never {
  throw new ReductionNotActiveError(where, location);
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

// --------------------------- REDUCTION (v0.8, #189) ----------------------
//
// A `Reduction` is a set→scalar (or set→record) reduction over a target record set — the
// concept's OWN representation records (`ThisRecords`) or a NAMED RecordSet concept
// (`ReductionConceptRef`). It replaces `DefinitionIsDefinition` for the recognized reduction
// forms, so downstream consumers see a STRUCTURAL node rather than having to re-match narrative
// text. Built two ways:
//   - the dedicated `countDefinition` production (`definition is count <target> at least N`), and
//   - a builder-level normalization that folds the narrative forms `exists this` /
//     `most recent this` / `exists "X"` into it.
// `most recent "X"` is deliberately NOT normalized — it stays a `DefinitionIsDefinition` and
// keeps its existing catalog-matcher / emit path (no-regression).
//
// TRUE discriminated union: the `count` arm alone carries `atLeast`, so a count-without-threshold
// (or a threshold on exists/mostRecent) is UNREPRESENTABLE rather than merely invalid.
export type ReductionTarget = ThisRecords | ReductionConceptRef;

// The concept's OWN representation records (`this`). Its own node + location so a reduction
// diagnostic can anchor at the `this` operand.
export interface ThisRecords extends ASTNode {
  type: "ThisRecords";
}

// A NAMED RecordSet concept as a reduction operand (`exists "X"`, `count "X" at least N`). `ref`
// preserves a qualified reference's location. Consumers that walk references (resolution, cycle
// detection, emit closure, project index, provenance) MUST track `ref` like a concept reference.
export interface ReductionConceptRef extends ASTNode {
  type: "ReductionConceptRef";
  ref: ReferenceName;
}

export interface ExistsReduction {
  kind: "exists";
  target: ReductionTarget;
}

export interface MostRecentReduction {
  kind: "mostRecent";
  target: ReductionTarget;
}

export interface CountReduction {
  kind: "count";
  target: ReductionTarget;
  atLeast: number;
}

export type Reduction = ExistsReduction | MostRecentReduction | CountReduction;

// `definition is <reduction>.` — a concept whose value is a reduction over a record set. A
// `ConceptDefinition` member parallel to `DefinitionIsDefinition`. NOTE: not every consumer of
// `ConceptDefinition` is a compiler-exhaustive switch — several are `if/else` ref-collection
// walkers (`referenceResolver`, `cycleDetector`, `provenance/indexer`, `imports/computeEmitClosure`,
// `cql-emitter/layeredEmit`, `language-services/projectIndex`) that would fall THROUGH a new kind
// silently. Each was taught an explicit `ReductionDefinition` arm so a NAMED reduction operand
// (`ReductionConceptRef`) is tracked exactly like a concept ref (resolution, cycles, closure, index,
// find-refs); the emit lanes fail loud via `reductionNotEmittable` (the dedicated
// `emit-reduction-not-active` sentinel replaces that chokepoint at the flip). In the
// grammar+validation slice a reduction PARSES + VALIDATES but does NOT yet emit.
export interface ReductionDefinition extends ASTNode {
  type: "ReductionDefinition";
  reduction: Reduction;
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
export type { ConceptShape } from "../grammar/conceptShapes";
export { activityTypes } from "../grammar/activityTypes";
export { conceptTypes } from "../grammar/conceptTypes";
export { conceptValueTypes } from "../grammar/conceptValueTypes";
