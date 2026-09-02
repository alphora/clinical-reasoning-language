import { CRL } from "../ast/types";
import type { LibraryDeclaration } from "../ast/types";
import type { ResolvedDispositionConfig } from "../dispositions/types";
import type { SourceContext } from "../imports/scopes";

import { AgePredicateValidator } from "./agePredicateValidator";
import { CycleDetector } from "./cycleDetector";
import { DecisionShapeValidator } from "./decisionShapeValidator";
import { DispositionValidator } from "./dispositionValidator";
import { EmitCapabilityValidator } from "./emitCapabilityValidator";
import { MetaTagValidator } from "./metaTagValidator";
import { NameUniquenessValidator } from "./nameUniquenessValidator";
import { PipelineStageValidator } from "./pipelineStageValidator";
import { RecordSetBoundValidator } from "./recordSetBoundValidator";
import { AnswerOptionsValidator } from "./answerOptionsValidator";
import { ReductionShapeValidator } from "./reductionShapeValidator";
import { ReferenceResolver } from "./referenceResolver";
import { RepresentationShapeValidator } from "./representationShapeValidator";
import { UseSiteTypeValidator } from "./useSiteTypeValidator";

/**
 * Stable, machine-readable discriminator for validation errors. Lets
 * consumers (CLI, extension, MCP) filter or specialize on the kind without
 * grepping message text.
 *
 * Kinds:
 *   - "empty-name"                      — declaration name is blank
 *   - "duplicate-name"                  — two declarations of the same kind
 *                                         share a name within the same library
 *   - "unresolved-reference"            — bare ref target doesn't exist
 *                                         in the local namespace
 *   - "reference-cycle"                 — concept refs form a cycle
 *   - "external-library-not-included"   — qualified ref `"Pkg"."X"` to a
 *                                         package library that the current
 *                                         file did not `include`, or to an
 *                                         unknown library
 *   - "qualified-ref-unresolved"        — qualified ref `"Lib"."X"` where
 *                                         Lib is in scope but X isn't
 *                                         declared there for the requested
 *                                         kind
 */
export type ValidationErrorKind =
  | "empty-name"
  | "duplicate-name"
  | "unresolved-reference"
  | "reference-cycle"
  | "decision-delegation-cycle"
  // #224 ii — a `criterion` whose body transitively references itself
  // (`A → B → A`, or a self-ref). Structural defect (like the other cycles);
  // never soft-demoted.
  | "criterion-cycle"
  // #224 ii — a `criterion` name used in a CONCEPT-only reference slot
  // (`defined as`, `sem-*` composition, `definition is` narrative, an action
  // guard `unless`/`only when`), or a library-qualified criterion ref. Criteria
  // may only appear in a decision `when` guard (or another criterion's body) in v0.
  | "criterion-misuse"
  | "external-library-not-included"
  | "qualified-ref-unresolved"
  | "decision-shape"
  | "pipeline-stage"
  | "reserved-library-name"
  // Configurable PA determinations (feature: configurable PA leaves). Only enforced when the project EXPLICITLY
  // configures `crl.dispositions.options` (the closed-set trigger); absent config = today's behavior.
  | "disposition-not-configured"
  | "disposition-request-type"
  | "disposition-non-final-leaf"
  // #154/#203 — registry-backed metadata (@tag) enforcement.
  | "meta-malformed-tag"
  | "meta-unknown-tag"
  | "meta-missing-field"
  | "meta-invalid-field"
  | "meta-duplicate-field"
  | "meta-cardinality"
  | "open-flag"
  // #215 / #257 T2 — an age predicate that is NOT sanctioned: an unsupported comparator
  // (`less than`, …) or an unsanctioned unit (day/week — NOT years/months). Sanctioned:
  // `at least` | `at most` | `under` | `younger than` + a YEARS or MONTHS quantity. Closes the
  // validate/emit divergence (these emit a loud unmatched sentinel at emit but validated
  // green). Author error — never soft-demoted.
  | "age-predicate-unsupported"
  // concept-model redesign Todo 2 — a static shape defect in a concept's representations
  // (posrep completeness, value-element path, value-projection-references-concept, duplicate rep key,
  // `definition is exists` misuse, >1 value type). The specific rule is on `.rule`. Every
  // one is a structural author mistake made possible by Todo 1's permissive grammar
  // superset — never soft-demoted.
  | "representation-shape"
  // concept-model redesign Todo 2 rule B — a use-site / result-shape TYPE mismatch: a pattern
  // operand at a type-demanding position (time-selection / value-comparison) whose value type is
  // wrong; a boolean at a REFINEMENT or temporal-ANCHOR operand position (Todo 4 —
  // `boolean-at-refinement-position`); a boolean operand LEAF in a non-boolean `defined as`
  // composition (Todo 4 — `boolean-in-refinement-composition`); a bare-ref `defined as "X"` alias whose
  // value type disagrees with the target's (Todo 4 — `bare-ref-value-type-mismatch`); a `defined as
  // exists`/top-level `sem-not` concept declaring a non-boolean value type; a no-projector source
  // representation whose value type disagrees with its concept; or a decision/criterion/action guard
  // literal resolving to a non-boolean concept. The specific rule is on `.rule`. Fires ONLY where
  // value types are declared (no-op on absent types); a structural author mistake — never soft-demoted.
  | "use-site-type-mismatch"
  // concept-model redesign Todo 2 rule B — a pattern operand at a type-demanding position whose
  // resolved concept declares NO value type. An intrinsic WARNING (not an error): today 231/547
  // concepts are untyped, and Todo 4's migration makes value types required. Flags the gap without
  // failing the build.
  | "use-site-operand-untyped"
  // #189 grammar+validation slice — a reduction / shape COHERENCE finding. All intrinsic WARNINGS
  // (validate-only; `isValid` stays true) — this slice LEADS the emit flip by one version, teaching
  // the corpus toward the reduction/shape model before emit consults it. The specific rule is on
  // `.rule`; `conceptName` names the offending concept. See ReductionShapeRule + disc 415.
  | "reduction-shape"
  // #189 / disc 495 Q6 — the authoring-time EMIT-CAPABILITY warning ("#1"): a concept with a local
  // `code is` whose effective resource type is NOT a case-feature-emittable registry resource (an
  // unlisted type, or Encounter's CEL-writer-only row) — `emit_cel` would fail closed on it
  // (`unsupported-casefeature-resource`); this surfaces it EARLIER at validate time. Intrinsic
  // WARNING, NEVER an error: the emit registry is a deliberate SUBSET of capability, so a hard error
  // would turn "not yet emittable" into "invalid CRL" (grammar defines the language, not the registry).
  | "unsupported-casefeature-resource"
  // #189 — a `shape is RecordSet` concept whose program never restricts the set, so it publishes the
  // patient's whole history. Intrinsic WARNING, NEVER an error: the shape is LEGAL and the Layered
  // authoring option uses it deliberately. It flags COST, not incorrectness — the case-feature transform
  // lands at the concept boundary, and for a RecordSet the boundary is the entire set.
  | "recordset-unbounded"
  | "answer-options-missing"
  | "answer-options-unanswerable"
  | "answer-options-not-coded";

