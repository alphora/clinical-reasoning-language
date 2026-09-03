/**
 * CRL → CQL emitter (v0.2).
 *
 * Walks a parsed CRL document and produces a CQL library targeting
 * `CRLCommon.cql` (see src/cql-emitter/catalog/CRLCommon.cql). The catalog is the source
 * of truth for narrative → canonical → CQL function name mapping; this
 * emitter consumes the canonical AST produced by `matchNarrative` from
 * `src/template-match`.
 *
 * v0.2 scope additions over v0.1:
 *   - Refinement-shape sem-and / sem-or / sem-not now emit `intersect` /
 *     `union` / `except` instead of `and` / `or` / `not` when the outer
 *     concept's declared shape is a refinement (valuetype != boolean).
 *     sem-not is hoisted out of sem-and into an `except` clause so that
 *     `A sem-and sem-not B` cleanly produces `A except B`.
 *   - Duplicate-identifier collision detection: when a CRL terminology and
 *     concept (or AST parameter) share a name, the terminology emission
 *     gets a " Code" / " ValueSet" suffix and the concept's reference is
 *     rewritten accordingly.
 *   - Runtime parameters: declared explicitly as `parameter "X": - param
 *     type is T.` (issue #59) and emit as native CQL `parameter "X" T`
 *     lines (Patient/Practitioner-typed parameters collapse to `context
 *     Patient` / `context Practitioner`).
 *
 * Out of scope for v0.2:
 *   - Value-bearing date concepts (`.authoredOn` / `.performed` extraction)
 *   - Disjunction / Conjunction args in narrative patterns
 *   - Nested pattern calls (e.g. `MostRecent(X, BeforeStartOf(...))`)
 *   - Refinement+boolean MIXED sem-* composition (would need cast wrappers)
 */

import { buildCRL } from "../index";
// #203 Todo 5 — status-aware meta emit. Direct `../meta` imports (NOT via `../index`) to avoid a barrel cycle:
// emitCQL already pulls buildCRL from ../index, and meta/* does not import cql-emitter, so the edge is one-directional.
import { parseMetaTag } from "../meta/parseMetaTag";
import { emitCqlTags, emitsToCql, suppressStatusesOf } from "../meta/registry";
import { matchNarrative } from "../template-match";
// #189 functional-VS slice — the SHARED ValueSet-url composition (leaf util; no cql→fhir-emitter cycle since
// slug.ts imports only node:crypto), so the CQL `valueset '<url>'` byte-matches the FHIR `ValueSet.url`.
import { valueSetUrl } from "../fhir-emitter/slug";
import { buildInlineAnswerSetMap } from "../fhir-emitter/inlineAnswerSet";
import type { InlineAnswerSet } from "../fhir-emitter/inlineAnswerSet";
import { findPatternCalls } from "../template-match/referenceRoles";
import { cqlStringLiteral, cqlQuotedIdentifier } from "./cqlStrings";
import { patternReturnShape, requireReturnShape } from "../template-match/patternCatalog";
import {
  candidateCodeCql,
  componentStampCql,
  constructorCallExpr,
  derivedStampCql,
  fhirBooleanFromSystemBoolean,
  fhirQuantityFromSystemQuantity,
  renderBoundaryTransform,
  renderConstructorCall,
  renderValueReadSourceArm,
} from "./renderConstructorCall";
import { boundarySelectedDefineName } from "./lowerLocalCodes";
import { renderBoundaryIdentityCheck } from "../emit/producerCandidate";
import type {
  BoundaryTransformSpec,
  ProducerCandidateSpec,
  ProjectedSourceSpec,
  ValueReadSourceSpec,
} from "../emit/producerCandidate";
import { renderRecordConstructor } from "./renderRecordConstructor";
import { renderProjectedSourceArm } from "./renderConstructorCall";

/** ⭐ #189 — the case subject, resolved ONCE at the call site so the constructors stay context-free and one
 *  generated function serves every concept (design D3a). */
const SUBJECT_REFERENCE_CQL = `FHIR.Reference { reference: FHIR.string { value: 'Patient/' + Patient.id } }`;
import { CONSTRUCTOR_NAME_PREFIX, isConstructorName } from "../emit/recordConstructor";
import type { ConstructorSignature } from "../emit/recordConstructor";
import type { RecordUnionTerm } from "../ast/types";
import type { PatternReturnShape } from "../template-match/patternCatalog";
import { questionReachableNames } from "../ast/questionReachability";
import { conceptRefsOfDefinition } from "../ast/conceptDependencies";
import {
  emitsBareReExportableScalarBoolean,
  emitsTotalScalarBoolean,
  emitsScalarValue,
  sameLayerResolver,
  uniformResolvers,
  branchCompositionOperandTotal,
} from "./totalScalarBoolean";
import type { Resolvers } from "./totalScalarBoolean";
import { makeTotalityFamilyResolver } from "../emit/declaredResultIndex";
import type { CrossLibraryTotality } from "../emit/declaredResultIndex";
import { conceptResultType, renderResultType } from "../grammar/resultType";
import type { ResultType } from "../grammar/resultType";
import type {
  CanonicalArg,
  CanonicalPatternCall,
} from "../template-match/canonicalTypes";
// #189 Slice C boundary 2 (2a) — the totality-ledger enrollment surface. `import type` for the obligation
// (erased at runtime, so no cycle despite `booleanTotality` importing `PATTERN_RETURN_SHAPE` as a VALUE from
// here); `DefineLedger`/`EmittedDefineEntry`/`classifyBooleanTotality` are runtime imports used at emit time.
import type {
  BooleanTotalityObligation,
  EmittedDefineEntry,
  DischargeMetadata,
  DischargeKind,
  DefineOrigin,
  DefineResult,
  DefineVisibility,
} from "../emit/booleanTotality";
import { DefineLedger, classifyBooleanTotality } from "../emit/booleanTotality";
import type {
  CRL,
  Concept,
  CompositionExpression,
  ConceptDefinition,
  Criterion,
  CodedFromDefinition,
  DefinedAsBareRef,
  DefinedAsBooleanComposition,
  DefinedAsComposition,
  DefinedAsExists,
  DefinitionIsDefinition,
  Parameter,
  Terminology,
  TerminologyBodyLine,
  TerminologySystem,
} from "../ast/types";
import {
  getRefName,
  getRefLibrary,
  isQualifiedRef,
  reductionNotEmittable,
  StructuredEmitError,
  ReductionShapeIncoherentError,
  CountThresholdTrivialError,
  MostRecentDerivationError,
  ReductionInCompositionError,
} from "../ast/types";
import type {
  EffectiveRepresentationDescriptor,
  RecencyAccess,
} from "../emit/effectiveRepresentation";
import type { ReferenceName } from "../ast/types";
import { emitCriterionDefine, emitTotalBooleanExpr } from "./emitCriterionDefine";
import { guardDefineNameCollisions, synthesizeGuardCriteria } from "../ast/guardDefines";
import type { QualifyLeaf, RenderLeafPolicy } from "./emitCriterionDefine";
import { branchConditionConceptRefsStrict } from "../ast/branchCondition";
import type { CRLError } from "../types/errors";
import { ageComputeFnForUnit } from "../template-match/agePredicate";
import { recencyOverrideById } from "../template-match/recencyProjectionOverride";
import { resolveRecencyValueConcept, isPureQuestionConcept } from "../template-match/recencyValueConcept";

import { lowerLocalCodes, preLowerAge } from "./lowerLocalCodes";
import { crossRepRecencyMergeExpr } from "./crossRepRecencyMerge";
import { assumedShapePreMigration } from "../grammar/conceptShapes";

/**
 * #187 — the FHIRHelpers version the emitted CQL pins in
 * `include FHIRHelpers version '<v>'`. This MUST equal the engine's bundled
 * FHIRHelpers version AND the header version of the shipped `catalog/FHIRHelpers.cql`
 * (== `loadFHIRHelpers().version`), so emitted == engine == include == catalog
 * source. A drift-guard test in imports/tests/emit.test.ts asserts all three agree.
 */
export const DEFAULT_FHIRHELPERS_VERSION = "4.0.1";

/**
 * v2.2 Todo 3 (issue #59) — classified per-parameter info indexed at emit time.
 * Discriminated union so context-only fields (`contextType`) and parameter-only
 * fields (`cqlType`) can't be confused at the call site.
 */
export type AstParameterInfo =
  | { kind: "context"; contextType: "Patient" | "Practitioner" }
  | { kind: "parameter"; cqlType: string };

export interface EmitOptions {
  libraryName?: string;
  // FHIRHelpers ships versioned with the FHIR spec (the R4 release pins
  // its own FHIRHelpers version), so the emitted CQL keeps its version
  // pin. CRLCommon, in contrast, is our own library — npm packaging IS
  // its version system, so we emit it without a `version '...'` clause.
  fhirHelpersVersion?: string;
  /**
   * Other CRL libraries this emit should `include` natively (`include Foo`
   * in the CQL header). Populated by `emitCQLImports` per-library based on
   * cross-library qualified refs the AST contains. Caller-controlled — the
   * emitter does NOT scan the AST itself.
   */
  crossLibraryIncludes?: string[];
  /**
   * v2.2 Todo 3 (issue #59) — cross-library parameter metadata for resolving
   * qualified refs to AST parameters in other libraries. Keyed by library
   * name (matching the qualifier string used in `arg.library` of a
   * `ConceptRefArg`) → parameter name → info. Populated by `emitCQLImports`
   * after the per-library AST scan + same-name concept shadow rule applied.
   * Single-file `emitCQL` callers leave this undefined; only the bare/self
   * dispatch through `astParameters` is needed in that mode.
   *
   * NOTE — the plan (R4-Δ1) called for keying by resolved `LibraryScope`
   * identity to disambiguate local-vs-package same-name. The actual map is
   * keyed by library NAME string, which is safe TODAY because:
   *   - Packages are excluded from the emit closure (`emit.ts:287`), so no
   *     package parameters ever land in this map — the only entries are
   *     local-origin libraries.
   *   - Two locals sharing a name already fire `registry-duplicate` before
   *     emit reaches this code path.
   * If Todo 4+ extends the map to include package-origin entries (e.g. for
   * cross-package context-rewrite), reshape this to key by `filePath` /
   * scope-resolved identity per R4-Δ1.
   */
  crossLibraryParameters?: Map<string, Map<string, AstParameterInfo>>;
  /**
   * The project's `crl.canonicalBase`. Threaded to `lowerLocalCodes` so the
   * synthetic local codesystem's CQL `codesystem` URL is published under
   * canonicalBase (`<base>/CodeSystem/<slug>-local`) — byte-equal with the FHIR
   * lane's emitted local CodeSystem `url`. **#271 — REQUIRED when the library has
   * local `code is` concepts:** absent/empty yields a hard
   * `missing-canonical-url-base` error (no URN fallback). A caller emitting local
   * codes must supply it (e.g. the MCP/CLI reads it from the nearest package.json).
   */
  canonicalBase?: string;
  /**
   * R1 — the POLICY ID (`metadata.name`) that slugs the synthetic local-domain
   * CodeSystem URL, threaded to `lowerLocalCodes` so the CQL `codesystem '<url>'`
   * byte-equals the policy-id-based FHIR `CodeSystem.url`. Undefined for direct
   * callers without package.json metadata → falls back to the source library name
   * (pre-R1 behavior).
   */
  localDomainId?: string;
  /**
   * #189 functional-VS slice — the POLICY ID (`metadata.name`), used to compose a HAND-AUTHORED functional
   * terminology's emitted `ValueSet` url (`<canonicalBase>/ValueSet/<valueSetId(policyId, name)>`) so the CQL
   * `valueset '<url>'` byte-matches the FHIR lane. Distinct from `localDomainId` (which is `localDomainIdFor(...)`
   * output and diverges for sibling libraries). Absent for direct/test callers → a functional terminology keeps
   * the legacy per-code emission (the latent multi-code bug persists only off the orchestrated path).
   */
  policyId?: string;
  /**
   * Case-feature truth-set emit (the LOCKED case-feature model). When set, this
   * EMITTED LAYER produces the truth-set shape: a `defined as` composition emits
   * `union`/`intersect`/`except` over operands where a LocalPrimitives leaf renders
   * `<LocalPrimitives>."L".asTruths()` and an Inferences operand renders `<Inferences>."N"`
   * (already a truth-set), and the header gains `include CaseFeatureCommon called
   * CFH`. Set PER EMITTED LAYER by `emitPartitioned` — only for the `Inferences` and
   * `Interface` layers of a `code is`/LocalPrimitives family split — so the
   * LocalConcepts/LocalPrimitives layers, the measure (`coded from`/ExternalPrimitives) lane,
   * the per-CRL path, and direct single-file callers stay byte-unchanged.
   *   - `kind: "inferred"`  : `defined as` concepts emit the set-op truth-set body.
   *   - `kind: "interface"` : `__interfaceReexport` concepts emit `…satisfied()`.
   * `localSourceLibrary` / `inferredLibrary` are the emitted CQL library names of
   * the sibling LocalPrimitives / Inferences layers (`partition.libraryNameFor(...)`), so
   * the Emitter classifies a requalified composition ref's TARGET layer EXACTLY (a
   * LocalPrimitives leaf → `.asTruths()`; an Inferences operand → bare) instead of
   * string-suffix-matching a library name.
   */
  caseFeature?: {
    kind: "inferred" | "interface";
    localSourceLibrary: string;
    inferredLibrary: string;
    /**
     * Fix 2 [important] — the emitted ExternalPrimitives sibling-layer library name
     * (`partition.libraryNameFor(policyId, "ExternalPrimitives")`), present when the
     * split has a ExternalPrimitives layer. The truth-set Inferences emit uses it to
     * DETECT a ExternalPrimitives (`coded from`) operand woven into a truth-set
     * (LocalPrimitives/Inferences) `defined as` — the FUTURE `code is` + `coded from`
     * weave — and hard-error (`emit-mixed-source-inference-unsupported`) instead
     * of unioning a truth-set with a record retrieve-list (invalid). Optional:
     * absent when the split has no ExternalPrimitives layer (the deliverable, `code is`
     * only → never triggers).
     */
    recordSourceLibrary?: string;
  };
  /**
   * #227 — RENDER-ONLY library-qualifier rename map (raw CRL library name → the
   * unified FHIR/CQL identity `S = pascalCaseNameForId(name)`). Threaded by
   * `emitCQLImports` for the per-CRL (`none`) path so a NAME-KEEPING-ROOT policy's
   * emitted CQL `library` header, `include` lines, and qualified cross-refs all
   * render under `S` — making the CQL header byte-equal the FHIR `Library.id` ==
   * `name` == url-tail (the identity cqf requires to load the library source).
   *
   * RENDERING ONLY. Self-ref detection (`crossLibraryOf`), context-parameter
   * lookup (`lookupContextParameter`), and the arg-library check stay keyed on the
   * RAW `options.libraryName` / AST qualifier — this map is consulted solely when
   * the qualifier is written into the emitted text. `renderLib` is the identity for
   * any name not in the map, so the layered path (which never passes this) and
   * single-file callers stay byte-unchanged.
   */
  libraryRenames?: ReadonlyMap<string, string>;
  /**
   * #189 Slice-C boundary 1 — a pre-split `concept name → declared shape` map for
   * resolving a REDUCTION operand whose target lives in a DIFFERENT emitted layer
   * library. In the layered path a reduction's records operand is requalified to a
   * cross-layer ref (`<S>-LocalPrimitives."X Records"`), so `emitConceptBody`'s
   * `conceptByName` (built from THIS layer's statements only) cannot see it; this
   * map is computed ONCE from the pre-split working AST (all concepts visible) in
   * `emitPartitioned` and threaded to every layer emitter so the reduction arm can
   * check the operand is a `RecordSet` before rendering `exists`/`Count`/the select.
   * Undefined for the `none` path + single-file callers (their `conceptByName`
   * already holds every concept). Keyed by BARE name — safe for boundary 1's
   * single-rep reductions (the twin `"X Records"` is a distinct name); the full
   * `{libraryIdentity, defineName}` metadata index (§4.5) supersedes it when
   * reductions compose.
   */
  conceptShapesByName?: ReadonlyMap<string, Concept["shape"]>;
  /**
   * ⭐⭐ #189 — `concept name → inline answer set`, built ONCE pre-split (`buildInlineAnswerSetMap`) and
   * threaded to every layer emitter.
   *
   * ⚠ REQUIRED for the cross-layer case, which is the NORMAL one: a concept declaring inline options is a
   * local primitive, while the `"X" in qualifying` predicate over it is an inference — different layers, so
   * this layer's own `conceptByName` cannot see the subject. Same construction and same reason as
   * `conceptShapesByName` above.
   */
  inlineAnswerSetsByName?: ReadonlyMap<string, InlineAnswerSet>;
  /**
   * #189 Slice C boundary 2 (2a) — the AUTHORED (pre-lowering) boolean-totality obligation per concept name,
   * for the totality-ledger enrollment (`emitConcept`). Built by the caller from the RAW authored AST (BEFORE
   * `preLowerAge`/`lowerLocalCodes` mutate it) — `for (c of raw concepts) map.set(c.name, classifyBooleanTotality(c))`
   * — so a `"public-determination"` (or untagged) emitted define inherits its authored obligation rather than
   * a re-classification of its lowered form (which loses `rejected`/E1 signals; disc 439 crit #2). Keyed by
   * authored name (the validator forbids duplicate concept names, so no collision); both-rep's two same-named
   * twins are disambiguated by `Concept.__loweringRole` (the `source-impl` half ignores this map). ABSENT ⇒
   * `emitCQLFromAST` builds it from its own raw input (direct none-lane callers); the layered path passes the
   * caller's map (its own input is already lowered). REPORT-MODE metadata only in 2a (no proof gate consumes it).
   */
  authoredObligations?: ReadonlyMap<string, BooleanTotalityObligation>;
  /**
   * #189 Slice 0c — the cross-library totality service (see `CrossLibraryTotality`). When present, the FAMILY arm
   * of `emitsTotalScalarBoolean` (the boolean-composition operand walk) proves a cross-library / cross-layer operand
   * total via the pre-emit `DeclaredResultIndex`, so a `defined as ( "Lib"."X" and "Y" )` emits `Lib."X" and "Y"`.
   * ABSENT ⇒ the family arm stays inert (same-library only) — direct CLI/test callers are byte-invariant. The legacy
   * arms (bare-ref alias, sem-*) never consult it, so a top-level sem-or `Numerator` is byte-invariant (banner I).
   */
  crossLibraryTotality?: CrossLibraryTotality;
}

/**
 * Issue #79 — Unmatched narrative pattern bookkeeping. Each entry records a
 * `- definition is <narrative>` body that fell through the template matcher.
 * The emitted CQL still contains a sentinel call (see emitDefinitionIs) so
 * downstream CQL compile fails loudly even if the caller ignores this array;
 * `EmitResult.success` is forced to `false` whenever any entry is present.
 */
export interface UnmatchedNarrative {
  text: string;
  line?: number;
  column?: number;
}

/**
 * #108 — a concept carried an `@crl-future-expression: <body>` meta
 * annotation. Each entry is an actionable "the catalog needs to support
 * this narrative" request attached to a concrete authoring site. The
 * canonical text in `expression` is what the author wrote after the
 * `@crl-future-expression:` prefix.
 */
export interface FutureExpressionRequest {
  conceptName: string;
  expression: string;
  line?: number;
  column?: number;
}

export interface EmitResult {
  success: boolean;
  result?: string;
  errors?: CRLError[];
  /**
   * Issue #79 — populated when one or more `- definition is …` bodies failed
   * to match a catalog pattern. When non-empty, `success` is `false` AND the
   * emitted `result` is still populated (with a compile-failing sentinel call
   * in each unmatched spot) so callers can inspect the partial output. Absent
   * field — never an empty array — means every narrative matched.
   */
  unmatched?: UnmatchedNarrative[];
  /**
   * #108 — populated when concepts carry `@crl-future-expression: <body>`
   * meta annotations. Each entry is a machine-trackable catalog-gap
   * request. Does NOT force `success: false` (the emit is still successful);
   * it's an informational signal for tooling that wants to round-trip
   * catalog-gap data. Absent field — never an empty array — means no
   * `@crl-future-expression` annotations were seen.
   */
  futureExpressions?: FutureExpressionRequest[];
  /**
   * #189 Slice C boundary 2 (2a) — the totality-ledger entries enrolled during THIS library's emit (one per
   * emitted `define`, via `DefineLedger.appendDefine`). Populated on EVERY return that carries `result` (a
   * successful emit AND a partial/unmatched/emit-error emit whose `result` is still populated), so a
   * completeness cross-check covers partial output too (disc 439 #9); absent on exception paths with no
   * `result`. Consumed in 2a ONLY by tests running `proveWholeBoundaryTotality` in REPORT mode; carried on
   * `LayeredEmitEntry.result` so callers aggregate across a split's layer libraries. No production gate reads
   * it yet (2b activates the closure-level proof).
   */
  ledgerEntries?: readonly EmittedDefineEntry[];
}

/** Map a canonical pattern name to its `CRLCommon.X` function name. */
const FUNCTION_NAME_OVERRIDES: Record<string, string> = {
  Last: "LastOf",
  First: "FirstOf",
};

function functionNameFor(canonical: string): string {
  return FUNCTION_NAME_OVERRIDES[canonical] ?? canonical;
}

// Shared with the FHIR-lane inline-CQL escaping (fhir-emitter/activity.ts) via cqlStrings — one source of truth
// so the two lanes can't drift (they previously did: this helper escaped only `\`/`'`, missing control chars).
const cqlString = cqlStringLiteral;

// Delegate to the shared quoter (cqlStrings) so the CQL lane and the FHIR lane's
// inline `text/cql-expression` guard can't drift. Escapes `\` first, then `"`.
const cqlIdent = cqlQuotedIdentifier;

// #189 Slice 0b — the boolean-composition leaf policy for the SHARED renderer (`emitTotalBooleanExpr`).
// A concept leaf is referenced BARE: the emit pivot (`emitBooleanComposition`) has ALREADY proven every
// operand a total scalar boolean via `emitsTotalScalarBoolean`, so a `Coalesce` here would MASK a proof
// failure (charter §4 no-magic — contrast the criterion-define policy, whose leaves are defensively
// `Coalesce`-totalized). A criterion ref is not a boolean-composition operand and is UNREACHABLE (the
// totality gate's `branchConditionConceptRefsStrict` throws on it first), so its arm is a defensive invariant.
const compositionLeafPolicy: RenderLeafPolicy = {
  concept: (qualified) => qualified,
  criterionRef: (node) => {
    throw new Error(
      `INVARIANT: a criterion operand ("${getRefName(node.ref)}") reached the boolean-composition renderer; ` +
        "the totality gate (`branchConditionConceptRefsStrict`) should have rejected it first.",
    );
  },
};

// CQL simple identifier: starts with letter or underscore, then word chars.
// Library identifiers that match this can be emitted unquoted, EXCEPT when
// the name happens to be a CQL reserved word — those must be quoted to
// avoid parse errors (e.g. a library named "Context" would otherwise emit
// `library Context` and break the translator).
const SIMPLE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// CQL reserved words that would parse as keywords if emitted unquoted as
// a library/include identifier. Conservatively quote when matched. Not an
// exhaustive list of CQL keywords — covers the ones a clinical library
// is plausibly named after.
const CQL_RESERVED = new Set([
  "and", "as", "asc", "ascending", "case", "cast", "code", "codesystem",
  "concept", "context", "convert", "default", "define", "desc", "descending",
  "display", "div", "during", "else", "end", "ends", "except", "exists",
  "expand", "false", "from", "function", "if", "in", "include", "includes",
  "interval", "intersect", "is", "let", "library", "list", "maximum", "meets",
  "minimum", "mod", "not", "null", "occurs", "of", "on", "or", "overlaps",
  "parameter", "private", "properly", "public", "return", "same", "start",
  "starts", "sort", "then", "this", "to", "true", "tuple", "union", "using",
  "valueset", "version", "when", "where", "width", "with", "within", "without",
  "year", "years", "month", "months", "week", "weeks", "day", "days", "hour",
  "hours", "minute", "minutes", "second", "seconds", "millisecond", "milliseconds",
]);

function cqlLibIdent(s: string): string {
  if (!SIMPLE_IDENT_RE.test(s)) return cqlIdent(s);
  if (CQL_RESERVED.has(s.toLowerCase())) return cqlIdent(s);
  return s;
}

/**
 * Emit a qualified CQL reference `Lib."Name"` (or `"Lib Name"."Name"` when
 * the library name needs quoting). Used wherever a CRL ref carries an
 * explicit library qualifier that doesn't match the current emit's
 * `options.libraryName`.
 */
function cqlQualifiedRef(libraryName: string, name: string): string {
  return `${cqlLibIdent(libraryName)}.${cqlIdent(name)}`;
}

function indent(text: string, level = 1): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

/**
 * Tags whose `@tag: <body>` meta lines render into a CQL block comment on the concept's `define`. DERIVED from the
 * registry's `emit.cql:true` tags (`emitCqlTags()`) — no hand-maintained mirror (#203 Todo 5, disc 225). Kept as an
 * export for the drift-guard test + back-compat; the emit DECISION uses the registry accessors directly (below), which
 * also canonicalize aliases (a raw `EMIT_CQL_COMMENT_TAGS.has(rawTag)` would miss `@over-reach-to-fix` etc.).
 */
export const EMIT_CQL_COMMENT_TAGS: ReadonlySet<string> = emitCqlTags();

// `@cql-comment` is a verbatim passthrough: its prefix is stripped so only the
// body appears in the emitted comment (unlike the other emit.cql tags, which
// keep their `@tag: body` form).
const CQL_COMMENT_RE = /^@cql-comment:\s*(.*)$/;

// #203 Todo 5 — STATUS-AWARE emit. A meta line reaches the generated CQL iff its tag has `emit.cql:true` AND its status
// is not a SUPPRESS status (registry `emit.suppressWhenStatus`, e.g. `["resolved"]`). So an OPEN @ke-feedback emits (a KE
// reads unresolved notes in the generated CQL) and a RESOLVED one does not (noise). Absent/unknown status → `open` →
// EMITS (conservative). Only an EXACT suppress status suppresses — the emitter does NOT run the validator, so an annotated
// `status resolved (per Dr X)` or a duplicate-status line reads as non-resolved and still emits (deliberate: surface
// anything not cleanly resolved). (#212 step 4b: review FLAGS left the registry — no flag tag emits anymore; the store is
// their home.) We parse ONLY to obtain {tag, status}; the RAW line is still what gets rendered (see metaCommentText).
function metaEmitsToCql(line: string): boolean {
  const res = parseMetaTag(line);
  if (res.kind !== "tag" || !emitsToCql(res.parsed.tag)) return false; // accessors canonicalize aliases
  const status = res.parsed.fields.get("status") ?? "open"; // absent status → open (conservative)
  return !suppressStatusesOf(res.parsed.tag).includes(status);
}

// The text rendered into the CQL comment for an emit.cql line: the body alone
// for `@cql-comment`, otherwise the full `@tag: body` line verbatim.
function metaCommentText(line: string): string {
  const m = CQL_COMMENT_RE.exec(line.trim());
  return m ? m[1] : line;
}

