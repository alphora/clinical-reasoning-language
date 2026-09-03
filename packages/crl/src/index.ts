import { ParseTree } from "antlr4ts/tree/ParseTree";

import { CRLAstBuilder } from "./ast/builder";
import { classifyCriterionRefs } from "./ast/criterionClassify";
import { CRL } from "./ast/types";
import { CRLLexer } from "./grammar/generated/antlr/CRLLexer";
import { createLexer } from "./lexer/createLexer";
import { createParser } from "./parser/createParser";
import { CRLError } from "./types/errors";
import { Validator, type ValidationError } from "./validator/validator";

export { emitCQL, emitCQLFromAST } from "./cql-emitter";
export type { EmitOptions as CqlEmitOptions, EmitResult as CqlEmitResult } from "./cql-emitter";

export { emitCQLImports } from "./imports/emit";
export type { EmitImportsResult } from "./imports/emit";

export {
  resolveImports,
  findProjectRoot,
  buildRegistry,
  walkIncludes,
  buildCombinedNamespace,
  emptyNamespace,
} from "./imports";
export type {
  ResolvedGraph,
  RegistryEntry,
  Registry,
  Namespace,
  NamespaceEntry,
  NodeKind,
  ImportDiagnostic,
  ParseFailureDiagnostic,
  ProjectRootNotFoundDiagnostic,
  PackageResolutionFailureDiagnostic,
  RegistryDuplicateDiagnostic,
  UnresolvedIncludeDiagnostic,
  CycleDiagnostic,
  AliasNotYetSupportedDiagnostic,
  RedundantLocalIncludeDiagnostic,
} from "./imports";

export { validateCRLImports } from "./imports/validate";
export type { ValidateImportsOptions, ValidateImportsResult } from "./imports/validate";

// === CEL (Case Example Language) — sibling DSL ===
export { tokenizeCEL, parseCEL, buildCEL } from "./cel";
export type { CELToken, CELParseResult } from "./cel";
export { resolveCelImports } from "./cel/imports";
export type {
  ResolveCelImportsOptions,
  ResolvedCelGraph,
  CelImportDiagnostic,
} from "./cel/imports";
export { runCel } from "./cre";
export type {
  CaseRun,
  CelRunResult,
  ProducedRec,
  TraceNode,
  CompositionTrace,
  BranchConditionTrace,
} from "./cre";
export {
  renderScenario,
  SCENARIO_VIEW_MODEL_SCHEMA_VERSION,
  unsatisfiedFrontier,
  frontierShortLabel,
  frontierTooltip,
} from "./cre";