/**
 * #187 — the SHARED catalog library names the emitter ALWAYS materializes into
 * every policy package (`CRLCommon.cql` + `CaseFeatureCommon.cql` + `FHIRHelpers.cql`
 * plus the CRLCommon/CaseFeatureCommon FHIR Libraries). An author `library "…"`
 * declared with any of these would collide with the emitted catalog copy — the
 * CQL-lane filename-skip catches the `.cql` clash, but a root library's FHIR
 * Library url is policy-id-based (not name-based), so the FHIR-lane url-skip can
 * miss it. Make the collision impossible at authoring time (hard error) rather
 * than relying on downstream skip heuristics.
 */
export const RESERVED_CATALOG_LIBRARY_NAMES: ReadonlySet<string> = new Set([
  "CRLCommon",
  "CaseFeatureCommon",
  "FHIRHelpers",
]);

/**
 * The specific decision-shape rule a `decision-shape` error violates. Lets
 * consumers specialize without parsing message text. See docs/decision-shapes.md.
 */
export type DecisionShapeRule =
  | "qualifier-required"
  | "qualifier-on-single-member"
  | "any-over-branches"
  | "first-over-actions"
  | "otherwise-misplaced"
  | "otherwise-required"
  | "otherwise-only"
  | "guard-on-single-action";

interface ValidationErrorBase {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  severity: "error" | "warning";
  // Source attribution — populated by source-aware validators (multi-file
  // path). Absent in single-file `validateCRL` mode where the ast doesn't
  // carry file/library identity.
  libraryName?: string;
  filePath?: string;
}

export interface EmptyNameError extends ValidationErrorBase {
  kind: "empty-name";
}
export interface DuplicateNameError extends ValidationErrorBase {
  kind: "duplicate-name";
}
export interface UnresolvedReferenceError extends ValidationErrorBase {
  kind: "unresolved-reference";
}
export interface ReferenceCycleError extends ValidationErrorBase {
  kind: "reference-cycle";
}
// T02 / #96. Validator-side decision-delegation cycle. The FHIR-emitter side
// emits a separate `circular-decision-reference` kind (see fhir-emitter/types.ts)
// from its own SCC classification — distinct kind, distinct message shape,
// distinct call path; callers filtering by kind may need to handle both.
export interface DecisionDelegationCycleError extends ValidationErrorBase {
  kind: "decision-delegation-cycle";
}
// #224 ii — a cycle in the criterion-reference graph (`criterion "A"` whose body
// references `criterion "B"` whose body references `"A"`, or a self-reference).
// Detected over the COMPLETE criterion graph (including unused criteria) so a
// non-terminating expansion is caught at the source, not at expansion time.
export interface CriterionCycleError extends ValidationErrorBase {
  kind: "criterion-cycle";
}
// #224 ii — a criterion name used somewhere criteria are not allowed: a concept-only
// reference slot, or a library-qualified criterion ref. `slot` names the offending
// slot for consumers; the message spells out the v0 rule (criteria are `when`-guard-only).
export interface CriterionMisuseError extends ValidationErrorBase {
  kind: "criterion-misuse";
  slot: CriterionSlot;
}

// Where a criterion name was wrongly used. `qualified` = a FOREIGN library-qualified
// criterion ref — criterion refs cannot be library-qualified in v0. (A self-qualified
// ref is bare-equivalent, so it yields a slot-specific misuse or is valid, never
// `qualified`.)
export type CriterionSlot =
  | "defined-as"
  | "composition"
  | "narrative"
  | "reduction"
  | "action-guard"
  | "qualified";
