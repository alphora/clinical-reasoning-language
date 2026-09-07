import type { PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import { classifyPublicationMembership, type PublicationValueError } from "./publicationDomain";

// REFACTOR:grounded (#320, review 562): unary production adds an inferred candidate. It never
// reselects input, inherits its id, assigns Now(), or treats a missing value as false.
export function publicationDerivedCandidateKey(producerId: string, operandKey: string): string {
  return `${producerId.length}:${producerId}${operandKey.length}:${operandKey}`;
}

export interface PublicationComputationalLineage {
  readonly producerId: string;
  readonly operandKey: string;
}

export function produceMembershipCandidate(
  descriptor: PublicationDescriptor,
  operand: PublicationCandidate<Record<string, unknown>> | undefined,
  subjectReference: string,
):
  | { readonly kind: "none" }
  | {
      readonly kind: "candidate";
      readonly candidate: PublicationCandidate<Record<string, unknown>>;
      readonly computationalLineage: PublicationComputationalLineage;
    }
  | PublicationValueError {
  const producer = descriptor.producer;
  if (producer === undefined)
    return {
      kind: "error",
      code: "publication-no-producer",
      message: "This publication has no membership producer.",
    };
  if (operand === undefined) return { kind: "none" };
  const value = classifyPublicationMembership(producer, operand.resource);
  if (value.kind === "error") return value;
  if (subjectReference.trim() === "")
    return {
      kind: "error",
      code: "publication-missing-subject",
      message: "A produced Observation requires an evaluation subject reference.",
    };
  const id = operand.resource.id;
  const directReference =
    typeof id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(id) ? `Observation/${id}` : undefined;
  const resource: Record<string, unknown> = {
    resourceType: "Observation",
    status: "final",
    subject: { reference: subjectReference },
    ...(descriptor.profileUrl === undefined ? {} : { meta: { profile: [descriptor.profileUrl] } }),
    code:
      descriptor.localCode === undefined
        ? { text: descriptor.title }
        : {
            coding: [{ system: descriptor.localCode.system, code: descriptor.localCode.code }],
            text: descriptor.title,
          },
    ...(value.kind === "known" ? { valueBoolean: value.value } : {}),
    ...(operand.resource.effectiveDateTime === undefined
      ? {}
      : { effectiveDateTime: operand.resource.effectiveDateTime }),
    ...(operand.resource._effectiveDateTime === undefined
      ? {}
      : { _effectiveDateTime: operand.resource._effectiveDateTime }),
    ...(directReference === undefined ? {} : { derivedFrom: [{ reference: directReference }] }),
  };
  return {
    kind: "candidate",
    candidate: {
      key: publicationDerivedCandidateKey(producer.producerId, operand.key),
      contributorId: producer.producerId,
      arm: "inferred",
      resource,
      ...(operand.validity === undefined ? {} : { validity: operand.validity }),
    },
    computationalLineage: Object.freeze({
      producerId: producer.producerId,
      operandKey: operand.key,
    }),
  };
}
