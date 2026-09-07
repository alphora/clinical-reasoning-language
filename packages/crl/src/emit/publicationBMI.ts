import type { Concept, Location, ReferenceName } from "../ast/types";
import type { PublicationDescriptor } from "./publicationProgram";
import type { PublicationCandidate } from "./publicationSelection";
import type { PublicationValueError } from "./publicationDomain";
import {
  readPublicationQuantity,
  isPublicationComparisonDecimal,
  publicationDecimal,
  PUBLICATION_UCUM,
} from "./publicationQuantity";
import { publicationDerivedCandidateKey } from "./publicationProducer";

// REFACTOR:grounded (#320, plan589): BMI produces a record; its authored anchor supplies
// validity, and the independent final selector decides whether this candidate is published.
export function readPublicationBMI(
  concept: Readonly<Concept>,
):
  | { weight: ReferenceName; height: ReferenceName; validity: ReferenceName; location: Location }
  | undefined {
  if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
  const { elements: e, location } = concept.definition.body;
  if (e.length !== 11) return undefined;
  for (const [i, word] of [
    [0, "body"],
    [1, "mass"],
    [2, "index"],
    [3, "of"],
    [5, "and"],
    [7, "using"],
    [8, "validity"],
    [9, "of"],
  ] as const)
    if (e[i].type !== "NWord" || e[i].value.toLowerCase() !== word) return undefined;
  const w = e[4],
    h = e[6],
    v = e[10];
  if (w.type !== "NConceptRef" || h.type !== "NConceptRef" || v.type !== "NConceptRef")
    return undefined;
  return { weight: w.value, height: h.value, validity: v.value, location };
}
const fail = (code: string, message: string): PublicationValueError => ({
  kind: "error",
  code,
  message,
});
type Measurement =
  | { kind: "unknown" }
  | { kind: "known"; coefficient: bigint; scale: bigint }
  | PublicationValueError;
function measurement(value: unknown, kind: "weight" | "height"): Measurement {
  const q = readPublicationQuantity(value);
  if (q.kind !== "known") return q;
  if (!isPublicationComparisonDecimal(q.value))
    return fail(
      "publication-bmi-precision-unsupported",
      "BMI inputs support magnitude at most 10^6 and eight decimal places.",
    );
  if (q.value <= 0)
    return fail("publication-bmi-nonpositive", "BMI measurements must be positive.");
  const factor =
    kind === "weight"
      ? q.unit === "kg"
        ? 1000n
        : q.unit === "g"
          ? 1n
          : undefined
      : q.unit === "m"
        ? 100n
        : q.unit === "cm"
          ? 1n
          : undefined;
  if (factor === undefined)
    return fail(
      "publication-bmi-unit-unsupported",
      "BMI requires weight in kg or g and height in m or cm.",
    );
  const d = publicationDecimal(q.value),
    coefficient = d.coefficient * factor;
  if (kind === "height" && (coefficient * 10000n) % d.scale !== 0n)
    return fail(
      "publication-bmi-precision-unsupported",
      "BMI height in centimetres supports at most four decimal places.",
    );
  return { kind: "known", coefficient, scale: d.scale };
}
export function publicationBMIValue(
  weight: unknown,
  height: unknown,
): { kind: "unknown" } | { kind: "known"; value: number } | PublicationValueError {
  const w = measurement(weight, "weight"),
    h = measurement(height, "height");
  if (w.kind === "error") return w;
  if (h.kind === "error") return h;
  if (w.kind === "unknown" || h.kind === "unknown") return { kind: "unknown" };
  // Exact positive rational in grams/centimetres, truncated once to eight places.
  const scaled =
    (w.coefficient * 10n * h.scale * h.scale * 100000000n) /
    (w.scale * h.coefficient * h.coefficient);
  if (scaled > 1000000n * 100000000n)
    return fail("publication-bmi-result-unsupported", "Published BMI exceeds magnitude 10^6.");
  return { kind: "known", value: Number(scaled) / 100000000 };
}
type Candidate = PublicationCandidate<Record<string, unknown>>;
export function produceBMICandidate(
  d: PublicationDescriptor,
  weight: Candidate | undefined,
  height: Candidate | undefined,
  subject: string,
): { kind: "none" } | { kind: "candidate"; candidate: Candidate } | PublicationValueError {
  if (d.producer?.kind !== "bodyMassIndex")
    return fail("publication-no-producer", "This publication has no BMI producer.");
  const value = publicationBMIValue(weight?.resource.valueQuantity, height?.resource.valueQuantity);
  if (value.kind === "error") return value;
  if (!weight || !height) return { kind: "none" };
  if (!subject.trim())
    return fail("publication-missing-subject", "A produced BMI requires an evaluation subject.");
  const anchor = d.producer.validityOperand === 0 ? weight : height;
  const references = [
    ...new Set(
      [weight, height].flatMap((c) =>
        typeof c.resource.id === "string" && /^[A-Za-z0-9.-]{1,64}$/.test(c.resource.id)
          ? [`Observation/${c.resource.id}`]
          : [],
      ),
    ),
  ];
  return {
    kind: "candidate",
    candidate: {
      key: publicationDerivedCandidateKey(
        d.producer.producerId,
        publicationDerivedCandidateKey(weight.key, height.key),
      ),
      contributorId: d.producer.producerId,
      arm: "inferred",
      ...(anchor.validity === undefined ? {} : { validity: anchor.validity }),
      resource: {
        resourceType: "Observation",
        status: "final",
        subject: { reference: subject },
        ...(d.profileUrl === undefined ? {} : { meta: { profile: [d.profileUrl] } }),
        code: { ...(d.localCode ? { coding: [d.localCode] } : {}), text: d.title },
        ...(value.kind === "known"
          ? {
              valueQuantity: {
                value: value.value,
                system: PUBLICATION_UCUM,
                code: "kg/m2",
                unit: "kg/m2",
              },
            }
          : {}),
        ...(anchor.resource.effectiveDateTime === undefined
          ? {}
          : { effectiveDateTime: anchor.resource.effectiveDateTime }),
        ...(anchor.resource._effectiveDateTime === undefined
          ? {}
          : { _effectiveDateTime: anchor.resource._effectiveDateTime }),
        ...(references.length
          ? { derivedFrom: references.map((reference) => ({ reference })) }
          : {}),
      },
    },
  };
}
