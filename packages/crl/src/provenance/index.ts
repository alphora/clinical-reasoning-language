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
export { deriveCoverage, decisionImplemented, isOverReach } from "./coverage";
export type { CoverageReport } from "./coverage";
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