// #108: render the emit.cql-eligible CRL `meta is …` lines as a CQL block
// comment to prepend to the concept's emitted `define`. Returns "" when no
// eligible annotations are present. The defusing replacement keeps CRL meta
// text containing "asterisk slash" from accidentally closing the comment early.
// #203 Todo 5 SCOPE NOTE: this is the ONLY caller of the emit filter, and it renders CONCEPT meta — which is why the
// flags' `emit.cqlScopes:["concept"]` is honored STRUCTURALLY (concept is the only lane that reaches here) rather than by
// a code check. If #206 adds a library-header or decision emit path, that new caller MUST consult `cqlScopes` (via a new
// `cqlScopesOf` accessor) before rendering a flag — else a concept-scoped flag would leak into a lane it doesn't declare.
function renderMetaBlock(meta: { text: string }[] | undefined): string {
  if (!meta || meta.length === 0) return "";
  // #154 shape (b): meta entries carry {text, location}; the emit logic operates on the `.text` (the backtick body),
  // so the emitted CQL bytes are unchanged from the old `string[]`.
  const emitted = meta.map((m) => m.text).filter(metaEmitsToCql).map(metaCommentText);
  if (emitted.length === 0) return "";
  const safe = emitted.map((line) => line.replace(/\*\//g, "* /"));
  return `/*\n${safe.map((l) => ` * ${l}`).join("\n")}\n */\n`;
}

type CompositionShape = "boolean" | "refinement";

// === Pattern return-shape classification ===
// #189 P2 D9 — the table now lives in `template-match/patternCatalog`, merged with the projection-scope
// facts so ONE module classifies the catalog. Reached through `patternReturnShape()` /
// `requireReturnShape()`; the raw record is deliberately NOT re-exported, so no caller can reintroduce a
// `?? default` lookup against it.
export type { PatternReturnShape };

/**
 * v2.2 Todo 3 — CRL parameter type → CQL parameter type token.
 *
 * Patient and Practitioner are handled separately (`emitContext`) — they do
 * NOT produce a `parameter` line. This map covers types that emit as
 * ordinary `parameter "X" Type` declarations.
 *
 *   - Period → Interval<DateTime>: matches the CRLCommon timing-arg
 *     signatures (`During(period Interval<DateTime>)` etc.). A CRL author
 *     writing `param type is Period.` is asking for the CQL Interval the
 *     patterns expect — not the FHIR `Period` resource datatype.
 *   - Primitives: PascalCase token per CQL 1.5 grammar.
 *   - FHIR data + resource types: passthrough — unqualified type names
 *     resolve via the library's `using FHIR version '4.0.1'` declaration.
 */
const CRL_PARAMETER_TYPE_TO_CQL: Record<string, string> = {
  // Primitives → PascalCase CQL primitive
  boolean: "Boolean",
  integer: "Integer",
  string: "String",
  date: "Date",
  dateTime: "DateTime",
  time: "Time",
  decimal: "Decimal",
  // Special: Period collapses to Interval<DateTime>
  Period: "Interval<DateTime>",
};

function cqlTypeForParameter(crlType: string): string {
  return CRL_PARAMETER_TYPE_TO_CQL[crlType] ?? crlType;
}

/**
 * Classify a `Parameter` AST node as either a CQL `context` declaration
 * (Patient/Practitioner) or an ordinary `parameter` line.
 *
 * Per operator's rule: every Patient-typed parameter — regardless of its
 * declared name — collapses into `context Patient`. The literal parameter
 * name does NOT survive into emitted CQL; references to a Patient-typed
 * parameter rewrite to the bare `Patient` identifier.
 */
export function infoForParameterStatement(stmt: Parameter): AstParameterInfo {
  if (stmt.parameterType === "Patient") {
    return { kind: "context", contextType: "Patient" };
  }
  if ((stmt.parameterType as string) === "Practitioner") {
    // Practitioner widening DEFERRED in Todo 3 — `parameterTypes.json`
    // currently rejects this at parse time. The branch is future-proofing
    // so the emitter is correct the moment the lexer allowlist widens.
    return { kind: "context", contextType: "Practitioner" };
  }
  return { kind: "parameter", cqlType: cqlTypeForParameter(stmt.parameterType) };
}

/**
 * #189 Slice C 2a — classify every authored concept's boolean-totality obligation from the RAW (pre-lowering)
 * AST, keyed by name, for ledger enrollment (`EmitOptions.authoredObligations`). Each classify is defensive
 * (a malformed concept classifies `rejected`/`unclassified`, never throws) — but wrapped so a future
 * classifier edit that throws can never turn a currently-succeeding emit into an exception (byte-invariance).
 */
export function buildAuthoredObligations(ast: CRL): ReadonlyMap<string, BooleanTotalityObligation> {
  const map = new Map<string, BooleanTotalityObligation>();
  // #189 Piece 1 (disc 506) — the both-rep RECENCY-VALUE concept names, so a `defined as exists ("V")` interface's
  // obligation can be classified as the ACTIVE member-existence fold (total) when V is recency-value, rather than
  // the build-debt `unclassified` arm. This classifier is per-concept and cannot resolve the referent alone; the whole-library
  // scan here supplies it (the SAME `recencyValueNames` set `lowerLocalCodes` computes for the emit side).
  const recencyValueNames = new Set<string>();
  for (const s of ast.statements) {
    if (s.type === "Concept" && s.name && resolveRecencyValueConcept(s).kind === "recency-value") {
      recencyValueNames.add(s.name);
    }
  }
  const isRecencyValueReferent = (name: string): boolean => recencyValueNames.has(name);
  // ⭐ #189 O2 — the whole-library "can be UNANSWERED" set, computed on the AUTHORED AST because
  // `lowerLocalCodes` erases the local `code is` that defines the property (MEASURED: a question and a piece
  // of evidence emit byte-identical defines). A concept's DERIVATION reads a question when any operand it
  // reads is in that set — which is what decides whether its comparator owes a boundary (charter §4).
  const conceptStatements = ast.statements.filter(
    (st): st is Concept => st.type === "Concept" && Boolean(st.name),
  );
  const answerable = questionReachableNames(conceptStatements);
  const derivationReadsAQuestion = (c: Concept): boolean =>
    conceptRefsOfDefinition(c.definition).some(
      (ref) => getRefLibrary(ref) === null && answerable.has(getRefName(ref)),
    );
  for (const s of ast.statements) {
    if (s.type !== "Concept" || !s.name) continue;
    try {
      map.set(s.name, classifyBooleanTotality(s, isRecencyValueReferent, derivationReadsAQuestion(s)));
    } catch (e) {
      map.set(s.name, {
        kind: "unclassified",
        reason: `classifyBooleanTotality threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return map;
}

export function emitCQLFromAST(ast: CRL, options: EmitOptions = {}): EmitResult {
  try {
    // ⭐⭐ #189 — the inline answer-option descriptors, captured HERE because this is the last point the ast
    // is still AUTHORED. `lowerLocalCodes` below CLEARS `Concept.code`, and these ids key on it, so any
    // later build yields an EMPTY map and every `in qualifying` fails to resolve — MEASURED on the probe.
    //
    // ⚠ A CALLER-SUPPLIED map WINS. The orchestrated path builds it from the RAW entry ast before this
    // function ever sees a lowered one (`imports/emit.ts`), exactly as it does the authored totality
    // obligations; this self-build is the fallback for a direct caller.
    const options_ = options.inlineAnswerSetsByName
      ? options
      : {
          ...options,
          inlineAnswerSetsByName: buildInlineAnswerSetMap(
            ast,
            options.localDomainId ?? options.policyId ?? "",
            options.canonicalBase ?? "",
          ),
        };
    options = options_;
    // Slice 3 — lower concept-level `code is` local source codes into synthetic
    // Terminology + CodedFromDefinition BEFORE any indexing/classification, so
    // the rest of this emitter handles them as ordinary asserted concepts. The
    // pass is idempotent (clears `Concept.code`), so a re-entry from the layered
    // path (`emitLayered` → `emitCQLFromAST`) is a no-op. Hard errors (mixed
    // code+definition, empty code, missing type, duplicate code) short-circuit.
    // #257 (age slice) T1 — the shared AGE pre-pipeline: the emit-boundary retirement scan of
    // authored `definition is age today` (the carve-out replaced by the Patient age `source
    // representation`) + the standalone (1-representation) age-posrep synthesis, run BEFORE the
    // `code is` lowering (which additionally handles the 2-representation recency case). Runs on the
    // ORIGINAL ast BEFORE any synthesis, so a definition SYNTHESIZED from a projection (flagged
    // `__synthesizedFromPosrep`) is never mistaken for the retired authored form. The SAME
    // `preLowerAge` runs in the imports/case-feature + FHIR lanes, so the standalone target is usable
    // everywhere and the retirement fires on every path (none runs the Validator).
    const pre = preLowerAge(ast);
    const lowered = lowerLocalCodes(pre.ast, {
      canonicalBase: options.canonicalBase,
      localDomainId: options.localDomainId,
      // ⭐ #189 — the policy id a PRODUCER stage needs to compose its constructed candidate's
      // `meta.profile` through the shared `slug.ts` authority. Absent for direct callers; a concept that
      // needs it refuses loudly rather than stamping an `unnamed` canonical.
      policyId: options.policyId,
    });
    const preEmitErrors = [...pre.errors, ...lowered.errors];
    if (preEmitErrors.length > 0) {
      return { success: false, errors: preEmitErrors };
    }
    // ⭐ #189 — the SYNTHETIC GUARD CRITERIA for ordered-`first:` priority exclusions, appended as ordinary
    // `Criterion` statements so `emitCriteria` emits them on the one criterion path (see `guardDefines.ts`
    // for why an `and` prior needs a named define at all, and why it is modelled as a criterion).
    //
    // This entry is the PER-CRL lane, where the whole source is one library and the `Decision` is present.
    // The LAYERED lane re-enters here with a per-layer AST that carries no `Decision`, so this is a no-op
    // there — `emitPartitioned` appends the same synthetics to its working AST, from the SAME function, and
    // `classifyStatementLayer` routes them into the Interface library the FHIR lane qualifies against.
    const guardCollisions = guardDefineNameCollisions(lowered.ast);
    if (guardCollisions.length > 0) {
      return { success: false, errors: guardCollisions };
    }
    const guardCriteria = synthesizeGuardCriteria(lowered.ast);
    const withGuards: CRL =
      guardCriteria.length > 0
        ? { ...lowered.ast, statements: [...lowered.ast.statements, ...guardCriteria] }
        : lowered.ast;
    // #189 Slice C 2a — the AUTHORED (pre-lowering) obligations for ledger enrollment. Built from the RAW
    // `ast` (BEFORE `preLowerAge`/`lowerLocalCodes`, disc 439 #10) so a `public-determination` inherits its
    // authored obligation, not a re-classification of its lowered form (which loses `rejected`/E1). Built
    // here ONLY when the caller supplied none — the layered path passes its own (its input is already lowered,
    // so this fallback would be wrong for it). Report-mode side channel; it changes no emitted bytes.
    const emitOptions: EmitOptions =
      options.authoredObligations !== undefined
        ? options
        : { ...options, authoredObligations: buildAuthoredObligations(ast) };
    const emitter = new Emitter(withGuards, emitOptions);
    const out = emitter.emit();
    const unmatched = emitter.getUnmatched();
    // Slice 4b D1 — emit-time diagnostics accumulated through the Emitter's
    // clean error channel (`getEmitErrors`), e.g. a codesystem decl name bound
    // to two conflicting urls. These do NOT carry a compile-failing sentinel
    // (the emitted CQL is otherwise well-formed), so they force `success: false`
    // and surface in `errors[]` but leave `result` populated for inspection.
    const emitErrors = emitter.getEmitErrors();
    if (unmatched.length > 0) {
      // Issue #79 — at least one `- definition is …` body fell through the
      // template matcher. The emitted `result` is still populated (with a
      // compile-failing sentinel call per unmatched spot) so callers can
      // inspect partial output, but `success` is forced to `false` and the
      // unmatched diagnostics are mirrored into `errors[]` as Validation
      // entries keyed by `kind: "emit-unmatched-narrative"`.
      const errors: CRLError[] = unmatched.map((u) => ({
        type: "Validation",
        kind: "emit-unmatched-narrative",
        line: u.line,
        column: u.column,
        message: `Unmatched narrative pattern: \`${u.text}\` (no catalog pattern matched). Emitted CQL contains a compile-failing CRLCommon.UnmatchedNarrative(…) sentinel; downstream CQL translation will fail until the body is rewritten to a known canonical narrative.`,
      }));
      return {
        success: false,
        result: out,
        errors: [...emitErrors, ...errors],
        unmatched,
        ledgerEntries: emitter.getLedgerEntries(),
        ...(emitter.getFutureExpressions().length > 0
          ? { futureExpressions: emitter.getFutureExpressions() }
          : {}),
      };
    }
    if (emitErrors.length > 0) {
      // Slice 4b D1 — no unmatched narratives, but an emit-time diagnostic
      // (e.g. conflicting codesystem urls) fired. Surface it and fail the emit
      // while keeping the otherwise well-formed `result` for inspection.
      return {
        success: false,
        result: out,
        errors: emitErrors,
        ledgerEntries: emitter.getLedgerEntries(),
        ...(emitter.getFutureExpressions().length > 0
          ? { futureExpressions: emitter.getFutureExpressions() }
          : {}),
      };
    }
    return {
      success: true,
      result: out,
      ledgerEntries: emitter.getLedgerEntries(),
      ...(emitter.getFutureExpressions().length > 0
        ? { futureExpressions: emitter.getFutureExpressions() }
        : {}),
    };
  } catch (e) {
    // #189 — a `ReductionDefinition` reaching a deep emit path throws a TYPED `StructuredEmitError`
    // (validate-only sentinel `emit-reduction-not-active`, or a coherence/threshold defect the
    // validator-free emit path must fail loud on: `emit-reduction-shape-incoherent` /
    // `emit-count-threshold-trivial`); surface it as a STRUCTURED `Validation` diagnostic (a filterable
    // kind + source location) rather than a bare `type: "Exception"`. Every lane that delegates to
    // `emitCQLFromAST` (the standard CQL lane, `imports/emit`) inherits this. The `code is` + reduction
    // case is caught earlier + structured by `lowerLocalCodes` (never reaches here).
    if (e instanceof StructuredEmitError) {
      return {
        success: false,
        errors: [
          {
            type: "Validation",
            kind: e.kind,
            message: e.message,
            ...(e.location
              ? { line: e.location.start.line, column: e.location.start.column }
              : {}),
          },
        ],
      };
    }
    return {
      success: false,
      errors: [
        {
          type: "Exception",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

export function emitCQL(input: string, options: EmitOptions = {}): EmitResult {
  const parsed = buildCRL(input);
  if (!parsed.success || !parsed.result) {
    return { success: false, errors: parsed.errors };
  }
  return emitCQLFromAST(parsed.result, options);
}

/**
 * Internal NORMALIZED case-feature emit mode. The `"off"` arm is the default
 * (per-CRL path, direct single-file callers, the measure/ExternalPrimitives lane, and
 * the lower LocalConcepts/LocalPrimitives layers): no truth-set shape, no CFH include
 * — byte-unchanged. The two truth-set arms carry the sibling layer library names
 * so the Emitter classifies a requalified composition ref's target layer exactly.
 */
type CaseFeatureMode =
  | { kind: "off" }
  | {
      kind: "inferred";
      localSourceLibrary: string;
      inferredLibrary: string;
      // Fix 2 — the ExternalPrimitives sibling library, when present, so the inferred
      // emit can detect (and hard-error on) a ExternalPrimitives operand woven into a
      // truth-set composition. Undefined when the split has no ExternalPrimitives layer.
      recordSourceLibrary?: string;
    }
  | {
      kind: "interface";
      localSourceLibrary: string;
      inferredLibrary: string;
      recordSourceLibrary?: string;
    };

class Emitter {
  private readonly ast: CRL;
  // `crossLibraryTotality` is stored on its own field (`this.crossLibraryTotality`), not defaulted into this
  // Required shape — it is genuinely optional (absent for direct callers), so it is `Omit`ted here (#189 Slice 0c).
  private readonly options: Required<Omit<EmitOptions, "crossLibraryTotality">>;
  /** Normalized case-feature truth-set emit mode (see `CaseFeatureMode`). */
  private readonly caseFeature: CaseFeatureMode;
  /** Names declared as terminologies (separate set since a name can be BOTH a terminology and a concept in the corpus). */
  private readonly terminologyNames: Set<string> = new Set();
  /** Names declared as concepts. */
  private readonly conceptNames: Set<string> = new Set();
  /**
   * #236 — names declared as CRITERIA. A criterion lowers to a bare `define "X"`
   * (like a concept), so for CQL top-level-identifier collision purposes it is
   * indexed and checked EXACTLY like a concept name: a same-name TERMINOLOGY is
   * suffixed (`detectCollisions`), and a same-name ordinary PARAMETER is a hard emit
   * error (`detectCriterionParameterCollisions`) — NOT the silent concept-vs-parameter
   * shadow, because a criterion is a BOOLEAN guard, not a value the parameter's users
   * could resolve to. Concept-vs-criterion itself can't collide (the validator's
   * concept-XOR-criterion bucket forbids it).
   *
   * "Exactly like a concept" also means criteria inherit the SAME residual, PRE-EXISTING
   * collision gaps the concept `define` surface already has and this pass does NOT close
   * (they are a separate hardening item — a full emitted-identifier preflight — because
   * they bite concepts identically, independent of #236): a `codesystem` DECL name (a
   * terminology body's `TerminologySystem.name`, or the synthetic `<Lib> Local Codes`),
   * a second-order collision from a suffixed terminology name, and an `include` alias
   * (`FHIRHelpers`/`CRLCommon`/`CFH`/cross-library). disc 420, both arms.
   */
  private readonly criterionNames: Set<string> = new Set();
  /** Concept's declared FHIR resource type. */
  private readonly conceptType: Map<string, string | undefined> = new Map();
  /** Concept's declared first valuetype (or undefined). */
  private readonly conceptValuetype: Map<string, string | undefined> = new Map();
  /** Concept's body-definition kind — drives the shape-of-emit heuristic. */
  private readonly conceptBodyKind: Map<string, ConceptDefinition["type"]> = new Map();
  /** For defined-as concepts, the body so we can recurse for shape. */
  private readonly conceptBody: Map<string, ConceptDefinition> = new Map();
  /**
   * Issue #232 — the Concept object by name, so the `sem-not` operand-flavor
   * classifier can read lowering markers (`__bothRepMerge === "recency"` →
   * patient-age truth-set) that live on the Concept, not its definition.
   */
  private readonly conceptByName: Map<string, Concept> = new Map();
  /** Terminology emit name (may differ from CRL name when disambiguated). */
  private readonly terminologyEmitName: Map<string, string> = new Map();
  /**
   * Names of CRL declarations to SKIP emitting. Currently only collisions
   * fold into the emit pipeline through this set — kept as a Set rather
   * than an inline filter so future SKIP cases (cross-library shadowing,
   * deprecation markers) plug in here.
   */
  private readonly skipNames: Set<string> = new Set();
  /**
   * v2.2 Todo 3 (issue #59) — indexed AST `Parameter` declarations. Populated
   * by `indexNames`'s second pass; respects the same-name-concept shadow
   * rule (parameter skipped if a concept of the same name exists). Drives
   * both `emitContext` (Patient/Practitioner) and `emitParameters` (ordinary
   * parameter lines). See [[038-v2.2.0-parameters-todo3-emitter]] R3-Δ1.
   */
  private readonly astParameters: Map<string, AstParameterInfo> = new Map();
  /**
   * Issue #79 — narratives that fell through the template matcher during
   * `emitDefinitionIs`. Each entry's `text` is the joined narrative; the
   * location pins the source span. Surfaced via the `EmitResult.unmatched`
   * field and as `kind: "emit-unmatched-narrative"` validation errors in
   * `EmitResult.errors` (see `emitCQLFromAST`). The CQL string itself
   * contains a compile-failing sentinel call at each spot.
   */
  private readonly unmatchedNarratives: UnmatchedNarrative[] = [];

  /**
   * Slice 4b D1 — emit-time diagnostics that aren't narrative mismatches.
   * The clean error channel reachable from deep in the emit walk (e.g.
   * `emitTerminologyLine` discovering a codesystem decl name bound to two
   * conflicting urls). `emitCQLFromAST` drains this via `getEmitErrors()`
   * and folds it into `EmitResult.errors`, forcing `success: false`. Most of
   * these carry NO compile-failing sentinel — the emitted CQL is otherwise
   * well-formed. EXCEPTION: `refuseNegation` (#232) pushes an
   * `emit-unlowerable-negation` error AND emits a compile-failing
   * `CRLCommon.UnsupportedNegation(…)` sentinel, since the alternative is a
   * silently-wrong (unnegated) body.
   */
  private readonly emitErrors: CRLError[] = [];

  // #108 — concepts carrying `@crl-future-expression: …` annotations;
  // surfaced via the EmitResult.futureExpressions envelope so tooling
  // can track catalog-gap requests programmatically (in addition to
  // the block comment on the emitted define).
  private readonly futureExpressions: FutureExpressionRequest[] = [];

  // #189 Slice C 2a — the totality-ledger: every emitted concept/criterion `define` enrolls here (dual-write,
  // alongside the existing text assembly). Consumed via `getLedgerEntries()` → `EmitResult.ledgerEntries`;
  // REPORT-MODE only in 2a (no proof gate). The ledger's own `render()` is NOT used — output stays the
  // section assembly, byte-identical.
  private readonly ledger = new DefineLedger();

  // #189 Slice 0c — the optional cross-library totality service (see `EmitOptions.crossLibraryTotality`). Stored
  // OUTSIDE the `Required<EmitOptions>`-shaped `this.options` because it is genuinely absent for direct CLI/test
  // callers (the family arm then stays inert — same-library only). Read by `totalityResolvers()`.
  private readonly crossLibraryTotality?: CrossLibraryTotality;

  constructor(ast: CRL, options: EmitOptions) {
    this.ast = ast;
    this.crossLibraryTotality = options.crossLibraryTotality;
    this.options = {
      libraryName: options.libraryName ?? ast.library.name,
      fhirHelpersVersion: options.fhirHelpersVersion ?? DEFAULT_FHIRHELPERS_VERSION,
      crossLibraryIncludes: options.crossLibraryIncludes ?? [],
      crossLibraryParameters: options.crossLibraryParameters ?? new Map(),
      // `canonicalBase` is consumed by `lowerLocalCodes` in `emitCQLFromAST`
      // (before the Emitter is constructed); the Emitter itself never reads it.
      // Kept on the Required<EmitOptions> shape for type completeness.
      canonicalBase: options.canonicalBase ?? "",
      // `localDomainId` (R1) is likewise consumed by `lowerLocalCodes` before
      // construction; kept here only for the Required<EmitOptions> shape.
      localDomainId: options.localDomainId ?? "",
      // #189 functional-VS slice — the policy id for a hand-authored functional terminology's emitted ValueSet url.
      policyId: options.policyId ?? "",
      // `caseFeature` is normalized into `this.caseFeature` below; the
      // Required-shape sentinel here is never read (absence === off).
      caseFeature: options.caseFeature ?? {
        kind: "inferred",
        localSourceLibrary: "",
        inferredLibrary: "",
      },
      // #227 — render-only qualifier rename map (raw → `S`); empty for the layered
      // path and single-file callers, making `renderLib` the identity there.
      libraryRenames: options.libraryRenames ?? new Map<string, string>(),
      // #189 Slice-C boundary 1 — cross-layer reduction-operand shape map (see the
      // EmitOptions doc). Empty for the `none` path / single-file callers, whose
      // `conceptByName` already holds every concept. INERT until the layered
      // reduction emit consumes it (build steps 2–4).
      conceptShapesByName: options.conceptShapesByName ?? new Map<string, Concept["shape"]>(),
      inlineAnswerSetsByName: options.inlineAnswerSetsByName ?? new Map<string, InlineAnswerSet>(),
      // #189 Slice C boundary 2 (2a) — authored (pre-lowering) obligations per concept name for ledger
      // enrollment. Empty when the caller supplied none; `emitCQLFromAST` builds a real map from its raw
      // input before construction and passes it here (direct none-lane callers) — see EmitOptions doc.
      authoredObligations: options.authoredObligations ?? new Map<string, BooleanTotalityObligation>(),
    };
    // Normalize the case-feature emit mode. The public option has no `"off"` arm
    // (absence === off); map it onto the internal discriminated union so the
    // truth-set code paths read one field.
    this.caseFeature = options.caseFeature ? { ...options.caseFeature } : { kind: "off" };
    this.indexNames();
    this.detectCollisions();
    this.detectCriterionParameterCollisions();
    this.guardBothRepLane();
  }

  /**
   * Fix 1 [critical] — GATE the both-representation (`code is` + `defined as`)
   * split to the truth-set/case-feature lane.
   *
   * `lowerLocalCodes` splits such a concept UNCONDITIONALLY into a LocalPrimitives
   * retrieve twin + an Inferences fold-in twin (the Inferences twin carries
   * `__bothRepFoldInLocalPrimitives`). But the fold-in
   * (`LocalPrimitives."X".asTruths() union (<inference>)`) is only emitted by
   * `emitDefinedAs` when `caseFeature.kind === "inferred"`. So a both-rep concept
   * reached via a NON-truth-set path — a DIRECT `emitCQL`/`emitCQLFromAST` (both
   * twins land in ONE library → a duplicate `define "X"`), or a layered split with
   * NO LocalPrimitives layer (`none`-routed / non-decision → `isCaseFeatureSplit`
   * false → the Inferences twin emits with the mode OFF → a fold-in-LESS, invalid
   * Inferences define) — would silently emit invalid CQL.
   *
   * The Inferences twin is the WITNESS: it is the only statement carrying
   * `__bothRepFoldInLocalPrimitives`. In the VALID truth-set Inferences emit the twin is
   * present AND `caseFeature.kind === "inferred"` (no error). The LocalPrimitives twin
   * does NOT carry the marker, so the LocalPrimitives sub-AST (mode off) never trips
   * this. Any other arrival of the marker → a path that won't fold it in → hard
   * error rather than mis-emit. (For the deliverable — decision-bearing local-code
   * policies — the twin always lands in the Inferences layer in truth-set mode.)
   */
  private guardBothRepLane(): void {
    if (this.caseFeature.kind === "inferred") return;
    for (const stmt of this.ast.statements) {
      if (stmt.type === "Concept" && stmt.__bothRepFoldInLocalPrimitives !== undefined) {
        this.emitErrors.push({
          type: "Validation",
          kind: "emit-both-rep-requires-case-feature-lane",
          line: stmt.location.start.line,
          column: stmt.location.start.column,
          message:
            `Both-representation concept "${stmt.name}" (\`code is\` + ` +
            `\`${stmt.definition?.type ?? "?"}\`, merge "${stmt.__bothRepMerge ?? "union"}") ` +
            `reached a non-truth-set emit path (mode "${this.caseFeature.kind}"). The ` +
            `LocalPrimitives-retrieve / Inferences-fold-in split is only valid in the ` +
            `case-feature truth-set lane (a layered split with a LocalPrimitives layer ` +
            `present, emitting the Inferences layer in "inferred" mode). On a direct ` +
            `emit the two twins collide into a duplicate \`define "${stmt.name}"\`; in ` +
            `a LocalPrimitives-less split the fold-in is dropped — either way the CQL is ` +
            `invalid. Emit this policy through the decision/case-feature lane.`,
        });
      }
    }
  }

  /**
   * First pass: index every declaration name + kind.
   *
   * Two-pass over `ast.statements`:
   *   - Pass A: Concept + Terminology. Populates `conceptNames` +
   *     `terminologyNames` so pass B can shadow-check.
   *   - Pass B: Parameter. Per R3-Δ1, an AST parameter whose name collides
   *     with a concept is NOT added to `astParameters` at all (the concept
   *     wins narrative-ref precedence; the parameter is silently shadowed).
   *
   * The single-pass form would depend on Concept-before-Parameter source
   * order, which the corpus follows but the grammar doesn't promise.
   */
  private indexNames(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type === "Concept" && stmt.name) {
        this.conceptNames.add(stmt.name);
        this.conceptByName.set(stmt.name, stmt);
        this.conceptType.set(stmt.name, stmt.conceptType);
        this.conceptValuetype.set(stmt.name, stmt.valueTypes?.[0]);
        if (stmt.definition) {
          this.conceptBodyKind.set(stmt.name, stmt.definition.type);
          this.conceptBody.set(stmt.name, stmt.definition);
        }
      } else if (stmt.type === "Terminology" && stmt.name) {
        this.terminologyNames.add(stmt.name);
      } else if (stmt.type === "Criterion" && stmt.name) {
        // #236 — index criterion names alongside concepts/terminology so the collision
        // passes below see a criterion's `define "X"` identifier.
        this.criterionNames.add(stmt.name);
      }
    }
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Parameter" || !stmt.name) continue;
      // Concept-first shadow: validator allows concept "X" + parameter "X"
      // to coexist; narrative-ref precedence resolves to the concept, so
      // the parameter is effectively unused in CQL. Skip it at index time
      // so `emitContext` and `emitParameters` never see the shadowed entry.
      if (this.conceptNames.has(stmt.name)) continue;
      this.astParameters.set(stmt.name, infoForParameterStatement(stmt));
    }
  }

  /**
   * Second pass: resolve terminology emit names — when a terminology name
   * collides with a concept, a CRITERION (#236), OR an AST parameter of the same
   * name (all produce CQL top-level identifiers `define X` / `valueset X` /
   * `parameter X`), the terminology gets the " ValueSet" / " Code" disambiguating
   * suffix. A criterion is treated exactly like a concept here (both emit `define X`).
   */
  private detectCollisions(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Terminology" || !stmt.name) continue;
      if (
        this.conceptNames.has(stmt.name) ||
        this.criterionNames.has(stmt.name) ||
        this.astParameters.has(stmt.name)
      ) {
        const suffix = hasOnlyValueset(stmt) ? " ValueSet" : " Code";
        this.terminologyEmitName.set(stmt.name, stmt.name + suffix);
      } else {
        this.terminologyEmitName.set(stmt.name, stmt.name);
      }
    }
  }

  /**
   * #236 — a criterion's `define "X"` and a same-name `parameter "X"` both claim the
   * CQL top-level identifier `X` in ONE emitted library → a duplicate-identifier CQL
   * error. Unlike the concept-vs-parameter case (where `indexNames` silently shadows
   * the parameter — a concept SUPERSEDES a same-named parameter as the value narrative
   * refs resolve to), a criterion is a BOOLEAN GUARD, not a value: dropping the
   * parameter would break the concept bodies that read it, and keeping both collides.
   * There is no safe automatic resolution, so this is a HARD emit error. The validator
   * permits the pair (Criterion and Parameter are separate uniqueness buckets), so this
   * emit-seam preflight is the only guard. `astParameters` already excludes any
   * concept-shadowed parameter, and a criterion can't co-exist with a same-name concept,
   * so a hit here is unambiguously a criterion↔parameter clash. Only an ORDINARY
   * parameter (`kind: "parameter"` → emits `parameter "X"`) can collide: a Patient/
   * Practitioner parameter emits `context Patient`, NOT a top-level `"X"` identifier,
   * so its source name never clashes with a criterion's `define` (disc 420, both arms).
   */
  private detectCriterionParameterCollisions(): void {
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Criterion" || !stmt.name) continue;
      // `astParameters` holds BOTH context (Patient/Practitioner) and ordinary parameters; only an
      // ordinary parameter emits the top-level `parameter "X"` identifier that would collide.
      if (this.astParameters.get(stmt.name)?.kind !== "parameter") continue;
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-criterion-parameter-name-collision",
        line: stmt.location.start.line,
        column: stmt.location.start.column,
        message:
          `Criterion "${stmt.name}" and parameter "${stmt.name}" both emit the CQL ` +
          `top-level identifier \`${stmt.name}\` in one library (criterion → \`define\`, ` +
          `parameter → \`parameter\`) — a duplicate-identifier collision. A criterion is a ` +
          `boolean guard, not a value, so the parameter cannot be shadowed the way a same-` +
          `named concept would. Rename the criterion or the parameter.`,
      });
    }
  }

  emit(): string {
    const sections: string[] = [];
    sections.push(this.header());

    const terminologies = this.ast.statements
      .filter((s): s is Terminology => s.type === "Terminology")
      .filter((t) => !this.skipNames.has(t.name));
    if (terminologies.length > 0) {
      sections.push(this.emitTerminologies(terminologies));
    }

    // ⭐⭐ #189 — the qualifying value set behind every `"X" in qualifying` THIS LAYER emits.
    //
    // ⚠ DECLARED IN THE LAYER THAT USES IT, not in the one that owns the concept. The subject is normally a
    // local primitive while the predicate is an inference, so the two are in DIFFERENT libraries; two
    // libraries each declaring the same canonical is ordinary CQL, and it avoids a cross-layer qualifier kept
    // in step by hand. Both declarations come from ONE descriptor, so they cannot disagree about the url.
    //
    // ⚠⚠ IT IS DELIBERATELY **OUTSIDE** THE `terminologies.length > 0` BLOCK, and that is not a style
    // choice. It was written INSIDE it and MEASURED broken: the Inferences layer declares no terminologies of
    // its own, so the block never ran and the layer emitted
    // `… in "np-patient-complaint-answer-options-qualifying"` with NO declaration for it — emit reported
    // SUCCESS and the library would fail to TRANSLATE ("Could not resolve identifier"). The predicate's layer
    // is precisely the one LEAST likely to have authored terminologies, so the enclosing condition was
    // anti-correlated with the need. Do not fold this back in.
    const inlineDecls = this.emitInlineAnswerValuesets();
    if (inlineDecls.length > 0) sections.push(inlineDecls);

    const parameters = this.emitParameters();
    if (parameters) sections.push(parameters);

    sections.push(this.emitContext());

    // ⭐⭐ #189 — THE GENERATED RECORD CONSTRUCTORS, emitted BEFORE the defines that call them.
    //
    // One function per distinct signature per library (design D1/D2 — construction is library-local, and
    // content addressing removes any per-concept parameter, so two concepts constructing the same resource
    // and value type share ONE function). Deduped by `functionName`.
    const constructors = this.emitGeneratedConstructors();
    if (constructors) sections.push(constructors);

    const concepts = this.ast.statements
      .filter((s): s is Concept => s.type === "Concept" && !!s.name)
      .filter((c) => !this.skipNames.has(c.name));
    if (concepts.length > 0) {
      sections.push(this.emitConcepts(concepts));
    }

    // #236 — each `criterion` becomes a boolean CQL define (referenced by identifier from a
    // decision guard, never inline-expanded). Filtered through `skipNames` for parity with concepts
    // (the set is currently never populated → an inert no-op today, kept so criteria participate if
    // a future SKIP case — cross-library shadowing, deprecation — starts populating it).
    const criteria = this.ast.statements
      .filter((s): s is Criterion => s.type === "Criterion" && !!s.name)
      .filter((c) => !this.skipNames.has(c.name));
    if (criteria.length > 0) {
      sections.push(this.emitCriteria(criteria));
    }
    return sections.join("\n\n") + "\n";
  }

  /**
   * #236 — emit each `criterion` as a boolean define. The body references co-resident defines BARE:
   * concept re-exports + sibling criterion defines live in the SAME library (the `none` lane is one
   * library; the layered Interface lane holds the decision's boolean surface + the criteria). No
   * cross-library qualification is needed — everything a criterion references is beside it.
   *
   * ⚠ The define is STRONG KLEENE, not per-operand totalized: an UNKNOWN leaf makes the guard UNKNOWN
   * (`emitCriterionDefine`). Totality belongs at the reference site. Also emits the SYNTHETIC guard
   * criteria (`ast/guardDefines.ts`), which are ordinary criteria in every respect except that the
   * author did not name them.
   */
  private emitCriteria(criteria: Criterion[]): string {
    return criteria
      .map((c) => {
        // A criterion's leaves are all beside it (same library — see the method doc; cross-library criterion refs
        // are out of scope in v0, `cycleDetector.ts`), so this DELIBERATELY renders bare, dropping any library
        // token — byte-invariant under the 0c `ReferenceName` signature (was `cqlIdent(name)`, name = getRefName).
        const cql = emitCriterionDefine(c.name, c.condition, (ref) => cqlIdent(getRefName(ref)), cqlIdent);
        this.enrollCriterion(c.name, cql);
        return cql;
      })
      .join("\n\n");
  }

  /** #189 Slice C 2a — enrolled totality entries for this library's emit (→ `EmitResult.ledgerEntries`). */
  getLedgerEntries(): readonly EmittedDefineEntry[] {
    return this.ledger.entries();
  }

  /** The emitted-library identity every ledger entry keys on — matches the `library` header
   *  (`renderLib(libraryName)`), so a `none`-path raw≠rendered name still keys correctly (disc 439 #9). */
  private ledgerLibrary(): string {
    return this.renderLib(this.options.libraryName ?? "GeneratedFromCRL");
  }

  /** A boolean-valued Scalar concept (exactly one value type, `boolean`). */
  private isBooleanScalarConcept(c: Concept): boolean {
    return c.valueTypes.length === 1 && c.valueTypes[0] === "boolean";
  }

  /** #189 Slice C 2a — a façade's emitted form, so `enrollConcept`'s obligation and `emittedDischargeAndType`'s
   *  discharge AGREE (disc 439 code review, gpt56 #1): `"recordsource"` = a plain record re-export (no boolean
   *  define); `"total-boolean"` = a BARE re-export of a total Inferences reduction (delegates its totality);
   *  `"satisfied"` = `…satisfied()` = `exists(truths)`, intrinsically total by its OWN existence wrapper. */
  private facadeForm(c: Concept): "recordsource" | "total-boolean" | "record-boolean-value" | "satisfied" {
    if (c.__interfaceSourceLayer === "ExternalPrimitives") return "recordsource";
    if (c.__interfaceSourceLayer === "Inferences" && c.__interfaceReexportMode === "total-boolean") return "total-boolean";
    // ⚠⚠ THIS ELSE-BRANCH IS THE DANGEROUS ONE, and a panel arm flagged it as the single worst silent-miss
    // in this change: a mode this function does not know about falls through to `"satisfied"`, which emits
    // `.satisfied()` on a RECORD *and* enrolls a `total` certificate — ill-typed text under a dishonest
    // proof, at `success: true`. So the record-boolean mode is named here explicitly.
    if (c.__interfaceSourceLayer === "Inferences" && c.__interfaceReexportMode === "record-boolean-value") {
      return "record-boolean-value";
    }
    return "satisfied"; // Inferences `.satisfied()` or LocalPrimitives `.asTruths().satisfied()`
  }

  /**
   * #189 Slice C 2a — enroll a concept's emitted `define` into the totality ledger (DUAL-WRITE, alongside the
   * unchanged text assembly). Obligation SOURCE by lowering role (disc 439): impl twins manufacture
   * `not-applicable`; a façade manufactures an obligation matching its emitted form (`facadeForm`); a
   * `public-determination` (or untagged authored) inherits its AUTHORED obligation (`authoredObligations`,
   * else a last-resort in-place classify). `obligationSource` records that provenance so 2b's gate can refuse
   * `in-place`. Discharge + resultType come from the EMITTED form (`emittedDischargeAndType`).
   */
  private enrollConcept(c: Concept, cql: string): void {
    const role = c.__loweringRole;
    let obligation: BooleanTotalityObligation;
    let origin: DefineOrigin = "authored";
    let obligationSource: "manufactured" | "authored-map" | "in-place" = "manufactured";
    if (role === "records-impl" || role === "source-impl") {
      // origin stays "authored" — it is DON'T-CARE for a non-boolean subject (the proof skips origin matching
      // for a `not-boolean`/`nullable` discharge); the enum has no implementation-twin arm.
      obligation = {
        kind: "not-applicable",
        nullable: false,
        reason: `lowering role \`${role}\` — implementation twin (no boolean define)`,
      };
    } else if (role === "interface-facade" && this.caseFeature.kind === "interface") {
      // GATE on `caseFeature.kind === "interface"` — the SAME precondition `emitConceptBody` keys the façade
      // emit on (round-2 code review, Claude #2). A role-tagged concept reaching the public `emitCQLFromAST`
      // with `caseFeature` off emits a LEGACY body, not `…satisfied()`; without this gate it would enroll a
      // manufactured `total` façade over a non-façade body (a false-total). Off the gate, it falls through to
      // the authored/public branch below, which classifies it by the form it ACTUALLY emits. (Production
      // façades always carry `caseFeature: "interface"` — `emitPartitioned` sets it on the Interface layer —
      // so this changes no emitted or enrolled bytes for a real producer.)
      origin = "interface-facade";
      const form = this.facadeForm(c);
      // ⭐ #189 — a PURE QUESTION's façade re-exports `.answeredValue()`, which is three-state BY DESIGN.
      // Keyed on the SAME `__pureQuestion` marker the DISCHARGE side uses (`emittedDischargeAndType`), because
      // the two disagreeing is exactly how this went wrong: the discharge said `three-state` while the
      // obligation fell through to the `…satisfied()` arm below and said `intrinsically-total`, so EVERY
      // façade of a question — the canonical `$apply` PAUSE path — enrolled a proof failure. MEASURED before
      // fixing (`tmp/nullprobe/analysis/facadeledger-out.txt`).
      if (c.__pureQuestion === true) {
        obligation = {
          kind: "sanctioned-three-state",
          family: "question",
          form: "interface façade of a pure question (`answeredValue()` re-export)",
          cell: "§3 pure question → `answeredValue()` true/false/null (NOT totalized)",
        };
      } else if (c.__interfaceThreeStateMerge === true) {
        // ⭐ #189 O3 — the façade of a THREE-STATE both-rep merge. Same shape as the question façade above and
        // for the same reason: the re-export is bare (which propagates the null), so claiming `total` here
        // would make the ledger disagree with what ships and fail the whole-boundary proof.
        obligation = {
          kind: "sanctioned-three-state",
          family: "merge",
          form: "interface façade of a both-rep recency merge (bare re-export of a three-state determination)",
          cell: "§3 question → three-state cross-representation merge (NOT totalized)",
        };
      } else if (form === "record-boolean-value") {
        // ⭐⭐ #189 — the façade of a RECORD-BOOLEAN GUARD. It reads the selected record's boolean carrier
        // (`FHIRHelpers.ToBoolean(… as FHIR.boolean)`), which is three-state by construction: no candidate
        // selected ⇒ `null`. Same family as the merge façade above and for the SAME reason — claiming `total`
        // here would make the ledger disagree with what ships and fail the whole-boundary proof. ⚠ The
        // certificate and the emitted text are decided from ONE marker (`__interfaceReexportMode`), so a mode
        // that renders a value read cannot enroll as anything else.
        obligation = {
          kind: "sanctioned-three-state",
          family: "merge",
          form: "interface façade of a Record-shaped boolean merge (value read of the selected record)",
          cell: "§3 guard reads the VALUE / featureExpression targets the RECORD (NOT totalized)",
        };
      } else if (form === "recordsource") {
        obligation = { kind: "not-applicable", nullable: false, reason: "ExternalPrimitives record re-export (no boolean define)" };
      } else if (form === "total-boolean") {
        // A bare re-export of a total Inferences reduction — total IFF the reduction is (delegated).
        const ref =
          c.definition?.type === "DefinedAsDefinition" && c.definition.body.type === "DefinedAsBareRef"
            ? c.definition.body.ref
            : undefined;
        obligation =
          ref !== undefined
            ? { kind: "composite", operands: [ref], cell: "§2 interface façade — bare total-boolean re-export (delegated)" }
            : { kind: "unclassified", reason: "total-boolean façade with no bare-ref body (unexpected shape)" };
      } else {
        // `…satisfied()` = `exists(truths)` — intrinsically total, independent of the truth-set operand.
        obligation = {
          kind: "intrinsically-total",
          form: "interface façade `…satisfied()` = exists(truths)",
          cell: "§2 interface façade — satisfied() existence wrapper (CaseFeatureCommon)",
        };
      }
    } else {
      // public-determination OR untagged authored: inherit the AUTHORED obligation (the map is built from the
      // RAW pre-lowering AST). The last-resort in-place classify only fires when no map entry exists (a direct
      // caller that skipped the builder, or a caller that passed a map built from LOWERED forms) — documented
      // unsound-as-production-source (disc 439 #4/round-2 #3), tagged `in-place` so 2b's gate can refuse it.
      const mapped = this.options.authoredObligations.get(c.name);
      // Wrap the last-resort classify (symmetry with `buildAuthoredObligations`, round-2 #6): a future
      // classifier edit that throws must never turn a currently-succeeding emit into an exception.
      let inPlace: BooleanTotalityObligation | undefined;
      if (mapped === undefined) {
        try {
          inPlace = classifyBooleanTotality(c);
        } catch (e) {
          inPlace = { kind: "unclassified", reason: `classifyBooleanTotality threw: ${e instanceof Error ? e.message : String(e)}` };
        }
      }
      obligation = mapped ?? inPlace!;
      obligationSource = mapped !== undefined ? "authored-map" : "in-place";
    }
    const { resultType, discharge, result } = this.emittedDischargeAndType(c, role);
    // #189 Slice C 2b.0 — routing visibility from the lowering role. `impl` twins are never routing targets;
    // `facade` ONLY under the same `caseFeature.kind === "interface"` gate the façade emit/obligation use
    // (round-3 pin) — a role-tagged concept in a non-interface lane emitted a legacy body → `public`; an
    // untagged `public-determination`/authored concept is `public`.
    const visibility: DefineVisibility =
      role === "records-impl" || role === "source-impl"
        ? "impl"
        : role === "interface-facade" && this.caseFeature.kind === "interface"
          ? "facade"
          : "public";
    this.ledger.appendDefine({
      library: this.ledgerLibrary(),
      name: c.name,
      resultType,
      obligation,
      discharge,
      origin,
      cql,
      obligationSource,
      result,
      visibility,
      // #189 2b.4a — a FORM-KEYED staging exemption from the HARD gate rides on the still-live REJECTED form
      // (the pre-flip bare-scalar `code is`, set at the classifier). A non-staged reject leaves `staging` unset →
      // the gate blocks it. Families (a)/(c) live on the ungated single-library path, so no discharge-side marker.
      stagingExclusion: obligation.kind === "rejected" ? obligation.staging : undefined,
    });
  }

  /**
   * ⭐ REFACTOR:grounded (#189, 2026-08-29) — a criterion define is a SANCTIONED THREE-STATE GUARD, never a
   * total boolean axiom.
   *
   * `criterionDefineLeafPolicy` renders leaves BARE (`emitCriterionDefine`) precisely so an UNKNOWN leaf
   * makes the guard UNKNOWN: a criterion is a GUARD, and a guard is where a pause has to be able to happen.
   * The charter settles it — *"Composition is strong Kleene, and totality belongs at the arm, never per
   * operand. A negated branch guard is null-propagating"* (§4) — and its one two-valued exception is the
   * per-action `unless` carrier, which re-totalizes at the REFERENCE SITE, not here.
   *
   * ⚠ This enrolled `total`/`axiom` until 2026-08-29, which was a rule that outlived its construct: true
   * before the Kleene flip, false after it, and the ledger went on certifying every criterion — including
   * the synthetic guard defines whose entire mechanism is returning null (MEASURED: `$apply` logs
   * `returned null` for one, and pauses because of it). A false `total` here is exactly the dishonest
   * certificate the §1 proof exists to catch, so the proof was being fed the defect it screens for.
   *
   * The family tag is what keeps the exemption structural: `"guard"` is reachable ONLY from this site, so
   * nothing else can claim a deliberate partial by asking for one.
   */
  private enrollCriterion(name: string, cql: string): void {
    this.ledger.appendDefine({
      library: this.ledgerLibrary(),
      name,
      resultType: "Boolean",
      obligation: {
        kind: "sanctioned-three-state",
        family: "guard",
        form: "criterion define (strong-Kleene guard body — bare leaves)",
        cell: "§4 branch guard → null-propagating; totality belongs at the reference site",
      },
      discharge: { booleanEffect: "three-state", readBy: "strong-Kleene guard body (bare leaves)" },
      origin: "criterion-guard",
      cql,
      obligationSource: "manufactured",
      result: { shape: "Scalar", valueType: "boolean" },
      visibility: "public",
    });
  }

  /**
   * ⭐ #189 — enroll the BOUNDARY HELPER as its own ledger entry.
   *
   * The helper is role-equivalent to a lowered implementation twin: a non-boolean RECORD define with no
   * boolean obligation and nothing to discharge. It exists only so the concept's own define can normalise
   * what it selected, and no consumer outside this library should read it.
   */
  private enrollBoundaryHelper(name: string, cql: string, resourceType: string): void {
    this.ledger.appendDefine({
      library: this.ledgerLibrary(),
      name,
      resultType: `non-Boolean(${resourceType})`,
      obligation: {
        kind: "not-applicable",
        nullable: false,
        reason: "#189 boundary helper — the PRE-transform raw select (no boolean define)",
      },
      // ⚠ `not-boolean`, not a three-state: the helper publishes a RECORD. It can be null (an empty space),
      // but that is record absence, not an unknown truth — the null arm of the transform reads it as such.
      discharge: { booleanEffect: "not-boolean" },
      origin: "authored",
      cql,
      obligationSource: "manufactured",
      result: { shape: "Record", resourceType },
      visibility: "impl",
    });
  }

  /**
   * #189 Slice C 2a — the DISCHARGE + result type of a concept's emitted `define`, from its EMITTED form.
   * `resultType === "Boolean"` is the proof's subject gate; a non-boolean form returns a `non-Boolean(...)`
   * token (skipped by the proof). FAIL-CLOSED (disc 439 #5): a form whose boolean-ness is not locally
   * determinable is reported `nullable`/non-Boolean, never a dishonest `total`. Report-mode snapshot of
   * CURRENT emit — the honest non-total forms are bare comparators (nullable) and authored `rejected` flip-
   * forms; truth-set-lane defined-as emit Lists (skipped) and their Interface `…satisfied()` façade IS total
   * (`exists`); 2b totalizes comparators + composes-over-totals to retire the truth-set lane.
   */
  private emittedDischargeAndType(
    c: Concept,
    role: Concept["__loweringRole"],
  ): { resultType: string; discharge: DischargeMetadata; result: DefineResult } {
    // The `result` (§4.5 2b.0) is the EMITTED define's discriminated result. `total`/`nullable` boolean forms
    // are Scalar<boolean>; `notBoolean` defaults to `{opaque, form}` (the honest arm for a truth-set List / a
    // form whose resource type is not locally known), overridable at a record-bearing site.
    const notBoolean = (form: string, result?: DefineResult): { resultType: string; discharge: DischargeMetadata; result: DefineResult } => ({
      resultType: `non-Boolean(${form})`,
      discharge: { booleanEffect: "not-boolean" },
      result: result ?? { shape: "opaque", form },
    });
    const total = (by: DischargeKind): { resultType: string; discharge: DischargeMetadata; result: DefineResult } => ({
      resultType: "Boolean",
      discharge: { booleanEffect: "total", dischargedBy: by },
      result: { shape: "Scalar", valueType: "boolean" },
    });
    const nullableBool = (reason: string): { resultType: string; discharge: DischargeMetadata; result: DefineResult } => ({
      resultType: "Boolean",
      discharge: { booleanEffect: "nullable", reason },
      result: { shape: "Scalar", valueType: "boolean" },
    });
    // ⭐ #189 null/pause — a sanctioned THREE-STATE read. It IS a Boolean-typed define and it IS null when
    // nothing establishes it; enrolling it as `not-boolean` ("representations-only stub") described the pause
    // mechanism as if no boolean were emitted at all. The ledger now records what actually ships.
    // ⚠ Serves TWO families: a pure QUESTION's newest-answer read, and (O3) a both-rep MERGE of an
    // answerable determination. Named for the READ, not the family, so a third caller does not have to
    // pretend to be a question to use it.
    const threeStateRead = (readBy: string): { resultType: string; discharge: DischargeMetadata; result: DefineResult } => ({
      resultType: "Boolean",
      discharge: { booleanEffect: "three-state", readBy },
      result: { shape: "Scalar", valueType: "boolean" },
    });
    // A RecordSet-emitting form's resource — MIRRORS the emit's own resolution (`emitCodedFrom`
    // `retrieveResourceType ?? conceptType ?? "Observation"`) so `result` reports the resource the retrieve
    // ACTUALLY emits: a synthetic source-impl `CodedFromDefinition` carries `retrieveResourceType`; a
    // hand-authored `coded from` has none and the emit falls back to `type is` (`conceptType`); a records twin
    // / natural retrieve carries `conceptType`. When BOTH are absent the emit uses its LEGACY `"Observation"`
    // default — a fabricated resource the concept never declared, so `result` reports `opaque` there rather
    // than assert a resource the author did not choose (charter §3–§4; a near-never cell — code review #4).
    const recordSetResultOf = (form: string): DefineResult => {
      const rt =
        c.definition?.type === "CodedFromDefinition"
          ? (c.definition.retrieveResourceType ?? c.conceptType)
          : c.conceptType;
      return rt !== undefined ? { shape: "RecordSet", resourceType: rt } : { shape: "opaque", form };
    };

    // Implementation twins publish records — no boolean define.
    if (role === "records-impl" || role === "source-impl") return notBoolean(role, recordSetResultOf(role));
    // Interface façade (disc 439 code review, gpt56 #1 — split by emitted form; `…satisfied()` is total by
    // its OWN existence wrapper, NOT a delegation to the truth-set operand). GATED on `caseFeature.kind ===
    // "interface"` to match the emit precondition (round-2 #2): a role-tagged concept in a non-interface lane
    // emits a legacy body, so it falls through to the definition switch (its ACTUAL form) below.
    if (role === "interface-facade" && this.caseFeature.kind === "interface") {
      // ⭐ #189 null/pause — a PURE QUESTION re-exports as `.answeredValue()`, which is three-state BY DESIGN
      // (true/false/null). Keyed on the SAME `__pureQuestion` marker the emit branch uses (≈:1798) so the
      // ledger cannot drift from the text. Previously this fell through to `total("facade-satisfied")` — the
      // ledger asserted the PAUSE read was TOTAL, which is the exact claim the charter and an executed
      // `$apply` run (`tmp/NOTES-apply-null-behavior.md` §14) both refute.
      if (c.__pureQuestion === true) return threeStateRead("answeredValue");
      // #189 O3 — lock-step with the obligation above: the façade of a three-state merge re-exports bare, so
      // its discharge is three-state, not `facade-delegated` total.
      if (c.__interfaceThreeStateMerge === true) return threeStateRead("bare re-export of a three-state merge");
      const form = this.facadeForm(c);
      if (form === "recordsource") return notBoolean("ExternalPrimitives record re-export");
      if (form === "total-boolean") return total("facade-delegated"); // bare re-export — delegates to the reduction
      // ⭐ #189 — a value read off the selected record is THREE-STATE, never total: an unselected record
      // yields `null`, which is precisely the PAUSE this issue exists to deliver. Certifying it `total` would
      // be the dishonest-certificate failure the enrollment above names.
      if (form === "record-boolean-value") return threeStateRead("record-boolean guard (value read of the selected record)");
      return total("facade-satisfied"); // `…satisfied()` = `exists(truths)` — intrinsically total
    }
    // #189 Slice C 2b.3b.1 — a both-representation twin's discharge is KINDED, lock-step with the emit flip + the
    // totality predicate. A `"recency"` twin emits `Coalesce(CFH.recencyAgeSelected(...), false)` — a TOTAL boolean →
    // discharges `total("boundary-coalesce")`, but ONLY when it declares a Scalar boolean (the SAME invariant
    // `emitRecencyMerge` + the predicate assert; a malformed twin is a loud emit error, so the discharge reports it
    // non-boolean rather than certifying a total it cannot emit). A `"union"` twin still emits a truth-set List
    // (`.asTruths() union …`) → NOT a boolean. Checked before the definition switch because a recency twin's
    // definition does NOT emit via the catalog path.
    if (c.__bothRepMerge === "recency") {
      // ⭐ #189 O3 — THREE-STATE, in lock-step with `emitRecencyMerge` dropping its outer `Coalesce`.
      // A recency twin has a local `code is` by construction, so it is an ANSWERABLE determination and a
      // merge no arm establishes is UNKNOWN, not false. It used to discharge `total("boundary-coalesce")`,
      // which was the pause-killer the proof now rejects for this family.
      return this.isBooleanScalarConcept(c) && assumedShapePreMigration(c.shape) === "Scalar"
        ? threeStateRead("recency-merge (three-state, no boundary)")
        : notBoolean("malformed recency twin (non-scalar-boolean declaration)");
    }
    if (c.__bothRepMerge === "recency-value") return notBoolean("both-rep recency-value scalar value merge");
    if (c.__bothRepMerge !== undefined) return notBoolean(`both-rep ${c.__bothRepMerge} truth-set merge`);

    const def = c.definition;
    if (def === undefined) return notBoolean("representations-only stub");
    switch (def.type) {
      case "ReductionDefinition": {
        const r = def.reduction;
        if (r.kind === "exists") return total("intrinsic-exists");
        if (r.kind === "count") return total("count-bare"); // †runtime empty/null pin (disc 439 #7) — 2b's gate discharges
        // A boolean `most recent this` is `Coalesce(FHIRHelpers.ToBoolean(<newest value read>), false)` ONLY
        // for a Scalar boolean; a `shape is Record` most-recent is a record SELECTION (non-boolean). Guard on
        // shape too, mirroring the coherence guard, not only the value type (disc 439 round-2 #2).
        return this.isBooleanScalarConcept(c) && assumedShapePreMigration(c.shape) === "Scalar"
          ? total("boundary-coalesce")
          : notBoolean(
              "most recent (non-scalar/non-boolean value read)",
              assumedShapePreMigration(c.shape) === "Record" && c.conceptType !== undefined
                ? { shape: "Record", resourceType: c.conceptType }
                : undefined,
            );
      }
      case "CodedFromDefinition":
        return notBoolean("coded-from retrieve", recordSetResultOf("coded-from retrieve"));
      case "DefinedAsDefinition": {
        // The truth-set lanes (inferred/interface) emit a List; the boolean subject is the façade.
        if (this.caseFeature.kind !== "off") {
          // #270 (disc 461 code review, both arms) — a `defined as exists` on the case-feature lane emits a
          // bare scalar `exists(...)` (a TOTAL boolean, `emitExistsBridge`), NOT a truth-set List. Its
          // totality is delivered by the ONE classifier: `emitsTotalScalarBoolean` now returns true for a
          // coherent `Scalar<boolean>` `defined as exists` (`totalScalarBoolean.ts` DefinedAsExists arm),
          // so this discharge, the pivot, `refIsTotal` (alias-to-exists / composition-over-exists), and the
          // Interface façade all read the SAME verdict — no body-tag override, no drift. It discharges
          // `composite-delegated` here (existence is intrinsically total; the closure proof's
          // `intrinsically-total` obligation for a `defined as exists`, `booleanTotality.ts:292`,
          // reconciles against the emitted bare Boolean).
          // #189 Slice C 2b.2 — a FLIPPED bare-ref alias to a total boolean discharges `composite-delegated`: its
          // authored obligation is already `composite` over [referent] (`booleanTotality.ts:296`), so the closure
          // proof delegates to the referent's own total. `emitsTotalScalarBoolean(c)` gates on `c`'s OWN boolean
          // declaration + the referent's totality — LOCK-STEP with the emit flip. Every OTHER truth-set
          // `defined as` (a composition, a non-boolean-declared or non-total alias) stays a List.
          // #189 B3 — a `defined as exists` over a SCALAR-VALUE operand discharges `null-presence` (`is not
          // null`), keyed on the SAME classification as the emitted expression (`existsBridgeIsNullPresence`) so
          // text ↔ discharge cannot drift (disc 500). Checked BEFORE the generic total-boolean path (a
          // `defined as exists` is `emitsTotalScalarBoolean`=true, which would otherwise mask it). INERT — no
          // corpus operand is scalar-value.
          if (def.body.type === "DefinedAsExists" && this.existsBridgeIsNullPresence(def.body)) {
            return total("null-presence");
          }
          // #189 Piece 1 (disc 506) — the value/interface MEMBER-EXISTENCE fold (`code is` + `defined as exists`
          // over a recency-value referent, `__bothRepFoldInLocalPrimitives` set, NO `__bothRepMerge`) emits the
          // three-leg total OR (`emitMemberExistenceFold`), NOT the generic `composite-delegated` alias re-export.
          // Its DEDICATED `member-existence-fold` discharge satisfies the `intrinsically-total` authored obligation
          // (existence is never null) without being mis-checked as a single `exists(...)` (Claude #8).
          if (def.body.type === "DefinedAsExists" && c.__bothRepFoldInLocalPrimitives !== undefined) {
            return total("member-existence-fold");
          }
          if (emitsTotalScalarBoolean(c, this.totalityResolvers())) {
            return total("composite-delegated");
          }
          // ⚠⚠ REFACTOR:suspect — #189 T5 step 2b, MEASURED HOLE, do not read this arm as intent.
          //
          // Since 2b the emit PIVOT routes on `emitsBareReExportableScalarBoolean` (is every operand a scalar
          // BOOLEAN), not on totality — so a composition over a three-state operand now emits a strong-Kleene
          // BOOLEAN (`"Adult Patient" and "Active Crohns Disease"`), not a truth-set List. This arm still
          // reports `non-Boolean(truth-set defined-as (List))` for it, which is FALSE, and the consequence is
          // worse than a wrong label: `isBooleanSubject` keys on `resultType`, so these defines drop OUT of the
          // boolean proof entirely and design §3's "every boolean define is total or a member of a CLOSED
          // sanctioned three-state family" goes UNENFORCED for exactly the family 2b introduces. The proof
          // still reports `proven` — vacuously. MEASURED via the test-mode ledger on `code-is-basic`
          // ("Adult With Crohns") and `semnot-232` (all five compositions).
          //
          // The fix is the plan's MACHINE (3): classify a Kleene composition `sanctioned-three-state`
          // (a new `family: "composition"`) with a matching `threeStateRead` discharge, and teach the prover to
          // accept a proven-three-state operand. Until then this hole is RECORDED, not papered over.
          return notBoolean("truth-set defined-as (List)");
        }
        // LEGACY lane (`caseFeature` off — cms/none): the emitted shape depends on the body + value type
        // (disc 439 code review, gpt56 #2 / Claude #1 — the flat "Boolean/composite" row was body/shape-blind):
        //   - `defined as exists ("X")` → `exists (...)` — intrinsically total.
        //   - boolean value type → boolean `and`/`or`/`not` composition/alias — a delegated composite.
        //   - non-boolean value type → REFINEMENT `union`/`intersect`/`except` (a List) — NOT a boolean define
        //     (labeling it Boolean would pollute the subject set AND false-PASS an ill-typed refinement whose
        //     operands happen to be total booleans).
        const body = def.body;
        // #189 B3 — null-presence (`is not null`) for a SCALAR-VALUE operand, `intrinsic-exists` (`exists(...)`)
        // for a record operand — the SAME `existsBridgeIsNullPresence` classification the emitted expression uses
        // (disc 500, no drift). INERT (no corpus operand is scalar-value).
        if (body.type === "DefinedAsExists")
          return total(this.existsBridgeIsNullPresence(body) ? "null-presence" : "intrinsic-exists");
        // #189 Slice 0b — a boolean composition discharges total IFF the family predicate proves every
        // operand a total scalar boolean (the SAME verdict the emit pivot + the case-feature discharge
        // above read, banner A). A non-total composition emits a LOUD error (not a define), so it must NOT
        // certify a total it cannot emit — the `declaredShapeOfConcept` check below (a value-type test, not
        // a totality proof) would wrongly do so.
        if (body.type === "DefinedAsBooleanComposition") {
          // ⚠⚠ REFACTOR:suspect — the LEGACY-lane half of the same measured hole as the case-feature arm above.
          // The `notBoolean` reason ("emit error") was true before 2b, when a non-total operand could not be
          // composed at all. It is now false for a THREE-STATE operand: the pivot admits it and emits a Kleene
          // Boolean. See the arm above for the measurement and for machine (3), the fix.
          return emitsTotalScalarBoolean(c, this.totalityResolvers())
            ? total("composite-delegated")
            : notBoolean("boolean composition with a non-total operand (emit error)");
        }
        // Boolean-vs-refinement is the emitter's OWN `declaredShapeOfConcept` rule (`valueTypes.includes
        // ("boolean")`), NOT `isBooleanScalarConcept` (exactly-one) — a multi-value-type concept including
        // `boolean` emits boolean CQL (round-2 code review). (A composition/alias's declared value type is
        // value-preserving vs its operands/referent, so this labels the alias by the type it emits; a
        // validator-free MISMATCH is a `rejected` obligation — caught before the subject filter.) Note the
        // KNOWN false-FAIL cell: a boolean composition over refinement operands is emitted total (each leaf
        // `exists`-bridged) but its List operand DEFINES enroll `not-boolean`, so the composite proof fails a
        // form whose CQL is total — that cell dies at the flip (refinement-leaf-in-boolean-parent
        // warning→error), so counting it in the 2a burn-down baseline is deliberate (round-2 #5).
        return this.declaredShapeOfConcept(c) === "boolean"
          ? total("composite-delegated")
          : notBoolean("refinement composition/alias (List)");
      }
      case "DefinitionIsDefinition": {
        const call = matchNarrative(def.body);
        if (!call.known) {
          // Unmatched narrative — the emitter emits a compile-failing sentinel. Fail-closed: report nullable
          // on a boolean concept (never a false `total`), non-Boolean otherwise.
          return this.isBooleanScalarConcept(c)
            ? nullableBool(`unmatched narrative "${call.pattern}" (fail-closed)`)
            : notBoolean("unmatched narrative");
        }
        const shape = patternReturnShape(call.pattern);
        if (shape === "boolean") {
          // ⭐ #189 O2 — lock-step with the emit above: a comparator over an ANSWERABLE operand emits BARE
          // (no boundary), so it discharges THREE-STATE. Keyed on the same authored obligation the emit
          // reads, which is what stops the metadata and the lowering disagreeing.
          const authoredCmp = this.options.authoredObligations?.get(c.name);
          if (authoredCmp?.kind === "sanctioned-three-state" && authoredCmp.family === "derivation") {
            return threeStateRead("comparator over a question (three-state, no boundary)");
          }
          // #189 Slice C 2b.1 — a boolean-DECLARED comparator now emits `Coalesce(<cmp>, false)` (total at its
          // boundary, `emitDefinitionIs`); a refinement-declared concept over a boolean pattern is the
          // ill-typed FIXME passthrough (`emitDefinitionIs` `:2522`), still a bare nullable boolean. Discharge
          // in lock-step with the emit, keyed on the emitter's OWN `declaredShapeOfConcept` rule.
          return this.declaredShapeOfConcept(c) === "boolean"
            ? total("boundary-coalesce")
            : nullableBool(`catalog comparator \`${call.pattern}\` in a refinement concept (FIXME passthrough)`);
        }
        if (shape === "list") {
          // A LIST pattern (`Has`/`WasPerformed`/…) realizes a boolean consumer as `exists <call>` — presence
          // over the set IS the intended boolean, so it is intrinsically total.
          return this.isBooleanScalarConcept(c)
            ? total("intrinsic-exists")
            : notBoolean(`catalog \`${call.pattern}\` (list)`);
        }
        if (shape === "instance") {
          // #189 Slice C 2b.1 code review (both arms) — an INSTANCE pattern (`most recent "X"`/`Last`/…) on a
          // boolean concept emits presence-semantics `exists { <selection> }` (`emitDefinitionIs`), which is
          // the §4 GAP-3 value-vs-presence cell: presence of the newest record ≠ "its boolean value is true".
          // `classifyBooleanTotality` classifies it `unclassified` and REFUSES to certify presence as total
          // (`booleanTotality.ts:139-147`). Keep the DISCHARGE honest — report `nullable`, NOT a false `total`,
          // so the ledger/`CloseIndex` never certifies a total over this semantically-unresolved lowering. The
          // `unclassified` obligation already makes the proof `incomplete`; the SEMANTIC accept-presence-vs-
          // reject-with-migration decision is deferred to 2b.3 (the value-read lowering) — its death point.
          return this.isBooleanScalarConcept(c)
            ? nullableBool(`instance-pattern \`${call.pattern}\` on a boolean concept — value-vs-presence unresolved (§4 gap 3, → 2b.3)`)
            : notBoolean(`catalog \`${call.pattern}\` (instance)`);
        }
        return notBoolean(`catalog \`${call.pattern}\` (other)`);
      }
    }
  }

  /** Issue #79 — unmatched narratives accumulated during this emit. */
  getUnmatched(): UnmatchedNarrative[] {
    return this.unmatchedNarratives;
  }

  /** Slice 4b D1 — emit-time diagnostics accumulated during this emit. */
  getEmitErrors(): CRLError[] {
    return this.emitErrors;
  }

  /** #108 — `@crl-future-expression` annotations seen during this emit. */
  getFutureExpressions(): FutureExpressionRequest[] {
    return this.futureExpressions;
  }

  private header(): string {
    const lines: string[] = [
      // CRL's library identity emits without a version (npm packaging
      // handles the package version). CRLCommon is our own library —
      // also no version. `using FHIR version` is a semantic FHIR model
      // identifier (R4 vs R5 is a different shape) — kept. FHIRHelpers
      // ships versioned with the FHIR spec — version pin kept.
      // #227 — render the header through the rename map: a name-keeping-root's
      // `library` header must be `S` (== the FHIR Library.id/name/url-tail), not
      // the raw CRL name. Identity for the layered path (empty map).
      `library ${cqlLibIdent(this.renderLib(this.options.libraryName ?? "GeneratedFromCRL"))}`,
      "",
      "using FHIR version '4.0.1'",
      "",
      `include FHIRHelpers version '${this.options.fhirHelpersVersion}' called FHIRHelpers`,
      "include CRLCommon called CRLCommon",
    ];
    // Case-feature truth-set lane (Inferences / Interface layers only): the
    // emitted bodies call the fluent `asTruths()` / `satisfied()` helpers, so the
    // layer `include`s CaseFeatureCommon. Ordered immediately after CRLCommon,
    // BEFORE the cross-library layer includes — matching the goldens.
    //
    // FLUENT-RESOLUTION RISK (verified-by-spec, not by an in-repo compiler). The
    // emitted bodies invoke `asTruths()` / `satisfied()` METHOD-STYLE on an
    // `include`d library with NO `CFH.` qualifier (e.g. `LocalPrimitives."X".asTruths()`).
    // The CQL spec (§ fluent functions) resolves a fluent function invoked
    // method-style across `include`d libraries, and the ASLP `ASLPPolicyCaseFeatures.cql`
    // precedent relies on exactly this. There is NO CQL→ELM translator in this repo
    // (the "compiler-proof" stage is explicitly post-deadline — docs/mvp-roadmap.md),
    // so the byte-goldens do NOT prove the translator resolves these refs. RESIDUAL
    // RISK: verify on a real CQL engine downstream; if fluent method-style resolution
    // across an `include` does NOT hold, the model + goldens must switch to qualified
    // `CFH.asTruths(...)` calls.
    // ⭐ #189 null/pause T5 step 2b — a PURE QUESTION's determination emits `"X Records".answeredValue()`,
    // which is also a CaseFeatureCommon fluent, and a question is NOT decision-bearing by construction — so it
    // reaches the DIRECT (unlayered) path where the case-feature lane is "off". Without this the emitted CQL
    // calls a fluent from a library the header never includes, and it cannot translate. MEASURED: a one-question
    // library emitted `"Present Records".answeredValue()` under a header carrying only FHIRHelpers + CRLCommon.
    const emitsQuestionRead = this.ast.statements.some(
      (s) => s.type === "Concept" && s.__pureQuestionRead === true && !this.skipNames.has(s.name),
    );
    if (this.caseFeature.kind !== "off" || emitsQuestionRead) {
      lines.push("include CaseFeatureCommon called CFH");
    }
    // Cross-library includes for per-CRL emit: every other CRL library this
    // file qualified-refs gets its own `include` line. Simple include (no
    // `called` alias) so qualified refs can use the natural `Lib."X"` form.
    for (const otherLib of this.options.crossLibraryIncludes ?? []) {
      // #227 — render each cross-library `include` under the target's `S`, so an
      // `include` of a name-keeping-root sibling matches that sibling's header/id.
      lines.push(`include ${cqlLibIdent(this.renderLib(otherLib))}`);
    }
    return lines.join("\n");
  }

  /**
   * Decide if a ref's library qualifier should produce a cross-library
   * CQL emit. Returns null for self-refs (qualifier matches current
   * library) and bare refs. Returns the qualifier string for cross-lib refs.
   */
  private crossLibraryOf(ref: ReferenceName): string | null {
    if (!isQualifiedRef(ref)) return null;
    const lib = getRefLibrary(ref);
    if (lib === null) return null;
    // Self-ref detection stays keyed on the RAW library name (#227): the AST
    // qualifier and `options.libraryName` are both raw on the `none` path.
    if (lib === this.options.libraryName) return null;
    // A genuine cross-lib qualifier — RENDER it through the rename map so a
    // reference to a name-keeping-root sibling emits under that sibling's `S`.
    return this.renderLib(lib);
  }

  /**
   * #227 — map a library qualifier from its RAW CRL name to the emitted CQL/FHIR
   * identity `S` for RENDERING (header / `include` / qualified ref). Identity for
   * any name absent from the map, so the layered path and single-file callers
   * (which pass no `libraryRenames`) are byte-unchanged.
   */
  private renderLib(name: string): string {
    return this.options.libraryRenames.get(name) ?? name;
  }

  /**
   * Emit `parameter "Name" Type` lines for each AST `Parameter` node with
   * `kind: "parameter"`. Patient/Practitioner-typed AST parameters land in
   * `emitContext` instead. No default clause — runtime callers supply
   * values explicitly. Returns empty string when no ordinary parameters
   * are declared.
   */
  private emitParameters(): string {
    const lines: string[] = [];
    for (const [name, info] of this.astParameters) {
      if (info.kind !== "parameter") continue;
      lines.push(`parameter ${cqlIdent(name)} ${info.cqlType}`);
    }
    if (lines.length === 0) return "";
    return lines.join("\n");
  }

  /**
   * Emit the CQL `context` line. Defaults to `context Patient`; promotes to
   * `context Practitioner` when any AST parameter declares `param type is
   * Practitioner.` (operator's rule: Practitioner takes precedence).
   *
   * When both Patient AND Practitioner-typed parameters coexist (currently
   * undetected by the validator), a `// FIXME` comment lands above the
   * chosen `context` line so the divergence is visible in the generated CQL.
   * A hardening validator diagnostic is tracked for a follow-up.
   */
  private emitContext(): string {
    let hasPatient = false;
    let hasPractitioner = false;
    for (const info of this.astParameters.values()) {
      if (info.kind !== "context") continue;
      if (info.contextType === "Patient") hasPatient = true;
      else if (info.contextType === "Practitioner") hasPractitioner = true;
    }
    const chosen = hasPractitioner ? "Practitioner" : "Patient";
    if (hasPatient && hasPractitioner) {
      return `// FIXME: multiple context-typed parameters declared; emitted as ${chosen}\ncontext ${chosen}`;
    }
    return `context ${chosen}`;
  }

  /**
   * Look up a `ConceptRefArg` (possibly qualified) against the parameter
   * indexes. Returns context-rewrite info when the ref resolves to a
   * `kind: "context"` AST parameter — bare local, qualified self-ref, or
   * qualified cross-library — so `emitArg` can emit the CQL context type
   * (`Patient` / `Practitioner`) in place of the literal name.
   *
   * Dispatch (per R4-Δ1):
   *   - Bare ref OR qualified self-ref → consult internal `astParameters`.
   *   - Foreign qualified ref → consult `EmitOptions.crossLibraryParameters`
   *     keyed by the qualifier string.
   */
  private lookupContextParameter(
    library: string | undefined,
    name: string,
  ): { contextType: "Patient" | "Practitioner" } | null {
    if (library === undefined || library === this.options.libraryName) {
      const info = this.astParameters.get(name);
      if (info && info.kind === "context") return { contextType: info.contextType };
      return null;
    }
    const targetMap = this.options.crossLibraryParameters.get(library);
    if (!targetMap) return null;
    const info = targetMap.get(name);
    if (info && info.kind === "context") return { contextType: info.contextType };
    return null;
  }

  private emitTerminologies(terms: Terminology[]): string {
    // Slice 4b — dedup shared `codesystem` declarations across terminologies.
    // Lowered concept-level local codes (`code is`) carry a SHARED codesystem
    // decl name on their `TerminologySystem.name` (the per-library domain, e.g.
    // "<Lib> Local Codes"), all sharing one URL. Emit that decl ONCE; later
    // terminologies referencing the same decl name skip the codesystem line but
    // still emit their own `code` line `from "<domain>"`. Hand-authored
    // terminologies (no `.name`) fall back to the historical per-terminology
    // "<emitName> System" decl, which is unique per terminology, so they never
    // collide in this map.
    //
    // D1 — keyed `decl name → emitted url` (not a bare name-Set) so a SECOND
    // decl reusing the name with a DIFFERENT url is detected as a conflict
    // rather than silently dropped and bound to the first url. Same-name +
    // same-url is the legitimate synthetic-local dedup (returns ""); same-name +
    // different-url pushes an `emit-codesystem-url-conflict` diagnostic through
    // the Emitter's clean error channel and the decl is still emitted.
    const emittedCodesystems = new Map<string, string>();
    return terms
      .map((t) => this.emitOneTerminology(t, emittedCodesystems))
      // Future-proofing: drops a terminology whose every line vanished. Today
      // the `code` line always survives (only the deduped `codesystem` line can
      // return ""), so no terminology fully vanishes — but the guard keeps the
      // join clean if that ever changes.
      .filter((s) => s.length > 0)
      .join("\n");
  }

  private emitOneTerminology(t: Terminology, emittedCodesystems: Map<string, string>): string {
    const emitName = this.terminologyEmitName.get(t.name) ?? t.name;
    // Resolve the codesystem DECL name from the body's single TerminologySystem
    // line: its synthetic shared `name` when present (slice 4b), else the
    // historical "<emitName> System". This is the name the `codesystem` decl
    // declares AND the name every `code` line in this terminology references via
    // `from`, so a code can resolve the shared decl even when its own
    // codesystem line was deduped away. Single `system` line per terminology is
    // assumed for the `from` binding; a multi-`system` body (hand-authored —
    // the grammar allows multiple `TerminologySystem` lines) is handled by the
    // D1 url-conflict guard in `emitTerminologyLine`.
    const systemLine = t.body.find(
      (l): l is TerminologySystem => l.type === "TerminologySystem",
    );

    // #189 functional-VS slice — a HAND-AUTHORED functional terminology (`system is`/`code is`, no `valueset is`)
    // binds its OWN emitted FHIR ValueSet by url (`valueset "X": '<vs-url>'`), the SAME rule the reference form
    // (`valueset is <url>`) already follows — instead of per-code `code "X"` decls that COLLIDE (invalid CQL) on a
    // multi-code body. Discriminator: `TerminologySystem.name` is SYNTHETIC-EMITTER-ONLY (ast/types.ts:352-366; the
    // parser never sets it) — `name === undefined` ⇒ hand-authored; a lowered-local-code terminology has it SET
    // (the `<Lib> Local Codes` domain) and stays on the UNCHANGED `codesystem`/`code` path below. Gated on
    // `policyId` (orchestrated path only) so no direct/test caller silently changes; the url is byte-matched to the
    // FHIR `ValueSet.url` via the shared `valueSetUrl`, so the `[Resource: "X"]` retrieve resolves membership over
    // ALL the terminology's codes.
    const hasValueset = t.body.some((l) => l.type === "TerminologyValueset");
    const hasCode = t.body.some((l) => l.type === "TerminologyCode");
    const isHandAuthoredFunctional =
      systemLine !== undefined && systemLine.name === undefined && hasCode && !hasValueset;
    if (isHandAuthoredFunctional && this.options.canonicalBase && this.options.policyId) {
      const url = valueSetUrl(this.options.canonicalBase, this.options.policyId, t.name);
      return `valueset ${cqlIdent(emitName)}: ${cqlString(url)}`;
    }

    // Reference terminologies (`valueset is`) + synthetic lowered-local-code terminologies (system `name` set):
    // UNCHANGED per-line emission — this is the "local codes untouched" path.
    const codesystemName =
      systemLine?.name ?? emitName + " System";
    return t.body
      .map((line) =>
        this.emitTerminologyLine(emitName, codesystemName, line, emittedCodesystems),
      )
      .filter((s) => s.length > 0)
      .join("\n");
  }

  private emitTerminologyLine(
    emitName: string,
    codesystemName: string,
    line: TerminologyBodyLine,
    emittedCodesystems: Map<string, string>,
  ): string {
    switch (line.type) {
      case "TerminologyValueset":
        return `valueset ${cqlIdent(emitName)}: ${cqlString(line.valuesetName)}`;
      case "TerminologySystem": {
        // Dedup by codesystem decl name, keyed name → emitted url (D1). For
        // synthetic locals the (name,url) pair is uniform across the library, so
        // the first occurrence emits and every later occurrence with the SAME
        // url is the legitimate dedup (returns ""). A later occurrence reusing
        // the name with a DIFFERENT url is invalid CQL (one decl name cannot
        // bind two urls): surface it on the clean error channel and still emit
        // the conflicting decl (so the divergence is visible, not silently
        // dropped + mis-bound to the first url).
        const recordedUrl = emittedCodesystems.get(codesystemName);
        if (recordedUrl !== undefined) {
          if (recordedUrl === line.system) return "";
          this.emitErrors.push({
            type: "Validation",
            kind: "emit-codesystem-url-conflict",
            line: line.location?.start.line,
            column: line.location?.start.column,
            message:
              `codesystem ${cqlIdent(codesystemName)} is declared with conflicting ` +
              `urls: '${recordedUrl}' and '${line.system}'. A CQL codesystem ` +
              `identifier must bind exactly one url; both declarations are emitted ` +
              `so the conflict is visible, but the resulting CQL is invalid until ` +
              `one declaration is renamed or its url corrected.`,
          });
          return `codesystem ${cqlIdent(codesystemName)}: ${cqlString(line.system)}`;
        }
        emittedCodesystems.set(codesystemName, line.system);
        return `codesystem ${cqlIdent(codesystemName)}: ${cqlString(line.system)}`;
      }
      case "TerminologyCode":
        return `code ${cqlIdent(emitName)}: ${cqlString(line.code)} from ${cqlIdent(codesystemName)}`;
    }
  }

  private emitConcepts(concepts: Concept[]): string {
    return concepts.map((c) => this.emitConcept(c)).join("\n\n");
  }

  private emitConcept(c: Concept): string {
    const header = `define ${cqlIdent(c.name)}:`;
    // ⭐ #189 null/pause T5 step 2b — the PURE QUESTION's Inferences twin. Dispatched HERE, ahead of the
    // representations-only guard below, because the twin deliberately carries no `definition`: the read is a
    // compiler-synthesized lowering, not an authored form. Without this the compiler would report a define it
    // built itself as unbuilt work.
    const questionRead = c.__pureQuestionRead === true ? this.emitPureQuestionRead(c) : undefined;
    // ⚠ A concept with no definition after lowering is REPRESENTATIONS-ONLY, and its lowering is unbuilt.
    // This used to emit a comment as the define's entire body — a `define` with no expression, i.e. CQL that
    // cannot translate — while the emitter reported SUCCESS. Silent success on invalid output is the worst
    // of the three options: worse than failing, and worse than an honest placeholder, because it reads as
    // "this works" to every consumer and to every progress report.
    //
    // Legal-but-unbuilt fails LOUDLY (charter §0a). The shape is canonical — do NOT re-author around it.
    if (c.definition === undefined && questionRead === undefined) {
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-representations-only-not-lowered",
        line: c.location.start.line,
        column: c.location.start.column,
        message:
          `Concept "${c.name}" is representations-only (a \`source representation\` with no top-level ` +
          `definition) and its emit lowering is NOT YET BUILT. This is unbuilt work, not an illegal form — ` +
          `the shape is canonical (charter §2/§3), so do not re-author the concept to avoid this. Emit ` +
          `fails rather than producing a define with no body.`,
      });
    }
    const body =
      questionRead ??
      (c.definition
        ? this.emitConceptBody(c, c.definition)
        : `CRLCommon.UnmatchedNarrative('representations-only concept "${c.name}" — emit lowering not yet built')`);
    // #108: emit `meta is` annotations as a leading block comment on the
    // concept's `define`. CRL preserves them on Concept.meta but the
    // emitter was dropping them silently. `@logic-expression-text`,
    // `@crl-future-expression`, and `@ke-feedback` are authoring
    // conventions that specifically need to land in the emitted artifact
    // for downstream readers (knowledge engineers + catalog-gap trackers).
    const metaBlock = renderMetaBlock(c.meta);
    // #108: surface `@crl-future-expression` annotations as machine-trackable
    // catalog-gap requests in the EmitResult envelope (in addition to the
    // block comment). Other `@tag` prefixes (e.g. `@ke-feedback`,
    // `@logic-expression-text`) get only the comment.
    if (c.meta) {
      for (const entry of c.meta) {
        // #154 shape (b): read `.text`; KEEP `c.location` for the emitted coordinates (switching to the meta-line
        // location would change the EmitResult envelope values, though not the .cql bytes).
        const m = /^@crl-future-expression:\s*(.+)$/.exec(entry.text);
        if (m) {
          this.futureExpressions.push({
            conceptName: c.name,
            expression: m[1].trim(),
            line: c.location.start.line,
            column: c.location.start.column,
          });
        }
      }
    }
    // ⭐⭐ #189 — THE BOUNDARY TRANSFORM. When lowering resolved a spec, this concept's space can publish a
    // record that is NOT its case feature (an unprojected source arm), so "<X>" normalises rather than
    // publishing the raw winner, and the raw select moves to a helper define.
    //
    // ⚠ THE TRANSFORM IS ON THE CONCEPT'S OWN DEFINE because the ruling is consumer-independent (charter
    // §3: "it does not depend on which consumer is asking"). Putting it on the helper and pointing only the
    // `cpg-featureExpression` at it would show the questionnaire a case feature while every other CQL
    // consumer read the raw record — and would LOOK correct, because the questionnaire is the surface the
    // defect was reported on.
    //
    // ⚠ PRESENCE OF THE SPEC IS THE GATE, decided at lowering. Nothing is emitted for a concept whose space
    // conforms by construction (`Obese`, whose Condition arm is projected) — a check with a provably dead
    // else-branch is noise a reader must then re-verify.
    const boundary = c.__boundaryTransformSpec as BoundaryTransformSpec | undefined;
    if (boundary !== undefined) {
      const selectedRef = cqlIdent(boundarySelectedDefineName(c.name));
      // ⭐ ONE code expression for BOTH the check and the construct. Probed: an inline `FHIR.CodeableConcept`
      // compares correctly with `~` on every coding cell, so no `code` declaration and no terminology
      // include are needed, and the two uses cannot drift (`tmp/NOTES-kernel-spellings-executed.md`).
      const codeLit = candidateCodeCql(boundary.code);
      const constructed = constructorCallExpr({
        functionName: boundary.signature.functionName,
        code: boundary.code,
        // ⚠ A VALUELESS concept's constructor takes `established`, not `value` — its truth is the record's
        // PRESENCE, so the replacement asserts existence rather than copying a datum that does not exist.
        valueExpr:
          boundary.carrier === undefined
            ? "true"
            : `(${selectedRef}.${boundary.carrier.element} as ${boundary.carrier.fhirType})`,
        // ⚠ STAMPED FROM THE RECORD IT REPLACES, never invented. A null stamp DROPS the candidate via the
        // constructor's own guard — consistent with the projected leg (disc 532 Q3).
        stampExpr: componentStampCql(selectedRef, boundary.recency.sortExpr, boundary.recency.cast),
        subjectExpr: `FHIR.Reference { reference: FHIR.string { value: 'Patient/' + Patient.id } }`,
        profile: boundary.profile,
      });
      const transformed = renderBoundaryTransform({
        selectedRef,
        identityCheck: renderBoundaryIdentityCheck(boundary, selectedRef, codeLit),
        constructedExpr: constructed,
      });
      const helper = `define ${selectedRef}:\n${indent(body, 1)}`;
      const own = `${metaBlock}${header}\n${indent(transformed, 1)}`;
      // ⚠⚠ TWO DEFINES, TWO LEDGER ENTRIES — never the concatenated pair under one name.
      //
      // The ledger's contract is ONE ENTRY PER EMITTED DEFINE (`appendStatement` refuses top-level defines
      // precisely to enforce it). Enrolling the pair under the concept's name SATISFIED `appendDefine`'s
      // check — it only asks that the entry's name is AMONG the declared headers — while leaving
      // `"<X> Selected"` a top-level define with NO entry. MEASURED: `extractEmittedDefineHeaders` reports
      // `BMI Selected` / `Height Selected` / `Weight Selected` as defines, so the completeness proof counts
      // them uncovered. Behaviour-neutral while the proof runs in report mode; a hard gate would reject a
      // valid library, and two readers of the contract would disagree about the invariant.
      //
      // The returned TEXT is still the pair — only the ENROLLMENT is split.
      this.enrollBoundaryHelper(boundarySelectedDefineName(c.name), helper, c.conceptType ?? "Resource");
      this.enrollConcept(c, own);
      return `${helper}\n\n${own}`;
    }
    const cql = `${metaBlock}${header}\n${indent(body, 1)}`;
    // #189 Slice C 2a — DUAL-WRITE: enroll the emitted define into the totality ledger (report-mode side
    // record). The returned string is UNCHANGED — output stays the section assembly, byte-identical.
    this.enrollConcept(c, cql);
    return cql;
  }

  /**
   * ⭐ #189 null/pause T5 step 2b — the PURE QUESTION's THREE-STATE read.
   *
   *   newest answer record valued true   -> true
   *   newest answer record valued false  -> false
   *   NO answer record at all            -> null   (UNKNOWN — the guard pauses and the question is asked)
   *
   * The whole point is the third row. `asTruths().satisfied()` — the collapse this slice retires — maps both
   * "no record" and "answered false" onto `false`, so a decision DENIES where it must PAUSE. `answeredValue()`
   * (CaseFeatureCommon) keeps them apart, and is deliberately NOT `Coalesce`d: totality belongs at the ARM,
   * never per operand (charter §4 / design of record §3.1/§3.3).
   *
   * Emitted on the INFERENCES twin so every consumer — a `defined as` composition, the Interface facade, a
   * criterion — reads the SAME define. Before 2b this read existed only on the facade, so a composition could
   * not reach it (`LAYER_ORDER` forbids Inferences -> Interface) and fell through to the collapse.
   */
  private emitPureQuestionRead(c: Concept): string {
    const def = c.definition;
    // INTERNAL-INVARIANT: the marker and the bare ref to the records twin are set TOGETHER when the
    // determination is synthesized (`lowerLocalCodes`). A marked determination that cannot name the records it
    // reads is a compiler bug, not a defaultable case — fail loudly rather than fabricate a target.
    if (def?.type !== "DefinedAsDefinition" || def.body.type !== "DefinedAsBareRef") {
      throw new Error(
        `internal invariant violated: pure-question determination "${c.name}" carries __pureQuestionRead but ` +
          `its definition is ${def?.type ?? "(none)"}, not a \`defined as\` bare ref to its records twin. The ` +
          `marker and the ref are set in lock-step in lowerLocalCodes; a determination missing either is a ` +
          `compiler bug.`,
      );
    }
    // INTERNAL-INVARIANT: `answeredValue()` returns a Boolean, so a marked determination that declares anything
    // else would publish a shape its author never wrote (charter §3 cardinality is authoritative / §4 no-magic).
    // `lowerLocalCodes` only sets the marker via `isPureQuestionConcept`, which enforces both — but
    // `emitCQLFromAST` is a validator-free public entry, so assert rather than emit a Boolean under a
    // Record/RecordSet or non-boolean declaration.
    if (!(assumedShapePreMigration(c.shape) === "Scalar" && c.valueTypes.length === 1 && c.valueTypes[0] === "boolean")) {
      throw new Error(
        `internal invariant violated: pure-question determination "${c.name}" carries __pureQuestionRead but ` +
          `declares shape=${c.shape ?? "(none)"}, value type(s)=` +
          `${c.valueTypes.length > 0 ? c.valueTypes.join(", ") : "(none)"}. The three-state read emits a Scalar ` +
          `boolean; any other declaration would manufacture a shape the concept did not declare.`,
      );
    }
    // The SAME qualification the bare-ref alias arm of `emitDefinedAsBody` uses, so the records twin resolves
    // identically whether it is same-library (direct emit) or cross-layer (the LocalPrimitives layer).
    const ref = def.body.ref;
    const crossLib = this.crossLibraryOf(ref);
    const target = crossLib !== null ? cqlQualifiedRef(crossLib, getRefName(ref)) : cqlIdent(getRefName(ref));
    return `${target}.answeredValue()`;
  }

  private emitConceptBody(c: Concept, def: ConceptDefinition): string {
    // Case-feature INTERFACE re-export: collapse the re-exported source-layer
    // truth-set to a boolean for the decision/action-guard surface.
    //   - Inferences source    → `Inferences."X".satisfied()`
    //   - LocalPrimitives source → `LocalPrimitives."X".asTruths().satisfied()` (a DIRECT
    //     `code is` condition with no `defined as`: lift the retrieve, then collapse)
    //   - ExternalPrimitives source→ plain re-export (legacy lane; truth-set is local-only)
    if (
      this.caseFeature.kind === "interface" &&
      c.__interfaceReexport &&
      def.type === "DefinedAsDefinition" &&
      def.body.type === "DefinedAsBareRef"
    ) {
      const name = getRefName(def.body.ref);
      const qref = cqlQualifiedRef(getRefLibrary(def.body.ref) ?? "", name);
      switch (c.__interfaceSourceLayer) {
        case "Inferences":
          // #189 Slice-C boundary 1 — a REDUCTION source publishes a TOTAL boolean (`exists`/`Count`/a
          // `Coalesce`-guarded `most recent`), which has no `.satisfied()` method: re-export it BARE. A
          // `defined as` truth-set determination stays `.satisfied()`. The mode is decided at synthesis
          // (`buildInterfaceReexports`) because this per-layer emitter's `conceptByName` is layer-isolated
          // and cannot see the source concept's definition.
          // ⭐⭐ #189 — THE RECORD-BOOLEAN GUARD reads the selected record's VALUE. Three-state by
          // construction: `true` / `false` / `null` when no candidate was selected — and the null is what
          // makes the tree PAUSE rather than deny. `FHIRHelpers.ToBoolean` is the established conversion in
          // this codebase (not a hand-rolled `.value` chain), and the CARRIER comes from the proven
          // resolution at synthesis, never a literal `.value` — a `type is Condition` boolean Record has no
          // boolean element at all, and reading one would be the same category error `.satisfied()` is.
          //
          // ⚠ DELIBERATELY NOT `Coalesce`d. Totality belongs at the ARM, never per operand; a `Coalesce` here
          // would fold "no candidate" into `false` and deny exactly where the design pauses.
          if (c.__interfaceReexportMode === "record-boolean-value") {
            const carrier = c.__recordBooleanCarrier;
            if (carrier === undefined) {
              // Set in lock-step with the mode at synthesis; a missing carrier is a compiler bug, and
              // falling through would emit `.satisfied()` on a record under a three-state certificate.
              throw new Error(
                `internal invariant violated: interface façade "${c.name}" is mode \`record-boolean-value\` ` +
                  `with no \`__recordBooleanCarrier\` — the two are set together at synthesis.`,
              );
            }
            return `FHIRHelpers.ToBoolean((${qref}).${carrier} as FHIR.boolean)`;
          }
          return c.__interfaceReexportMode === "total-boolean" ? qref : `${qref}.satisfied()`;
        case "LocalPrimitives":
          // #189 null/pause — a PURE QUESTION reads THREE-STATE. `asTruths().satisfied()` folds "no answer
          // record" and "answered false" into the same `false`, so an unanswered question is indistinguishable
          // from a "no" and the decision DENIES where it must PAUSE and ask. `answeredValue()` keeps them
          // apart (true / false / null) and is deliberately NOT `Coalesce`d — totality belongs at the ARM,
          // never per operand (design of record §3.1/§3.3). Marker set at synthesis (`buildInterfaceReexports`)
          // because this emitter is layer-isolated. REFACTOR:grounded — derived from the design of record and
          // the reference IGs' case-feature read, not from the adjacent truth-set lane.
          return `${qref}.asTruths().satisfied()`;
        // ExternalPrimitives (and any other) → fall through to the legacy re-export.
      }
    }
    // #189 Piece 1 (disc 506) — the both-representation RECENCY-VALUE merge (`code is` + `most recent this` +
    // a `coded from` `source representation`, e.g. `Covered Device`): a `Scalar<value-type>`-or-null recency
    // select between the newest local record's value and the newest source record's value. Marker-driven (the
    // retargeted reduction body is NEVER rendered). NOT a truth-set boolean (unlike the age `"recency"` merge) —
    // a plain scalar value define, so it is dispatched here regardless of the case-feature lane.
    // ⭐ #189 — the both-representation RECORD UNION (`code is` + ONE simple `coded from` `source
    // representation`, `shape is RecordSet`, no definition). Charter §3: "a concept unions the records from
    // all its representations". Marker-driven (the retargeted `sem-or` body is NEVER rendered) and dispatched
    // regardless of the case-feature lane, exactly like `recency-value`: a record-valued concept has no
    // truth-set, so routing it through the `defined as` composition lane would hard-error
    // `emit-mixed-source-inference-unsupported` (MEASURED — an ExternalPrimitives record-list cannot join a
    // `.asTruths()` truth-set, and rightly so; that lane is for BOOLEAN determinations).
    if (c.__bothRepMerge === "record-union") {
      return this.emitRecordUnion(c);
    }
    if (c.__bothRepMerge === "recency-value") {
      return this.emitRecencyValueMerge(c);
    }
    // Both-representation RECENCY merge (`code is` + `definition is age today at
    // least <Q>`): the Inferences twin recency-selects between the newest valid
    // local Observation and the live computed age, then lifts back to a truth-set.
    // Only valid in the truth-set Inferences lane; the marker is set at lowering.
    if (
      c.__bothRepMerge === "recency" &&
      this.caseFeature.kind === "inferred" &&
      c.__bothRepFoldInLocalPrimitives !== undefined
    ) {
      return this.emitRecencyMerge(c);
    }
    switch (def.type) {
      case "CodedFromDefinition":
        return this.emitCodedFrom(c, def);
      case "DefinedAsDefinition":
        // #189 Slice 0b — a `defined as` BOOLEAN composition (`("A" and "B")`) lowers to ONE compound total
        // boolean `and`/`or`/`not` via its OWN renderer. `emitDefinedAs`'s parameter type structurally
        // EXCLUDES it (it is NOT a sem-* truth-set composition — its operands are separate boolean facts),
        // so the dispatch routes it here, on BOTH lanes.
        if (def.body.type === "DefinedAsBooleanComposition")
          return this.emitBooleanComposition(c, def.body);
        return this.emitDefinedAs(c, def.body);
      case "DefinitionIsDefinition":
        return this.emitDefinitionIs(c, def);
      case "ReductionDefinition": {
        const r = def.reduction;
        // #189 flip (Slice A/B1) — activate emission of a reduction over a LOCAL `shape is RecordSet`
        // operand (`exists "X"` / `count "X" at least N` where X publishes a record set) →
        // `exists (<X>)` / `Count(<X>) >= N`, mirroring `defined as exists`. Both are TOTAL booleans
        // ONLY once the operand resolves to a record set; over a scalar/record they are ILL-TYPED CQL,
        // not total booleans — disc 429 assigned operand-cardinality validity to the §4.5 lowering
        // reject (Slice C), not the totality proof. So GATE on a locally-resolved `shape is RecordSet`:
        // a non-RecordSet local operand, a cross-lib operand (Slice C), `this` (ThisRecords — lowered by
        // `lowerLocalCodes` to the named form before it reaches here), and `most recent` all stay loud.
        // The `code is` + `this` forms are lowered here by `lowerLocalCodes`, which also guards their
        // threshold + result-concept coherence; the NAMED-operand form reaches here VALIDATOR-FREE, so
        // mirror both guards with the SAME typed kinds (crl-emit Slice-B1 disc + disc 431 crit).
        if ((r.kind === "exists" || r.kind === "count") && r.target.type === "ReductionConceptRef") {
          // `count … at least N` with N < 1 is an author error (trivially true), NOT a not-yet-active
          // form — fail loud with the specific kind, not the misleading not-active sentinel.
          if (r.kind === "count" && r.atLeast < 1) {
            throw new CountThresholdTrivialError(
              `Concept "${c.name}": \`count "${getRefName(r.target.ref)}" at least ${r.atLeast}\` is ` +
                `trivially true (every set has at least ${r.atLeast} members). Use \`at least 1\` (or ` +
                `\`exists\`), or a threshold ≥ 1.`,
              def.location,
            );
          }
          // Slice-C boundary 1: resolve the operand shape + rendered ref via the SHARED resolver so the
          // `none` (bare) and layered (cross-layer qualified) lanes cannot drift.
          const { shape: operandShape, rendered: operandRef } = this.reductionOperand(r.target.ref);
          const refName = getRefName(r.target.ref);
          if (operandShape === "RecordSet") {
            // COHERENCE (charter): the RESULT concept `c` publishes a Scalar boolean for exists/count. A
            // non-Scalar shape, or a value type that is not exactly one `boolean`, contradicts that —
            // and the totality classifier (`booleanTotality.ts`) rejects the same, so admitting it here
            // would arm a Slice-C proof failure. Mirror the `this`-path guard in `lowerLocalCodes`.
            if (assumedShapePreMigration(c.shape) !== "Scalar" || c.valueTypes.length !== 1 || c.valueTypes[0] !== "boolean") {
              const vtClause =
                c.valueTypes.length === 1
                  ? ` and \`value type is ${c.valueTypes[0]}\``
                  : c.valueTypes.length > 1
                    ? ` and ${c.valueTypes.length} value types (needs exactly one \`boolean\`)`
                    : " and no `value type`"; // lock-step mirror of the lowerLocalCodes this-path clause
              throw new ReductionShapeIncoherentError(
                `Concept "${c.name}": \`definition is ${r.kind === "count" ? "count" : "exists"} ` +
                  `"${refName}"\` publishes a Scalar boolean, but the concept declares ` +
                  `\`shape is ${c.shape}\`${vtClause}. Declare \`- shape is Scalar.\` with ` +
                  `\`value type is boolean\`.`,
                def.location,
              );
            }
            return r.kind === "exists"
              ? `exists (${operandRef})`
              : `Count(${operandRef}) >= ${r.atLeast}`;
          }
        }
        // #189 Slice B2a/B2b — a `most recent this`, lowered by `lowerLocalCodes` to a `mostRecent` over the
        // records twin (which ALSO attached the resolved `__effectiveDescriptor`). TWO active cells,
        // discriminated by the RESULT concept's declared shape (lowerLocalCodes gated each): `shape is
        // Scalar` boolean → B2a VALUE READ; `shape is Record` → B2b RECORD SELECT (no value read). A named
        // `most recent "X"` is NOT normalized to a ReductionDefinition (stays a DefinitionIsDefinition), so
        // this arm only ever sees the lowered `this` form.
        if (r.kind === "mostRecent" && r.target.type === "ReductionConceptRef") {
          const { shape: operandShape, rendered: operandRef } = this.reductionOperand(r.target.ref);
          if (operandShape === "RecordSet") {
            const desc = c.__effectiveDescriptor as EffectiveRepresentationDescriptor | undefined;
            if (assumedShapePreMigration(c.shape) === "Record") {
              // B2b RECORD SELECT — `Last((<twin>) O sort by <recency>, id)`, the filter-free/read-free
              // spine (`emitSelectNewest` with no value filter). A Record's OPTIONAL `value type` (a datum
              // descriptor, design §1) is NOT read by the select, so it is deliberately NOT guarded here
              // (rejecting it would hard-fail validator-clean content — B2b panel #1). NULL-RECENCY: a record
              // whose recency element is null sorts first and cannot mask a dated record; if ALL records are
              // undated `Last` returns the highest-`id` record — deterministic, unreachable on the canonical
              // lane (T2: CEL writes the dateTime variant), inheriting the disc-433-reviewed shared-primitive
              // behavior (for a Record the failure mode is "wrong record published", cf. B2a's "wrong truth").
              //
              // ⚠⚠ WHAT THE BOUNDARY DOES WITH AN UNDATED WINNER IS CONDITIONAL, and an earlier version of
              // this comment overstated it. THE ACTUAL RULE: **a CONSTRUCTED record requires a stamp; a
              // CONFORMING winner is never constructed.** So:
              //
              //   · undated winner that already carries the local code  -> PUBLISHED AS-IS, undated. The
              //     identity check passes, the preserve branch returns it, and the constructor's
              //     `recorded is null` guard is never reached.
              //   · undated winner that must be replaced                 -> the constructor yields null, so
              //     the concept publishes NOTHING; the determination is unestablished and the guard pauses.
              //   · a concept with NO transform (a projected arm, e.g. `Obese`) -> always publishes its
              //     winner, dated or not.
              //
              // ⚠ MEASURED, because the first version of this comment claimed the strong form and was wrong:
              // one undated LOCAL-coded weight record publishes `id=wlocal, value=88, stamp=null` — a
              // record, not null (`tmp/NOTES-boundary-transform-executed.md`).
              //
              // The two sites are still ONE rule: ranking must not invent an order, so the select is
              // permissive; CONSTRUCTING a case feature requires a date, so the constructor refuses. They
              // only interact when replacement is actually needed.
              //
              // ⭐ That is CONSISTENT with the leg that already shipped: `renderConstructorCall`'s projected
              // arm has always dropped an undated source record ("a source record with no date yields a
              // null candidate that the `union` drops"). Passing the raw record through at the boundary
              // instead would make the SAME undated record behave differently depending on whether its rep
              // happens to carry a projection (disc 532 Q3 — the arms disagreed; this was settled by
              // reading both call sites, not by argument).
              // FULL CONTRACT GUARD (a hand-built AST via `emitCQLFromAST` is a public entry): a Record select
              // carries NO datum and — because B2b admits ANY registry resource (no Observation pin) — the
              // descriptor's resource must match the concept, or a mismatched descriptor would emit the wrong
              // resource's recency element (gpt56 #4). Validate local-exact arm + recency present + value
              // element/datum ABSENT + `desc.resourceType === c.conceptType`, failing loud with a FILTERABLE
              // kind rather than an ill-typed emit.
              if (
                desc === undefined ||
                desc.arm !== "local-exact" ||
                desc.recency === undefined ||
                desc.valueElement !== undefined ||
                desc.datumValueType !== undefined ||
                desc.resourceType !== c.conceptType
              ) {
                throw new MostRecentDerivationError(
                  `Concept "${c.name}": a lowered \`shape is Record\` \`most recent this\` reached emit ` +
                    `without a well-formed record descriptor / declaration (arm ` +
                    `"${desc === undefined ? "(none)" : desc.arm}", resource ` +
                    `"${desc?.arm === "local-exact" ? (desc.resourceType ?? "(none)") : "(n/a)"}" vs concept ` +
                    `"${c.conceptType ?? "(none)"}", recency ` +
                    `"${desc?.arm === "local-exact" ? (desc.recency ? "set" : "(none)") : "(n/a)"}", datum ` +
                    `"${desc?.arm === "local-exact" ? (desc.datumValueType ?? "(none)") : "(n/a)"}", shape ` +
                    `"${c.shape}"). This is a compiler invariant that lowerLocalCodes upholds on valid input.`,
                  def.location,
                );
              }
              return this.emitSelectNewest(operandRef, desc, undefined);
            }
            // B2a VALUE READ — FULL CONTRACT GUARD (crl-emit B2a impl #4/#5): validate EVERY field the
            // boolean read consumes (arm, resource, datum, recency, value element) AND the concept's own
            // declaration, and fail loud with a FILTERABLE kind rather than a bare exception or ill-typed emit.
            if (
              desc === undefined ||
              desc.arm !== "local-exact" ||
              desc.resourceType !== "Observation" ||
              desc.datumValueType !== "boolean" ||
              desc.valueElement === undefined ||
              desc.recency === undefined ||
              assumedShapePreMigration(c.shape) !== "Scalar" ||
              c.valueTypes.length !== 1 ||
              c.valueTypes[0] !== "boolean"
            ) {
              throw new MostRecentDerivationError(
                `Concept "${c.name}": a lowered \`most recent this\` reached emit without a well-formed ` +
                  `Observation-boolean descriptor / declaration (arm ` +
                  `"${desc === undefined ? "(none)" : desc.arm}", resource ` +
                  `"${desc?.arm === "local-exact" ? (desc.resourceType ?? "(none)") : "(n/a)"}", datum ` +
                  `"${desc?.arm === "local-exact" ? (desc.datumValueType ?? "(none)") : "(n/a)"}", shape ` +
                  `"${c.shape}", value types [${c.valueTypes.join(", ") || "none"}]). This is a compiler ` +
                  `invariant that lowerLocalCodes upholds on valid input.`,
                def.location,
              );
            }
            return this.emitMostRecentBooleanRead(operandRef, desc);
          }
        }
        return reductionNotEmittable(`emitConceptBody("${c.name}")`, def.location);
      }
    }
  }

  /**
   * #189 Slice B2a — the SHARED select-newest skeleton for `most recent this` (extracted so B2b's Record
   * select can't re-spell/drift the filter+sort — disc 433). Emits `Last((<twinRef>) O [where O.<ve> is
   * <filter>] sort by <recency>, id)`. The recency sort is the descriptor's per-resource access
   * (`(effective as FHIR.dateTime).value` for Observation, cast:"dateTime"; `<expr>.value` for cast:"none"),
   * ALIAS-FREE — CQL sort resolves against the result element, NOT the query alias (disc 433 Claude #2).
   * `valueTypeFilter` (e.g. `FHIR.boolean`) restricts to records whose datum CONFORMS to the declared type,
   * so a newer mistyped/valueless row can't mask an older conforming one ("newest CONFORMING record wins" —
   * disc 433 crit).
   */
  /**
   * ⭐ THE SELECTION — and the clearest place the SHAPE-IS-SUFFICIENT invariant is spent.
   *
   * Everything this reads off a space member is SHAPE: the recency element to sort by, `id` to break ties,
   * and the carrier element to type-filter. **None of it needs the member to carry the concept's own local
   * code**, which is exactly why a raw source record may sit in the collection un-projected
   * (`renderSpaceTerms`, the `external-primitives` arm) and cost nothing per member.
   *
   * The identity obligation — *a consumer has to see a CASE FEATURE* (charter §3, operator 2026-09-01) —
   * is discharged at the concept BOUNDARY, on the ONE record this returns, not on the n records it sorted.
   * ⚠ And it is scoped: *"it only applies to concepts that have a `code is`"* (same ruling). An UNCODED
   * concept has no local identity to publish, so there is nothing to stamp and no obligation to discharge.
   *
   * ⚠⚠ SO IF THIS FUNCTION EVER NEEDS THE CONCEPT'S IDENTITY — a sort, filter or tie-break that reads the
   * local code rather than the shape — **carve out that case; do not project the space to satisfy it.**
   * Projecting here is a one-line change that moves the cost from 1 to n, on every evaluation, with no
   * failing test to announce it. See the foot-gun note at the `external-primitives` arm.
   */
  private emitSelectNewest(
    twinRef: string,
    desc: EffectiveRepresentationDescriptor & { arm: "local-exact" },
    valueTypeFilter: string | undefined,
  ): string {
    const recencyExpr =
      desc.recency.cast === "dateTime"
        ? `(${desc.recency.sortExpr} as FHIR.dateTime).value`
        : `${desc.recency.sortExpr}.value`;
    // ⭐ #189 — the conforming filter reads the carrier from EITHER source. A value-READING concept
    // has it on `valueElement`; a RECORD-publishing one reads no value on this arm but its record still
    // CARRIES one, on `answerCarrier`. Same element either way — ONE authority resolved it.
    const filterElement = desc.valueElement ?? desc.answerCarrier?.element;
    const whereClause =
      valueTypeFilter !== undefined && filterElement !== undefined
        ? `\n      where O.${filterElement} is ${valueTypeFilter}`
        : "";
    // `twinRef` is the ALREADY-RENDERED operand expression (bare `"X Records"` on the `none` path, or a
    // cross-layer `<S>-LocalPrimitives."X Records"` qualified ref on the layered path — Slice-C boundary 1),
    // so it is inserted verbatim, NOT re-wrapped with `cqlIdent` (which would double-quote a qualifier).
    return `Last(\n    (${twinRef}) O${whereClause}\n      sort by ${recencyExpr}, id\n  )`;
  }

  /**
   * #189 Slice-C boundary 1 — resolve a reduction operand ref to its declared SHAPE and its RENDERED CQL
   * reference, for BOTH emit lanes off one authority (so the `none` and layered spellings cannot drift —
   * disc 436 Q3). The operand is the lowered records twin (`<X> Records`):
   *   - `none` path: a BARE local ref — shape from this library's `conceptByName`, rendered `cqlIdent`.
   *   - LAYERED path: `requalifyDefinition` rewrote it to a cross-layer qualified ref
   *     (`<S>-LocalPrimitives."X Records"`) whose target is NOT in this layer's `conceptByName`; the shape
   *     comes from the pre-split `conceptShapesByName` map and the render carries the qualifier.
   * A `shape` of `undefined` (unknown operand) fails the caller's `=== "RecordSet"` gate → the reduction
   * falls through to the loud `reductionNotEmittable`, never a silent bad emit.
   */
  private reductionOperand(ref: ReferenceName): { shape: Concept["shape"] | undefined; rendered: string } {
    const crossLib = this.crossLibraryOf(ref);
    const refName = getRefName(ref);
    if (crossLib !== null) {
      return { shape: this.options.conceptShapesByName.get(refName), rendered: cqlQualifiedRef(crossLib, refName) };
    }
    return { shape: this.conceptByName.get(refName)?.shape, rendered: cqlIdent(refName) };
  }

  /**
   * #189 Slice-C boundary 1 — a REDUCTION operand cannot appear in a TRUTH-SET `defined as`, whether as a
   * composition operand (`( "R" sem-or "S" )`) OR a bare-ref alias (`defined as "R"`). Both flow through the
   * truth-set lane, which treats a same-layer Inferences sibling as an `.asTruths()` list / a
   * `.satisfied()`-collapsible determination — but a reduction publishes a bare CQL Boolean, so
   * `<boolean> union <List<Boolean>>` (composition) or `Interface."D".satisfied()` on a bare boolean
   * (bare-ref alias) is ill-typed, caught only at translator load, shipped under success:true. Composing
   * `defined as` over TOTAL booleans is a boundary-2 change; loud-refuse until then with a CRL-level kind.
   * SHARED by the composition-operand site (`emitComposition` CompositionRef) and the bare-ref-alias site
   * (`emitDefinedAs` truth-set lane) so they cannot drift (impl-panel round 1, Claude — the bare-ref alias
   * bypassed the composition-only guard). Scope: only a SAME-LAYER LOCAL reduction is checked here. A
   * cross-library operand is left unchecked — NOT because it is universally preflight-blocked (impl-panel
   * round 2, Claude): `emit-cross-library-ref-into-split-library` only fires when the TARGET library is
   * SPLIT; a `defined as` referencing a reduction in a none-path foreign sibling would fall to the truth-set
   * lane's foreign-null fallback (a plain `Foreign."R"` Boolean woven into a set-op — ill-typed). That is a
   * PRE-EXISTING, non-reduction-specific class (any foreign operand in a truth-set composition is equally
   * ill-typed) and cross-library concept refs are v0-unsupported generally, so the full cross-lib guard
   * lands with §4.5 (cross-lib reduction operands), not boundary 1.
   */
  private assertNotReductionTruthSetOperand(ref: ReferenceName): void {
    if (this.crossLibraryOf(ref) !== null) return;
    const operand = this.conceptByName.get(getRefName(ref));
    if (operand?.definition?.type === "ReductionDefinition") {
      throw new ReductionInCompositionError(
        `Concept "${operand.name}" is a reduction (a TOTAL scalar boolean) and cannot be a truth-set operand in a ` +
          `REFINEMENT-lane \`defined as\` composition (a union/intersect/except of a total boolean and a truth-set ` +
          `List is ill-typed). To compose booleans, declare the PARENT concept \`- value type is boolean.\` so the ` +
          `whole composition flips to the boolean (\`and\`/\`or\`/\`not\`) lane (#189 2b.3b.1). Weaving a total ` +
          `boolean into a truth-set (refinement) List is the record-half case, deferred to a later #189 boundary. ` +
          `(A bare-ref alias to a SCALAR-BOOLEAN reduction is supported; reaching this guard via the alias form ` +
          `means a NON-Scalar-boolean reduction, which has no bare boolean re-export.)`,
        typeof ref === "string" ? undefined : ref.location,
      );
    }
  }

  /**
   * #189 Slice B2a — a Scalar BOOLEAN `most recent this` value read → a TOTAL boolean at the boundary
   * (requires-boundary discharge, `docs/emit-189-boolean-totality.md`): select the newest CONFORMING
   * record, read its boolean value, `Coalesce(<read>, false)` (closed-world — absence is false; NEVER the
   * age truth-set `{true}/{}` lift, which is age-specific and retired §7). The read primitive
   * `FHIRHelpers.ToBoolean(O.value as FHIR.boolean)` matches the engine-proven age recency helper
   * (`catalog/CaseFeatureCommon.cql`); the exact spelling stays a build-verify G-gate (design pins the SORT,
   * not the READ). `valueElement` is caller-guaranteed present (the lowering derived a value-bearing datum).
   */
  private emitMostRecentBooleanRead(
    twinRef: string,
    desc: EffectiveRepresentationDescriptor & { arm: "local-exact" },
  ): string {
    const newest = this.emitSelectNewest(twinRef, desc, "FHIR.boolean");
    return `Coalesce(\n  FHIRHelpers.ToBoolean((${newest}).${desc.valueElement!} as FHIR.boolean),\n  false\n)`;
  }

  /**
   * Emit the patient-age RECENCY both-rep merge (Inferences twin). #189 Slice C 2b.3b.1 — emits a TOTAL scalar
   * boolean `Coalesce(CFH.recencyAgeSelected(local, computed), false)` (was the `recencyAgeTruths` `{ true }` / `{}`
   * truth-set lift, now retired from emit), so it composes in the Inferences/Interface boolean lane.
   *
   * The merge CANNOT use `asTruths()` — that reads only `value.value is true`,
   * discarding the Observation and erasing an explicit `false`. Instead the
   * newest VALID local Observation is selected from the LocalPrimitives retrieve
   * (boolean value, sorted by `effective`), and the CaseFeatureCommon
   * `recencyAgeSelected` helper does the precedence select (asserted-if-newer vs
   * computed) returning a nullable Boolean, which the outer `Coalesce(..., false)`
   * totalizes (closed-world — an undetermined merge is false).
   */
  private emitRecencyMerge(c: Concept): string {
    const foldIn = c.__bothRepFoldInLocalPrimitives!;
    // INTERNAL-INVARIANT: a `"recency"` twin MUST carry BOTH its threshold AND its
    // comparator op (set in lock-step at lowerLocalCodes when the twin is synthesized).
    // A missing threshold or op here is a compiler bug, not a defaultable case — fail
    // loudly (matching the co-invariant assert in lowerLocalCodes), never silently emit
    // a fabricated `18 'years'` or default the comparator to `AtLeast`.
    if (
      c.__bothRepRecencyThreshold === undefined ||
      c.__bothRepRecencyOp === undefined ||
      c.__recencyComputeFn === undefined
    ) {
      throw new Error(
        `internal invariant violated: recency both-rep twin "${c.name}" has ` +
          `__bothRepMerge === "recency" but is missing __bothRepRecencyThreshold ` +
          `(${c.__bothRepRecencyThreshold}), __bothRepRecencyOp (${c.__bothRepRecencyOp}), ` +
          `and/or __recencyComputeFn (${c.__recencyComputeFn}). The marker, threshold, op, and ` +
          `compute fn are set together in lowerLocalCodes; a recency twin missing any is a ` +
          `compiler bug.`,
      );
    }
    // #189 Slice C 2b.3b.1 — CARDINALITY/coherence invariant (crl-emit code review, both arms). The recency merge
    // emits a SCALAR boolean (`Coalesce(CFH.recencyAgeSelected(...), false)`); a non-scalar (Record/RecordSet) or
    // non-single-boolean declaration would emit a shape the concept did NOT declare (charter §3 cardinality is
    // authoritative / §4 no-magic). `resolveAgeConcept` enforces `value type is boolean` but does NOT gate shape,
    // and `emitCQLFromAST` is a validator-free public entry, so assert here — the SAME `isScalarBoolean` invariant
    // the totality predicate + the discharge (`emittedDischargeAndType`) key on, so a malformed twin is ONE loud
    // emit error, never a predicate/emit/discharge drift.
    if (!(assumedShapePreMigration(c.shape) === "Scalar" && c.valueTypes.length === 1 && c.valueTypes[0] === "boolean")) {
      throw new Error(
        `internal invariant violated: recency both-rep twin "${c.name}" must declare a single \`boolean\` value ` +
          `type and \`Scalar\` cardinality (has shape=${c.shape ?? "(none)"}, value type(s)=` +
          `${c.valueTypes.length > 0 ? c.valueTypes.join(", ") : "(none)"}). The recency merge emits a scalar ` +
          `boolean; a non-scalar/non-boolean declaration would manufacture a shape the concept did not declare ` +
          `(charter §3/§4). Declare \`- value type is boolean.\` (and Scalar cardinality) on a patient-age ` +
          `recency concept.`,
      );
    }
    // The recency emit consults the projection OVERRIDE the twin names (`__recencyOverrideId`) for
    // its CQL helper (the compute fn is per-UNIT, carried on the twin — see below) — age is ONE
    // caller of the override mechanism, not a hardcoded engine branch. The override's helper is
    // age-shaped (`recencyAgeTruths`) so the emitted CQL is byte-identical to the retired carve-out
    // for the years case; the CQL catalog stays age-shaped
    // (the re-home is a compile-time seam). A missing/unknown id is a compiler bug (the marker is
    // set in lock-step with the recency markers in lowerLocalCodes).
    const override = c.__recencyOverrideId ? recencyOverrideById(c.__recencyOverrideId) : undefined;
    if (override === undefined) {
      throw new Error(
        `internal invariant violated: recency both-rep twin "${c.name}" has ` +
          `__bothRepMerge === "recency" but __recencyOverrideId (${c.__recencyOverrideId}) ` +
          `resolves to no built recency-projection override. The id is set in lock-step with ` +
          `the recency markers in lowerLocalCodes; a recency twin without a resolvable override ` +
          `is a compiler bug.`,
      );
    }
    const threshold = c.__bothRepRecencyThreshold;
    const op = c.__bothRepRecencyOp;
    // The compute fn is a per-UNIT HOW carried on the twin (`AgeAt` years / `AgeInMonths` months,
    // #257 T2) — NOT on the override (which is unit-agnostic), and NOT re-derived from the unit
    // here. The matcher chose it; the emit renders it so the compute fn matches the threshold's
    // unit through the unit-blind comparator overload (#215).
    const computeFn = c.__recencyComputeFn;
    // INTERNAL-INVARIANT (#215 defense at the EXPORT boundary): the compute fn MUST agree with the
    // threshold's unit (`AgeAt`↔years, `AgeInMonths`↔months). The compiler pairs them at one site,
    // but `emitCQLFromAST` is a public entry a caller can feed a hand-built twin — a mismatched
    // pair (`AgeAt` + `6 'months'`) would silently emit the exact unit-blind miscompile this slice
    // exists to prevent. Fail loudly instead. The unit is parsed back out of the already-rendered
    // threshold literal (e.g. `6 'months'`); a unitless threshold cannot be a sanctioned age one.
    const thresholdUnit = /'([^']+)'/.exec(threshold)?.[1];
    if (thresholdUnit === undefined || ageComputeFnForUnit(thresholdUnit) !== computeFn) {
      throw new Error(
        `internal invariant violated: recency both-rep twin "${c.name}" pairs compute fn ` +
          `__recencyComputeFn (${computeFn}) with a threshold (${threshold}) whose unit ` +
          `(${thresholdUnit ?? "(none)"}) does not match — this would emit a unit-blind ` +
          `miscompile (#215). The matcher pairs the fn and unit; a mismatched twin is a compiler ` +
          `bug (or an ill-formed hand-built AST).`,
      );
    }
    const localLib =
      this.caseFeature.kind === "inferred" ? this.caseFeature.localSourceLibrary : "";
    // The newest valid local boolean Observation (or null). `.value is FHIR.boolean`
    // keeps only boolean-valued rows (LOCK-STEP with `recencyAgeSelected`'s
    // `local.value as FHIR.boolean` cast in CaseFeatureCommon.cql — if you change
    // one filter/cast, change the other). NO status filter: a DTR-extracted answer
    // (sdc `definitionExtractValue`, ProcessDefinitionItem) is NOT stamped `final`,
    // so restricting status would silently drop it (operator decision 2026-07-01).
    // Sort by the COMPARABLE effective value, NOT the raw `effective[x]` choice.
    // `sort by effective` translates but THROWS at runtime with 2+ rows —
    // `DateTimeType is not comparable` — because it orders the polymorphic choice
    // element. Casting to the System.DateTime (`(effective as FHIR.dateTime).value`)
    // matches the comparable value the lattice reads in `recencyAgeAssertedWins`.
    // The extraction populates `effective` (from QuestionnaireResponse.authored),
    // NOT `issued`, so recency keys on `effective`; FHIR sorts null low, so a dated
    // answer is preferred and an all-null set is deterministic (by `id`). NO status
    // filter (extracted answers aren't stamped `final`; operator decision 2026-07-01).
    const newestLocal =
      `Last(\n` +
      `    (${cqlQualifiedRef(localLib, foldIn)}) O\n` +
      `      where O.value is FHIR.boolean\n` +
      `      sort by (effective as FHIR.dateTime).value, id\n` +
      `  )`;
    const computed = `CRLCommon.${op}(CRLCommon.${computeFn}(), ${threshold})`;
    // #189 Slice C 2b.3b.1 — the recency merge is now a TOTAL boolean at its boundary: the recency-SELECTED
    // nullable Boolean (`recencyAgeSelected`), `Coalesce`d to `false` (closed-world — an undetermined merge is
    // false). NOT the `recencyAgeTruths` List lift (retired from emit; the helper stays in the catalog,
    // unreferenced). Do NOT Coalesce `computed` before arbitration — a null computed (malformed/absent
    // birthDate) must fall through to the local-source fallback (`CaseFeatureCommon.cql:102-104`), so only the
    // OUTER arbitration result is Coalesced. `CFH.<recencySelectedHelper>(newestLocalObservation, computedBoolean)`
    // reads the projected datum + its recency timestamp (`${override.valueElementPath}` /
    // `${override.recencyTimestamp}`) internally (Patient context), so the call site passes only the two arms.
    // `CFH` is the include alias for CaseFeatureCommon (see the layered header).
    const selected =
      `CFH.${override.recencySelectedHelper}(\n` +
      `  ${newestLocal},\n` +
      `  ${computed}\n` +
      `)`;
    // ⭐ #189 O3 — NO OUTER `Coalesce`. The merge stays THREE-STATE.
    //
    // This used to `return Coalesce(<selected>, false)`, and MEASURED
    // (`tmp/nullprobe/analysis/layeredAge-out.txt`) that made the ONLY working both-representation merge in
    // the emitter DENY on absence: unanswered locally AND no `birthDate` ⇒ `recencyAgeSelected` null ⇒
    // `false` ⇒ the decision's `otherwise` fires. The concept carries a local `code is` (that is what makes
    // this the RECENCY merge rather than the standalone one), so it is ANSWERABLE, and a determination no
    // arm establishes is UNKNOWN — charter §4, and the operator's acceptance criterion that the only route
    // to a Deny is a STATED `false`.
    //
    // ⚠ The null is LOAD-BEARING and must survive to the guard: the Interface layer above is a bare
    // re-export (`define X: Inferences."X"`), a branch guard is deliberately null-propagating (that IS the
    // pause), and an action-guard carrier totalizes at its OWN reference site. Totality belongs at the ARM.
    // ⚠ Do NOT Coalesce `computed` before arbitration either — a null computed age must fall through to the
    // local-source arm (`CaseFeatureCommon.cql`), which is why the inner arms stay bare too.
    //
    // The STANDALONE age concept (posrep only, no local `code is`) is a different cell and KEEPS its
    // boundary: its one arm is `Patient.birthDate`, which is EVIDENCE, and absent evidence is `false`.
    // `classifyBooleanTotality` splits the two on exactly that test, in lock-step with this emit.
    return selected;
  }

  /**
   * #189 Piece 1 (disc 506) — emit the both-representation RECENCY-VALUE merge: a `Scalar<value-type>`-or-null
   * recency select between the newest local record's value and the newest source record's value. Unlike the age
   * `"recency"` merge (a truth-set boolean), this is a PLAIN scalar value — NO `Coalesce(…, false)` (charter §4:
   * a Coalesce would MANUFACTURE a value; a both-absent merge is legitimately null, which the interface fold reads
   * as member-non-existence). Marker-driven: reads the `[local-exact, source]` descriptors off
   * `__recencyValueDescriptors` (derived at lowering) + the LP/EP retrieve names. The tie-break policy lives in the
   * ONE shared `CaseFeatureCommon.recencyLocalWins` (via `crossRepRecencyMergeExpr`), so age and this cannot drift.
   */
  /**
   * #189 — the both-representation RECORD UNION: `<local records> union <source records>`.
   *
   * The two arms are the twins `lowerLocalCodes` synthesized beside this one — a LocalPrimitives retrieve
   * over the synthetic local code, and an ExternalPrimitives `"<X> Source"` retrieve over the posrep's
   * terminology. This define is the PUBLIC determination the author's name resolves to.
   *
   * ⚠ Deliberately NOT deduped. Charter §3 states the union; whether the same clinical fact arriving on both
   * arms should collapse to one record is the OPEN dedup question (design §9), and silently choosing
   * `distinct` here would answer it by accident. CQL `union` is set-semantics over identical elements only,
   * so two DIFFERENT resources describing one fact both survive — which is the honest reading of "the records
   * this concept publishes" until dedup is designed.
   */
  /**
   * The record-union twin's space — an ORDERED list of terms, `union`ed left to right.
   *
   * ⚠ #189 P2: the terms are now LISTED on the twin (`__recordUnionTerms`) rather than DERIVED from a
   * fold-in name. The derived form could only ever express exactly two terms — a local retrieve and one
   * `<name> Source` — and the space P2 needs is `local ∪ n posreps ∪ n constructed candidates`
   * (design P2-D3). Emitted text is byte-identical for the two-term case; the goldens pin that.
   *
   * A `record-union` marker with no terms THROWS rather than falling back to the derived pair: a silent
   * fallback would re-hide exactly the implicitness this replaces.
   */
  private emitRecordUnion(c: Concept): string {
    const terms = c.__recordUnionTerms;
    if (terms === undefined || terms.length === 0) {
      throw new Error(
        `internal invariant violated: record-union twin "${c.name}" carries no \`__recordUnionTerms\` — ` +
          `set in lock-step with the marker at lowering; a missing list is a compiler bug.`,
      );
    }
    const localLib = this.caseFeature.kind === "inferred" ? this.caseFeature.localSourceLibrary : "";
    const sourceLib =
      this.caseFeature.kind === "inferred" ? (this.caseFeature.recordSourceLibrary ?? "") : "";

    return this.renderSpaceTerms(c, terms, localLib, sourceLib);
  }

  /**
   * ⭐ #189 — emit the generated record constructors this library's producer stages call.
   *
   * ⚠ THE COLLISION CHECK IS LOAD-BEARING, not hygiene. `recordConstructor.ts` records that it VERIFIED the
   * collision is reachable: `concept "CRLConstructObservationQuantity"` parses and keeps that name, because
   * CRL concept names are quoted strings and no lexical rule excludes the prefix. Design D1 is "detect
   * before emission, never rely on a translator error", so an authored define in the reserved namespace
   * throws HERE rather than silently shadowing (or being shadowed by) a generated function.
   */
  private emitGeneratedConstructors(): string | null {
    const byName = new Map<string, ConstructorSignature>();
    for (const st of this.ast.statements) {
      if (st.type !== "Concept") continue;
      const specs = ((st as Concept).__recencyProducerSpecs ?? []) as readonly ProducerCandidateSpec[];
      for (const spec of specs) byName.set(spec.signature.functionName, spec.signature);
      // ⭐⭐ #189 — A BOUNDARY TRANSFORM DEMANDS A CONSTRUCTOR TOO, AND MAY BE ITS ONLY DEMAND.
      //
      // ⚠ Gathering from producer specs ALONE was a dangling-emit waiting to happen (gpt-5.6 arm, disc 532):
      // a source-only unprojected leaf — the goal's `Height`/`Weight`, whose whole program is `code is` +
      // `coded from` — has NO producer and NO projection, so nothing here would have defined the function the
      // boundary transform CALLS. That is a library that fails to translate, not a wrong answer.
      const boundary = (st as Concept).__boundaryTransformSpec as BoundaryTransformSpec | undefined;
      if (boundary !== undefined) byName.set(boundary.signature.functionName, boundary.signature);
      // ⭐⭐ #189 — AND SO DOES A CONSTRUCTED HETEROGENEOUS SOURCE ARM — same dangling-emit class.
      //
      // A concept whose posrep is a DIFFERENT resource type (`type is Observation` + a `type is ServiceRequest`
      // representation carrying `value element is`) constructs one candidate per source record, and that arm
      // can be the library's ONLY constructor demand: such a concept need have no producer, and it is
      // statically excluded from the boundary transform because it already conforms BY CONSTRUCTION. Gathering
      // only the other two emits a call to a function nothing defines — a library that fails to TRANSLATE.
      const valueRead = (st as Concept).__valueReadSourceSpec as ValueReadSourceSpec | undefined;
      if (valueRead !== undefined) byName.set(valueRead.signature.functionName, valueRead.signature);
      // ⭐⭐ #189 — AND SO DOES A PROJECTED SOURCE ARM. THE FOURTH DEMAND, AND THE THIRD TIME THIS EXACT
      // CLASS HAS BITTEN, so the pattern is worth stating: EVERY spec kind that renders a constructor CALL
      // must be gathered here, or the library fails to TRANSLATE while emit reports success.
      //
      // ⚠ MEASURED on `tmp/bleph` via `$apply`: `Could not resolve call to operator
      // CRLConstructObservationBoolean`. It was INVISIBLE until a content change removed the other concepts
      // whose specs had been defining that function incidentally — the caller had never carried its own
      // demand, and free-rode for as long as a neighbour happened to declare it. A dangling constructor is
      // therefore not a property of the CALLING concept alone; it depends on its company, which is exactly
      // why gathering must be exhaustive rather than representative.
      const projected = (st as Concept).__projectedSourceSpec as ProjectedSourceSpec | undefined;
      if (projected !== undefined) byName.set(projected.signature.functionName, projected.signature);
    }
    // ⚠ Reached when the library has neither a producer nor a boundary transform — nothing to define.
    if (byName.size === 0) return null;

    for (const st of this.ast.statements) {
      const name = (st as { name?: string }).name;
      if (name !== undefined && isConstructorName(name)) {
        throw new Error(
          `declaration "${name}" is in the RESERVED generated-constructor namespace ` +
            `(\`${CONSTRUCTOR_NAME_PREFIX}\`...), which this library also needs for a producer stage's ` +
            `record construction. Rename the declaration.`,
        );
      }
    }

    return [...byName.keys()]
      .sort()
      .map((n) => renderRecordConstructor(byName.get(n)!))
      .join("\n\n");
  }

  /**
   * ⭐⭐ #189 — THE ONE READER OF "WHAT IS IN A CONCEPT'S SPACE".
   *
   * Both both-representation twins describe their space as a `__recordUnionTerms` list and both render it
   * here: the RECORD-UNION twin (the records target) and the RECENCY-VALUE merge's record branch. That is
   * deliberate. Two renderers would be two answers to one question, free to disagree about whether a derived
   * candidate is in the space — and a `cpg-featureExpression` records read that disagreed with the published
   * determination is exactly the cross-lane drift this refactor exists to remove. (Panel round 1, Claude arm
   * #5: the first draft patched the merge directly and left this channel dead.)
   *
   * The operator's model is then literally the emitted text: each term ADDS to the collection, and the
   * `definition is` stage WORKS ON the result.
   */
  private renderSpaceTerms(
    c: Concept,
    terms: readonly RecordUnionTerm[],
    localLib: string,
    sourceLib: string,
  ): string {
    const specs = (c.__recencyProducerSpecs ?? []) as readonly ProducerCandidateSpec[];
    const rendered = terms.map((term) => {
      switch (term.kind) {
        case "local-primitives":
          return cqlQualifiedRef(localLib, term.define);
        case "external-primitives": {
          const epRef = cqlQualifiedRef(sourceLib, term.define);
          // ⭐ #189 — A PROJECTED SOURCE ARM IS STILL THE SOURCE TERM, transformed. The retrieve stays what it
          // is (`[Condition: "Obese VS"]` — the honest source records); the projection turns EACH record into
          // a candidate of the CONCEPT's `type is` right here, at the space-assembly site, beside the
          // producer's candidate. That keeps the ExternalPrimitives twin truthful about what it retrieves and
          // keeps every transformation of the space in one place.
          // ⚠⚠ RETURNING THE RAW RECORD IS CORRECT *HERE*, IN THE COLLECTION — and NOT at the boundary.
          //
          // RULED (operator, 2026-09-01): **a consumer has to see a CASE FEATURE** — scoped, by the same
          // ruling, to concepts that HAVE a local `code is` (an uncoded concept has no identity to
          // publish). But that obligation is
          // the concept's BOUNDARY's, not this union's: comparison, recency ordering and value reads need
          // only the SHAPE, so the collection may hold the raw record and pay nothing per member. The
          // local-code projection belongs where the concept PUBLISHES — one record for a `shape is Record`
          // concept, bounded by construction.
          //
          // ⚠ Do NOT "fix" this line by projecting every member: that is the expensive shape (n transforms
          // over a history) and it buys nothing the boundary does not already give.
          //
          // ⚠⚠ IF YOU FIND A CASE WHERE SHAPE IS *NOT* SUFFICIENT INSIDE THE COLLECTION — some later stage
          // that needs the concept's IDENTITY and not merely its shape — **carve that case out; do not
          // remove the invariant.** Removing it is a one-line change that silently makes every RecordSet
          // concept pay a construction per member, on every evaluation, forever: a giant performance foot
          // gun with no failing test to announce it. A carve-out is bounded and reviewable; a removal is
          // neither. If a carve-out genuinely cannot express the case, that is an operator-level decision
          // about the model, not a local fix.
          //
          // ⚠ The questionnaire path survives a raw record — measured, `$extract` re-derives identity from
          // `patternCodeableConcept` — but that is a SPECIFIC CASE WE CANNOT RELY ON, and it is not why this
          // line is correct. REFACTOR:grounded
          const src = (c.__recencyValueDescriptors as { source?: { arm?: string } } | undefined)?.source;
          // ⭐⭐ A HETEROGENEOUS ARM IS CONSTRUCTED, NOT UNIONED. Its records are not the concept's `type is`,
          // so unioning them raw puts a shape in the collection that the selection cannot read — MEASURED,
          // the merge's own conforming filter (`where O.value is …`) removes them again, emit reports
          // success, and the concept publishes null with no diagnostic.
          //
          // ⚠ This is the SAME obligation the projection arm discharges, for a different reason: a
          // projection converts a source whose truth is EXISTENCE, this converts one carrying a DATUM the
          // concept wants (`ServiceRequest.code` read as "what service was requested").
          const vrSpec = c.__valueReadSourceSpec as ValueReadSourceSpec | undefined;
          if (vrSpec !== undefined) {
            // ⭐⭐ WRAPPED, and the reason is the RETURN clause, not the alias.
            //
            // A CQL query source must be fully parenthesized, so `A union (B) S where ...` does bind S to
            // `(B)` alone — VERIFIED by execution (a local record beside a source one won on recency and kept
            // its own `id`, so it was never swallowed into the query). The sibling comment below attributes the
            // measured failure to the alias capturing the whole union; that mechanism is wrong.
            //
            // ⚠ What IS greedy is `returnClause`, which takes a full `expression` — so `return F(S) union <next>`
            // swallows the following term into the return, which is exactly the measured
            // `Union(FHIR.Observation, list<FHIR.Observation>)` signature. This arm is safe ONLY while it is the
            // final term; a concept combining a heterogeneous posrep with a producer stage puts a constructed
            // term after it and reproduces that failure under emit-success. Two characters buy immunity.
            return `(${renderValueReadSourceArm({
              sourceRef: epRef,
              functionName: vrSpec.signature.functionName,
              code: vrSpec.code,
              read: vrSpec.read,
              recency: vrSpec.recency,
              subjectExpr: SUBJECT_REFERENCE_CQL,
              profile: vrSpec.profile,
            })})`;
          }
          // ⚠ A SAME-TYPE arm is returned RAW, and that is correct — it is already the concept's shape, so
          // the collection is homogeneous and nothing needs constructing (charter §3's shape-sufficiency).
          if (src?.arm !== "source-projected") return epRef;
          const spec = c.__projectedSourceSpec as ProjectedSourceSpec | undefined;
          if (spec === undefined) {
            throw new Error(
              `internal invariant violated: both-rep twin "${c.name}" has a PROJECTED source arm but no ` +
                `\`__projectedSourceSpec\` — the two are set together at lowering.`,
            );
          }
          // ⚠⚠ THE PARENTHESES ARE LOAD-BEARING, AND THIS WAS CAUGHT BY EXECUTION, not review. A CQL query
          // source binds LOOSER than `union`, so `A union (B) C return f(C)` parses as `(A union B) C` — the
          // alias captures the WHOLE union and the projection is applied to the local answers as well. The
          // engine reported `Could not resolve call to operator Union with signature (FHIR.Observation,
          // list<FHIR.Observation>)`. Wrapping makes the query one term of the union, which is what it is.
          return `(${renderProjectedSourceArm({
            sourceRef: epRef,
            functionName: spec.functionName,
            code: spec.code,
            recency: spec.recency,
            subjectExpr: SUBJECT_REFERENCE_CQL,
            profile: spec.profile,
          })})`;
        }
        case "constructed": {
          const spec = specs.find((sp) => sp.stageIndex === term.stageIndex);
          if (spec === undefined) {
            // Set in lock-step at lowering, so a missing spec is a compiler bug, not an author error. Fail
            // loud rather than emit a union that silently drops the derived arm.
            throw new Error(
              `internal invariant violated: both-rep twin "${c.name}" lists a CONSTRUCTED term ` +
                `(stage ${term.stageIndex}) with no matching producer spec — the two are set together at ` +
                `lowering.`,
            );
          }
          return `(${this.renderConstructedCandidate(spec)})`;
        }
      }
    });
    return rendered.join("\n  union ");
  }

  /**
   * Render ONE producer stage's constructed candidate as a singleton list that is EMPTY when nothing was
   * produced — so it unions into the space with no special case for "the producer produced nothing", which
   * is the state that leaves the determination UNKNOWN and lets the tree PAUSE.
   *
   * Everything here was resolved at lowering (`emit/producerCandidate.ts`); this only turns it into text.
   * The one thing it does NOT take from the spec is how to render a reference — `emitArg` does that, so
   * reference qualification has exactly ONE implementation.
   */
  private renderConstructedCandidate(spec: ProducerCandidateSpec): string {
    const computed = this.emitPatternCall(spec.call);
    let valueExpr: string;
    switch (spec.valueWrap) {
      case "quantity":
        valueExpr = fhirQuantityFromSystemQuantity(`(${computed})`);
        break;
      case "boolean":
        valueExpr = fhirBooleanFromSystemBoolean(`(${computed})`);
        break;
      case "none":
        // `existence` mode: the constructor's second parameter is a RAW `System.Boolean` guard, not a FHIR
        // value, so it takes no wrapper (design D0b).
        valueExpr = `(${computed})`;
        break;
    }
    // §5b — the candidate's stamp is the NEWEST of the components that DETERMINE its value, read off each
    // operand through ITS OWN registry row. Literal operands (a threshold) carry no stamp and are absent.
    const stampExpr = derivedStampCql(
      spec.operandStamps.map((st) =>
        componentStampCql(`(${this.emitArg(spec.call.args[st.argIndex])})`, st.sortExpr, st.cast),
      ),
    );
    return renderConstructorCall({
      functionName: spec.signature.functionName,
      code: spec.code,
      valueExpr,
      stampExpr,
      subjectExpr: SUBJECT_REFERENCE_CQL,
      profile: spec.profile,
    });
  }

  private emitRecencyValueMerge(c: Concept): string {
    const foldIn = c.__bothRepFoldInLocalPrimitives;
    const marker = c.__recencyValueDescriptors as
      | { local: EffectiveRepresentationDescriptor; source: EffectiveRepresentationDescriptor }
      | undefined;
    if (
      foldIn === undefined ||
      marker === undefined ||
      marker.local?.arm !== "local-exact" ||
      (marker.source?.arm !== "source" && marker.source?.arm !== "source-projected")
    ) {
      throw new Error(
        `internal invariant violated: recency-value merge twin "${c.name}" is missing its fold-in name or its ` +
          `[local-exact, source] descriptors — set in lock-step at lowering; a missing pair is a compiler bug ` +
          `(or an ill-formed hand-built AST).`,
      );
    }
    const local = marker.local;
    const source = marker.source;
    const sourceName = `${foldIn} Source`;

    const localLib = this.caseFeature.kind === "inferred" ? this.caseFeature.localSourceLibrary : "";
    const sourceLib =
      this.caseFeature.kind === "inferred" ? (this.caseFeature.recordSourceLibrary ?? "") : "";
    const lpRef = cqlQualifiedRef(localLib, foldIn);
    const epRef = cqlQualifiedRef(sourceLib, sourceName);

    // ⭐⭐ #189 — a `shape is Record` merge publishes the newest RECORD, so it selects over the UNION of the arms
    // and stops. It does NOT go through the value-merge below.
    //
    // WHY THE UNION IS THE WHOLE MECHANISM HERE: both arms retrieve the concept's OWN `type is` resource (the
    // local `code is` records and the `coded from` source records are both `[Observation: …]`), so the union is
    // HOMOGENEOUS and needs no candidate construction. The operator's model — two arms ADD to a collection and
    // the `definition is` stage WORKS ON it — is then literally the emitted expression: `union` adds, `Last(…)`
    // is the stage.
    //
    // ⚠ THE VALUE MERGE BELOW CANNOT SERVE THIS CASE, and would emit untranslatable CQL if it tried. A
    // record-shaped `local-exact` descriptor carries NO `valueElement`/`datumValueType` (there is no value to
    // read — the record IS the result), so the value path interpolates them as `undefined` and emits
    // `where O.undefined is FHIR.undefined` under `success: true`. MEASURED on the goal's `Height` before this
    // branch existed. A silent untranslatable emit is worse than a refusal, so the branch is taken FIRST.
    //
    // ⚠ ARM RANK IS NOT IN THIS SORT KEY, deliberately and with the operator's ruling. On an equal `effective`
    // the order is ASSERTED > RECORDED > INFERRED, but `sort by <effective>, id` cannot express it and the
    // operator ruled the cell unrealistic ("nothing is ever going to come in on two arms at the same instant")
    // and low priority. It is recorded in `DESIGN-bothrep-derivation-merge.md` §5c, NOT silently dropped.
    if (c.__recencyMergePublishes === "record") {
      // ⭐ #189 — THE SPACE COMES FROM THE TERM LIST, not from the two refs above. `local ∪ posrep ∪ n
      // constructed candidates` is ONE list with ONE renderer (`renderSpaceTerms`), so the records twin and
      // the published determination cannot disagree about what is in the space. A twin with no terms is a
      // lowering bug rather than an author error, but the two-arm form is kept as an EXPLICIT fallback so a
      // hand-built AST (a public entry) still emits the derived pair it always did.
      // ⚠ NO SILENT FALLBACK. An earlier revision fell back to `lpRef union epRef` when terms were absent,
      // twenty lines below `emitRecordUnion` THROWING for the identical state with the comment "a silent
      // fallback would re-hide exactly the implicitness this replaces" — two answers to one question in one
      // file, which is the drift `renderSpaceTerms` exists to remove. Worse, the lock-step invariant was
      // enforced in ONE direction: a constructed term with no spec threw, while SPECS WITH NO TERMS silently
      // emitted two arms and dropped every producer. That is precisely the failure this slice removes.
      // ⭐⭐ #189 — A VALUELESS RECORD MUST NEVER WIN THE SELECTION (operator, 2026-08-31: *"there should
      // never be valueless observations at all"*).
      //
      // The VALUE merge has always filtered non-conforming rows — *"a newer non-conforming row must not mask
      // an older conforming one"* (disc 506). The RECORD branch had no such filter, because the descriptor
      // did not know the record's carrier. It does now (`answerCarrier`), so the same rule applies: a record
      // whose declared carrier holds nothing is not a candidate for "the newest establishment of this
      // determination", however recent it is. Our own case-feature profile says `value[x] min=1`, so such a
      // record does not conform to what we tell a user to write.
      //
      // ⚠ SCOPED TO A DECLARED CARRIER, and that scope IS the rule. An `exists this` concept's SD carries NO
      // `value[x]` at all — its answer is the record's PRESENCE — so `answerCarrier` is absent and no filter
      // is emitted. Filtering there would drop every legitimate existence record.
      //
      // ⚠ DEFENCE-IN-DEPTH, not a fix for a defect we ship: nothing in our emit produces a valueless record
      // (measured — the four I first blamed on the emit were my own harness submitting an UNPRUNED
      // QuestionnaireResponse). It defends the invariant against ANY writer, which is what makes it worth
      // having: this space holds records from `$extract`, from source systems, and from us.
      const conformingFilter =
        local.answerCarrier !== undefined ? `FHIR.${local.answerCarrier.valueType}` : undefined;
      const terms = c.__recordUnionTerms;
      if (terms === undefined || terms.length === 0) {
        throw new Error(
          `internal invariant violated: recency-value merge twin "${c.name}" carries no ` +
            `\`__recordUnionTerms\` — set in lock-step with the descriptors at lowering; a missing list is a ` +
            `compiler bug (or an ill-formed hand-built AST).`,
        );
      }
      return this.emitSelectNewest(this.renderSpaceTerms(c, terms, localLib, sourceLib), local, conformingFilter);
    }

    // ⚠ A PROJECTED SOURCE ARM HAS NO VALUE ELEMENT, and cannot: its source resource is one whose truth is
    // EXISTENCE (a Condition has no modeled value carrier at all). It contributes CONSTRUCTED RECORDS, so it
    // belongs to the record branch. The value merge would read `source.valueElement` off it — the compiler
    // catches that today, and this keeps it caught if the descriptor ever grows the field for another reason.
    if (source.arm === "source-projected") {
      throw new Error(
        `internal invariant violated: recency-value merge twin "${c.name}" publishes a VALUE but its source ` +
          `arm is a PROJECTION, which contributes constructed records rather than a value to read.`,
      );
    }

    // ⚠ THE VALUE BRANCH READS NEITHER TERMS NOR SPECS, so a constructed candidate reaching it would be
    // SILENTLY DROPPED. It is unreachable today — `deriveEffect` grants `producer` only to a record-spaced
    // concept, so `producerStages.length > 0` implies `publishes === "record"` — but that invariant lives two
    // modules away and a hand-built AST is a public entry. Same standard `producerCandidate.ts` applies to a
    // flow-reading producer: make the day it becomes reachable a LOUD failure, not a quiet divergence.
    if (((c.__recencyProducerSpecs ?? []) as readonly unknown[]).length > 0) {
      throw new Error(
        `internal invariant violated: recency-value merge twin "${c.name}" publishes a VALUE but carries ` +
          `producer specs. A constructed candidate joins a RECORD space; the value merge has nowhere to put ` +
          `it and would drop the derivation silently.`,
      );
    }

    // A recency timestamp read (`System.DateTime`) off a record expression (`base` = `(<newest>).`) or the bare
    // element (`base` = "" for the in-query `sort by`). `dateTime` casts the polymorphic `effective[x]` choice.
    const ts = (rec: RecencyAccess, base: string): string =>
      rec.cast === "dateTime"
        ? `(${base}${rec.sortExpr} as FHIR.dateTime).value`
        : `${base}${rec.sortExpr}.value`;

    // The newest local + newest source record, each a deterministic `Last(… where <value conforms> sort by
    // <recency>, id)`. NO status filter (a DTR-extracted answer is not stamped `final` — same rule as the age
    // merge, operator decision 2026-07-01). The value-conforming `where` keeps only rows whose datum is the
    // declared type (a newer non-conforming row must not mask an older conforming one — disc 506).
    const localNewest =
      `Last(\n    (${lpRef}) O\n      where O.${local.valueElement} is FHIR.${local.datumValueType}\n` +
      `      sort by ${ts(local.recency, "")}, id\n  )`;
    const sourceNewest =
      `Last(\n    (${epRef}) O\n      where O.${source.valueElement} is FHIR.${source.datumValueType}\n` +
      `      sort by ${ts(source.recency, "")}, id\n  )`;

    // The two-tier selection (source-null→local, local-null→source, else recency tie-break). Value reads cast to
    // the concept's datum type (`local.valueElement` is the polymorphic `value[x]`; the source's own value read).
    return crossRepRecencyMergeExpr({
      localValue: `(${localNewest}).${local.valueElement} as FHIR.${local.datumValueType}`,
      localTs: ts(local.recency, `(${localNewest}).`),
      sourceValue: `(${sourceNewest}).${source.valueElement} as FHIR.${source.datumValueType}`,
      sourceTs: ts(source.recency, `(${sourceNewest}).`),
    });
  }

  private emitCodedFrom(c: Concept, def: CodedFromDefinition): string {
    // A synthetic local-source CodedFromDefinition (from `lowerLocalCodes`)
    // supplies `retrieveResourceType: "Observation"` to force the local-source
    // retrieve to `[Observation: …]` regardless of the concept's `type is`.
    // Hand-authored `coded from` has no `retrieveResourceType` → keeps the
    // historical `conceptType ?? "Observation"` (byte-identical emit).
    // ⚠ This is a SYNTHESIZED-TWIN backstop, not the author-facing default. A twin the emitter builds
    // may carry no `conceptType` of its own; an AUTHORED `code is` with no `type is` is rejected upstream
    // by `local-code-missing-type` and never reaches here.
    const resource = def.retrieveResourceType ?? c.conceptType ?? "Observation";
    const crossLib = this.crossLibraryOf(def.terminologyName);
    const termName = getRefName(def.terminologyName);
    if (crossLib !== null) {
      // Cross-library terminology ref: emit `[Resource: Lib."Term"]`. No
      // collision suffix — the other library owns its terminology naming.
      return `[${resource}: ${cqlQualifiedRef(crossLib, termName)}]`;
    }
    if (!this.terminologyNames.has(termName)) {
      // v2.2 Todo 3 (issue #59) — if the unresolved name is shadowed by an
      // AST parameter, surface that in the FIXME so the author isn't sent
      // chasing a missing terminology that was actually a parameter ref in
      // the wrong slot.
      if (this.astParameters.has(termName)) {
        return `// FIXME: ${cqlIdent(termName)} is a parameter, not a terminology\n[${resource}: ${cqlIdent(termName)}]`;
      }
      return `// FIXME: unresolved terminology ${cqlIdent(termName)}\n[${resource}: ${cqlIdent(termName)}]`;
    }
    const refName = this.terminologyEmitName.get(termName) ?? termName;
    return `[${resource}: ${cqlIdent(refName)}]`;
  }

  /**
   * Determine the AUTHOR's declared shape for a concept — boolean vs
   * refinement. Per the principle [[defined-as-is-semantic-composition]],
   * the author declares `(type, valuetype)`; the emitter delivers that
   * shape. The body kind says WHAT operation; the declaration says WHAT
   * the operation produces. Catalog patterns have NO return types; they
   * are semantic expressions whose CQL realization shape is decided by
   * the author's declaration.
   *
   *   - `value type is boolean` → boolean (predicate)
   *   - otherwise              → refinement (list of declared `type`)
   *
   * For names that don't resolve to a known concept (e.g., raw
   * terminology refs that escape into the composition), we fall back to
   * refinement.
   */
  private declaredShape(name: string): CompositionShape {
    if (!this.conceptNames.has(name)) {
      // Unknown ref — treat as refinement (the safer default for downstream).
      return "refinement";
    }
    const valuetype = this.conceptValuetype.get(name);
    if (valuetype === "boolean") return "boolean";
    return "refinement";
  }

  private declaredShapeOfConcept(c: Concept): CompositionShape {
    if (c.valueTypes?.includes("boolean")) return "boolean";
    return "refinement";
  }

  /**
   * #189 Slice C 2b.3b.1ii — classify a boolean-parent `defined as` COMPOSITION's SAME-LAYER (bare-ref) operands
   * for the pivot. Distinguishes: a QUALIFIED operand (`hasQualifiedOperand` — a rendered cross-LAYER ref or an
   * authored cross-LIBRARY ref → the caller DEFERS to the existing behavior; the cross-lib verdict rides the
   * index-backed resolver in a later slice); an UNRESOLVED bare name (`firstUnresolvedBareName` — a same-layer ref
   * to no known concept, an author typo → loud, not a dangling identifier); a KNOWN-non-boolean OR INDETERMINATE
   * operand (`firstNonBooleanOperand` + its `firstNonBooleanResultType`, `undefined` ⇒ indeterminate 0/>1 value
   * types — BOTH are result-type problems: an indeterminate scalar has no determinate type and a shape-blind
   * comparator can still read it `total`, so it must be caught as a mismatch, NOT silently flipped — 1ii-a review
   * gpt56 #2); and per-operand totality (`anyTotal` / `firstNonTotalOperand`) via the shared predicate. NOTE: the
   * FLIP decision itself is the shared predicate at the caller (parent + operand gate, lock-step with 1i), not an
   * `allTotal` flag here.
   */
  private classifyBooleanCompositionOperands(expr: CompositionExpression): {
    hasQualifiedOperand: boolean;
    firstUnresolvedBareName?: string;
    anyTotal: boolean;
    firstNonBooleanOperand?: string;
    firstNonBooleanResultType?: ResultType; // undefined ⇒ the operand's result type is INDETERMINATE (0/>1 value types)
    firstNonTotalOperand?: string;
  } {
    const refs: ReferenceName[] = [];
    const walk = (e: CompositionExpression): void => {
      switch (e.type) {
        case "CompositionRef":
          refs.push(e.ref);
          break;
        case "CompositionGroup":
        case "SemNotExpression":
          walk(e.expression);
          break;
        case "SemAndExpression":
        case "SemOrExpression":
          e.terms.forEach(walk);
          break;
      }
    };
    walk(expr);
    const resolver = this.totalityResolvers();
    let hasQualifiedOperand = false;
    let anyTotal = false;
    let firstUnresolvedBareName: string | undefined;
    let firstNonBooleanOperand: string | undefined;
    let firstNonBooleanResultType: ResultType | undefined;
    let firstNonTotalOperand: string | undefined;
    for (const ref of refs) {
      if (getRefLibrary(ref) !== null) {
        hasQualifiedOperand = true; // cross-layer / cross-library → defer (1ii-b)
        continue;
      }
      const name = getRefName(ref);
      const concept = this.conceptByName.get(name);
      if (concept === undefined) {
        if (firstUnresolvedBareName === undefined) firstUnresolvedBareName = name;
        continue;
      }
      const rt = conceptResultType(assumedShapePreMigration(concept.shape), concept.valueTypes ?? [], concept.conceptType);
      const isScalarBoolean = rt !== undefined && rt.shape === "Scalar" && rt.valueType === "boolean";
      if (!isScalarBoolean && firstNonBooleanOperand === undefined) {
        // A known non-boolean result type OR an indeterminate one (rt === undefined) — both are result-type
        // problems the boolean lane cannot take.
        firstNonBooleanOperand = name;
        firstNonBooleanResultType = rt;
      }
      if (emitsBareReExportableScalarBoolean(concept, resolver)) anyTotal = true;
      else if (firstNonTotalOperand === undefined) firstNonTotalOperand = name;
    }
    return {
      hasQualifiedOperand,
      firstUnresolvedBareName,
      anyTotal,
      firstNonBooleanOperand,
      firstNonBooleanResultType,
      firstNonTotalOperand,
    };
  }

  /** #189 2b.3b.1ii — the category-specific remedy for a `emit-composition-result-type-mismatch` operand (1ii-a
   *  review gpt56 #3: `defined as exists` is valid ONLY for a RecordSet, not a scalar or a single record). */
  private compositionMismatchRemedy(operand: string, rt: ResultType | undefined): string {
    if (rt !== undefined && rt.shape === "RecordSet") {
      return `Make the existence bridge explicit with \`- defined as exists ( "${operand}" ).\` (existence over the record set), or give "${operand}" a boolean value type.`;
    }
    if (rt !== undefined && rt.shape === "Record") {
      return `Reduce "${operand}" to a boolean explicitly (a boolean \`most recent\` / comparator over the record), not an existence bridge over a single record.`;
    }
    // Scalar<V≠boolean> or indeterminate (0/>1 value types).
    return `Give "${operand}" a single \`- value type is boolean.\` (or derive a boolean from it).`;
  }

  /**
   * Determine the shape to use for a composition expression FROM ITS
   * PARENT's perspective. The parent concept's declared
   * `(type, valuetype)` is authoritative — operands of a composition
   * are bridged to match. This replaces the v0.2 leaf-walking heuristic
   * which contradicted the principle.
   */
  private shapeForComposition(parent: Concept, _expr: CompositionExpression): CompositionShape {
    return this.declaredShapeOfConcept(parent);
  }

  /**
   * #189 Slice 0b — lower a `defined as` BOOLEAN composition (`("A" and "B")`) to ONE compound total
   * boolean `and`/`or`/`not`. This is NOT the sem-* truth-set path (`emitDefinedAs`/`emitComposition`): the
   * operands are SEPARATE boolean facts, referenced BARE (gate-proven) via `compositionLeafPolicy` — never
   * `.asTruths()`-lifted or `exists`-bridged. Lane-independent: a same-lib operand references bare
   * `cqlIdent(name)` on BOTH the off/standard and case-feature Inferences lanes (the composition and its
   * operands both classify Inferences → same layer). SAME-LIB operands only in 0b (cross-lib proof rides 0c).
   *
   * GATE on the family predicate `emitsTotalScalarBoolean(c)` — parent `Scalar<boolean>` ∧ EVERY operand a
   * proven-total scalar boolean, the SAME verdict the discharge + façade read (banner A). A non-total operand
   * or a non-scalar-boolean parent is a LOUD emit error, NEVER a fabricated terminal `Coalesce` (charter §4).
   */
  /**
   * The `{legacy, family}` totality-resolver pair for the ONE classifier `emitsTotalScalarBoolean` (0c per-arm
   * family switch, disc 465). In the same-library emit phase BOTH arms use the same-layer name→concept resolver, so
   * a qualified operand is inert (non-total) — byte-for-byte the pre-0c single-resolver behavior. 0c step 3 overrides
   * `family` with a cross-library `DeclaredResultIndex`-backed resolver (bound to this library's source identity) so a
   * boolean composition over a foreign total boolean proves total; the legacy arms (bare-ref alias, sem-*) keep the
   * inert resolver, so a top-level sem-or `Numerator` stays byte-invariant (banner I containment). Centralizing the
   * pair here means the pivot, the ledger discharge, and every operand walk read ONE resolver policy (banner A).
   */
  private totalityResolvers(): Resolvers {
    const sameLayer = sameLayerResolver((n) => this.conceptByName.get(n));
    const svc = this.crossLibraryTotality;
    if (svc === undefined) return uniformResolvers(sameLayer); // no service → same-library only (byte-invariant)
    const renderedLayerNames = svc.renderedLayerNames;
    const family = makeTotalityFamilyResolver({
      sameLayer,
      index: svc.index,
      fromIdentity: svc.fromIdentity,
      ...(svc.resolveRawLibrary !== undefined ? { resolveRawLibrary: svc.resolveRawLibrary } : {}),
      // Rendered-layer classification is layered-lane only; on the `none` lane there are no rendered tokens.
      ...(renderedLayerNames !== undefined
        ? { isRenderedLayerToken: (lib: string) => renderedLayerNames.has(lib) }
        : {}),
    });
    return { legacy: sameLayer, family };
  }

  private emitBooleanComposition(c: Concept, body: DefinedAsBooleanComposition): string {
    // A `code is` + `defined as (boolean composition)` both-representation concept: a boolean composition
    // publishes ONE scalar boolean, which cannot fold into the local-code truth-set union (the SAME ill-typing
    // as `code is` + `defined as exists`, refused in `emitDefinedAs`; the multi-representation both-rep case is
    // #257-deferred — `classifyBooleanTotality` rejects its obligation). `lowerLocalCodes` admits it into the
    // union fold, so refuse LOUD here on the RIGHT axis (the both-rep fold) rather than fall through to the
    // generic "(unknown)" non-total-operand error (code review disc 464, Claude #2b).
    if (c.__bothRepMerge !== undefined || c.__bothRepFoldInLocalPrimitives !== undefined) {
      const loc = body.expression.location.start;
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-boolean-composition-both-rep",
        line: loc.line,
        column: loc.column,
        message:
          `Concept "${c.name}" carries a local \`code is\` AND a \`defined as\` boolean composition (a both-` +
          `representation merge). A boolean composition publishes one scalar boolean, which cannot fold into the ` +
          `local-code truth-set union (ill-typed, like \`code is\` + \`defined as exists\`). Multi-representation ` +
          `is #257-deferred — model the boolean over the local records with a separate concept, or drop one arm.`,
      });
      return `/* FIXME: emit-boolean-composition-both-rep (${c.name}) */ CRLCommon.BooleanCompositionBothRep('${c.name}')`;
    }
    const resolver = this.totalityResolvers();
    // #189 O3 — the LANE gate asks whether every operand is a SCALAR BOOLEAN, not whether each is TOTAL.
    // Charter §4: composition is strong Kleene and "totality belongs at the arm, never per operand", so a
    // three-state operand composes fine — `not(null)` is null, which is the pause propagating.
    if (!emitsBareReExportableScalarBoolean(c, resolver)) {
      return this.emitBooleanCompositionError(c, body);
    }
    // The gate passed → every operand is a proven-total scalar boolean (a cross-library operand proven via the
    // `DeclaredResultIndex` family arm, 0c). Render library-aware: a cross-library / cross-layer operand qualifies
    // through the emit's rename map (`crossLibraryOf` — self-ref → null → bare; a rendered-layer sibling → its layer
    // library; a genuine foreign ref → `S`), a bare same-layer operand stays bare. This reuses the EXACT
    // qualification every other cross-lib emit path uses (`emitCQL.ts:2664/2757`), so the emitted qualifier matches
    // the emitted `include` line (and the include-alias/rename spelling).
    const qualify: QualifyLeaf = (ref) => {
      const crossLib = this.crossLibraryOf(ref);
      const refName = getRefName(ref);
      return crossLib !== null ? cqlQualifiedRef(crossLib, refName) : cqlIdent(refName);
    };
    // Defense-in-depth (0c, NARROWED from the 0b blanket qualified-operand refusal — plan §3): a qualified operand
    // whose RAW library token is not among this emit's `crossLibraryIncludes` would emit a DANGLING reference (no
    // matching `include`). The include collector (`visitConceptDefinitionRefs`) walks the SAME boolean-composition
    // operands, so this cannot fire in correct operation — it is a tripwire for a future collector/emit divergence,
    // refusing LOUD rather than shipping dangling CQL. (A self-qualified operand → `crossLibraryOf` null → excluded.)
    const danglingOperand = branchConditionConceptRefsStrict(body.expression, "emitBooleanComposition").find((r) => {
      const lib = getRefLibrary(r.ref);
      return lib !== null && this.crossLibraryOf(r.ref) !== null && !this.options.crossLibraryIncludes.includes(lib);
    });
    if (danglingOperand !== undefined) {
      const loc = body.expression.location.start;
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-boolean-composition-operand-missing-include",
        line: loc.line,
        column: loc.column,
        message:
          `INVARIANT (#189 Slice 0c): operand "${getRefName(danglingOperand.ref)}" of boolean composition ` +
          `"${c.name}" renders a qualified reference to library "${getRefLibrary(danglingOperand.ref)}", not among ` +
          `this library's cross-library includes — the emitted CQL would dangle. The include collector and the ` +
          `emitter have diverged on boolean-composition operands.`,
      });
      return `/* FIXME: emit-boolean-composition-operand-missing-include (${c.name} -> ${getRefName(danglingOperand.ref)}) */ CRLCommon.BooleanCompositionOperandMissingInclude('${c.name}')`;
    }
    return emitTotalBooleanExpr(body.expression, qualify, compositionLeafPolicy);
  }

  /** The LOUD, actionable emit error for a boolean composition that cannot flip (charter §4 — never a
   *  fabricated total). Distinguishes a non-`Scalar<boolean>` PARENT from a non-total OPERAND (naming the first
   *  offender). A qualified operand is reported as `operand-not-total` with a cross-library note (NOT a separate
   *  kind — that misdiagnosed a same-lib CROSS-LAYER requalified operand as cross-library; disc 464 Claude #2a).
   *  Mirrors the sem-* pivot's `emitErrors.push` + FIXME-return pattern (accumulate, don't crash the emit). */
  private emitBooleanCompositionError(c: Concept, body: DefinedAsBooleanComposition): string {
    const loc = body.expression.location.start;
    const parentIsScalarBoolean =
      assumedShapePreMigration(c.shape) === "Scalar" && (c.valueTypes?.length ?? 0) === 1 && c.valueTypes?.[0] === "boolean";
    if (!parentIsScalarBoolean) {
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-boolean-composition-parent-not-scalar-boolean",
        line: loc.line,
        column: loc.column,
        message:
          `Concept "${c.name}" is a \`defined as\` boolean composition (\`and\`/\`or\`/\`not\`) but its parent is ` +
          `not a scalar boolean. Declare it \`- shape is Scalar.\` + \`- value type is boolean.\` — a boolean ` +
          `composition publishes ONE total boolean (charter §3: cardinality is authoritative).`,
      });
      return `/* FIXME: emit-boolean-composition-parent-not-scalar-boolean (${c.name}) */ CRLCommon.BooleanCompositionParentNotScalarBoolean('${c.name}')`;
    }
    const resolvers = this.totalityResolvers();
    const refs = branchConditionConceptRefsStrict(body.expression, "emitBooleanComposition");
    // Name the FIRST genuinely non-total operand under the SAME family-arm policy the gate used
    // (`branchCompositionOperandTotal`: a qualified operand consults the cross-lib index verdict, a bare operand
    // recurses same-layer). 0c PROVES a qualified operand total, so the 0b "any qualified operand ⇒ offender" rule
    // now mis-blames a proven-total foreign operand in a mixed `foreign-total and local-non-total` composition
    // (disc 466, both arms). A qualified offender that is STILL non-total gets an accurate note (its foreign define
    // is non-total, or it is unresolvable in this library's scope — never a promise of a proof that just failed).
    // ⭐ #189 null/pause T5 step 2b — SEARCH IN THE GATE'S MODE (`scalarBoolean`), not in `total`.
    //
    // The gate above asks `emitsBareReExportableScalarBoolean` — is every operand a scalar BOOLEAN — because
    // composition is strong Kleene and totality belongs at the arm, never per operand. Searching in `total`
    // mode asked a DIFFERENT question, so in `defined as ( "Q" and "SomeRecordSet" )` the gate failed on the
    // RecordSet while the search named the QUESTION — which is scalar-boolean but (rightly) never total.
    // The message then told the author to totalize a question, and adding `exists this` to a question converts
    // "ask the user" into "deny": the exact pause→deny flip this slice exists to remove, delivered by the
    // diagnostic meant to help. Same mode ⇒ the named operand is always one that actually failed the gate.
    const nonTotal = refs.find((r) => !branchCompositionOperandTotal(r.ref, resolvers, "scalarBoolean"));
    const offender = nonTotal !== undefined ? getRefName(nonTotal.ref) : "(unknown)";
    const crossLibNote =
      nonTotal !== undefined && getRefLibrary(nonTotal.ref) !== null
        ? " (a cross-library operand whose foreign define does not emit a total scalar boolean, or is unresolvable in this library's scope)"
        : "";
    this.emitErrors.push({
      type: "Validation",
      kind: "emit-boolean-composition-operand-not-total",
      line: loc.line,
      column: loc.column,
      // ⚠ #189 null/pause T5 step 2b — this message must NEVER advise totalizing an operand. A three-state
      // operand is WELCOME here (composition is strong Kleene; `not(null)` is null, which is the pause
      // propagating), so the defect is never "this operand can be null" — it is "this operand is not a scalar
      // boolean at all". Advising `exists this` on a question would turn a pause into a denial.
      message:
        `Concept "${c.name}" is a boolean \`defined as\` composition (\`and\`/\`or\`/\`not\`) but operand ` +
        `"${offender}"${crossLibNote} does not emit a scalar BOOLEAN. Every operand must publish one boolean — a ` +
        `reduction \`exists\`/\`count\`, a boolean comparator, a \`defined as exists\`, a locally-coded boolean ` +
        `question, or a composition/alias over such. An operand that publishes RECORDS composes with \`sem-and\`/` +
        `\`sem-or\` instead, on the record lane. ⚠ Do NOT make the operand "total" to satisfy this: an operand ` +
        `that is UNKNOWN until answered is legitimate here and its unknown must propagate (charter §4 — totality ` +
        `belongs at the arm, never per operand). Totalizing a question turns a pause into a denial.`,
    });
    return `/* FIXME: emit-boolean-composition-operand-not-total (${c.name} -> ${offender}) */ CRLCommon.BooleanCompositionOperandNotTotal('${c.name}')`;
  }

  private emitDefinedAs(
    c: Concept,
    body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition
  ): string {
    // Case-feature truth-set INFERRED emit: a `defined as` concept is a normalized
    // truth-set. The operators stay set-ops (`union`/`intersect`/`except`) and the
    // operand-shape/`exists(...)` bridge is suppressed (every operand IS a
    // truth-set), so we force the parent shape to "refinement" and let
    // `emitComposition`'s truth-set leaf rendering add `.asTruths()` per LocalPrimitives
    // leaf. (A bare-ref `defined as` to another Inferences concept is a truth-set
    // alias — emit the qualified ref with NO `.asTruths()`.)
    if (this.caseFeature.kind === "inferred") {
      // #270 — `defined as exists ("X")` lowers on the case-feature INFERRED lane too, to the SAME bare
      // scalar `exists (<X>)` as the standard lane (`emitExistsBridge`, shared). Existence is a TOTAL
      // boolean (the ONE classifier `emitsTotalScalarBoolean` now returns true for it), so it does NOT join
      // the truth-set set-op weave below — it re-exports bare via the Interface façade, like an
      // inferred-lane `definition is exists` reduction. Before #270 this threw `definedAsExistsNotLowered`
      // (no content exercised the inferred lane); the shared bridge retires that. The early return narrows
      // `body` to bare-ref | composition for the truth-set rendering below.
      if (body.type === "DefinedAsExists") {
        // Claude-3 (disc 461 code review, both arms): a both-rep `code is` + `defined as exists` twin
        // (`__bothRepFoldInLocalPrimitives` set) would fold `LocalPrimitives."X".asTruths() union exists(...)` — a
        // truth-set List union a scalar Boolean, ill-typed, silently DROPPING the concept's own local-code
        // records from its truth. The `code is` + `defined as` fold is validator-rejected (E1) but
        // `emitCQLFromAST` is validator-free, so refuse loud here (mirrors the bare-ref both-rep guard below)
        // rather than emit a wrong answer on the canonical local-domain path (charter §2).
        if (c.__bothRepFoldInLocalPrimitives !== undefined) {
          // #189 Piece 1 (disc 506) — the value/interface boolean fold. `code is X` + `defined as exists ("V")`
          // where V is a both-rep RECENCY-VALUE concept: the interface is member-EXISTENCE, a three-leg total OR
          //   (i)  own arm — the NEWEST own boolean record's value (NOT `exists(O where value is true)`, which
          //        erases an explicit `false` over a multi-record history — design v7 §1);
          //   (ii) `exists(LocalPrimitives."V")` — a local member record;
          //   (iii)`exists(ExternalPrimitives."V Source")` — a source member record.
          // All three legs are total (`is true` / `exists`) → the OR is total, no `Coalesce`. NARROWED to a
          // recency-value referent (Piece 1 scope); any other both-rep fold stays the DEFERRED throw below.
          // The member-existence fold twin was VALIDATED at lowering (`isMemberExistenceInterface`: unqualified ref
          // to a recency-value referent, own arm a standard boolean Observation) and marked by the ABSENCE of a
          // `__bothRepMerge` (an age twin carries `"recency"`, a deferred union `"union"`). So key on that marker,
          // NOT a re-check of the referent — the interface-shape gate lives at ONE authority (disc 507 A/B).
          if (c.__bothRepMerge === undefined) {
            return this.emitMemberExistenceFold(c, getRefName(body.ref));
          }
          throw new ReductionInCompositionError(
            `Concept "${c.name}" carries a local \`code is\` and \`defined as exists ("${getRefName(body.ref)}")\` ` +
              `but is not the value/interface member-existence fold (the referent is not a same-library ` +
              `recency-value concept, or the interface's own arm is not a standard boolean Observation). The ` +
              `general \`code is\` + \`defined as\` both-rep fold is a DEFERRED emit gap (#257), NOT an authoring ` +
              `error — do not reshape the concept (fixture-is-oracle).`,
            body.location,
          );
        }
        return this.emitExistsBridge(c, body);
      }
      // Both-representation fold-in: the Inferences twin of a `code is` + `defined
      // as` concept must UNION the direct local-source retrieve with its inferred
      // composition: `LocalPrimitives."X".asTruths() union (<composition>)`. The
      // LocalPrimitives leaf is an EXPLICIT qualified ref (not a bare same-name ref —
      // that would resolve to this very Inferences twin and self-recurse).
      // #189 Slice-C boundary 1 — a bare-ref alias `defined as "R"` to a REDUCTION is ill-typed in the
      // truth-set lane (its façade would apply `.satisfied()` to a bare Boolean). The composition arm below
      // guards via `emitComposition`; guard the bare-ref arm here with the SAME shared assertion so the
      // alias form cannot bypass it (impl-panel round 1, Claude).
      const foldIn = c.__bothRepFoldInLocalPrimitives;
      // #189 Slice C 2b.2 — FLIP: a bare-ref alias whose OWN declaration is boolean AND whose same-layer referent
      // emits a TOTAL Scalar boolean (a reduction / boolean comparator / boolean list-pattern, transitively —
      // `emitsTotalScalarBoolean(c)`, which gates on `c`'s declared value type per charter §3–§4) re-exports that
      // total boolean DIRECTLY (a bare CQL Boolean), NOT lifted to a truth-set `.asTruths()` List. A non-total /
      // non-boolean-declared alias keeps the load-bearing guard + the `.asTruths()` path. Fold-in (a both-rep
      // concept, `__bothRepMerge` set) is orthogonal — the predicate already refuses it, and `foldIn === undefined`
      // keeps the flip out of the union path (whose weave is guarded next).
      if (body.type === "DefinedAsBareRef" && foldIn === undefined && emitsBareReExportableScalarBoolean(c, this.totalityResolvers())) {
        return cqlIdent(getRefName(body.ref));
      }
      // #189 Slice C 2b.2 (code review, Claude #3) — a both-rep UNION whose inferred bare-ref operand is a TOTAL
      // boolean would emit `LocalPrimitives."X".asTruths() union (<Boolean>)` — ill-typed. The flip is excluded here
      // (`foldIn !== undefined`) and the retained reduction guard misses a comparator/alias operand, so reject any
      // total-boolean bare-ref operand woven into the union (mirrors the composition-site widening).
      if (
        body.type === "DefinedAsBareRef" &&
        foldIn !== undefined &&
        getRefLibrary(body.ref) === null &&
        emitsBareReExportableScalarBoolean(this.conceptByName.get(getRefName(body.ref)), this.totalityResolvers())
      ) {
        throw new ReductionInCompositionError(
          `Concept "${getRefName(body.ref)}" emits a TOTAL boolean and cannot be the inferred operand of a ` +
            `both-representation \`code is\` + \`defined as\` union (a truth-set List \`union\` a total boolean is ` +
            `ill-typed). Composing a both-rep merge over total booleans is deferred to a later #189 boundary.`,
          typeof body.ref === "string" ? undefined : body.ref.location,
        );
      }
      // #189 Slice C 2b.3b.1 — FLIP a boolean-declared `defined as` COMPOSITION whose operands are ALL total to
      // the boolean lane (`and`/`or`/`not`) instead of the truth-set set-op lane (`union`/`intersect`/`except`).
      // TOTALITY-GATED: the shared predicate returns true only when EVERY operand is total (recursively), so a
      // composition mixing a truth-set (bare-scalar `code is`) operand stays on the truth-set lane (BYTE-INVARIANT,
      // deferred to 2e; the retained refinement guard in `emitComposition` still fires on a MIXED operand set). A
      // fold-in weave (`foldIn !== undefined`) stays refinement (§4.6(i) — the record-half flip rides 2b.4/#257).
      // Gated the SAME way as the discharge (`emittedDischargeAndType`) + the façade, which consult the SAME
      // predicate, so emit / discharge / façade agree by construction.
      // #189 2b.3b.1ii — PIVOT for a boolean-DECLARED `defined as` COMPOSITION. `declaredShapeOfConcept(c) ===
      // "boolean"` is the boolean-vs-refinement gate (includes-boolean). Then:
      //   - a QUALIFIED / cross-lib operand → DEFER to the current behavior (the cross-lib totality/compatibility
      //     verdict rides the index-backed resolver, a later slice — keeps `layered-name-collision` byte-invariant);
      //   - PARENT CARDINALITY authority (disc 452 #1, re-affirmed 1ii-a review, BOTH arms): only a Scalar<boolean>
      //     parent may emit a scalar boolean composition. A boolean-DECLARED but non-scalar-boolean parent (Record /
      //     RecordSet / multi-value-type) must NOT flip — it falls through to the current path (loud via the retained
      //     refinement guard when operands are total). The FLIP itself is the shared predicate
      //     `emitsTotalScalarBoolean(c)` (parent isScalarBoolean + EVERY operand total), lock-step with the discharge
      //     + façade — NOT the classifier, which only SELECTS the honest error when the parent is scalar-boolean but
      //     the composition does not flip.
      if (body.type === "DefinedAsComposition" && foldIn === undefined && this.declaredShapeOfConcept(c) === "boolean") {
        const resolver = this.totalityResolvers();
        const cls = this.classifyBooleanCompositionOperands(body.expression);
        const parentIsScalarBoolean =
          assumedShapePreMigration(c.shape) === "Scalar" && (c.valueTypes?.length ?? 0) === 1 && c.valueTypes?.[0] === "boolean";
        if (!cls.hasQualifiedOperand && parentIsScalarBoolean) {
          const loc = body.expression.location.start;
          if (cls.firstUnresolvedBareName !== undefined) {
            // A same-layer bare operand resolving to NO known concept — an author typo / missing concept, NOT the
            // deferred cross-lib cell. Loud rather than a dangling identifier that only fails at translator load
            // (1ii-a review, both arms — §4.4 miss policy for the reachable same-layer case).
            this.emitErrors.push({
              type: "Validation",
              kind: "emit-declared-result-unresolved",
              line: loc.line,
              column: loc.column,
              message:
                `Concept "${c.name}" is a boolean \`defined as\` composition whose operand ` +
                `"${cls.firstUnresolvedBareName}" does not resolve to a concept in this library. Check the name, or ` +
                `import the library that declares it.`,
            });
            return `/* FIXME: emit-declared-result-unresolved (${c.name} -> ${cls.firstUnresolvedBareName}) */ CRLCommon.DeclaredResultUnresolved('${cls.firstUnresolvedBareName}')`;
          }
          if (cls.firstNonBooleanOperand !== undefined) {
            // A boolean parent over an operand with a KNOWN non-boolean OR INDETERMINATE (0/>1 value-type) result
            // type — a hard emit error at the flip (design §7 `composition-result-type-mismatch`), NOT a silent
            // `exists`-bridge. Remedy is category-specific (a RecordSet CAN take an explicit `exists`; a scalar /
            // single record cannot) — 1ii-a review gpt56 #2 (indeterminate) + #3 (remedy).
            this.emitErrors.push({
              type: "Validation",
              kind: "emit-composition-result-type-mismatch",
              line: loc.line,
              column: loc.column,
              message:
                `Concept "${c.name}" is a boolean \`defined as\` composition but operand "${cls.firstNonBooleanOperand}" ` +
                `has ${cls.firstNonBooleanResultType === undefined ? "an INDETERMINATE result type (0 or >1 value types)" : `result type \`${renderResultType(cls.firstNonBooleanResultType)}\``}, ` +
                `not \`boolean\`. A boolean composition (\`and\`/\`or\`/\`not\`) cannot take it. ` +
                this.compositionMismatchRemedy(cls.firstNonBooleanOperand, cls.firstNonBooleanResultType),
            });
            return `/* FIXME: emit-composition-result-type-mismatch (${c.name}) */ CRLCommon.CompositionResultTypeMismatch('${c.name}')`;
          }
          if (emitsBareReExportableScalarBoolean(c, resolver)) {
            return this.emitComposition(body.expression, "boolean"); // FLIP — parent Scalar<boolean> + every operand a scalar boolean
          }
          if (cls.anyTotal) {
            // MIXED totality: every operand is boolean-COMPATIBLE (mismatch above did not fire) but some are total,
            // some not — their result types AGREE (both Scalar<boolean>) so the mismatch diagnostic would be false.
            // NEW kind. Remedy: make the non-total operand total, or keep the composition on the truth-set lane.
            this.emitErrors.push({
              type: "Validation",
              kind: "emit-composition-totality-mixed",
              line: loc.line,
              column: loc.column,
              message:
                `Concept "${c.name}" is a boolean \`defined as\` composition mixing TOTAL and non-total boolean ` +
                `operands (e.g. non-total "${cls.firstNonTotalOperand}"). A total scalar boolean (reduction / recency ` +
                `/ comparator) cannot compose with a non-total truth-set operand in one lane. Make every operand ` +
                `total, or keep the composition on the truth-set lane using only truth-set operands (the non-total ` +
                `bare-scalar retirement is a later #189 boundary).`,
            });
            return `/* FIXME: emit-composition-totality-mixed (${c.name}) */ CRLCommon.CompositionTotalityMixed('${c.name}')`;
          }
          // else: ALL operands non-total (bare-scalar truth-set) → fall through to the current truth-set/refinement
          // path (BYTE-INVARIANT; the bare-scalar flip is deferred to slice 2e).
        }
        // NOTE (ledger honesty, 1ii-a review Claude nit): on the error returns above the concept still enrolls a
        // discharge from its PRE-error form (`emittedDischargeAndType` runs separately). Harmless — the emit already
        // fails (`success:false`), so nothing ships — but the T7 declared-vs-emitted gate must exempt an
        // emit-errored concept rather than trip on the sentinel body.
      }
      if (body.type === "DefinedAsBareRef") this.assertNotReductionTruthSetOperand(body.ref);
      const inner =
        body.type === "DefinedAsBareRef"
          ? this.emitTruthSetBareRef(body.ref)
          : this.emitComposition(body.expression, "refinement");
      if (foldIn !== undefined) {
        const direct = `${cqlQualifiedRef(this.caseFeature.localSourceLibrary, foldIn)}.asTruths()`;
        // Multi-line parenthesized group around the inferred composition, matching
        // the both-rep golden's layout. `indent(inner, 2)` adds the 4-space inset.
        return `${direct}\n  union (\n${indent(inner, 2)}\n  )`;
      }
      return inner;
    }
    if (body.type === "DefinedAsExists") return this.emitExistsBridge(c, body);
    if (body.type === "DefinedAsBareRef") {
      const crossLib = this.crossLibraryOf(body.ref);
      const refName = getRefName(body.ref);
      if (crossLib !== null) {
        return cqlQualifiedRef(crossLib, refName);
      }
      return cqlIdent(refName);
    }
    const shape = this.shapeForComposition(c, body.expression);
    return this.emitComposition(body.expression, shape);
  }

  /**
   * #270 — lower `defined as exists ( "X" )` to a bare scalar `exists (<X>)`. SHARED by the off/standard
   * lane (#265) AND the case-feature INFERRED lane (#270), so the two lanes cannot drift (impl-plan disc
   * 461 banner C — ONE target-shape check at the exists lowering). The operand is X's RAW define — a
   * `code is` retrieve, a `coded from`/list-pattern retrieve, or a refinement list — resolved via the
   * shared cross-library/cross-layer qualification (the requalifier has already qualified a cross-LAYER
   * ref, `layeredEmit.ts:811`). NOT `.asTruths()`: existence is over the RAW records ("any record
   * exists"), mirroring the standard lane and an inferred-lane `definition is exists` REDUCTION — which
   * also emits a bare `exists(...)` and re-exports bare (the reduction precedent, `totalScalarBoolean.ts:143`
   * + the reduction lowering above). A `defined as exists` is a TOTAL boolean (existence is never null),
   * so its ledger discharge is `intrinsic-exists` and its Interface façade re-exports BARE (the
   * `DefinedAsExists` arms at the discharge + `layeredEmit`'s `srcIsExists`), NOT the truth-set
   * `.satisfied()` path. Emitting a truth-set lift here instead would DIVERGE from both the standard lane
   * and reductions (disc 461: the "truth-set lift" option missed the reduction precedent).
   *
   * Two guards (disc 461 code review, both arms): (1) RESULT coherence — the result concept must be a
   * `Scalar<boolean>` (a record shape cannot publish an existence boolean); (2) OPERAND must publish a
   * record set — refuse ANY same-lib operand that emits a total scalar boolean (exists / reduction /
   * comparator / flipped alias), because `exists` over a scalar boolean is ill-typed or silently inverts.
   * A cross-layer/cross-lib operand skips guard (2) (`crossLibraryOf !== null`) — its shape is proven at the
   * resolver seam (0c), not here.
   */
  private emitExistsBridge(c: Concept, body: DefinedAsExists): string {
    // #189 Piece 1 (disc 507 C) — a NO-`code is` `defined as exists ("V")` whose referent V is a both-rep
    // RECENCY-VALUE concept: the correct lowering is MEMBER-EXISTENCE (exists V's records, design v7), NOT the B3
    // scalar null-presence (`V is not null`) — those diverge on the record-with-null-value edge, exactly what v7
    // fixed. The no-`code is` member-existence interface is NOT built in Piece 1 (only the `code is` + `defined as
    // exists` fold is), and `emitsScalarValue`'s verdict on the merge twin is an ACCIDENT of the requalify workaround
    // (lane-divergent), so refuse LOUDLY here rather than inherit it. Same-lib only (a cross-lib operand's shape is
    // proven at the resolver seam).
    if (this.crossLibraryOf(body.ref) === null) {
      const referent = this.conceptByName.get(getRefName(body.ref));
      if (referent?.__bothRepMerge === "recency-value") {
        throw new ReductionInCompositionError(
          `Concept "${c.name}": \`defined as exists ("${getRefName(body.ref)}")\` over a both-representation ` +
            `recency-value value concept is a MEMBER-EXISTENCE interface (design v7). The no-\`code is\` form is a ` +
            `DEFERRED emit gap — add a local \`code is\` to author the value/interface boolean (the built fold), or ` +
            `it activates in a later slice. NOT an authoring error — do not reshape the concept.`,
          body.location,
        );
      }
    }
    // RESULT COHERENCE (disc 461 code review G2, both arms; charter §3 cardinality authoritative). `defined
    // as exists` publishes a SCALAR BOOLEAN (existence is true-or-false), so the result concept must declare
    // exactly `shape is Scalar` + a single `value type is boolean`. A `shape is Record/RecordSet` +
    // `defined as exists` is incoherent (a record shape cannot publish an existence boolean) — the
    // useSiteType validator documents this as a DEFERRED gap it does not yet catch, and `emitCQLFromAST` is
    // validator-free, so enforce it HERE rather than emit a scalar `exists(...)` under a record declaration.
    // Mirrors the reduction coherence guard (`ReductionShapeIncoherentError`).
    if (assumedShapePreMigration(c.shape) !== "Scalar" || c.valueTypes.length !== 1 || c.valueTypes[0] !== "boolean") {
      const vtClause =
        c.valueTypes.length === 1
          ? ` and \`value type is ${c.valueTypes[0]}\``
          : c.valueTypes.length > 1
            ? ` and ${c.valueTypes.length} value types (needs exactly one \`boolean\`)`
            : " and no `value type`";
      throw new ReductionShapeIncoherentError(
        `Concept "${c.name}": \`defined as exists\` publishes a Scalar boolean (existence is true-or-false), ` +
          `but the concept declares \`shape is ${c.shape}\`${vtClause}. Declare \`- shape is Scalar.\` with ` +
          `\`value type is boolean\`.`,
        body.location,
      );
    }
    // OPERAND must publish a RECORD SET (disc 461 code review G3/Claude-7, both arms; the #269 gap). `exists`
    // over an already-total scalar boolean — another `defined as exists`, a reduction, a boolean comparator,
    // a flipped total alias — is ill-typed at translator load, or SILENTLY INVERTS if the translator
    // promotes the singleton to a list (`exists({false})` = true). Refuse ANY same-lib operand that emits a
    // total scalar boolean (the ONE classifier, now exists-aware — so exists-over-exists is caught
    // transitively), not merely a `ReductionDefinition`. A cross-layer/cross-lib operand skips this
    // (`crossLibraryOf !== null`) — its shape is proven at the resolver seam (0c), not here.
    if (this.crossLibraryOf(body.ref) === null) {
      const operand = this.conceptByName.get(getRefName(body.ref));
      if (operand && emitsBareReExportableScalarBoolean(operand, this.totalityResolvers())) {
        throw new ReductionInCompositionError(
          `\`defined as exists ("${operand.name}")\` applies \`exists\` to "${operand.name}", which already ` +
            `emits a TOTAL scalar boolean — \`exists\` over a scalar boolean is ill-typed (and may silently ` +
            `invert via singleton promotion). Reference it directly with \`defined as "${operand.name}"\`, ` +
            `or apply \`exists\` to a record set.`,
          typeof body.ref === "string" ? undefined : body.ref.location,
        );
      }
    }
    const crossLib = this.crossLibraryOf(body.ref);
    const refName = getRefName(body.ref);
    const ref = crossLib !== null ? cqlQualifiedRef(crossLib, refName) : cqlIdent(refName);
    // #189 B3 — a SCALAR-VALUE operand (the B2 cross-rep merge / a `most recent this` value read) lowers to a
    // NULL-PRESENCE predicate, NOT `exists (<scalar>)` (ill-typed — disc 496). Keyed on the LOWERED result
    // (`emitsScalarValue`), so a `coded from` Scalar<CodeableConcept> that emits a RECORD retrieve correctly stays
    // `exists` (the `Overweight Diagnoses` trap, disc 500). `ref` is the operand's PUBLIC name — which the flip
    // wires to publish the MERGE/value define, never the records twin (Claude referent contract, disc 500).
    if (this.existsBridgeIsNullPresence(body)) return `(${ref} is not null)`;
    return `exists (${ref})`;
  }

  /**
   * #189 Piece 1 (disc 506) — emit the value/interface boolean MEMBER-EXISTENCE fold: a three-leg total OR for a
   * `code is X` + `defined as exists ("V")` interface whose referent V is a both-rep RECENCY-VALUE concept. Legs:
   *   (i)   own arm — the NEWEST own boolean record's value (design v7 §1: newest-wins, NOT `exists(O where value
   *         is true)`, which erases an explicit `false` over a multi-record history);
   *   (ii)  `exists(LocalPrimitives."V")`      — a local member record of V;
   *   (iii) `exists(ExternalPrimitives."V Source")` — a source member record of V.
   * Every leg is total (`FHIRHelpers.ToBoolean(null) is true` → false; `exists` never null), so the OR is a TOTAL
   * boolean with NO `Coalesce`. The own LP twin is `c`'s own name (`__bothRepFoldInLocalPrimitives`); V's LP/EP
   * retrieves are `V` / `V Source`. Explicit sibling-QUALIFIED refs (a bare same-name would resolve to the
   * Inferences merge and self-recurse — `buildNameLayerMaps`).
   */
  private emitMemberExistenceFold(c: Concept, referentName: string): string {
    const foldIn = c.__bothRepFoldInLocalPrimitives!;
    const localLib = this.caseFeature.kind === "inferred" ? this.caseFeature.localSourceLibrary : "";
    const sourceLib =
      this.caseFeature.kind === "inferred" ? (this.caseFeature.recordSourceLibrary ?? "") : "";
    // (i) own arm — the newest own boolean Observation's value. The standard boolean case-feature read
    //     (`O.value`/`effective`) is CORRECT because `isMemberExistenceInterface` gated activation on a
    //     `Scalar<boolean>` Observation at the default value carrier (disc 507 B). NO status filter (a DTR-extracted
    //     answer is not stamped `final`, mirroring the age merge).
    const ownNewest =
      `Last(\n    (${cqlQualifiedRef(localLib, foldIn)}) O\n      where O.value is FHIR.boolean\n` +
      `      sort by (effective as FHIR.dateTime).value, id\n  )`;
    const ownArm = `FHIRHelpers.ToBoolean((${ownNewest}).value as FHIR.boolean) is true`;
    // (ii)/(iii) member records of the referent V.
    const localMember = `exists (${cqlQualifiedRef(localLib, referentName)})`;
    // ⭐⭐ LEG (iii) CARRIES THE REFERENT'S OWN DATUM FILTER, or it CONTRADICTS the referent.
    //
    // ⚠ MEASURED (panel round 10, gpt arm #3), and it is a self-contradiction inside ONE library. When V's
    // source arm is CONSTRUCTED, V drops any source record carrying no datum — that is V's pause semantics.
    // A raw `exists (EP."V Source")` here answers from the RETRIEVE instead, so for a carrier whose coding and
    // datum are DIFFERENT elements the two disagree: a `Condition` in the value set with a `recordedDate` but
    // no `onset` makes V publish null while this leg says a member exists. Same library, opposite answers
    // about the same concept — the cross-lane drift this refactor exists to remove.
    //
    // ⚠ It does NOT arise where coding and datum COINCIDE (`ServiceRequest.code`, `Encounter.type`), because
    // the VS-filtered retrieve already implies the datum. That coincidence is why the probe missed it.
    const referent = this.conceptByName.get(referentName);
    const referentRead = (referent?.__valueReadSourceSpec as ValueReadSourceSpec | undefined)?.read.element;
    const sourceRef = cqlQualifiedRef(sourceLib, `${referentName} Source`);
    const sourceMember =
      referentRead === undefined
        ? `exists (${sourceRef})`
        : `exists ((${sourceRef}) S where S.${referentRead} is not null)`;
    return `${ownArm}\n    or ${localMember}\n    or ${sourceMember}`;
  }

  /** #189 B3 — is this `defined as exists ("X")`'s operand a SCALAR-VALUE (→ null-presence `is not null`) rather
   *  than a record list (→ `exists`)? Consulted by BOTH `emitExistsBridge` (the expression) AND the discharge
   *  (`emittedDischargeAndType`), so the emitted text and the enrolled discharge cannot drift (disc 500). Same-lib
   *  only — a cross-lib operand stays on `exists` in B3 (its scalar-value cell is dispatched at the flip). INERT
   *  today: no emittable corpus operand is scalar-value (all are RecordSet / gated). */
  private existsBridgeIsNullPresence(body: DefinedAsExists): boolean {
    if (this.crossLibraryOf(body.ref) !== null) return false;
    return emitsScalarValue(this.conceptByName.get(getRefName(body.ref)), this.totalityResolvers());
  }

  /**
   * Case-feature truth-set leaf rendering for a composition `CompositionRef` (or a
   * truth-set bare-ref `defined as`). The requalifier (`layeredEmit.ts`) has
   * already qualified cross-LAYER refs and left same-layer refs bare:
   *   - cross-lib ref whose target is the LocalPrimitives layer → a `code is` LEAF:
   *     `<LocalPrimitives>."L".asTruths()` (lift the Observation retrieve to a truth-set).
   *   - cross-lib ref whose target is the Inferences layer → a NESTED `defined as`
   *     operand (already a truth-set): `<Inferences>."N"` (NO `.asTruths()`).
   *   - BARE ref → a SAME-LAYER Inferences sibling (the requalifier drops the
   *     qualifier for same-layer targets): SELF-QUALIFY to `<Inferences>."N"` (a
   *     truth-set), matching the nested golden's `"…-Inferences"."A And B"`.
   * Returns null for a ref the truth-set classifier doesn't recognize (a foreign
   * library, or an unknown bare name) so the caller falls back to legacy rendering.
   */
  private emitTruthSetRef(ref: ReferenceName): string | null {
    if (this.caseFeature.kind === "off") return null;
    const { localSourceLibrary, inferredLibrary, recordSourceLibrary } = this.caseFeature;
    const name = getRefName(ref);
    const lib = getRefLibrary(ref);
    if (lib === null) {
      // Bare ref → a SAME-LAYER Inferences sibling (the requalifier drops the
      // qualifier for same-layer targets). A bare name that is NOT an Inferences
      // concept is NOT a truth-set leaf this lane models — return null so the
      // caller surfaces it via legacy handling instead of fabricating a dangling
      // `<inferredLib>."name"`.
      if (this.conceptNames.has(name)) {
        return this.inferredSiblingRef(name);
      }
      return null;
    }
    if (lib === localSourceLibrary) {
      return `${cqlQualifiedRef(localSourceLibrary, name)}.asTruths()`;
    }
    if (lib === inferredLibrary) {
      return this.inferredSiblingRef(name);
    }
    // Fix 2 [important] — a ExternalPrimitives (`coded from`) operand woven into a
    // truth-set (LocalPrimitives/Inferences) `defined as` composition. This is the
    // FUTURE `code is` + `coded from` weave: unioning/intersecting a truth-set
    // with a record retrieve-LIST is invalid. Hard-error rather than mis-emit a
    // bare `RecordLib."X"` into the set-op. (The deliverable is `code is` only →
    // no ExternalPrimitives layer → `recordSourceLibrary` undefined → never triggers.)
    if (recordSourceLibrary !== undefined && lib === recordSourceLibrary) {
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-mixed-source-inference-unsupported",
        line: typeof ref === "string" ? 0 : ref.location.start.line,
        column: typeof ref === "string" ? 0 : ref.location.start.column,
        message:
          `A \`defined as\` truth-set composition references ExternalPrimitives concept ` +
          `"${name}" (\`coded from\`/record retrieve) alongside LocalPrimitives/Inferences ` +
          `truth-set operands. Mixing a record retrieve-list into a truth-set ` +
          `set-op (union/intersect/except) is invalid, and the \`code is\` + ` +
          `\`coded from\` weave is a future feature. Keep a \`defined as\` over a ` +
          `single source family.`,
      });
      // Return null so the caller falls through; the emit already fails via the
      // structured error above.
      return null;
    }
    // Foreign / unrecognized qualifier → not a truth-set leaf this lane models.
    return null;
  }

  /**
   * Render an Inferences→Inferences truth-set sibling ref. When the Inferences sibling
   * lives in the CURRENT emitting library (the common same-library case — a
   * `defined as` define referencing another `defined as` define in the same
   * `<policyId>-Inferences` layer), emit it BARE (`"A And B"`): a library cannot
   * reference its own define by its own library name — the CQL translator rejects
   * `"<lib>-Inferences"."A And B"` with `Could not resolve identifier
   * <lib>-Inferences`. Only a genuinely cross-library Inferences operand is qualified.
   * Mirrors the measure lane's same-library-bare behavior.
   */
  private inferredSiblingRef(name: string): string {
    const { inferredLibrary } = this.caseFeature as { inferredLibrary: string };
    if (inferredLibrary === this.options.libraryName) {
      return cqlIdent(name);
    }
    return cqlQualifiedRef(inferredLibrary, name);
  }

  /** Truth-set bare-ref `defined as` (used by the fold-in helper). */
  private emitTruthSetBareRef(ref: ReferenceName): string {
    const ts = this.emitTruthSetRef(ref);
    if (ts !== null) return ts;
    // Fallback (foreign qualifier): plain qualified/bare ref, no truth-set lift.
    const crossLib = this.crossLibraryOf(ref);
    const refName = getRefName(ref);
    return crossLib !== null ? cqlQualifiedRef(crossLib, refName) : cqlIdent(refName);
  }

  /**
   * Wrap an operand's emission to match the PARENT composition's declared
   * shape. The principle: each operand may have its own declared shape
   * (boolean or refinement); the emitter BRIDGES to deliver the parent's
   * shape. Bridging rules:
   *   - operand boolean, parent boolean: emit as-is
   *   - operand refinement, parent refinement: emit as-is
   *   - operand refinement, parent boolean: wrap with `exists (...)`
   *   - operand boolean, parent refinement: unrepresentable in general (a
   *     boolean isn't a list); emit FIXME + raw operand. This case is
   *     rare in the corpus.
   */
  private bridgeOperand(operandCql: string, operandShape: CompositionShape, parentShape: CompositionShape): string {
    if (operandShape === parentShape) return operandCql;
    if (parentShape === "boolean" && operandShape === "refinement") {
      return `exists (${operandCql})`;
    }
    // operandShape === 'boolean' && parentShape === 'refinement'
    return `/* FIXME: boolean operand in refinement composition */ ${operandCql}`;
  }

  private emitComposition(
    expr: CompositionExpression,
    shape: CompositionShape
  ): string {
    switch (expr.type) {
      case "CompositionRef": {
        // #189 Slice-C boundary 1 — LOUD GUARD: a REDUCTION operand in a TRUTH-SET composition
        // (`shape === "refinement"`) is ill-typed (see `assertNotReductionTruthSetOperand`). A `boolean`-
        // shape composition over a reduction (`"R" and "S"`) is well-typed, so this is gated on refinement.
        if (shape === "refinement") {
          this.assertNotReductionTruthSetOperand(expr.ref);
          // #189 Slice C 2b.2 — post-alias-flip, a TOTAL-boolean operand (a flipped alias / a comparator) woven
          // into a TRUTH-SET composition is `Boolean union/intersect/except List` — ill-typed. The reduction-only
          // guard above misses an alias/comparator (a `DefinedAsDefinition`/`DefinitionIsDefinition`, not a
          // `ReductionDefinition`), so reject any total-boolean operand here. GATED on the truth-set lane
          // (`caseFeature.kind !== "off"`) — the legacy/none lane composes via `bridgeOperand` (`exists`-wrapping),
          // NOT `.asTruths()` set-ops, so a total-boolean operand there is the pre-existing FIXME passthrough, not
          // this weave (code review, Claude #2). #189 2b.3b.1 RETAINS this guard for the REFINEMENT lane (plan
          // §4.5): the boolean-lane flip lands at the pivot (`emitDefinedAs`), so a BOOLEAN parent never reaches
          // here; a REFINEMENT parent still cannot weave a total boolean into a truth-set List (the record-half
          // case, a later boundary).
          if (
            this.caseFeature.kind !== "off" &&
            getRefLibrary(expr.ref) === null &&
            emitsBareReExportableScalarBoolean(this.conceptByName.get(getRefName(expr.ref)), this.totalityResolvers())
          ) {
            // ⚠ #189 null/pause T5 step 2b — this message must NOT say "total", and must NOT advise totalizing.
            // Since 2b it fires for a PURE QUESTION too: a question's determination IS a scalar Boolean, but a
            // THREE-STATE one. Telling an author to make it total is the exact pause→deny flip #189 removes —
            // adding `exists this` to a question converts "ask the user" into "deny". Name the type mismatch and
            // point at the LANE, never at the operand.
            throw new ReductionInCompositionError(
              `Concept "${getRefName(expr.ref)}" emits a scalar BOOLEAN and cannot be a truth-set operand in ` +
                `a REFINEMENT-lane \`defined as\` composition (a boolean union/intersect/except a truth-set ` +
                `List is ill-typed). To compose booleans, declare the PARENT concept \`- value type is boolean.\` so ` +
                `the composition flips to the boolean (\`and\`/\`or\`/\`not\`) lane, which is strong Kleene and ` +
                `propagates an unanswered operand as unknown. Do NOT totalize the operand to satisfy this — if it ` +
                `is a question, totalizing it turns a pause into a denial. Weaving a boolean into a truth-set ` +
                `(refinement) List is the record-half case, deferred to a later #189 boundary.`,
              typeof expr.ref === "string" ? undefined : expr.ref.location,
            );
          }
        }
        // Case-feature truth-set leaf: `.asTruths()` on LocalPrimitives leaves,
        // self-qualified bare truth-set on same-layer Inferences siblings. Bypasses
        // the operand-shape `bridgeOperand` path entirely (no `exists(...)`).
        const truthSet = this.emitTruthSetRef(expr.ref);
        if (truthSet !== null) return truthSet;
        const crossLib = this.crossLibraryOf(expr.ref);
        const refName = getRefName(expr.ref);
        if (crossLib !== null) {
          // Cross-library composition ref: emit `Lib."Name"`. Operand
          // shape is unknown without cross-library scope info; default to
          // "refinement" (the existing fallback for unknown names).
          //
          // TRAP FOR THE FUTURE INTERFACE SLICE: a cross-library composition
          // operand loses its DECLARED-SHAPE info here — we cannot see the
          // target library's concept declaration, so the operand is forced to
          // "refinement" regardless of how it was actually declared (boolean
          // vs refinement). In slice-2 (layered auto-split) this is not
          // reachable in a SHAPE-significant way: cross-LAYER refs the splitter
          // produces are requalified leaf refs, not shape-bearing compositions.
          // When the interface/decision slice introduces genuine cross-library
          // composition over declared-boolean concepts, this forced "refinement"
          // will mis-bridge — revisit by threading target-library shape info.
          return this.bridgeOperand(cqlQualifiedRef(crossLib, refName), "refinement", shape);
        }
        const operandShape = this.declaredShape(refName);
        return this.bridgeOperand(cqlIdent(refName), operandShape, shape);
      }
      case "CompositionGroup":
        return `(${this.emitComposition(expr.expression, shape)})`;
      case "SemNotExpression":
        // No-base sem-not (standalone, or a `sem-or`/union term — a positive-
        // anchored `sem-and` negative is unwrapped to `except` in `emitSemAnd`
        // and never reaches here). Boolean lane: `not (X)`. Refinement lane
        // (#232): the closed-world complement `({ true } except (X))` when the
        // operand is a truth-set; loud-refuse otherwise (a resource-list
        // complement has no universe). See `emitNoBaseNegation`.
        if (shape === "boolean") {
          return `not (${this.emitComposition(expr.expression, shape)})`;
        }
        return this.emitNoBaseNegation(expr.expression, expr);
      case "SemAndExpression":
        return this.emitSemAnd(expr.terms, shape);
      case "SemOrExpression":
        return this.emitSemOr(expr.terms, shape);
    }
  }

  /**
   * sem-and. For booleans: join with `and`. For refinement: positive terms
   * `intersect`-joined, then any sem-not children become `except` clauses.
   */
  private emitSemAnd(terms: CompositionExpression[], shape: CompositionShape): string {
    if (shape === "boolean") {
      return terms
        .map((t) => this.emitComposition(t, shape))
        .join("\n  and ");
    }
    const positives: CompositionExpression[] = [];
    const negatives: Array<{ operand: CompositionExpression; node: CompositionExpression }> = [];
    for (const t of terms) {
      // #232 — a `sem-not` term contributes its OPERAND as a negative. Unwrap a
      // parenthesized `(sem-not B)` (any depth) too, so `A sem-and (sem-not B)`
      // is byte-identical to `A sem-and sem-not B` (both `A except B`) rather
      // than recursing the group into the no-base path. `node` is the `sem-not`
      // itself, for the refusal diagnostic's source location.
      const neg = asSemNotOperand(t);
      if (neg !== null) negatives.push(neg);
      else positives.push(t);
    }
    if (positives.length === 0) {
      // No positive base to `except` from: each negative is the closed-world
      // complement from the unit universe `{ true }` (`emitNoBaseNegation`
      // gates truth-set flavor / loud-refuses). AND of complements = intersect.
      // (Previously `{} except (…)` — always empty, a silent bug.)
      return negatives
        .map((n) => this.emitNoBaseNegation(n.operand, n.node))
        .join("\n  intersect ");
    }
    const pos = positives.map((t) => this.emitComposition(t, shape)).join("\n  intersect ");
    if (negatives.length === 0) return pos;
    // Positive-anchored: `except` each negative operand from the base. NOTE: this
    // path does NOT classify the negative — a resource-list negative emits
    // `base except R` and fails only downstream at CQL translation (a type error),
    // without the source-located CRL error the no-base path gives. Pre-existing
    // asymmetry; tracked by the #235 silent-FIXME audit.
    const neg = negatives.map((n) => this.emitComposition(n.operand, shape)).join("\n  except ");
    return `${pos}\n  except ${neg}`;
  }

  /**
   * Issue #232 — lower a NO-BASE `sem-not` operand to the closed-world truth-set
   * complement. In the truth-set lane every value is `{ true }` (established) or
   * `{}` (not established), so `{ true } except (X)` is `{ true }` iff X is not
   * established — the missing standalone-complement operator, expressed with the
   * native `except` (no new fluent helper, no shared-library version bump). The
   * result is PARENTHESISED because `union`/`except`/`intersect` share precedence
   * and left-associate: as a `sem-or` term, `B union ({ true } except (A))` must
   * not degrade to `(B union { true }) except A`.
   *
   * Loud-refuse when the operand is NOT a truth-set (a `List<Resource>` complement
   * has no bounded universe): push an `emit-unlowerable-negation` hardError
   * (forces `success: false`, keeps `result`) AND emit a compile-failing
   * `CRLCommon.UnsupportedNegation(…)` sentinel — mirroring the #79 unmatched-
   * narrative mechanism so the artifact can never silently ship inverted.
   */
  private emitNoBaseNegation(
    operand: CompositionExpression,
    node: CompositionExpression
  ): string {
    const flavor = this.classifyNegationOperand(operand);
    if (flavor !== "truth-set") {
      return this.refuseNegation(node, flavor);
    }
    return `({ true } except (${this.emitComposition(operand, "refinement")}))`;
  }

  /**
   * The message distinguishes the two unlowerable flavors — a `resource-list`
   * (`coded from`) operand genuinely has no complement universe, whereas
   * `unknown` means the operand's truth-representation could not be established
   * locally (cross-library/foreign operand, a `definition is` predicate, or a
   * cyclic definition). Reporting both as "resource-list" would misdescribe the
   * latter and suggest an irrelevant remedy.
   */
  private refuseNegation(
    node: CompositionExpression,
    flavor: "resource-list" | "unknown"
  ): string {
    const loc = node.location?.start;
    const cause =
      flavor === "resource-list"
        ? "has a resource-list (`coded from`) operand, which has no bounded universe to negate against"
        : "has an operand whose truth-representation could not be established locally (a cross-library/foreign operand, a `definition is` predicate, a TOTAL scalar boolean such as a patient-age recency merge / reduction / comparator, or a cyclic definition)";
    this.emitErrors.push({
      type: "Validation",
      kind: "emit-unlowerable-negation",
      line: loc?.line ?? 0,
      column: loc?.column ?? 0,
      message:
        `\`sem-not\` ${cause}, so this \`defined as\` cannot be lowered to CQL. ` +
        "If the operand is a TOTAL scalar boolean (e.g. a patient-age recency merge — #189 2b.3b.1), declare " +
        "THIS concept `- value type is boolean.` so the whole composition flips to the `not (...)` boolean lane. " +
        "Otherwise express it as a positive-anchored `A sem-and sem-not B` (list refinement over a base), or move " +
        "the negation to the decision layer (`not`). The emitted CQL carries a compile-failing " +
        "CRLCommon.UnsupportedNegation(…) sentinel so it cannot silently ship.",
    });
    const note =
      flavor === "resource-list"
        ? "resource-list operand has no complement universe"
        : "operand flavor could not be established";
    return (
      `// FIXME: unlowerable sem-not — ${note}\n` +
      `CRLCommon.UnsupportedNegation('sem-not operand flavor: ${flavor}')`
    );
  }

  /**
   * Issue #232 — classify a `sem-not` operand's truth-representation. PURE: no
   * diagnostics pushed (unlike `emitTruthSetRef`, whose ExternalPrimitives branch
   * pushes an error), so classification never double-fires or spuriously fires
   * a mixed-source diagnostic. `truth-set` → complement lowers; anything else →
   * loud-refuse. Deliberately conservative: an operand whose flavor cannot be
   * established locally is `unknown` → loud-refuse (never a silent inversion).
   */
  private classifyNegationOperand(
    expr: CompositionExpression,
    visiting: ReadonlySet<string> = new Set()
  ): "truth-set" | "resource-list" | "unknown" {
    switch (expr.type) {
      case "CompositionRef":
        return this.classifyRefFlavor(expr.ref, visiting);
      case "CompositionGroup":
        return this.classifyNegationOperand(expr.expression, visiting);
      case "SemNotExpression":
        // Double negation: complement of a complement — same flavor as the operand.
        return this.classifyNegationOperand(expr.expression, visiting);
      case "SemAndExpression":
      case "SemOrExpression":
        return combineFlavors(
          expr.terms.map((t) => this.classifyNegationOperand(t, visiting))
        );
    }
  }

  private classifyRefFlavor(
    ref: ReferenceName,
    visiting: ReadonlySet<string>
  ): "truth-set" | "resource-list" | "unknown" {
    // No case-feature model (`off` lane): the truth-set representation does not
    // exist here, so the operand's flavor is unmodeled → `unknown` → loud-refuse.
    if (this.caseFeature.kind === "off") return "unknown";
    const cf = this.caseFeature;
    const name = getRefName(ref);
    const lib = getRefLibrary(ref);
    if (lib === null) {
      // Bare → same-layer Inferences sibling; recurse into its declaration.
      if (!this.conceptNames.has(name)) return "unknown";
      return this.classifyConceptFlavor(name, visiting);
    }
    if (lib === cf.localSourceLibrary) return "truth-set"; // `.asTruths()` leaf
    if (lib === cf.inferredLibrary) return this.classifyConceptFlavor(name, visiting);
    if (cf.recordSourceLibrary !== undefined && lib === cf.recordSourceLibrary) {
      return "resource-list"; // `coded from` retrieve
    }
    // Foreign library — flavor not locally knowable (a cross-library operand
    // loses its declared-shape info, per the cross-library trap documented at
    // the `bridgeOperand` fallback in `emitComposition`). A future cross-policy
    // Interface truth-set operand under `sem-not` will over-refuse here until
    // target-library flavor is threaded through. Conservative → loud-refuse.
    return "unknown";
  }

  private classifyConceptFlavor(
    name: string,
    visiting: ReadonlySet<string>
  ): "truth-set" | "resource-list" | "unknown" {
    if (visiting.has(name)) return "unknown"; // cycle → loud (never memoize a guess)
    const c = this.conceptByName.get(name);
    if (!c) return "unknown";
    // #189 Slice C 2b.3b.1 — a Patient-age RECENCY twin now emits a bare TOTAL boolean
    // (`Coalesce(CFH.recencyAgeSelected(...), false)`), NOT a truth-set. A REFINEMENT-lane `sem-not` over it would
    // otherwise render `{ true } except (<Boolean>)` — ill-typed (a boolean is not a truth-set universe). Return
    // `unknown` → the no-base-negation path loud-refuses (the remedy: declare the parent boolean so it flips to the
    // `not (...)` boolean lane). A boolean-declared parent never reaches this classifier (it flips at the pivot).
    if (c.__bothRepMerge === "recency") return "unknown";
    const body = c.definition;
    if (!body) return "unknown"; // asserted-only concept in this layer
    const next = new Set(visiting).add(name);
    switch (body.type) {
      case "DefinedAsDefinition": {
        const da = body.body;
        if (da.type === "DefinedAsBareRef") return this.classifyRefFlavor(da.ref, next);
        // `exists ("X")` is a boolean determination, not a truth-set/resource-list flavor — return
        // the conservative no-guess sentinel for the sem-not refusal path (like `definition is`),
        // never a composition-shaped guess. (Emit lowering itself landed in #265.)
        if (da.type === "DefinedAsExists") return "unknown";
        // A boolean composition is a boolean determination, not a truth-set/resource-list flavor — return
        // the conservative no-guess sentinel (like `exists`). Emit is inert until T3.
        if (da.type === "DefinedAsBooleanComposition") return "unknown";
        return this.classifyNegationOperand(da.expression, next);
      }
      case "CodedFromDefinition":
        return "resource-list"; // `coded from` → ExternalPrimitives retrieve
      case "DefinitionIsDefinition":
        return "unknown"; // temporal/count predicate flavor not modeled → loud
      case "ReductionDefinition":
        return "unknown"; // #189 reduction flavor not modeled (not emittable yet) → loud
    }
  }

  /** sem-or. Boolean: `or`. Refinement: `union`. */
  private emitSemOr(terms: CompositionExpression[], shape: CompositionShape): string {
    const op = shape === "boolean" ? "or" : "union";
    return terms
      .map((t) => this.emitComposition(t, shape))
      .join(`\n  ${op} `);
  }

  private emitDefinitionIs(c: Concept, def: DefinitionIsDefinition): string {
    const matched = matchNarrative(def.body);
    if (!matched.known) {
      const text = def.body.elements.map((el) => narrativeElementText(el)).join(" ");
      this.unmatchedNarratives.push({
        text,
        line: def.body.location?.start.line,
        column: def.body.location?.start.column,
      });
      // Issue #79 — compile-failing sentinel. `CRLCommon.UnmatchedNarrative`
      // is intentionally undefined in CRLCommon.cql so a downstream CQL
      // compile fails loudly rather than silently shipping always-`true`. The
      // EmitResult.unmatched envelope field is the primary signal; this
      // sentinel is the operational safety net for callers that miss it.
      return `// FIXME: unmatched narrative pattern — ${text}\nCRLCommon.UnmatchedNarrative(${cqlString(text)})`;
    }
    // Generics-by-composition: CRLCommon functions return their PRIMITIVE
    // shape — list-shaped for filter patterns, boolean for inherently-boolean
    // patterns, other-shape for Period/Quantity/Instance/Interval patterns.
    // ⚠ REFACTOR:suspect — THIS BLOCK IS THE PATIENT, not doctrine.
    // The RULE ([[patterns-are-semantic]]): the emitter picks the pattern's REALIZATION FORM from the
    // author's declared `(type, valuetype)` — a catalog signature never constrains what may be declared.
    // It must NEVER INSERT A REDUCTION to bridge a shape. The `exists ...` / `exists { ... }` / `{ ... }`
    // branches below do exactly that, and are slated to become author-time errors naming the fix
    // ("declare the reduction"). They survive only until reduction NESTING lands — without nesting an
    // author cannot SAY `exists ( <filter pattern> )`, so removing them first would strand every author.
    // Do NOT cite these branches as evidence of intended behaviour.
    // #189 — a locally-coded concept's own records join the set its reduction reduces (see the marker).
    const localUnionRef =
      c.__reductionLocalUnion !== undefined
        ? cqlQualifiedRef(
            this.caseFeature.kind === "inferred" ? this.caseFeature.localSourceLibrary : "",
            c.__reductionLocalUnion,
          )
        : undefined;
    const call = this.emitPatternCall(matched, localUnionRef);
    const declared = this.declaredShapeOfConcept(c);
    // #189 P2 D9 — FAIL CLOSED. This was `?? "list"`, which silently classified an unknown pattern as a
    // FILTER: a wrong classification that compiles, which is the soft-compile trap in miniature. Only
    // KNOWN patterns reach here (`emitDefinitionIs` returns the unmatched sentinel above), so a miss is a
    // catalog gap and must say so.
    const patternShape: PatternReturnShape = requireReturnShape(matched.pattern, `concept "${c.name}"`);

    if (declared === "boolean" && patternShape === "list") {
      return `exists ${call}`;
    }
    if (declared === "refinement" && patternShape === "boolean") {
      return `// FIXME: ${matched.pattern} is inherently boolean; refinement consumer cannot use it as a list\n${call}`;
    }
    if (declared === "refinement" && patternShape === "instance") {
      // ⭐ #189 — `shape is Record` PUBLISHES ONE RECORD, and a selection pattern already returns exactly
      // that. Emit the call BARE: there is nothing to bridge.
      //
      // ⚠ This is the `{ call }` coercion, and it was NOT harmless. `declaredShapeOfConcept` collapses every
      // non-boolean into "refinement", so a `shape is Record` concept was silently listified — MEASURED, a
      // `shape is Record` selection emitted `{ CRLCommon.MostRecent("Weight Records") }`
      // (`tmp/nullprobe/analysis/scalarOperand-out.txt`). Consequences that all trace here: `shape is` was
      // not honored in emit at all; a comparator over such a concept bound the `List<Observation>` overload
      // (`exists (…)`, TOTAL) instead of the null-propagating scalar one, which is why the O2 boundary is
      // behaviourally dead; and `Greatest Weight` could not publish the record its shape declares.
      //
      // ⚠ SCOPE — this removes ONE bridge, not the block. `REFACTORS-IN-FORCE` says the coercion block
      // "cannot be removed until reduction NESTING lands — without nesting an author cannot SAY
      // `exists ( <filter pattern> )`". That rationale is REAL and reaches the `exists <call>` bridge above,
      // which is untouched: strip that one and an author has no way to write what it inserts. It does NOT
      // reach this bridge — here the pattern already yields the record, so removing the lift asks the author
      // for nothing they have not already written (`- shape is Record.`). Scope narrowing, not retirement
      // (`stale-requirements` §2); the blocker's own stated reason is what bounds it.
      //
      // RecordSet / Scalar keep the historical lift: declaring a SET (or a scalar VALUE) while reducing to
      // one record is an incoherence the shape validator owns, not a bridge to re-decide here.
      if (assumedShapePreMigration(c.shape) === "Record") return call;
      return `{ ${call} }`;
    }
    if (declared === "boolean" && patternShape === "instance") {
      return `exists { ${call} }`;
    }
    if (declared === "boolean" && patternShape === "boolean") {
      // ⭐ #189 O2 — the boundary is CONDITIONAL. Keyed on the concept's AUTHORED obligation, which
      // `buildAuthoredObligations` already classified with whole-library question-reachability — so the emit
      // and the obligation cannot drift (a drift here is exactly what `proveWholeBoundaryTotality` rejects).
      // A derivation over an ANSWERABLE operand inherits its unknown and must NOT be totalized: charter §4,
      // and the acceptance criterion that a Deny requires an ESTABLISHED false — asserted, recorded, or
      // computed (charter "VOCABULARY"). Absence is never established, so it must not totalize to `false`.
      const authored = this.options.authoredObligations?.get(c.name);
      if (authored?.kind === "sanctioned-three-state" && authored.family === "derivation") {
        return call;
      }
      // #189 Slice C 2b.1 — TOTALIZE the boolean comparator at its own boundary. A catalog comparator
      // (`CRLCommon.AtLeast`/`Below`/…) is a NULLABLE boolean (its argument can be null — e.g. an absent
      // age), so a bare emit violates the charter's null-safety-by-construction (§4). `Coalesce(<cmp>, false)`
      // makes it TOTAL under closed-world (absence ⟹ false). Applied PER-OPERAND at the leaf, BEFORE any `not`
      // (a comparator is a leaf — no `not` here; a composing `defined as` Coalesces each operand at 2b.3).
      // The age both-rep recency merge is a SEPARATE path (`emitRecencyMerge`, `{true}/{}` truth-set) and does
      // NOT reach here, so there is no double-Coalesce.
      return `Coalesce(${call}, false)`;
    }
    // All other combinations: declared matches pattern shape (or pattern is
    // "other"-shaped and the author chose a matching valuetype).
    return call;
  }

  /**
   * ⭐⭐ `"<concept>" in "<terminology>"` — THREE-STATE membership over the subject's published datum.
   *
   * ⚠⚠ THE GUARD IS NOT DEFENSIVE STYLE. MEASURED on the engine, and every row of this cost a probe:
   *
   *   | expression                                   | CQL returns |
   *   |----------------------------------------------|-------------|
   *   | `ToConcept(<member CC>) in "VS"`              | true        |
   *   | `ToConcept(<nonmember CC>) in "VS"`           | false       |
   *   | multi-coding where ONE coding is a member     | true        |
   *   | **`{coding: {}}` — present but EMPTY**        | **false**   |
   *   | **`null` CodeableConcept**                    | **false**   |
   *
   * So `in` reads a MISSING datum as a determinate NO. Lowered naively, "nobody has said which service was
   * requested" would DENY instead of PAUSE — collapsing the unanswered row into the not-covered row, which is
   * the precise defect the goal fixture exists to prevent. The `if … then null` restores the third state.
   *
   * ⚠ EMPTINESS, not just null: a `CodeableConcept` with an empty `coding[]` is PRESENT (so it survives a
   * `is not null` filter, including the one gap 1's constructed source arm applies) and still carries no code
   * to test. It must pause for the same reason no record does.
   *
   * ⚠ `FHIRHelpers.ToConcept(…)` is REQUIRED — a raw FHIR `CodeableConcept` is not a valid `in` operand; the
   * conversion to a System `Concept` is what gives the any-coding-matches semantics measured above.
   *
   * ⚠ The subject is a CONCEPT that has ALREADY REDUCED, so this reads the ONE value it publishes. It does
   * NOT reach through to the subject's representations — that would ignore the author's own reduction and
   * make the answer depend on machinery they cannot see.
   */
  /**
   * The `valueset` declarations for every inline-options subset this layer's predicates bind.
   *
   * ⚠ THE WALK IS RECURSIVE, via `findPatternCalls`. `matchNarrative` FOLDS a pipeline into a
   * `NestedPatternArg`, so a scan of top-level args misses a membership buried in a stage — a bug that
   * appeared in THREE separate readers earlier in #189 before the shared authority existed.
   */
  private emitInlineAnswerValuesets(): string {
    const sets = new Map<string, InlineAnswerSet>();
    for (const stmt of this.ast.statements) {
      if (stmt.type !== "Concept" || stmt.definition?.type !== "DefinitionIsDefinition") continue;
      for (const call of findPatternCalls(stmt.definition.body, "Membership")) {
        if (!call.args.some((a: CanonicalArg) => a.type === "SubsetRefArg")) continue;
        const subj = call.args.find((a: CanonicalArg) => a.type === "ConceptRefArg");
        if (!subj || !("value" in subj)) continue;
        const set = this.options.inlineAnswerSetsByName?.get(String(subj.value));
        if (set) sets.set(set.qualifying.id, set);
      }
    }
    // ⚠⚠ A GENERATED DECLARATION SHARES CQL'S TOP-LEVEL IDENTIFIER NAMESPACE with every authored one, and
    // a clash is SILENT: MEASURED, an authored `terminology "<policy>-<code>-answer-options-qualifying"`
    // produced TWO `valueset` decls with the SAME identifier and DIFFERENT urls, under `success: true`.
    // The library then fails to translate, or binds to whichever the engine picks.
    //
    // ⚠ The FHIR side is already covered by the closure's url/path invariants (VERIFIED: an id clash there
    // is a hard `closure-resource-url-collision`). This is the half those invariants cannot see, because a
    // CQL identifier is not a resource url.
    const taken = new Map<string, string>();
    for (const st of this.ast.statements) {
      const n = (st as { name?: string }).name;
      if (typeof n === "string" && n !== "") taken.set(n, st.type);
    }
    for (const set of sets.values()) {
      const clash = taken.get(set.qualifying.id);
      if (clash === undefined) continue;
      this.emitErrors.push({
        type: "Validation",
        kind: "emit-inline-answer-valueset-name-collision",
        message:
          `The generated \`valueset\` declaration for "${set.ownerConcept}"'s qualifying options is named ` +
          `\`${set.qualifying.id}\`, which collides with an authored ${clash} of the same name in this ` +
          `library. Both would emit a top-level CQL identifier, and the library would bind one of them ` +
          `arbitrarily. Rename the authored declaration, or change the concept's \`code is\` (the generated ` +
          `name derives from it).`,
      });
    }

    return [...sets.values()]
      .map((set) => `valueset ${cqlIdent(set.qualifying.id)}: ${cqlString(set.qualifying.url)}`)
      .join(String.fromCharCode(10));
  }

  /** Resolve a subset comparand against its SUBJECT and render the layer-local `valueset` identifier. */
  private renderSubsetComparand(subjArg: CanonicalArg | undefined, subsetName: string): string {
    const name = subjArg?.type === "ConceptRefArg" ? subjArg.value : undefined;
    const set = name === undefined ? undefined : this.options.inlineAnswerSetsByName?.get(name);
    if (!set) {
      throw new Error(
        `\`in ${subsetName}\` names a subset of "${name ?? "?"}", but that concept declares no inline ` +
          `\`value from:\` options, so there is no set to test against. (#189)`,
      );
    }
    return cqlIdent(set.qualifying.id);
  }

  private emitMembership(call: CanonicalPatternCall): string {
    // ⚠⚠ THE SUBJECT MUST PUBLISH ONE RECORD, AND THIS LANE CANNOT CHECK IT — the VALIDATOR does
    // (`membership-subject-shape-unsupported`). Recorded here because the gap is real: for a
    // `shape is RecordSet` subject the read below is a LIST and the cast is list-to-singleton, so emit
    // reports SUCCESS and the library fails to TRANSLATE ("Expression of type 'List of choice<…>' cannot be
    // cast as a value of type 'CodeableConcept'") — MEASURED, and the same class as gap 1's repeating-read.
    //
    // ⭐ THE GUARD NOW FIRES. It was written here once and REMOVED because `conceptByName` holds only THIS
    // layer's statements and the subject lives in another — a check that cannot fire is worse than none.
    // The note left behind said it needed "the subject's shape carried down where the whole AST is visible";
    // `conceptShapesByName` IS that map (built pre-split, threaded to every layer), so the missing piece was
    // already on the options object.
    const subjArg = call.args[0];
    if (subjArg?.type === "ConceptRefArg") {
      const shape = this.options.conceptShapesByName?.get(subjArg.value);
      if (shape !== undefined && shape !== "Record") {
        throw new Error(
          `membership subject "${subjArg.value}" publishes \`shape is ${shape}\`, but this lowering reads ` +
            `ONE record's value. For a RecordSet that read is a LIST and the cast fails at TRANSLATION while ` +
            `emit reports success. (#189 membership-subject-shape-unsupported)`,
        );
      }
    }

    const subject = this.emitArg(call.args[0]);
    const setArg = call.args[1];
    // ⚠ A SUBSET comparand resolves against the SUBJECT, never against a global terminology table — two
    // different subjects may each declare a `qualifying` subset, and they are different sets.
    const set =
      setArg?.type === "SubsetRefArg"
        ? this.renderSubsetComparand(subjArg, setArg.value)
        : this.emitArg(setArg);
    const datum = `(${subject}.value as FHIR.CodeableConcept)`;
    return (
      `if ${datum} is null or not exists (${datum}.coding) then null
` +
      `    else FHIRHelpers.ToConcept(${datum}) in ${set}`
    );
  }

  private emitPatternCall(call: CanonicalPatternCall, localUnionRef?: string): string {
    // Synthetic patterns (not catalog entries — they represent CQL keyword
    // operators) emit as CQL syntax instead of CRLCommon calls.
    if (call.pattern === "StartOf") {
      return `start of ${this.emitArg(call.args[0])}`;
    }
    if (call.pattern === "EndOf") {
      return `end of ${this.emitArg(call.args[0])}`;
    }
    // ⭐⭐ #189 gap 3 — MEMBERSHIP. Native, like the two above: it emits CQL syntax, not a `CRLCommon` call
    // (there is no membership function and there will not be one — the operator is `in`).
    if (call.pattern === "Membership") {
      return this.emitMembership(call);
    }
    const fn = functionNameFor(call.pattern);
    // ⭐ #189 — `localUnionRef` set ⟺ the concept carried a local `code is` beside this reduction, so the
    // reduction applies to `this` ∪ its named set (operator, 2026-08-29). Only the FIRST argument is the set
    // being reduced; a scope/threshold argument is untouched.
    const args = call.args
      .map((a, i) =>
        i === 0 && localUnionRef !== undefined
          ? `${localUnionRef}
    union ${this.emitArg(a)}`
          : this.emitArg(a),
      )
      .join(", ");
    return `CRLCommon.${fn}(${args})`;
  }


  private emitArg(arg: CanonicalArg): string {
    switch (arg.type) {
      case "ConceptRefArg": {
        // v2.2 Todo 3 (issue #59) — Patient/Practitioner-typed AST
        // parameter refs rewrite to the bare CQL context type. Applies to
        // bare local, qualified self, AND qualified cross-library refs.
        // Per operator: "ALL concepts that reference that parameter should
        // use that Patient context (per the CQL spec)."
        const ctx = this.lookupContextParameter(arg.library, arg.value);
        if (ctx) return ctx.contextType;
        if (arg.library && arg.library !== this.options.libraryName) {
          // #227 — cross-lib arg ref: compare RAW, render the qualifier through `S`.
          return cqlQualifiedRef(this.renderLib(arg.library), arg.value);
        }
        return cqlIdent(arg.value);
      }
      case "SubsetRefArg": {
        // ⚠⚠ SENTINEL — REPLACE WITH THE GENERATED QUALIFYING VALUESET'S CQL DECLARATION IDENTIFIER.
        // `"X" in qualifying` parses and builds, but the per-concept CodeSystem and its ValueSets are not
        // emitted yet, so there is no declaration to render. THROWING is the only honest option: returning
        // a plausible identifier would emit CQL that translates against nothing, and returning the subset
        // name would silently bind to whatever authored terminology happened to share it.
        throw new Error(
          `inline \`value from:\` options do not emit yet: cannot render the "${arg.value}" subset of an ` +
            `answer-option set that has no generated ValueSet. (#189, emit-inline-value-from-not-active)`,
        );
      }
      case "TerminologyRefArg": {
        // ⭐ A value-set operand renders as the CQL `valueset` DECLARATION IDENTIFIER, never as a define name.
        // ⚠ It resolves in the TERMINOLOGY namespace, which is why it is not a `ConceptRefArg`: rendering it
        // through the concept path would emit a reference to a define that does not exist.
        if (arg.library && arg.library !== this.options.libraryName) {
          return cqlQualifiedRef(this.renderLib(arg.library), arg.value);
        }
        return cqlIdent(this.terminologyEmitName.get(arg.value) ?? arg.value);
      }
      case "QuantityArg":
        return arg.unit ? `${arg.value} ${cqlString(arg.unit)}` : `${arg.value}`;
      case "EnumArg":
        return cqlString(arg.value);
      case "DisjunctionArg":
        // When all disjuncts are concept refs (each resolving to a
        // List<Resource>), emit with `union` so the result is a flattened
        // List<Resource>, not a List<List<Resource>>. For non-concept
        // disjuncts (quantities, enums), keep CQL list-literal form.
        if (arg.disjuncts.every((d) => d.type === "ConceptRefArg")) {
          return `(${arg.disjuncts.map((d) => this.emitArg(d)).join(" union ")})`;
        }
        return `{ ${arg.disjuncts.map((d) => this.emitArg(d)).join(", ")} }`;
      case "ConjunctionArg":
        // Mirror DisjunctionArg: for concept-ref conjuncts, use `intersect`
        // to produce a flattened List<Resource> instead of List<List>.
        if (arg.conjuncts.every((c) => c.type === "ConceptRefArg")) {
          return `(${arg.conjuncts.map((c) => this.emitArg(c)).join(" intersect ")})`;
        }
        return `{ ${arg.conjuncts.map((c) => this.emitArg(c)).join(", ")} }`;
      case "NestedPatternArg":
        return this.emitPatternCall(arg.pattern);
    }
  }
}

