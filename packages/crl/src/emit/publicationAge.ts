// REFACTOR:grounded (#320, plan583): age owns daily recalculation and assertion eligibility.
// This policy is selected by the authored age-today pattern, never by the generic selector.
import type { Representation } from "../ast/types";
import { matchNarrative } from "../template-match/matcher";
import { sanctionedAgeTodayOp } from "../template-match/agePredicate";
import { isValidFhirTemporal } from "../cel/temporal";
import type { PublicationDescriptor } from "./publicationProgram";
import { publicationDerivedCandidateKey } from "./publicationProducer";
import { selectPublicationCandidate, type PublicationCandidate } from "./publicationSelection";
import type { PublicationValueError } from "./publicationDomain";

export const AGE_METHOD_SYSTEM = "urn:crl:determination-method:v1";
export const ageMethod = (code: "asserted" | "calculated") => ({ coding: [{ system: AGE_METHOD_SYSTEM, code }] });
export interface PublicationAgeSource {
  readonly kind: "ageToday";
  readonly contributorId: string;
  readonly op: "AtLeast" | "AtMost" | "Below";
  readonly unit: "years" | "months";
  readonly threshold: number;
}
export function readAgeProjection(rep: Readonly<Representation>): Omit<PublicationAgeSource, "contributorId"> | undefined {
  if (rep.conceptType !== "Patient" || rep.terminologyName !== undefined || rep.valueElement !== undefined || rep.valueTypes.length || !rep.valueProjection) return undefined;
  const call = matchNarrative(rep.valueProjection.body), age = sanctionedAgeTodayOp(call);
  const quantity = call.args[1];
  if (!age || quantity?.type !== "QuantityArg" || !Number.isFinite(Number(quantity.value)) || Number(quantity.value) < 0) return undefined;
  return { kind: "ageToday", op: age.op, unit: age.computeFn === "AgeAt" ? "years" : "months", threshold: Number(quantity.value) };
}
export const hasAgeSource = (d: PublicationDescriptor): boolean => d.sources?.some(s => s.kind === "ageToday") === true;
export interface AgeClock { readonly day: string; readonly offsetHours: number }
export function ageClock(now: Date): AgeClock {
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return { day, offsetHours: -now.getTimezoneOffset() / 60 };
}
type Candidate = PublicationCandidate<Record<string, unknown>>;
const fail = (code: string, message: string): PublicationValueError => ({ kind: "error", code, message });

export function produceAgeCandidate(d: PublicationDescriptor, source: PublicationAgeSource, patient: Record<string, unknown>, subject: string, clock: AgeClock):
  { kind: "candidate"; candidate: Candidate } | { kind: "missing" } | PublicationValueError {
  if (patient.resourceType !== "Patient" || `Patient/${patient.id}` !== subject) return fail("publication-source-subject-unsupported", "Age must use the evaluation Patient.");
  if (typeof patient.id !== "string" || !/^[A-Za-z0-9.-]{1,64}$/.test(patient.id)) return fail("publication-missing-input-identity", "Age source requires a valid Patient id.");
  if (patient.modifierExtension !== undefined && (!Array.isArray(patient.modifierExtension) || patient.modifierExtension.length)) return fail("publication-source-state-unsupported", "Qualified Patient data requires a supported interpretation.");
  const birth = patient.birthDate;
  if (birth === undefined) return { kind: "missing" };
  if (typeof birth !== "string" || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(birth) || !isValidFhirTemporal(birth)) return fail("publication-age-invalid-birthdate", "Patient birthDate must be a valid FHIR date.");
  if ((birth + "-01-01").slice(0, 10) > clock.day) return fail("publication-age-future-birthdate", "Patient birthDate is after the evaluation date.");
  if (birth.length !== 10) return { kind: "missing" };
  const [by, bm, bd] = birth.split("-").map(Number), [ty, tm, td] = clock.day.split("-").map(Number);
  const months = (ty - by) * 12 + tm - bm - (td < bd ? 1 : 0), age = source.unit === "months" ? months : Math.floor(months / 12);
  const value = source.op === "AtLeast" ? age >= source.threshold : source.op === "AtMost" ? age <= source.threshold : age < source.threshold;
  if (d.localCode && !d.profileUrl) return fail("publication-source-profile-required", "Coded age publication requires its profile.");
  const input = `Patient/${patient.id}`;
  return { kind: "candidate", candidate: { key: publicationDerivedCandidateKey(source.contributorId, input), contributorId: source.contributorId,
    arm: "source", retrievedInputIdentity: input, validity: clock.day,
    resource: { resourceType: "Observation", status: "final", subject: { reference: subject }, ...(d.profileUrl ? { meta: { profile: [d.profileUrl] } } : {}),
      code: { ...(d.localCode ? { coding: [d.localCode] } : {}), text: d.title }, valueBoolean: value, effectiveDateTime: clock.day, method: ageMethod("calculated") } } };
}