// #224 decision-layer boolean guards: the `WhenBlock.condition` expression node
// and its traversal. Published so external consumers of the AST (`buildCRL`)
// can read guard refs through the shared helpers rather than re-walking the union.
export type {
  BranchCondition,
  BranchConditionRef,
  BranchConditionAnd,
  BranchConditionOr,
  BranchConditionCriterionRef,
  // #224 iii.2 — decision-guard negation. `BranchConditionNot` is a new member of the
  // (already public) `BranchCondition` union, so external exhaustive switches over it must
  // add a `not` case (a breaking exhaustiveness change, intentional). The narrowed
  // `BranchConditionLiteral`/`…NegatedLiteral` are the DNF-arm atom type that emit consumes.
  BranchConditionNot,
  BranchConditionLiteral,
  BranchConditionNegatedLiteral,
  Criterion,
} from "./ast/types";
export { classifyCriterionRefs } from "./ast/criterionClassify";
// The criterion table + the non-materializing expansion-size envelope (#236 retired inline
// expansion; a criterion lowers to a referenced boolean define — see `criterionIndex.ts`).
export {
  expandedSize,
  containsCriterionRef,
  buildCriterionTable,
  CRITERION_EXPANSION_ATOM_CAP,
  CRITERION_MAX_DEPTH,
} from "./ast/criterionExpansion";
export type { CriterionTable, ExpandedSize, ExpansionReason } from "./ast/criterionExpansion";
export {
  visitBranchCondition,
  branchConditionRefs,
  soleRef,
  describeBranchCondition,
  assertWellFormedBranchCondition,
  // #224 iii.2 — negation-normal-form + the `not` structural helpers.
  toNNF,
  containsNot,
} from "./ast/branchCondition";
// DISPLAY-only projection of a PA determination outcome name (`"certify.Met"` → `"Met"`); the cockpit renderers in
// crl-vscode import this so the outcome shows only the human `<key>`. See dispositions/displayName.ts.
export { displayDetermination, determinationCategory, parseDeterminationName } from "./dispositions";
export type { DeterminationName, DispositionCategoryName } from "./dispositions";
export type {
  RenderScenarioResult,
  ScenarioViewModel,
  CaseView,
  FactView,
  DecisionView,
  ViewNode,
  ConditionView,
  BranchConditionView,
  ConceptView,
  Frontier,
  FrontierItem,
  GuardView,
  ActionView,
  ExplanationView,
} from "./cre";
export {
  getAuthoringKit,
  STAGES,
  DEFAULT_STAGE,
  USE_CASES,
  USE_CASE_NAMES,
  DEFAULT_USE_CASE,
} from "./authoring-kit";
export type {
  AuthoringEdge,
  AuthoringKit,
  AuthoringStage,
  AuthoringUseCase,
  ConceptLayerEntry,
  KitFacet,
  KitRule,
  KitExample,
  ReferenceArtifact,
  TypeAllowlist,
  VerifyLoop,
} from "./authoring-kit/types";
// === Provenance correspondence view-model (validation cockpit, #156) ===
export {
  buildCorrespondenceModel,
  buildCockpitModel,
  buildCrlRevealMaps,
  caseIdsForUnit,
  caseIdsForNode,
  unitsForCase,
  unitsForConcept,
  rowsForConcept,
  conceptNodesForUnit,
  unitsForConceptNode,
  rowNodeKeysForConcept,
  conceptNodesForRow,
  conceptKeysForUnit,
  conceptKeysForNode,
  rowNodeKeysForUnit,
  rowNodeKeysForUnitWithConcepts,
  crlAnchorsForUnits,
  conceptCrlAnchors,
  unitsForRow,
  unitsForRowAll,
  unitNumbersForRow,
  unitNumbersForCase,
  buildCrlStructure,
  buildCrlConceptLayer,
  classifyConcept,
  buildConceptContainment,
  buildConceptShapeIndex,
  codeIsLeavesPreorder,
  buildDefExprIndex,
  collectDefExprLeafKeys,
  buildDefStruct,
  branchConditionToDefStruct,
  buildGuardOutlines,
  buildCriterionIdentities,
  criterionGateIdentities,
  topCriterion,
  criterionKey,
  DEF_EXPR_CAP,
  GUARD_OPERAND_CAP,
  DEF_MAX_EXPR_DEPTH,
  generateProvenanceScaffold,
  mergeScaffold,
  decisionSpine,
  nodeKey,
  conceptDeclRef,
  assembleConceptProjections,
} from "./provenance";
export type {
  CorrespondenceModel,
  CorrespondenceUnit,
  ResolvedItem,
  ResolvedSourceSpan,
  ResolvedCrlNode,
  ResolvedCelNode,
  AttachedFinding,
  FindingTarget,
  Rollup,
  CorrespondenceDiagnostic,
  ByteRange,
  ProvenanceFinding,
  ProvenanceFindingKind,
  Severity as ProvenanceSeverity,
  AnchorSourceMeta,
  CrlStructureNode,
  CrlDecisionStructure,
  CrlNodeKind,
  CrlActionKind,
  CrlConceptNode,
  ConceptDefinitionKind,
  ConceptLayer,
  ConceptClassification,
  ConceptContainment,
  ConceptShapeNode,
  ConceptShapeIndex,
  DefExpr,
  DefRef,
  DefExprEntry,
  DefExprIndex,
  DefStructExpr,
  ResolveDefExprEntry,
  GuardOutline,
  CriterionIdentity,
  SpineNode,
  SpineNodeKind,
  ProvNodeRef,
  CockpitModel,
  CrlRevealMaps,
  GenerateDiagnostic,
  GenerateResult,
  MergeDiagnostic,
  MergeResult,
} from "./provenance";

