import type { PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import { classifyPublicationMembership } from "./publicationDomain";
import { publicationDerivedCandidateKey } from "./publicationProducer";

type Candidate = PublicationCandidate<Record<string, unknown>>;
export function produceAnyMembershipCandidate(d: PublicationDescriptor, operands: readonly (Candidate | undefined)[], subject: string) {
  const p = d.producer;
  if (p?.kind !== "anyMembership" || operands.length !== p.operands.length)
    return { kind: "error" as const, code: "publication-no-producer", message: "Aggregate membership requires all prepared operands." };
  // Evaluate every classification before reducing; a positive cannot conceal an error.
  const values = operands.map((c, i) => c === undefined ? { kind: "unknown" as const } :
    classifyPublicationMembership({ domain: p.domains[i], qualifying: p.qualifying }, c.resource));
  const error = values.find(v => v.kind === "error");
  if (error?.kind === "error") return error;
  if (!subject.trim()) return { kind: "error" as const, code: "publication-missing-subject", message: "A produced Observation requires an evaluation subject." };
  // REFACTOR:grounded — errors above survive; only the explicit available-value operation ignores absence.
  const value = values.some(v => v.kind === "known" && v.value) ? true : p.availableValuesOnly || values.every(v => v.kind === "known") ? false : undefined;
  const anchor = operands[p.validityOperand];
  const refs = [...new Set(operands.flatMap(c => typeof c?.resource.id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(c.resource.id) ? [`Observation/${c.resource.id}`] : []))];
  const candidate: Candidate = {
    key: publicationDerivedCandidateKey(p.producerId, operands.map(c => c === undefined ? "M" : `S${c.key.length}:${c.key}`).join("")),
    contributorId: p.producerId, arm: "inferred",
    ...(anchor?.validity === undefined ? {} : { validity: anchor.validity }),
    resource: {
      resourceType: "Observation", status: "final", subject: { reference: subject },
      ...(d.profileUrl === undefined ? {} : { meta: { profile: [d.profileUrl] } }),
      code: { ...(d.localCode ? { coding: [d.localCode] } : {}), text: d.title },
      ...(value === undefined ? {} : { valueBoolean: value }),
      ...(anchor?.resource.effectiveDateTime === undefined ? {} : { effectiveDateTime: anchor.resource.effectiveDateTime }),
      ...(anchor?.resource._effectiveDateTime === undefined ? {} : { _effectiveDateTime: anchor.resource._effectiveDateTime }),
      ...(refs.length ? { derivedFrom: refs.map(reference => ({ reference })) } : {}),
    },
  };
  return { kind: "candidate" as const, candidate };
}
