import type { PublicationCode, PublicationMembershipProducer } from "./publicationProgram";
import type { Location, Terminology } from "../ast/types";

// REFACTOR:grounded (#320, review 562): interpretation follows selection. Display/version/order
// never decide membership, and an extra foreign coding cannot negate a recognized coding.
export function publicationCodeKey(code: PublicationCode): string {
  return JSON.stringify([code.system, code.code]);
}

/** REFACTOR:grounded (#320, review 563 r3): shared literal normalization for authoring and emit. */
export function normalizePublicationCodes(
  codes: readonly PublicationCode[],
): readonly PublicationCode[] {
  return Object.freeze(
    [...new Map(codes.map((code) => [publicationCodeKey(code), code])).values()]
      .sort((a, b) => publicationCodeKey(a).localeCompare(publicationCodeKey(b)))
      .map((code) => Object.freeze({ ...code })),
  );
}

export function readFinitePublicationTerminology(
  terminology: Readonly<Terminology>,
):
  | { readonly kind: "finite"; readonly codes: readonly PublicationCode[] }
  | {
      readonly kind: "error";
      readonly code: "publication-domain-not-finite";
      readonly message: string;
      readonly location?: Location;
    } {
  // A referenced ValueSet contributes membership even beside literal codes. Without its full
  // resolved expansion, using just those codes would silently truncate the interpreted set.
  const unresolved = terminology.body.find((line) => line.type === "TerminologyValueset");
  if (unresolved !== undefined)
    return {
      kind: "error",
      code: "publication-domain-not-finite",
      message:
        "A referenced ValueSet, including one mixed with explicit codes, does not establish a complete finite interpretation domain. Opaque ValueSet resolution is not supported on this publication path. This path requires a complete explicit code set; substituting arbitrary codes changes its meaning.",
      location: unresolved.location,
    };
  let system: string | undefined;
  let segmentCount = 0;
  const codes: PublicationCode[] = [];
  for (const line of terminology.body) {
    // REFACTOR:grounded (#320, 615): an unenumerated system segment is not a finite domain.
    if (line.type === "TerminologySystem") {
      if (system !== undefined && segmentCount === 0) return {
        kind: "error", code: "publication-domain-not-finite",
        message: "Every system segment in a finite domain must enumerate its codes.", location: line.location,
      };
      system = line.system;
      segmentCount = 0;
    }
    if (line.type === "TerminologyCode") {
      if (system === undefined || system.trim() === "" || line.code.trim() === "")
        return {
          kind: "error",
          code: "publication-domain-not-finite",
          message: "Finite domains require an explicit nonempty system/code for every member.",
          location: line.location,
        };
      codes.push({ system, code: line.code });
      segmentCount++;
    }
  }
  if (codes.length === 0 || segmentCount === 0)
    return {
      kind: "error",
      code: "publication-domain-not-finite",
      message: "A URI-only or empty terminology does not establish a finite interpreted domain.",
    };
  return { kind: "finite", codes: normalizePublicationCodes(codes) };
}

export type PublicationValueError = {
  readonly kind: "error";
  readonly code: string;
  readonly message: string;
};
export type PublicationCodeableValue =
  | { readonly kind: "unknown" }
  | { readonly kind: "recognized"; readonly codes: readonly PublicationCode[] }
  | PublicationValueError;

export function interpretPublicationCodeableValue(
  domain: readonly PublicationCode[],
  resource: Readonly<Record<string, unknown>>,
): PublicationCodeableValue {
  const value = resource.valueCodeableConcept;
  if (value === undefined || value === null) return { kind: "unknown" };
  const allowed = new Map(domain.map((code) => [publicationCodeKey(code), code]));
  const coding =
    typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).coding
      : undefined;
  const recognized = new Map<string, PublicationCode>();
  for (const item of Array.isArray(coding) ? coding : []) {
    if (item === null || typeof item !== "object") continue;
    const { system, code } = item as Record<string, unknown>;
    if (typeof system !== "string" || typeof code !== "string") continue;
    const key = publicationCodeKey({ system, code });
    const member = allowed.get(key);
    if (member !== undefined) recognized.set(key, member);
  }
  return recognized.size === 0
    ? {
        kind: "error",
        code: "publication-uninterpretable-value",
        message: "The selected value has no coding in its explicit interpreted domain.",
      }
    : {
        kind: "recognized",
        codes: [...recognized.values()].sort((a, b) =>
          publicationCodeKey(a).localeCompare(publicationCodeKey(b)),
        ),
      };
}

export function classifyPublicationMembership(
  producer: PublicationMembershipProducer,
  resource: Readonly<Record<string, unknown>>,
):
  | { readonly kind: "unknown" }
  | { readonly kind: "known"; readonly value: boolean }
  | PublicationValueError {
  const interpreted = interpretPublicationCodeableValue(producer.domain, resource);
  if (interpreted.kind !== "recognized") return interpreted;
  const qualifying = new Set(producer.qualifying.map(publicationCodeKey));
  const states = new Set(interpreted.codes.map((code) => qualifying.has(publicationCodeKey(code))));
  return states.size > 1
    ? {
        kind: "error",
        code: "publication-ambiguous-coded-value",
        message:
          "Recognized codings in the selected value disagree on the authored membership classification.",
      }
    : { kind: "known", value: [...states][0] };
}
