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
export { buildProvenanceIndex, nodeKey } from "./indexer";
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
export type { CrlStructureNode, CrlDecisionStructure, CrlNodeKind, CrlActionKind } from "./crlStructure";
export { buildCrlConceptLayer } from "./crlConceptLayer";
export type { CrlConceptNode, ConceptDefinitionKind } from "./crlConceptLayer";
export { buildCockpitModel } from "./cockpitModel";
export type { CockpitModel } from "./cockpitModel";
export { decisionSpine } from "../ast/decisionSpine";
export type { SpineNode, SpineNodeKind } from "../ast/decisionSpine";
export { deriveCoverage, decisionImplemented, isOverReach } from "./coverage";
export type { CoverageReport } from "./coverage";
export { validateProvenance } from "./validators";
export type {
  ProvenanceFinding,
  ProvenanceFindingKind,
  Severity,
  ValidateOpts,
} from "./validators";
export { validateProvenanceFiles } from "./validateFiles";
export type { ValidateProvenanceFilesResult } from "./validateFiles";
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