export { validateCEL, validateCELFile } from "./cel/validator";
export type {
  CELValidationError,
  CELValidationErrorKind,
  CELValidationResult,
  CELValidationOptions,
} from "./cel/validator";
export {
  emitCelToFhir,
  writeEmitResult,
  // ⭐ The ONE path authority for a CEL case on disk. Consumers (the MV questionnaire pane, the
  // $apply producer) MUST call these rather than recomposing a directory from names — see the
  // doc on `celResourceId` for the drift this exists to prevent.
  celResourceId,
  celCaseCompartmentId,
  celCaseCompartmentDir,
} from "./cel/emitter";

// ⭐ EMITTED RESULTS — what an ENGINE produced over the emitted definitions and a case's data
// (`$apply`'s Questionnaire for prior auth, a MeasureReport for a measure). Deliberately NOT part of
// CEL emit: CEL emits the FACTS a case states and owns `tests/data/fhir/patient/`; results have a
// different producer, inputs and lifecycle, and live under `tests/results/<use-case>/`.
export {
  RESULT_USE_CASES,
  isResultUseCase,
  USE_CASE_RESOURCE_TYPES,
  resultsRoot,
  caseResultsDir,
  caseResultsTypeDir,
  compartmentIdOf,
} from "./results/useCases";
export type { ResultUseCase } from "./results/useCases";
export { buildProducerInputs, casesMissingFromEmit } from "./results/caseInput";
export type { ProducerCaseInput, CaseInputDiagnostic } from "./results/caseInput";
export { buildEngineRepoBundle, cqlIndex, parseDriverStdout } from "./results/repoBundle";
export type { RepoBundleInputs, RepoBundleResult } from "./results/repoBundle";
export {
  producerManifestName,
  resolveCaseArtifacts,
  caseState,
} from "./results/manifest";
// ⭐ The JVM spawn contract for result producers — bounded by construction, because an unbounded run
// of this crashed VS Code and the machine.
export {
  APPLY_OPERATION,
  RETRIEVE_SETTINGS,
  DEFAULT_BOUNDS,
  SingleFlight,
  jvmFlags,
  killTreeCommand,
  capTail,
  MIN_JDK_MAJOR,
  parseJavaMajor,
  resolveJava,
  verifyJar,
  assertSafeWorkingDir,
} from "./results/spawn";
export type { JvmBounds, JavaResolution, JarVerification } from "./results/spawn";
export type {
  ProducerManifest,
  ProducerCaseEntry,
  ProducerCaseState,
  ProducerArtifact,
} from "./results/manifest";
export type {
  EmitResult,
  EmittedCase,
  EmittedResource,
  EmitDiagnostic,
  EmitDiagnosticKind,
  EmitOptions,
} from "./cel/emitter";

