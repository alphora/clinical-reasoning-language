import type { Concept, ReferenceName } from "../ast/types";
import type { PublicationCode, PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import { publicationDerivedCandidateKey } from "./publicationProducer";
import type { PublicationValueError } from "./publicationDomain";
import { readAgeProjection, type PublicationAgeSource } from "./publicationAge";
export type PublicationSource = PublicationServiceRequestSource | PublicationAgeSource;

// REFACTOR:grounded (#320, review 564): one source record supplies one positive witness.
// This is not a closed-world exists reduction or a hidden status/intent exclusion filter.
export interface PublicationServiceRequestSource {
  readonly kind: "serviceRequestWitness";
  readonly contributorId: string;
  readonly terminology: ReferenceName;
  readonly codes: readonly PublicationCode[];
}

export function publicationSourceAdmissionReason(concept: Readonly<Concept>): string | undefined {
  if (concept.representations.length === 0) return undefined;
  if (!concept.code || concept.valueTypes[0] !== "boolean")
    return "Source publication currently requires a local code and an Observation<boolean> result.";
  if (concept.representations.some(rep => readAgeProjection(rep) !== undefined))
    return concept.representations.length === 1 && concept.definition === undefined ? undefined
      : "Age publication currently supports one age projection plus local answers; mixed producer policies require an explicit implementation.";
  for (const rep of concept.representations) {
    const words = rep.valueProjection?.body.elements;
    if (rep.conceptType !== "ServiceRequest" || rep.terminologyName === undefined ||
      rep.valueElement !== undefined || rep.valueTypes.length !== 0 || words?.length !== 2 ||
      words[0].type !== "NWord" || words[0].value.toLowerCase() !== "exists" ||
      words[1].type !== "NWord" || words[1].value.toLowerCase() !== "this")
      return "Source publication currently supports ServiceRequest coded-from with per-record `value projection is exists this`; other source operations are not implemented.";
  }
  return undefined;
}

/** Post-retrieve identity check only: accepting a spelling here does not make a repository retrieve it. */
export function publicationPatientId(reference: unknown): string | undefined {
  if (typeof reference !== "string") return undefined;
  return /^(?:https?:\/\/[^?#]+\/)?Patient\/([A-Za-z0-9.-]{1,64})(?:\/_history\/[A-Za-z0-9.-]{1,64})?$/.exec(reference)?.[1];
}

/** REFACTOR:grounded (#320, review 565): CRE consumes CEL's relative Patient-compartment data.
 * This models the pinned in-memory retrieve, which does not resolve absolute/versioned references.
 * It is distinct from the adapter's check on a row an external repository has already supplied.
 */
export function matchesCelPublicationPatient(resource: Record<string, unknown>, subjectReference: string): boolean {
  return publicationPatientId(subjectReference) !== undefined &&
    (resource.subject as { reference?: unknown } | undefined)?.reference === subjectReference;
}

export function matchesPublicationSource(source: PublicationSource, resource: Record<string, unknown>): boolean {
  if (source.kind === "ageToday") return resource.resourceType === "Patient";
  if (resource.resourceType !== "ServiceRequest") return false;
  const coding = (resource.code as { coding?: unknown } | undefined)?.coding;
  return Array.isArray(coding) && coding.some((item) => item !== null && typeof item === "object" &&
    source.codes.some((code) => code.system === item.system && code.code === item.code));
}

export function adaptServiceRequestPublicationCandidate(
  descriptor: PublicationDescriptor,
  source: PublicationServiceRequestSource,
  resource: Record<string, unknown>,
  subjectReference: string,
): { readonly kind: "candidate"; readonly candidate: PublicationCandidate<Record<string, unknown>> } | PublicationValueError {
  const fail = (code: string, message: string): PublicationValueError => ({ kind: "error", code, message });
  if (!matchesPublicationSource(source, resource)) return fail("publication-source-mismatch", "The record does not match this ServiceRequest contributor.");
  if (descriptor.localCode === undefined || descriptor.profileUrl === undefined)
    return fail("publication-source-profile-required", "A source-produced Case Feature requires its local code and profile.");
  if (resource.status !== "active" || resource.intent !== "order" ||
    (resource.doNotPerform !== undefined && resource.doNotPerform !== false) ||
    (resource._doNotPerform !== undefined && resource.doNotPerform === undefined) ||
    (resource.modifierExtension !== undefined && (!Array.isArray(resource.modifierExtension) || resource.modifierExtension.length > 0)))
    return fail("publication-source-state-unsupported", "This source projection currently supports active order requests without prohibition or modifier extensions; other states require an authored eligibility policy.");
  const patient = publicationPatientId(subjectReference);
  if (patient === undefined || patient !== publicationPatientId((resource.subject as { reference?: unknown } | undefined)?.reference))
    return fail("publication-source-subject-unsupported", "The source must resolve to the current evaluation Patient.");
  if (typeof resource.id !== "string" || !/^[A-Za-z0-9.-]{1,64}$/.test(resource.id))
    return fail("publication-missing-input-identity", "A retrieved ServiceRequest requires a valid FHIR id in this dataset.");
  if (resource.authoredOn !== undefined && typeof resource.authoredOn !== "string")
    return fail("publication-invalid-validity", "ServiceRequest authoredOn must be a FHIR dateTime or absent.");
  const input = `ServiceRequest/${resource.id}`;
  const output: Record<string, unknown> = {
    resourceType: "Observation", status: "final", subject: { reference: subjectReference },
    meta: { profile: [descriptor.profileUrl] },
    code: { coding: [descriptor.localCode], text: descriptor.title }, valueBoolean: true,
    ...(resource.authoredOn === undefined ? {} : { effectiveDateTime: resource.authoredOn }),
    ...(resource._authoredOn === undefined ? {} : { _effectiveDateTime: resource._authoredOn }),
  };
  // No basedOn/derivedFrom: this analytics result does not fulfil the requested procedure.
  return { kind: "candidate", candidate: {
    key: publicationDerivedCandidateKey(source.contributorId, input), contributorId: source.contributorId,
    arm: "source", retrievedInputIdentity: input, resource: output,
    ...(resource.authoredOn === undefined ? {} : { validity: resource.authoredOn as string }),
  } };
}
