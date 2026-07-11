import { ParseTree } from "antlr4ts/tree/ParseTree";

import { CRLAstBuilder } from "./ast/builder";
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
export type { CaseRun, CelRunResult, ProducedRec, TraceNode, CompositionTrace } from "./cre";
export { renderScenario, SCENARIO_VIEW_MODEL_SCHEMA_VERSION } from "./cre";
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
  DEF_EXPR_CAP,
  DEF_MAX_EXPR_DEPTH,
  generateProvenanceScaffold,
  mergeScaffold,
  decisionSpine,
  nodeKey,
  conceptDeclRef,
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
export { emitCelToFhir, writeEmitResult } from "./cel/emitter";
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
} from "./fhir-emitter";
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

// #154/#203 — flag detection API (the MV cockpit consumes this for the mvComplete gate + the flag list).
export { collectFlags, openFlags } from "./meta/collectFlags";
export type { FlagInstance } from "./meta/collectFlags";
export { parseMetaTag } from "./meta/parseMetaTag";
export type { ParseMetaResult, ParsedMetaTag } from "./meta/parseMetaTag";

// #205 crl-refactors — the write-half of the CRL-source API. Instance #1: the flag-status flip (meta-quickfix family).
export { rewriteMetaStatus, rewriteStatusInBody } from "./refactors/rewriteMetaStatus";
export type { FlagStatus } from "./refactors/rewriteMetaStatus";

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
    builder = new CRLAstBuilder();
    const ast = builder.visit(tree) as CRL;
    const parserErrors = parserErrorListener.getErrors();
    if (parserErrors.length > 0) {
      return { success: false, errors: parserErrors };
    }
    const lexerErrors = lexerErrorListener.getErrors();
    if (lexerErrors.length > 0) {
      return { success: false, errors: lexerErrors };
    }
    const builderErrors = builder.getErrors();
    if (builderErrors.length > 0) {
      return { success: false, errors: builderErrors };
    }
    return { success: true, result: ast };
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