// v2.3.0 CRL → FHIR Definition emit lane (#73). Types prefixed
// `FhirDef`/`Cpg` to disambiguate from the CEL FHIR-instance emit
// types already exported above (both lanes have `EmitOptions` and
// `EmittedResource` — the CEL ones are FHIR-instance-side, these
// are FHIR-definition-side).
// Round-3 gpt55 disposition: keep the public surface to the emit functions
// + the resolver callback type that callers MUST supply. Internal-only:
// the per-profile lookup table, CodeSystem constant, and CpgActivityProfile
// shape — these are tightly coupled to the CPG IG and may evolve;
// exporting them at the root would make a published-IG change a breaking
// surface change. Internal Todo 4 wiring imports from "./fhir-emitter"
// directly.
export {
  readPackageMetadata,
  normalizePackageMetadata,
  slugify as fhirSlugify,
  pascalCaseName,
  emitValueSet,
  emitValueSetsForLibrary,
  emitLibrary,
  emitLibrariesForClosure,
  emitActivityDefinition,
  emitActivityDefinitionsForLibrary,
  emitRecommendationDefinition,
  emitRecommendationDefinitionsForLibrary,
  emitDecisionPlanDefinition,
  emitDecisionPlanDefinitionsForLibrary,
  emitFhirDefFromPath,
  isFhirDefError,
  isFhirDefWarning,
  writeFhirResources,
  scanFhirIds,
  collectIdViolations,
  FHIR_ID_MAX_LEN,
  CAPABILITY_ORDER,
  type TerminologyResolver,
  type ConceptResolver,
  type ActivityResolver,
  type DecisionResolver,
  type FhirDefFromPathResult,
} from "./fhir-emitter";
export type {
  CpgMetadata,
  CodeableConcept,
  ContactPoint,
  UsageContext,
  EmittedResource as FhirDefEmittedResource,
  EmitOptions as FhirDefEmitOptions,
  FhirDefEmitResult,
  UnmatchedReference,
  MetadataResult,
  Capability,
  CheckReport,
  IdViolation,
  IdViolationReason,
  CheckReadError,
} from "./fhir-emitter";
// Two-lane CRL emit (CQL closure + FHIR defs) and its shared disk writer — the
// SINGLE composition + write path behind both `crl-emit --target fhir-def` and
// the `emit_crl` MCP `out` directory (#237/T2).
export { emitCrlTwoLane } from "./emit-two-lane";
export type { EmitCrlTwoLaneResult, TwoLaneCqlLibrary } from "./emit-two-lane";
export { writeTwoLane, EmitWriteError } from "./emit-writers";
export type { TwoLaneWritten } from "./emit-writers";
export type {
  CEL,
  CELLibraryDeclaration,
  CELCoversDeclaration,
  CELInclude,
  CELStatement,
  CELFact,
  CELFactBody,
  CELCase,
  CELCaseBody,
  CELAnchorField,
  CELAnchorExpr,
  CELFactRefField,
  CELAtClause,
  CELDurationOffset,
  CELResultField,
  CELResultValue,
  CELCrossResourceField,
  CELReferenceName,
  IntentModifier,
  CrossResourceRelation,
} from "./cel/ast/types";
export type { ValidationError, ValidationErrorKind, ValidationResult } from "./validator/validator";

export { parseMetaTag } from "./meta/parseMetaTag";
export type { ParseMetaResult, ParsedMetaTag } from "./meta/parseMetaTag";
// #212 step 4 — the CORE-owned flag VOCABULARY (moved OUT of the `.crl` meta-registry; flags left `.crl`). The single source
// of the flag tags/fields/aliases/categories/enums for the cockpit drawer, the MCP flag tools, and the create seam. Plus the
// pure field validator + the forbidden-char rules + the create-seam target/input types.
export { flagTags, isFlagTag, canonicalFlagTag, flagCategoryOf, flagDisplayNameOf, flagLabelOf, allFlagLabels, flagFieldRulesOf, validateFlagFields, FORBIDDEN_FLAG_CHARS, hasForbiddenFlagChars, FORBIDDEN_GIST_CHARS, hasForbiddenGistChars } from "./flags/flagVocab";
export type { FlagTagInfo, FlagLabel, FieldRule, FlagStatus, CreateFlagTarget, CreateFlagInput, ValidateFlagFieldsResult, FlagFieldsFailure } from "./flags/flagVocab";