export interface ExternalLibraryNotIncludedError extends ValidationErrorBase {
  kind: "external-library-not-included";
  // The library name in the offending qualified ref `"<targetLibrary>"."X"`.
  targetLibrary: string;
}
export interface QualifiedRefUnresolvedError extends ValidationErrorBase {
  kind: "qualified-ref-unresolved";
  // The library name in the offending qualified ref `"<targetLibrary>"."<targetName>"`.
  targetLibrary: string;
  targetName: string;
}
// Decision-shape structural rule violation (first/any/all/otherwise legality).
// Never demoted under `soft` — a malformed decision shape is a structural
// defect, not incomplete-but-fixable authoring state.
export interface DecisionShapeError extends ValidationErrorBase {
  kind: "decision-shape";
  rule: DecisionShapeRule;
}
// #187 — an author library declared with a name reserved for the emitter's
// shared catalog libraries (CRLCommon / CaseFeatureCommon / FHIRHelpers).
export interface ReservedLibraryNameError extends ValidationErrorBase {
  kind: "reserved-library-name";
  // The reserved name the author used.
  reservedName: string;
}
// A recommended activity that is NOT in the configured disposition set (the closed set — see the kind comment).
export interface DispositionNotConfiguredError extends ValidationErrorBase {
  kind: "disposition-not-configured";
  activityName: string;
}
// A configured determination activity whose `request` type is not `CPGCommunicationRequest` (a determination is
// COMMUNICATED, not ordered — meaning enforced by validation, not grammar).
export interface DispositionRequestTypeError extends ValidationErrorBase {
  kind: "disposition-request-type";
  activityName: string;
  actualRequestType: string;
}
// A non-final determination (e.g. `pended`) recommended under `standalone` mode, where our tree IS the whole
// adjudication and every leaf must be FINAL. Legitimate only in `embedded` mode (our tree feeds a larger one).
export interface DispositionNonFinalLeafError extends ValidationErrorBase {
  kind: "disposition-non-final-leaf";
  activityName: string;
}

// #154/#203 — a metadata (@tag) diagnostic. One interface for all meta kinds (the kind + payload live in `kind`
// + `message`); carries its intrinsic `severity` (open-flag/unknown/malformed = warning; field/cardinality = error).
export interface MetaDiagnostic extends ValidationErrorBase {
  kind:
    | "meta-malformed-tag"
    | "meta-unknown-tag"
    | "meta-missing-field"
    | "meta-invalid-field"
    | "meta-duplicate-field"
    | "meta-cardinality"
    | "open-flag";
}

// #215 / #257 — an age predicate/projection defect. `conceptName` names the offending concept;
// the `reason` sub-discriminator (mirrors `representation-shape`'s `rule`) lets consumers
// specialize without parsing message text.
//
//   - "unsupported-comparator"   — #215: an attempted `age at start of <…>` predicate with an
//                                  unsupported comparator or non-year unit (anchored form; the
//                                  `age today` form is now retired, below).
//   - "definition-retired"       — #257: an authored `definition is age today …` — the carve-out
//                                  is RETIRED; migrate to a Patient age `source representation`.
//   - "projection-unsupported"   — #257: a posrep `value projection is age today …` with an
//                                  unsupported comparator or non-year unit.
//   - "projection-wrong-carrier" — #257: a sanctioned age-today projection on the wrong carrier
//                                  (resource / value element / value type is not the Patient age one).
//   - "projection-shape"         — #257: a whole-concept age-shape defect (a `code is`+`definition`+
//                                  age posrep 3-way, a 3rd representation, a non-Observation local
//                                  type, a `definition`+age posrep without `code is`, or a concept
//                                  value type that is not the projection's result type).
export type AgePredicateReason =
  | "unsupported-comparator"
  | "definition-retired"
  | "projection-unsupported"
  | "projection-wrong-carrier"
  | "projection-shape";

export interface AgePredicateUnsupportedError extends ValidationErrorBase {
  kind: "age-predicate-unsupported";
  conceptName: string;
  reason: AgePredicateReason;
}

/**
 * The specific representation-shape rule a `representation-shape` error violates
 * (concept-model redesign Todo 2). Lets consumers specialize without parsing message text.
 * See tmp/representation-model.md §"Shape rules" + disc 395.
 *
 *   - "incomplete-representation"    — a `source representation` missing `type` / `value
 *                                      element` / `value type` (a posrep is ALWAYS fully
 *                                      explicit; `coded from` stays optional)
 *   - "value-element-invalid"        — a `value element` path that is single-segment, or
 *                                      whose leading segment disagrees with the rep's `type`
 *                                      ("path X is not on type Y"). (A posrep `value element`
 *                                      with no `type` surfaces as `incomplete-representation`,
 *                                      not here.)
 *   - "value-element-without-code"   — a concept-level (local-rep) `value element` with no
 *                                      local `code is` (it describes a non-existent local rep)
 *   - "value-projection-references-concept" — a rep-level `value projection is` PROJECTOR whose
 *                                      narrative references another concept (or a parameter — a
 *                                      narrative ref may resolve to either; either is illegal); a
 *                                      projection is datum-local (for a concept-level calc use
 *                                      `definition is` above the source representation)
 *   - "duplicate-representation-key"  — two representations (local + posreps) share the
 *                                      structural key `{type, value element, coding-source}`
 *   - "definition-is-exists-misuse"  — a `definition is exists (...)` (existence is a
 *                                      `defined as` operator, not `definition is`)
 *   - "multiple-value-types"         — >1 `value type` on one concept or posrep (the
 *                                      canonical result shape is singular)
 *   - "missing-value-type"           — a SCALAR concept declares NO `value type` (its canonical result
 *                                      shape; A.10, now shape-conditional — Record/RecordSet publish a
 *                                      record whose resource is `type is`, so `value type` is optional there)
 */