/** Walk a composition expression and collect every CompositionRef name. */
function collectRefs(expr: CompositionExpression, out: string[]): void {
  switch (expr.type) {
    case "CompositionRef":
      out.push(getRefName(expr.ref));
      return;
    case "SemNotExpression":
      collectRefs(expr.expression, out);
      return;
    case "SemAndExpression":
    case "SemOrExpression":
      for (const t of expr.terms) collectRefs(t, out);
      return;
    case "CompositionGroup":
      collectRefs(expr.expression, out);
      return;
  }
}

/**
 * Issue #232 — if `t` is a `sem-not` term (bare, or wrapped in ANY depth of
 * redundant grouping — `(sem-not B)`, `((sem-not B))`, …), return its operand
 * plus the `sem-not` node (for the refusal diagnostic's location); else null.
 * Lets `emitSemAnd` treat `A sem-and (sem-not B)` identically to `A sem-and
 * sem-not B` (both `A except B`). Peeling ALL group levels matters in the
 * resource-list lane: a doubly-grouped negative left as a "positive" would route
 * through the no-base complement path and loud-refuse, so parentheses would
 * otherwise change SUPPORT, not just layout.
 */
function asSemNotOperand(
  t: CompositionExpression
): { operand: CompositionExpression; node: CompositionExpression } | null {
  let cur = t;
  while (cur.type === "CompositionGroup") cur = cur.expression;
  if (cur.type === "SemNotExpression") return { operand: cur.expression, node: cur };
  return null;
}

/**
 * Issue #232 — combine child truth-representation flavors for a `sem-and` /
 * `sem-or` operand under classification. Any `unknown` (or a mixed truth-set +
 * resource-list weave, which is itself unsupported) yields `unknown` so the
 * no-base negation loud-refuses rather than guessing.
 */
function combineFlavors(
  flavors: Array<"truth-set" | "resource-list" | "unknown">
): "truth-set" | "resource-list" | "unknown" {
  if (flavors.length === 0) return "unknown";
  if (flavors.some((f) => f === "unknown")) return "unknown";
  const distinct = new Set(flavors);
  return distinct.size === 1 ? flavors[0] : "unknown";
}

function hasOnlyValueset(t: Terminology): boolean {
  return t.body.length === 1 && t.body[0].type === "TerminologyValueset";
}

function narrativeElementText(el: { type: string }): string {
  const anyEl = el as { type: string; value?: string | number; unit?: string };
  if (anyEl.type === "NWord") return String(anyEl.value ?? "");
  if (anyEl.type === "NConceptRef") return `"${anyEl.value ?? ""}"`;
  if (anyEl.type === "Quantity") return `${anyEl.value} '${anyEl.unit ?? ""}'`;
  return `<${anyEl.type}>`;
}
