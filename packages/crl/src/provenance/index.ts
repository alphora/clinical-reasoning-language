export {
  canonicalizeDocx,
  buildAnchorArtifact,
  sliceUtf8Bytes,
  byteOffsetToDisplayRange,
  byteRangeToDisplayRange,
  CANONICALIZER_NAME,
  CANONICALIZER_VERSION,
} from "./canonicalize";
export type {
  AnchorMetaCore,
  AnchorMeta,
  CanonicalizeResult,
  AnchorArtifactResult,
  CanonicalizeWarning,
  CanonicalizeError,
} from "./canonicalize";
export { buildProvenanceIndex, nodeKey, conceptDeclRef } from "./indexer";
export type {
  ProvenanceIndex,
  IndexedCrlNode,
  ProvNodeRef,
  DeclKind,
  StructuralRelation,
  ReachInfo,
  ReachEdge,
  ProvenanceIndexDiagnostic,
} from "./indexer";
export { buildCrlStructure } from "./crlStructure";
export type {
  CrlStructureNode,
  CrlDecisionStructure,
  CrlNodeKind,
  CrlActionKind,
} from "./crlStructure";
export { buildCrlConceptLayer, classifyConcept } from "./crlConceptLayer";
export type {
  CrlConceptNode,
  ConceptDefinitionKind,
  ConceptLayer,
  ConceptClassification,
} from "./crlConceptLayer";
export { buildConceptContainment } from "./conceptContainment";
export type { ConceptContainment } from "./conceptContainment";
export { buildConceptShapeIndex, codeIsLeavesPreorder } from "./conceptShape";
export type { ConceptShapeNode, ConceptShapeIndex } from "./conceptShape";
export { buildDefExprIndex, collectDefExprLeafKeys, buildDefStruct, DEF_EXPR_CAP, DEF_MAX_EXPR_DEPTH } from "./definedAsExpr";
export type { DefExpr, DefRef, DefExprEntry, DefExprIndex, DefStructExpr, ResolveDefExprEntry } from "./definedAsExpr";
export { buildCockpitModel, buildCockpitModelFromResolved } from "./cockpitModel";
export type { CockpitModel } from "./cockpitModel";
export { checkCockpitCorrespondence } from "./correspondenceCheck";
export type {
  CorrespondenceCheckResult,
  CorrespondenceUncheckedReason,
} from "./correspondenceCheck";
export {
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
} from "./revealMaps";
export type { CrlRevealMaps } from "./revealMaps";
export { decisionSpine } from "../ast/decisionSpine";
export type { SpineNode, SpineNodeKind } from "../ast/decisionSpine";
export { deriveCoverage, decisionImplemented, isOverReach } from "./coverage";
export type { CoverageReport } from "./coverage";
export { validateProvenance, ATTRIBUTION_KINDS, WAIVER_KINDS } from "./validators";
export type {
  ProvenanceFinding,
  ProvenanceFindingKind,
  ProvenanceValidationMode,
  Severity,
  ValidateOpts,
} from "./validators";
export { validateProvenanceFiles } from "./validateFiles";
export type { ValidateProvenanceFilesResult } from "./validateFiles";
export { generateProvenanceFiles } from "./generateFiles";
export type { GenerateProvenanceFilesResult } from "./generateFiles";
export { generateProvenanceScaffold, mergeScaffold } from "./generate";
export type { GenerateDiagnostic, GenerateResult, MergeDiagnostic, MergeResult } from "./generate";
export { allUnsatisfiedCriteria, failedCriterionFrontier } from "./failedCriteria";
export type {
  FailedCriterionNode,
  FailedCriterionDisplay,
  FcScenario,
  FcViewNode,
} from "./failedCriteria";
// #173 T1: the generalized run-path decomposer the cockpit (T3) re-roots a runtime nodeId through.
export { runtimeNodePathRefs, producedRuntimePathRefs } from "./runPath";
export type { RuntimePathRef, ProducedRunPath, MinimalViewNode } from "./runPath";
// resolveProvenance / ResolveProvenanceResult are intentionally NOT re-exported — they are an internal shared step
// (consumed by correspondence.ts via a relative import); keeping the large intermediate shape out of the package API.
export { buildCorrespondenceModel } from "./correspondence";
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
} from "./correspondence";
export { PROVENANCE_SCHEMA_VERSION } from "./artifact";
export type {
  ProvenanceArtifact,
  Item,
  Origin,
  SourceRef,
  Role,
  RoleStatus,
  LinkRequirement,
  AdministrativeSubtype,
  DispositionClass,
  DrivesDeterminationEdge,
  ExpectedDisposition,
  KnownExpectedDisposition,
  AuthoredKind,
  SupportsRef,
  RefStatus,
  CrlRelation,
  CelRelation,
  NodeKind,
  Ownership,
  MatchRank,
  RelinkHint,
  CrlNodeRef,
  CelNodeRef,
  Cluster,
  IgnoredRange,
  AnchorSourceMeta,
} from "./artifact";