export type RepresentationShapeRule =
  | "incomplete-representation"
  | "value-element-invalid"
  | "value-element-without-code"
  | "value-projection-references-concept"
  | "duplicate-representation-key"
  | "definition-is-exists-misuse"
  // concept-boolean-composition T2 (design §6) — a `defined as ( <boolean> )` concept is PURE-DERIVED; it
  // cannot also carry a local `code is` / `source representation` (a representation-source coherence defect,
  // not a use-site TYPE mismatch — it can fire with no value type declared). The both-rep fold is #257-deferred.
  | "boolean-composition-not-pure-derived"
  | "multiple-value-types"
  // #189 SR — a REP-LOCAL projection form (`exists this`, `matches this`) used somewhere it has no
  // representation to be local to: a concept-level `definition is`, or a stage of a `, then` pipeline (where
  // the fold PREPENDS the previous stage, handing a zero-operand pattern an operand). One global pattern
  // registry serves all three slots, so nothing structural prevents it — this rule does. See
  // `template-match/patternCatalog.ts`.
  | "projection-only-pattern-misplaced"
  | "missing-value-type";

// concept-model redesign Todo 2 — a static representation-shape defect. One kind with a
// `rule` sub-discriminator (mirrors `decision-shape`); `conceptName` names the offending
// concept. Never demoted under `soft` (structural author mistake).
export interface RepresentationShapeError extends ValidationErrorBase {
  kind: "representation-shape";
  rule: RepresentationShapeRule;
  conceptName: string;
}

/**
 * #189 P2 (design D10) — a defect in a `, then` PIPELINE's stage structure. ERRORS, deliberately:
 * a pipeline is explicit author structure, and a stage that matches nothing must not soft-compile
 * (plan §2.10 — the goal fixture once "validated clean while matching the wrong operation").
 *
 *   - "pipeline-malformed"                 — a `then` the runs around it cannot satisfy (leading /
 *                                            doubled / dangling); the message names WHICH.
 *   - "pipeline-stage-unmatched"           — a stage matches no known form. Names the 1-based stage, quotes
 *                                            it, and points at the STAGE's own span, not the definition's.
 *   - "pipeline-selection-after-selection"  — a selection over a space the previous stage already collapsed
 *                                            to one record. ⚠ SELECTION → FILTER stays LEGAL.
 *   - "pipeline-stage-unclassified"        — FAIL-CLOSED: a matched pattern with no return-shape catalog
 *                                            entry, so its position cannot be checked. OUR gap, not the
 *                                            author's, and it must never pass silently as "not a selection".
 */
export type PipelineStageRule =
  | "pipeline-malformed"
  | "pipeline-stage-unmatched"
  | "pipeline-selection-after-selection"
  | "pipeline-stage-projection-only"
  | "pipeline-stage-unclassified";

export interface PipelineStageError extends ValidationErrorBase {
  kind: "pipeline-stage";
  rule: PipelineStageRule;
  conceptName: string;
}

/**
 * The specific rule a `use-site-type-mismatch` violates (concept-model redesign Todo 2 rule B).
 * One kind with a `rule` sub-discriminator (mirrors `representation-shape` / `decision-shape`);
 * lets consumers specialize without parsing message text.
 *
 *   - "operand-shape"             — a pattern operand at a constrained position (time-selection ⟹
 *                                   NOT boolean; value-comparison ⟹ Quantity) whose resolved concept
 *                                   declares a value type that violates the operand constraint.
 *                                   Carries `pattern` / `argPosition` / `expected` / `actual`.
 *   - "boolean-at-refinement-position" — a `boolean`-declared concept used at a REFINEMENT or
 *                                   temporal-ANCHOR operand position (`… performed`, `… during …`,
 *                                   `component of`, `on day of`, a window anchor, …). Those positions
 *                                   filter or anchor over event INSTANCES; a `boolean` emits the
 *                                   existence/`and`/`or` shape, which has no instance stream to filter
 *                                   or day to anchor (concept-model redesign Todo 4 / disc 403). Same
 *                                   payload as `operand-shape`; a distinct rule so a consumer can find
 *                                   every such hit without parsing message text. The check only proves
 *                                   `!== boolean`, never "is a resource set" (hence the name).
 *   - "boolean-in-refinement-composition" — a `defined as` composition (`sem-and`/`sem-or`, or a nested
 *                                   `sem-not`) whose parent declares a single NON-boolean value type, with
 *                                   a `boolean` operand LEAF. The composition's value is a resource stream
 *                                   (the emitter's refinement shape); a boolean leaf can't be unioned /
 *                                   intersected into it (lifts the emitter's `bridgeOperand`
 *                                   `FIXME: boolean operand in refinement composition` to a pre-emit
 *                                   error). This is the NON-demotable ERROR cell; the RETIRING
 *                                   exists-bridge direction (a resource/record leaf under a `boolean`
 *                                   parent) and every other result-type disagreement are the WARNING-only
 *                                   `composition-result-type-mismatch` (below), NOT this — see #189 IMPL 2b.
 *   - "bare-ref-value-type-mismatch" — a `defined as "X"` bare-ref ALIAS whose full discriminated RESULT
 *                                   type (Scalar value type, or `Record<R>` / `RecordSet<R>`) disagrees
 *                                   with X's. A bare-ref is value-preserving and the emitter bridges it in
 *                                   NEITHER direction, so a boolean alias over a resource target (or a
 *                                   `RecordSet<Condition>` alias over a `RecordSet<Observation>`) silently
 *                                   mis-emits. BIDIRECTIONAL, full-equality (not just boolean-ness), and a
 *                                   hard error (a bare alias has no bridge to migrate to — #189 IMPL 2b).
 *   - "exists-result-nonboolean"  — a `defined as exists (…)` concept declaring a non-boolean
 *                                   `value type` (existence is boolean by definition).
 *   - "negation-result-nonboolean"— a `defined as (… top-level sem-not …)` concept declaring a
 *                                   non-boolean `value type` (closed-world negation is boolean).
 *   - "posrep-value-type-mismatch"— a `source representation` with NO `value projection is` whose
 *                                   `value type` differs from its concept's (the projection is the
 *                                   bridge when they differ; without one they must match).
 *   - "decision-guard-nonboolean" — a decision `when` guard / criterion body / action guard literal
 *                                   resolving to a concept whose declared `value type` is not boolean
 *                                   (a guard consumes a boolean; no implicit truthiness).
 *   - "composition-result-type-mismatch" — (#189 IMPL 2b) a `defined as` composition LEAF whose full
 *                                   discriminated RESULT type (design §2: `Scalar<V>` → `V`, `Record<R>`,
 *                                   `RecordSet<R>`) disagrees with the composition's own — in a direction
 *                                   the old asymmetric `boolean-in-refinement-composition` rule PERMITTED
 *                                   (a resource/record leaf under a `boolean` parent via the retiring
 *                                   exists-bridge; two differing non-booleans; a record-set shape
 *                                   disagreement). Intrinsic WARNING severity (the bridge still runs at
 *                                   emit until the #189 flip) — validate-only migration teaching, never
 *                                   flips isValid. The boolean-leaf-under-a-non-boolean-SCALAR-parent cell
 *                                   stays the non-demotable `boolean-in-refinement-composition` ERROR.
 *   - "decision-guard-record-shaped" — (#189 IMPL 2b) a decision / criterion / action guard operand that
 *                                   resolves to a concept with a `boolean` DATUM value type but a non-Scalar
 *                                   SHAPE (Record/RecordSet). It passes today's value-type guard check, but
 *                                   at the #189 flip it publishes records (`Record<R>`/`RecordSet<R>`), not a
 *                                   boolean, so the guard would then hard-error. Intrinsic WARNING severity —
 *                                   the forward-looking guard cell that LEADS the flip (design §9 step 1),
 *                                   mirroring `composition-result-type-mismatch`; steers to an `exists`
 *                                   reduction. The value-type failure (a non-boolean datum) stays the
 *                                   `decision-guard-nonboolean` ERROR.
 */
