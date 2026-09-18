import type { PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import { publicationDerivedCandidateKey } from "./publicationProducer";

// REFACTOR:grounded (#322): this predicate describes the selected answer, never clinical nonexistence.
// Callers must propagate selection/type/domain errors before invoking it. No clinical clock is invented.
export function produceHasValueCandidate(
  descriptor: PublicationDescriptor,
  operand: PublicationCandidate<Record<string, unknown>> | undefined,
  subjectReference: string,
) {
  const producer = descriptor.producer;
  if (producer?.kind !== "hasValue")
    return {
      kind: "error" as const,
      code: "publication-no-producer",
      message: "This publication has no has-value producer.",
    };
  if (!subjectReference.trim())
    return {
      kind: "error" as const,
      code: "publication-missing-subject",
      message: "A produced Observation requires an evaluation subject reference.",
    };
  const choice =
    producer.operandValueType === "boolean"
      ? "valueBoolean"
      : producer.operandValueType === "string"
        ? "valueString"
        : producer.operandValueType === "dateTime" ? "valueDateTime" : "valueCodeableConcept";
  const id = operand?.resource.id;
  const resource: Record<string, unknown> = {
    resourceType: "Observation",
    status: "final",
    subject: { reference: subjectReference },
    ...(descriptor.profileUrl === undefined ? {} : { meta: { profile: [descriptor.profileUrl] } }),
    code:
      descriptor.localCode === undefined
        ? { text: descriptor.title }
        : { coding: [descriptor.localCode], text: descriptor.title },
    valueBoolean: operand?.resource[choice] != null,
    ...(operand?.resource.effectiveDateTime === undefined
      ? {}
      : { effectiveDateTime: operand.resource.effectiveDateTime }),
    ...(operand?.resource._effectiveDateTime === undefined
      ? {}
      : { _effectiveDateTime: operand.resource._effectiveDateTime }),
    ...(typeof id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(id)
      ? { derivedFrom: [{ reference: `Observation/${id}` }] }
      : {}),
  };
  const candidate: PublicationCandidate<Record<string, unknown>> = {
    key:
      operand === undefined
        ? `${producer.producerId}:missing`
        : publicationDerivedCandidateKey(producer.producerId, operand.key),
    contributorId: producer.producerId,
    arm: "inferred",
    resource,
    ...(operand?.validity === undefined ? {} : { validity: operand.validity }),
  };
  return { kind: "candidate" as const, candidate };
}
