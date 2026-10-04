import type { Representation, ReferenceName, NarrativeClause, Location } from "../ast/types";
import type { PublicationCode, PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import { publicationDerivedCandidateKey } from "./publicationProducer";
import { isValidFhirTemporal } from "../cel/temporal";
import type { PublicationValueError } from "./publicationDomain";

export const ADMINISTRATIVE_GENDERS = ["female", "male", "other", "unknown"] as const;
export interface PublicationGenderSource {
  readonly kind: "patientGender";
  readonly contributorId: string;
  readonly mappings: readonly { readonly gender: string; readonly answer: PublicationCode }[];
}

// The author supplies the mapping; field values do not imply clinical predicates.
export function readGenderProjection(rep: Readonly<Representation>): ReturnType<typeof readGenderMappings> {
  if (rep.conceptType !== "Patient" || rep.terminologyName !== undefined || rep.valueElement !== undefined || rep.valueTypes.length) return undefined;
  return rep.valueProjection ? readGenderMappings(rep.valueProjection.body) : undefined;
}
export function readGenderMappings(body: NarrativeClause): readonly { gender: string; terminology: ReferenceName; location: Location }[] | undefined {
  const e = body.elements;
  if (!e || e.length < 5 || (e.length - 2) % 3 !== 0 ||
      e[0].type !== "NWord" || e[0].value.toLowerCase() !== "administrative" ||
      e[1].type !== "NWord" || e[1].value.toLowerCase() !== "gender") return undefined;
  const mappings: { gender: string; terminology: ReferenceName; location: Location }[] = [];
  for (let i = 2; i < e.length; i += 3) {
    const gender = e[i], as = e[i + 1], term = e[i + 2];
    if (gender.type !== "NWord" || !ADMINISTRATIVE_GENDERS.some(g => g === gender.value.toLowerCase()) ||
        as.type !== "NWord" || as.value.toLowerCase() !== "as" || term.type !== "NConceptRef" ||
        mappings.some(m => m.gender === gender.value.toLowerCase())) return undefined;
    mappings.push({ gender: gender.value.toLowerCase(), terminology: term.value, location: term.location });
  }
  return mappings;
}

export function produceGenderCandidate(d: PublicationDescriptor, source: PublicationGenderSource,
  patient: Record<string, unknown>, subject: string):
  { kind: "candidate"; candidate: PublicationCandidate<Record<string, unknown>> } | { kind: "missing" } | PublicationValueError {
  const fail = (code: string, message: string): PublicationValueError => ({ kind: "error", code, message });
  if (patient.resourceType !== "Patient" || `Patient/${patient.id}` !== subject)
    return fail("publication-source-subject-unsupported", "Gender must use the evaluation Patient.");
  if (typeof patient.id !== "string" || !/^[A-Za-z0-9.-]{1,64}$/.test(patient.id))
    return fail("publication-missing-input-identity", "Gender source requires a valid Patient id.");
  if (patient.modifierExtension !== undefined && (!Array.isArray(patient.modifierExtension) || patient.modifierExtension.length))
    return fail("publication-source-state-unsupported", "Qualified Patient data requires a supported interpretation.");
  if (patient.gender === undefined) return { kind: "missing" };
  if (!ADMINISTRATIVE_GENDERS.some(g => g === patient.gender))
    return fail("publication-gender-invalid", "Patient gender must be a valid FHIR administrative gender.");
  const mapping = source.mappings.find(m => m.gender === patient.gender);
  if (!mapping) return { kind: "missing" };
  const validity = (patient.meta as { lastUpdated?: unknown } | undefined)?.lastUpdated;
  if (validity !== undefined && (typeof validity !== "string" || (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(validity) || !isValidFhirTemporal(validity))))
    return fail("publication-invalid-validity", "Patient lastUpdated must be a valid FHIR instant.");
  const input = `Patient/${patient.id}`;
  return { kind: "candidate", candidate: {
    key: publicationDerivedCandidateKey(source.contributorId, input), contributorId: source.contributorId,
    arm: "source", retrievedInputIdentity: input, validity: validity as string | undefined,
    resource: { resourceType: "Observation", status: "final", subject: { reference: subject },
      ...(d.profileUrl ? { meta: { profile: [d.profileUrl] } } : {}),
      code: { ...(d.localCode ? { coding: [d.localCode] } : {}), text: d.title },
      valueCodeableConcept: { coding: [{ ...mapping.answer }] },
      ...(validity === undefined ? {} : { effectiveDateTime: validity }) },
  } };
}