export type UseSiteTypeRule =
  | "operand-shape"
  | "boolean-at-refinement-position"
  | "boolean-in-refinement-composition"
  | "composition-result-type-mismatch"
  | "bare-ref-value-type-mismatch"
  | "exists-result-nonboolean"
  | "negation-result-nonboolean"
  // concept-boolean-composition T2 — the `defined as ( <boolean> )` family (design §2). Result MUST be a
  //   declared Scalar<Boolean>; operands MUST resolve to Scalar<Boolean> (RESULT type, not datum value type).
  //   A 0-vt/A.10 Scalar or an unindexed cross-lib operand is deliberately SILENT here (fail-OPEN; T3 emit is
  //   the fail-closed point). (The PURE-DERIVED / no-`code is` check is a `representation-shape` rule, not here —
  //   it is a representation-source coherence defect that can fire with no value type declared.)
  | "boolean-composition-result-nonscalar"
  | "boolean-composition-result-nonboolean"
  | "boolean-composition-operand-nonboolean"
  | "posrep-value-type-mismatch"
  | "decision-guard-nonboolean"
  | "decision-guard-record-shaped";

// concept-model redesign Todo 2 rule B — a use-site / result-shape type mismatch. One kind with a
// `rule` sub-discriminator; `conceptName` names the offending concept (or the decision, for a
// guard). Never demoted under `soft` (structural author mistake).
export interface UseSiteTypeMismatchError extends ValidationErrorBase {
  kind: "use-site-type-mismatch";
  rule: UseSiteTypeRule;
  conceptName: string;
  // Operand payload — `pattern` / `argPosition` present for the two OPERAND-position rules
  // (`operand-shape` AND `boolean-at-refinement-position`); absent for the result-shape / guard /
  // posrep / composition rules. `expected` / `actual` are present on every rule EXCEPT the untyped
  // case (which is a separate warning kind).
  pattern?: string;
  argPosition?: number;
  expected?: string;
  actual?: string;
}

// concept-model redesign Todo 2 rule B — a pattern operand at a type-demanding position whose
// resolved concept declares no value type. Intrinsic WARNING severity (routes as a warning, never
// flips isValid). `conceptName` names the concept whose definition holds the use site.
export interface UseSiteOperandUntypedWarning extends ValidationErrorBase {
  kind: "use-site-operand-untyped";
  conceptName: string;
}