// #212 — the `medical-validation/flags/` STORE model (moved from crl-vscode so BOTH the cockpit AND the MCP flag tools share it). The
// single home for review flags: a pure record model + per-flag JSON store + a navigation anchor resolver. See discussions/248.
export { coerceFlag, coerceFlagStatus, isOpen, isValidFlagId } from "./flags/mvFlag";
export type { MvFlag, MvFlagAnchor, MvFlagStatus, MvFlagCategory, MvFlagScope } from "./flags/mvFlag";
export { flagStoreDir, legacyFlagStoreDir, hasLegacyFlagStore, loadFlags, saveFlag, removeFlag } from "./flags/mvFlagStore";
export type { FlagStoreLoad } from "./flags/mvFlagStore";
export { resolveAnchor } from "./flags/mvFlagAnchor";
export type { AnchorContext, AnchorConceptRef, AnchorResolution } from "./flags/mvFlagAnchor";
// #212 step 2 — the single validate-a-draft + build-a-store-record seam (MCP tool + cockpit both route through it).
export { validateAndBuildMvFlagDraft } from "./flags/buildFlagDraft";
export type { BuildFlagResult, BuildFlagFailure } from "./flags/buildFlagDraft";
export { occurrencesOf, occurrenceByNodeId, occurrenceByNodeKey, occurrenceKeyValue, parseOccurrenceKey, resolveOccurrence, isOccurrenceKey, isOccurrenceNode } from "./flags/occurrenceKey";
export type { OccurrenceRef } from "./flags/occurrenceKey";
// #212 — the policy source-layout primitive (shared by the flag store + provenance/MV discovery).
export { findPolicySrc, findPolicySrcFromDir, findPolicySrcNear, collectPolicyCels, isFile } from "./provenance/policyLayout";

export interface Token {
  line: number;
  column: number;
  type: string;
  text: string;
}

export interface ParseResult<T> {
  success: boolean;
  result?: T;
  errors?: CRLError[];
}

/**
 * Tokenizes CRL input into a sequence of tokens
 * @param input The CRL code to tokenize
 * @returns ParseResult containing tokens or errors
 */