function candidateDay(raw: string | undefined, clock: AgeClock): string | undefined {
  if (!raw || raw.length < 10) return undefined;
  if (raw.length === 10) return raw;
  return new Date(Date.parse(raw) + clock.offsetHours * 3_600_000).toISOString().slice(0, 10);
}
// A partial calendar date can be definitely old/future without identifying a day.
function candidateDayRelation(raw: string | undefined, clock: AgeClock): "past" | "same" | "future" | "unknown" {
  if (!raw) return "unknown";
  if (raw.length < 10) {
    const current = clock.day.slice(0, raw.length);
    return raw < current ? "past" : raw > current ? "future" : "unknown";
  }
  const day = candidateDay(raw, clock)!;
  return day < clock.day ? "past" : day > clock.day ? "future" : "same";
}
export function eligibleAgeCandidates(d: PublicationDescriptor, candidates: readonly Candidate[], clock: AgeClock):
  { kind: "eligible"; candidates: readonly Candidate[] } | PublicationValueError {
  const keys = new Set<string>(), inputs = new Set<string>();
  const asserted: Candidate[] = [], cached: Candidate[] = [], live: Candidate[] = [];
  for (const c of candidates) {
    const validated = selectPublicationCandidate([c], { conceptId: d.conceptId, equalTime: d.selector.equalTime });
    if (validated.state === "failed") return fail(validated.diagnostic.code, validated.diagnostic.message);
    if (c.resource.modifierExtension !== undefined && (!Array.isArray(c.resource.modifierExtension) || c.resource.modifierExtension.length))
      return fail("publication-source-state-unsupported", "Qualified age input requires a supported interpretation.");
    const identity = JSON.stringify([c.contributorId, c.retrievedInputIdentity]);
    if (keys.has(c.key) || (c.retrievedInputIdentity !== undefined && inputs.has(identity))) return fail("publication-duplicate-input", "Repeated age input identity.");
    keys.add(c.key); inputs.add(identity);
    const coding = (c.resource.method as { coding?: unknown } | undefined)?.coding;
    const markers = Array.isArray(coding) ? coding.filter(x => x?.system === AGE_METHOD_SYSTEM) : [];
    if (markers.length !== 1 || !["asserted", "calculated"].includes(markers[0].code)) return fail("publication-age-method-required", "Age inputs require exactly one asserted or calculated determination method; migrate unmarked records from known provenance.");
    const relation = candidateDayRelation(c.validity, clock);
    if (relation === "future") return fail("publication-age-future-input", "Age input is dated after the evaluation day.");
    if (markers[0].code === "asserted") asserted.push(c);
    else if (c.arm === "source") live.push(c);
    else if (relation === "unknown") return fail("publication-age-day-unknown", "Cannot determine whether a cached age calculation is current.");
    else if (relation === "same") cached.push(c);
  }
  const calculated = live.length ? live : cached;
  if (!calculated.length) return { kind: "eligible", candidates: asserted };
  if (asserted.some(c => candidateDayRelation(c.validity, clock) === "unknown")) return fail("publication-age-day-unknown", "Cannot determine whether an assertion overrides today's calculation.");
  const sameDay = asserted.filter(c => candidateDayRelation(c.validity, clock) === "same");
  return { kind: "eligible", candidates: sameDay.length ? sameDay : calculated };
}