/**
 * The specific rule a `reduction-shape` finding violates (#189 grammar+validation slice). One kind
 * with a `rule` sub-discriminator (mirrors `representation-shape` / `use-site-type-mismatch`); every
 * one is an intrinsic WARNING — this validate-only slice ships one version BEFORE emit consults the
 * reduction/shape model, so the findings teach the migration without failing the build. See
 * .vibe-tools/discussions/415 + docs/emit-consistency-189-design.md §8.
 *
 *   - "recordset-operand-required"   — a `definition is <exists|count> "X"` whose named operand X is
 *                                      NOT `shape is RecordSet` (a reduction reduces a set of records;
 *                                      the A.8 single-ref supersession's coherence check).
 *   - "reduction-result-nonboolean"  — an `exists` / `count` reduction on a Scalar concept declaring a
 *                                      non-boolean `value type` (a presence/threshold reduction is boolean).
 *   - "reduction-this-no-representation" — a `<reduction> this` on a concept with NO representation
 *                                      (no `code is`, no `source representation`) — `this` has no records.
 *   - "reduction-multi-rep"          — a `most recent this` / `count this` on a concept with >1
 *                                      representation (local code arm + posreps): cross-rep dedup is
 *                                      deferred (#257), so the reduction target is ambiguous today.
 *   - "recordset-scalar-reduction"   — a `shape is RecordSet` concept carrying a reduction OR a narrative
 *                                      `most recent "X"` selection (a set publishes records, not a
 *                                      reduced value or a single selected record). NOTE: a bare local
 *                                      `code is` on a RecordSet is NOT flagged — it is the canonical
 *                                      base-record retrieve (North Star §3 / design §2 `(none) + set of`).
 *   - "record-shape-invariant"       — a `shape is Record` concept without a record-SELECTING `most
 *                                      recent` (the folded `most recent this` reduction OR the narrative
 *                                      `most recent "X"`). (The `type is R` must-agree-with-the-selected-
 *                                      `RecordSet<R>`-operand check is DEFERRED — reachable but held for
 *                                      the flip step; see the validator's record-shape-invariant comment.)
 *   - "no-bare-scalar-code"          — a Scalar bare `code is` (no definition) — NOT a `defined as` (a
 *                                      satisfying reduction, exempt), NOT a mixed `code is`+`definition
 *                                      is`/`coded from` (already an emit-mixed error). THE MIGRATION
 *                                      PROMPT — fires corpus-wide (every bare presence concept); carries a
 *                                      per-concept action (`definition is exists this` for boolean, else
 *                                      `most recent this` / promote-to-RecordSet when multi-rep).
 *   - "non-scalar-missing-type"      — a non-Scalar concept with no `type is` (and not a derived-from-
 *                                      operand reduction) — a record shape needs its resource declared.
 *   - "shape-marker-not-emit-active" — an explicit non-Scalar `shape is` on a concept that STILL has a
 *                                      live emit path (emit does not yet consult `shape`): honest
 *                                      "declared but not emit-active; the flip will change it" warning.
 *   - "count-threshold-trivial"      — a `count … at least N` with N < 1 (trivially true).
 */
export type ReductionShapeRule =
  | "recordset-operand-required"
  | "reduction-result-nonboolean"
  | "reduction-this-no-representation"
  | "reduction-multi-rep"
  | "recordset-scalar-reduction"
  | "record-shape-invariant"
  | "no-bare-scalar-code"
  | "non-scalar-missing-type"
  | "shape-marker-not-emit-active"
  | "count-threshold-trivial";

// #189 grammar+validation slice — a reduction/shape coherence WARNING. One kind with a `rule`
// sub-discriminator (mirrors `representation-shape`); `conceptName` names the offending concept.
// Intrinsic WARNING severity (routes as a warning, never flips isValid) — the slice validates one
// version ahead of the emit flip.
export interface ReductionShapeError extends ValidationErrorBase {
  kind: "reduction-shape";
  rule: ReductionShapeRule;
  conceptName: string;
}

// #189 / disc 495 Q6 — the emit-capability WARNING ("#1"). `conceptName` names the offending concept;
// `resourceType` is its effective (`type is`, defaulted to `Observation`) resource type that the emit
// registry does not back as a case-feature datum. Intrinsic WARNING severity (never flips isValid).
export interface EmitCapabilityWarning extends ValidationErrorBase {
  kind: "unsupported-casefeature-resource";
  conceptName: string;
  resourceType: string;
}

/**
 * ⭐ #189 — a `shape is RecordSet` concept whose program never restricts the set.
 *
 * ⚠ INTRINSICALLY a warning, never demotable-from-error: an unbounded coded history is LEGAL (the Layered
 * authoring option publishes one deliberately) and charter §3 keeps all three authoring options canonical.
 * See `recordSetBoundValidator.ts` for why the cost is real and why the scope is drawn where it is.
 */
export interface RecordSetUnboundedWarning extends ValidationErrorBase {
  kind: "recordset-unbounded";
  conceptName: string;
}

/** ⭐ #189 gap 2 — findings about a coded question's ANSWER OPTIONS (`value from`). The `missing` kind is a
 *  WARNING today and becomes an error at the flip (operator ruling, 2026-09-01); the other two are errors. */
export interface AnswerOptionsFinding extends ValidationErrorBase {
  kind: "answer-options-missing" | "answer-options-unanswerable" | "answer-options-not-coded";
  conceptName: string;
}

export type ValidationError =
  | EmptyNameError
  | DuplicateNameError
  | UnresolvedReferenceError
  | ReferenceCycleError
  | DecisionDelegationCycleError
  | CriterionCycleError
  | CriterionMisuseError
  | ExternalLibraryNotIncludedError
  | QualifiedRefUnresolvedError
  | DecisionShapeError
  | ReservedLibraryNameError
  | DispositionNotConfiguredError
  | DispositionRequestTypeError
  | DispositionNonFinalLeafError
  | AgePredicateUnsupportedError
  | RepresentationShapeError
  | PipelineStageError
  | UseSiteTypeMismatchError
  | UseSiteOperandUntypedWarning
  | ReductionShapeError
  | EmitCapabilityWarning
  | RecordSetUnboundedWarning
  | AnswerOptionsFinding
  | MetaDiagnostic;

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validator options.
 *
 * `soft`: when true, RELAXED checks demote certain "would-be-error" findings
 * to warnings so authoring can continue with incomplete state. The kinds
 * that demote are listed in `SOFT_DEMOTABLE_KINDS` below; structural
 * diagnostics like `external-library-not-included` and cycles never demote.
 */
