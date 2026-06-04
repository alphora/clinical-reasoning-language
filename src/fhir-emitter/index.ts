export {
  readPackageMetadata,
  normalizePackageMetadata,
  type MetadataResult,
} from "./metadata";

export { slugify, pascalCaseName } from "./slug";

export { emitValueSet, emitValueSetsForLibrary } from "./valueSet";

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
