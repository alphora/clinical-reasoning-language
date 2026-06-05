export {
  readPackageMetadata,
  normalizePackageMetadata,
  type MetadataResult,
} from "./metadata";

export { slugify, pascalCaseName } from "./slug";

export { emitValueSet, emitValueSetsForLibrary } from "./valueSet";

export { emitLibrary, emitLibrariesForClosure } from "./library";

export {
  activityDefinitionCanonicalUrl,
  emitActivityDefinition,
  emitActivityDefinitionsForLibrary,
  type TerminologyResolver,
} from "./activity";

export {
  ALL_CPG_ACTIVITY_PROFILES,
  CPG_ACTIVITY_TYPE_CODE_SYSTEM,
  lookupCpgActivityProfile,
  type CpgActivityProfile,
} from "./cpgActivityProfiles";

export { writeFhirResources } from "./writer";

export type {
  CpgMetadata,
  CodeableConcept,
  ContactPoint,
  UsageContext,
  EmittedResource,
  EmitOptions,
  FhirDefEmitResult,
  UnmatchedReference,
} from "./types";