export interface ValidatorOptions {
  soft?: boolean;
  /**
   * The resolved PA disposition config (feature: configurable PA leaves). Threaded in by the project-aware caller
   * (`validateCRLImports`) — the Validator is filesystem-free, so the caller resolves it. Absent in single-file /
   * inline mode → the disposition rules don't run. Even when present, the closed-set enforcement fires only if the
   * deployment EXPLICITLY configured `options` (`config.configured`).
   */
  dispositionConfig?: ResolvedDispositionConfig;
}

/**
 * The set of validation kinds that downgrade to warnings under `soft` mode.
 * These represent incomplete-but-fixable authoring state, not structural
 * defects in the source.
 */
const SOFT_DEMOTABLE_KINDS: ReadonlySet<ValidationErrorKind> = new Set([
  "unresolved-reference",
  "qualified-ref-unresolved",
  // Mid-authoring, recommending a determination before wiring it into the config is incomplete-but-fixable state
  // (parallels unresolved-reference) — demote under soft. `disposition-request-type` is a STRUCTURAL defect
  // (a determination modeled as an order) and stays a hard error (like decision-shape), so it is NOT listed.
  "disposition-not-configured",
  // #154: a missing required @tag field is incomplete-but-fixable authoring state (parallels unresolved-reference)
  // → demote under soft. An INVALID enum value (`meta-invalid-field`) is misuse, not incompleteness → stays a hard error.
  "meta-missing-field",
]);

function demote(e: ValidationError): ValidationError {
  return { ...e, severity: "warning" } as ValidationError;
}

export class Validator {
  private readonly nameUniquenessValidator: NameUniquenessValidator;
  private readonly referenceResolver: ReferenceResolver;
  private readonly cycleDetector: CycleDetector;
  private readonly decisionShapeValidator: DecisionShapeValidator;
  private readonly dispositionValidator: DispositionValidator;
  private readonly metaTagValidator: MetaTagValidator;
  private readonly agePredicateValidator: AgePredicateValidator;
  private readonly representationShapeValidator: RepresentationShapeValidator;
  private readonly pipelineStageValidator: PipelineStageValidator;
  private readonly recordSetBoundValidator: RecordSetBoundValidator;
  private readonly answerOptionsValidator: AnswerOptionsValidator;
  private readonly reductionShapeValidator: ReductionShapeValidator;
  private readonly useSiteTypeValidator: UseSiteTypeValidator;
  private readonly emitCapabilityValidator: EmitCapabilityValidator;

  constructor() {
    this.nameUniquenessValidator = new NameUniquenessValidator();
    this.referenceResolver = new ReferenceResolver();
    this.cycleDetector = new CycleDetector();
    this.decisionShapeValidator = new DecisionShapeValidator();
    this.dispositionValidator = new DispositionValidator();
    this.metaTagValidator = new MetaTagValidator();
    this.agePredicateValidator = new AgePredicateValidator();
    this.representationShapeValidator = new RepresentationShapeValidator();
    this.pipelineStageValidator = new PipelineStageValidator();
    this.recordSetBoundValidator = new RecordSetBoundValidator();
    this.answerOptionsValidator = new AnswerOptionsValidator();
    this.reductionShapeValidator = new ReductionShapeValidator();
    this.useSiteTypeValidator = new UseSiteTypeValidator();
    this.emitCapabilityValidator = new EmitCapabilityValidator();
  }