export function tokenizeCRL(input: string): ParseResult<Token[]> {
  try {
    const { lexer, errorListener } = createLexer(input);
    const tokens: Token[] = [];
    let token = lexer.nextToken();

    while (token.type !== CRLLexer.EOF) {
      if (token.channel === 0) {
        // Only show tokens on the default channel
        const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown (${token.type})`;
        tokens.push({
          line: token.line,
          column: token.charPositionInLine,
          type: typeName,
          text: token.text ?? "",
        });
      }
      token = lexer.nextToken();
    }

    const errors = errorListener.getErrors();
    if (errors.length > 0) {
      return { success: false, errors };
    }
    return { success: true, result: tokens };
  } catch (error) {
    const errorObj: CRLError = {
      type: "Exception",
      message: error instanceof Error ? error.message : String(error),
    };
    return { success: false, errors: [errorObj] };
  }
}

/**
 * Parses CRL input into a parse tree
 * @param input The CRL code to parse
 * @returns ParseResult containing parse tree or errors
 */
export function parseCRL(input: string): ParseResult<ParseTree> {
  let lexerErrorListener, parserErrorListener;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.crl();
    const parserErrors = parserErrorListener.getErrors();
    if (parserErrors.length > 0) {
      return { success: false, errors: parserErrors };
    }
    const lexerErrors = lexerErrorListener.getErrors();
    if (lexerErrors.length > 0) {
      return { success: false, errors: lexerErrors };
    }
    return { success: true, result: tree };
  } catch (error) {
    // Collect all errors if available, plus the exception
    const errors = [
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * Builds an AST from CRL input
 * @param input The CRL code to build AST from
 * @returns ParseResult containing AST or errors
 */
export function buildCRL(input: string): ParseResult<CRL> {
  let lexerErrorListener, parserErrorListener, builder;
  try {
    const parserSetup = createParser(input);
    lexerErrorListener = parserSetup.lexerErrorListener;
    parserErrorListener = parserSetup.parserErrorListener;
    const tree = parserSetup.parser.crl();

    // ⚠ CHECK THE PARSE BEFORE BUILDING. The builder used to visit the tree FIRST, so a syntax error left
    // it walking a broken tree — it threw, and the catch below appended the raw ANTLR message as a
    // diagnostic. An author who put a `definition is` after a `source representation:` (they are TRAILING by
    // grammar) got BOTH lines:
    //     Syntax error: mismatched input 'definition is' expecting 'source representation'
    //     The specified node does not exist                     ← internal, reads as a TOOL failure
    // The second is noise at best and misdirection at worst: it looks like the toolchain broke rather than
    // like the CRL being wrong, and it is the line an author is most likely to report as a bug.
    // A failed parse has nothing to build; return the syntax errors alone.
    // ⚠ LEXICAL ERRORS FIRST — a bad token is the ROOT CAUSE and the parser error is its CONSEQUENCE.
    // "Invalid activity type" tells an author what to fix; the `mismatched input` cascade it provokes does
    // not. Both are returned so nothing is hidden, ordered cause-before-effect. (Previously these reached
    // the author only via the catch block below, which happened to order them this way — relying on the
    // builder THROWING to produce good diagnostics.)
    const lexerErrors = lexerErrorListener.getErrors();
    const parserErrors = parserErrorListener.getErrors();
    if (lexerErrors.length > 0 || parserErrors.length > 0) {
      return { success: false, errors: [...lexerErrors, ...parserErrors] };
    }

    builder = new CRLAstBuilder();
    const ast = builder.visit(tree) as CRL;
    const builderErrors = builder.getErrors();
    if (builderErrors.length > 0) {
      return { success: false, errors: builderErrors };
    }
    // #224 ii: classify guard refs that name a local `criterion` into distinct
    // `BranchConditionCriterionRef` nodes, so the single source AST every consumer
    // reads is already classified (the expansion tripwire precondition). Pure +
    // byte-identical when the file declares no criteria.
    return { success: true, result: classifyCriterionRefs(ast) };
  } catch (error) {
    // Collect all errors if available, plus the exception
    const errors = [
      ...(lexerErrorListener?.getErrors() ?? []),
      ...(parserErrorListener?.getErrors() ?? []),
      ...(builder?.getErrors() ?? []),
      {
        type: "Exception" as const,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
    return {
      success: false,
      errors,
    };
  }
}

/**
 * ValidateCRL options.
 *
 * `soft`: relaxes reference-target-exists checks (unresolved concepts /
 * terminologies become warnings instead of errors). Useful while authoring
 * an incomplete document. Name uniqueness and cycle detection always stay
 * errors regardless of this flag.
 */
export interface ValidateOptions {
  soft?: boolean;
}

/**
 * The result envelope for `validateCRL`. Extends `ParseResult<CRL>` with a
 * `warnings` field so callers can surface both. When `success` is true the
 * file is semantically clean in the requested mode (in soft mode some
 * findings may have been demoted to warnings — they're still in the
 * envelope).
 */
export interface ValidationResultEnvelope extends ParseResult<CRL> {
  warnings?: CRLError[];
}

/**
 * Validate a CRL document end-to-end: lex, parse, build AST, then run the
 * semantic validator (name uniqueness, reference resolution, cycle
 * detection, action uniqueness). Returns a ParseResult-shaped envelope
 * with `errors` (and `warnings` in soft mode) suitable for surfacing to
 * editor diagnostics, the MCP layer, or a CLI.
 */
export function validateCRL(
  input: string,
  options: ValidateOptions = {},
): ValidationResultEnvelope {
  const built = buildCRL(input);
  if (!built.success || !built.result) {
    // Lex/parse/build errors short-circuit semantic validation.
    return { success: false, errors: built.errors };
  }
  try {
    const validator = new Validator();
    const result = validator.validate(built.result, { soft: options.soft });
    const errors = result.errors.map(toCrlError);
    const warnings = result.warnings.map(toCrlError);
    if (errors.length > 0) {
      return { success: false, result: built.result, errors, warnings };
    }
    return { success: true, result: built.result, warnings };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          type: "Exception",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function toCrlError(v: ValidationError): CRLError {
  return {
    type: "Validation",
    kind: v.kind,
    message: v.message,
    line: v.location?.start.line,
    column: v.location?.start.column,
  };
}