  /**
   * Validate a CRL AST.
   *
   * Single-file mode (`sources` absent): validators treat `ast` as the only
   * library; `Concept`/`Decision`/`Activity`/`Terminology` names form a flat
   * local namespace; bare refs resolve against that namespace; qualified refs
   * to non-self libraries emit `external-library-not-included`.
   *
   * Multi-file mode (`sources` present): validators use per-statement scope
   * context to enforce per-library uniqueness, per-library bare-ref
   * resolution, and qualified-ref resolution against the target library's
   * scope.
   */
  public validate(
    ast: CRL,
    options: ValidatorOptions = {},
    sources?: SourceContext[],
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const pushSplit = (results: ValidationError[]): void => {
      for (const e of results) {
        // #154: route by INTRINSIC severity FIRST — sub-validators may now emit real warnings (open-flag,
        // unknown/malformed tag) that must NOT become errors / flip isValid. Only ERROR-severity findings are
        // eligible for soft demotion.
        if (e.severity === "warning") {
          warnings.push(e);
        } else if (options.soft && SOFT_DEMOTABLE_KINDS.has(e.kind)) {
          warnings.push(demote(e));
        } else {
          errors.push(e);
        }
      }
    };

    // Duplicate names — always an error (never demoted)
    const nameResult = this.nameUniquenessValidator.validate(ast, sources);
    errors.push(...nameResult);

    // Reference resolution — per-kind demotion via SOFT_DEMOTABLE_KINDS
    const refResult = this.referenceResolver.validate(ast, sources);
    pushSplit(refResult);

    // Cycles — always an error (structural defect)
    const cycleResult = this.cycleDetector.validate(ast, sources);
    errors.push(...cycleResult);

    // Decision-shape structural rules — always an error (never demoted)
    const shapeResult = this.decisionShapeValidator.validate(ast, sources);
    errors.push(...shapeResult);

    // #187 — reserved catalog library names — always an error (never demoted).
    errors.push(...this.validateReservedLibraryNames(ast, sources));

    // #215 — reject unsanctioned `age today <cmp> <n> <unit>` predicates at author time
    // (unsupported comparator / non-year unit). Always an error (author mistake, never
    // demoted) — closes the validate/emit divergence for the age carve-out.
    errors.push(...this.agePredicateValidator.validate(ast, sources));

    // concept-model redesign Todo 2 — static representation-shape rules (posrep completeness,
    // value-element path, value-projection-references-concept, duplicate rep key, `definition is exists`
    // misuse, >1 value type). Always an error (structural author mistake, never demoted) —
    // closes the check gap Todo 1's permissive grammar superset opened.
    errors.push(...this.representationShapeValidator.validate(ast, sources));
    // #189 P2 D10 — pipeline stage structure. ERRORS: an unmatched stage must never soft-compile.
    errors.push(...this.pipelineStageValidator.validate(ast, sources));
    // #189 — an unbounded `shape is RecordSet` history. ⚠ Pushed straight to `warnings`, NOT through
    // `pushSplit`: this finding is intrinsically advisory (the shape is legal — see the validator's header),
    // so it must never flip `isValid`, and there is nothing for `soft` mode to demote.
    warnings.push(...this.recordSetBoundValidator.validate(ast, sources));
    // ⭐ #189 gap 2 — a coded question's ANSWER OPTIONS. Routed through `pushSplit` because this validator
    // emits BOTH severities by intrinsic kind: `value from` on an unanswerable or non-coded concept is an
    // ERROR (the line can never do anything), while a coded question MISSING one is a WARNING today and
    // becomes an error at the flip — 9 in-tree concepts must migrate first (operator ruling, 2026-09-01).
    pushSplit(this.answerOptionsValidator.validate(ast, sources));

    // concept-model redesign Todo 2 rule B — use-site & result-shape type checking (pattern
    // operand constraints incl. refinement/anchor booleans and non-boolean composition/bare-ref
    // leaves (Todo 4), `defined as exists`/`sem-not` boolean results, no-projector posrep
    // value-type agreement, decision-guard booleanness). Routed through pushSplit so each finding
    // routes by its INTRINSIC severity: the `use-site-operand-untyped` warning and the #189 IMPL 2b
    // warning-severity rules (`composition-result-type-mismatch`, `decision-guard-record-shaped`)
    // route as warnings, while the error-severity `use-site-type-mismatch` rules stay non-demotable
    // errors. Fires only where value types are declared (no-op on absent types).
    pushSplit(this.useSiteTypeValidator.validate(ast, sources));

    // #189 grammar+validation slice — reduction/shape COHERENCE, all intrinsic WARNINGS (validate-only,
    // one version ahead of the emit flip): named-operand-must-be-RecordSet, reduction result/target
    // coherence, multi-rep ambiguity, shape invariants (RecordSet/Record), the corpus-wide bare-scalar-
    // code migration prompt, non-Scalar-needs-type, and the shape-marker-not-emit-active honesty note.
    // Routed through pushSplit; every finding is `severity: "warning"`, so isValid is never flipped.
    pushSplit(this.reductionShapeValidator.validate(ast, sources));

    // #189 / disc 495 Q6 — the authoring-time EMIT-CAPABILITY warning ("#1"): a local `code is` concept whose
    // `type is` is not a case-feature-emittable registry resource (an unlisted type, or Encounter's CEL-writer-
    // only row). Intrinsic WARNING (the registry is a deliberate SUBSET of capability — never a hard error);
    // routed through pushSplit so isValid is never flipped.
    pushSplit(this.emitCapabilityValidator.validate(ast, sources));

    // #154/#203 — registry-backed @tag metadata enforcement (vocabulary / field / cardinality / open-flag).
    // Routed through pushSplit so open-flag/unknown/malformed WARN (not fail) and meta-missing-field soft-demotes.
    pushSplit(this.metaTagValidator.validate(ast, sources));

    // Configurable PA determinations — only when the project supplied a config; the closed-set enforcement is
    // further gated on `config.configured` inside the validator. Always an error (a structural config violation).
    if (options.dispositionConfig) {
      errors.push(...this.dispositionValidator.validate(ast, options.dispositionConfig, sources));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * #187 — reject an author `library "<name>"` declared with a name reserved for
   * the emitter's shared catalog libraries. In multi-file mode each distinct
   * source library is checked (deduped by name+file so one library isn't flagged
   * once per statement); in single-file mode the lone `ast.library` is checked.
   */
  private validateReservedLibraryNames(
    ast: CRL,
    sources?: SourceContext[],
  ): ReservedLibraryNameError[] {
    const out: ReservedLibraryNameError[] = [];
    const make = (
      name: string,
      location: LibraryDeclaration["location"],
      attrib?: { libraryName: string; filePath: string },
    ): ReservedLibraryNameError => ({
      kind: "reserved-library-name",
      reservedName: name,
      message:
        `Library name "${name}" is reserved for the CRL emitter's shared catalog ` +
        `library (CRLCommon / CaseFeatureCommon / FHIRHelpers), which every emitted ` +
        `policy always ships. Rename this library so it cannot collide with the ` +
        `emitted catalog copy.`,
      location: {
        start: { line: location.start.line, column: location.start.column },
        end: { line: location.end.line, column: location.end.column },
      },
      severity: "error",
      ...(attrib ? { libraryName: attrib.libraryName, filePath: attrib.filePath } : {}),
    });

    if (sources && sources.length > 0) {
      const seen = new Set<string>();
      for (const src of sources) {
        const lib = src.entry.ast.library;
        const name = lib?.name;
        if (!name || !RESERVED_CATALOG_LIBRARY_NAMES.has(name)) continue;
        const dedupeKey = `${src.entry.filePath}\u0001${name}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(
          make(name, lib.location, { libraryName: name, filePath: src.entry.filePath }),
        );
      }
      return out;
    }

    const name = ast.library?.name;
    if (name && RESERVED_CATALOG_LIBRARY_NAMES.has(name)) {
      out.push(make(name, ast.library.location));
    }
    return out;
  }
}
