// REFACTOR:grounded (#320, reviewed 557): select an authored publication candidate without changing it.
// Target: docs/CRL-NORTH-STAR.md and .vibe-tools/discussions/557-plan-round3.md.
// Producers own resource/value interpretation and identity construction; this module owns selection only.
import { isValidFhirTemporal } from "../cel/temporal";
import type { FhirTemporalComparison } from "../cel/temporal";

import { comparePublicationValidity } from "./publicationTemporal";

export interface PublicationCandidate<T> {
  readonly key: string;
  readonly contributorId: string;
  /**
   * Arm of the contributor in this evaluation, never inferred from resource codes or provenance.
   * A freshly produced local-coded CF is inferred; once persisted and retrieved locally it is local.
   */
  readonly arm: "local" | "source" | "inferred";
  readonly resource: T;
  readonly validity?: string;
  /** Opaque dataset/resource/version identity supplied by the producer, required for retrieved arms. */
  readonly retrievedInputIdentity?: string;
}

export interface PublicationSelectionOptions {
  readonly conceptId: string;
  readonly equalTime: "error" | "preferLocal";
}

export interface PublicationCandidateContext {
  readonly key: string;
  readonly contributorId: string;
  readonly arm: PublicationCandidate<unknown>["arm"];
  readonly retrievedInputIdentity?: string;
  readonly validity?: string;
}

export type PublicationSelectionFailureCode =
  | "publication-invalid-validity"
  | "publication-missing-input-identity"
  | "publication-duplicate-input"
  | "publication-undated-input"
  | "publication-incomparable-validity"
  | "publication-ambiguous-selection";

export interface PublicationComparisonContext {
  readonly left: PublicationCandidateContext;
  readonly right: PublicationCandidateContext;
  readonly comparison: FhirTemporalComparison;
}

export interface PublicationSelectionDiagnostic {
  readonly code: PublicationSelectionFailureCode;
  readonly conceptId: string;
  readonly message: string;
  readonly candidates: readonly PublicationCandidateContext[];
  readonly comparisons?: readonly PublicationComparisonContext[];
}

export type PublicationSelectionResult<T> =
  | { readonly state: "missing" }
  | { readonly state: "selected"; readonly candidate: PublicationCandidate<T> }
  | { readonly state: "failed"; readonly diagnostic: PublicationSelectionDiagnostic };

function contextOf(candidate: PublicationCandidate<unknown>): PublicationCandidateContext {
  return {
    key: candidate.key,
    contributorId: candidate.contributorId,
    arm: candidate.arm,
    retrievedInputIdentity: candidate.retrievedInputIdentity,
    validity: candidate.validity,
  };
}

// This ordering formats diagnostics only. It is never used to arbitrate candidate selection.
function displayKey(context: PublicationCandidateContext): string {
  return JSON.stringify([
    context.key,
    context.contributorId,
    context.arm,
    context.retrievedInputIdentity,
    context.validity,
  ]);
}

function displayOrder(a: PublicationCandidateContext, b: PublicationCandidateContext): number {
  const left = displayKey(a);
  const right = displayKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasValidity<T>(
  candidate: PublicationCandidate<T>,
): candidate is PublicationCandidate<T> & { readonly validity: string } {
  return candidate.validity !== undefined;
}

/**
 * Pure final most-recent selection over already typed contributions. The temporal helper deliberately
 * refuses leap-second/sub-millisecond comparisons and indeterminate precision/zone relationships;
 * valid singletons need no comparison. No timestamp, metadata, value or resource is manufactured.
 */
export function selectPublicationCandidate<T>(
  candidates: readonly PublicationCandidate<T>[],
  options: PublicationSelectionOptions,
): PublicationSelectionResult<T> {
  function failed(
    code: PublicationSelectionFailureCode,
    message: string,
    affected: readonly PublicationCandidate<T>[],
    comparisons?: readonly PublicationComparisonContext[],
  ): PublicationSelectionResult<T> {
    return {
      state: "failed",
      diagnostic: {
        code,
        conceptId: options.conceptId,
        message,
        candidates: affected.map(contextOf).sort(displayOrder),
        ...(comparisons ? { comparisons } : {}),
      },
    };
  }

  // Validate every supplied validity, including an older row that would otherwise lose selection.
  const malformed = candidates.filter(
    (candidate) => candidate.validity !== undefined && !isValidFhirTemporal(candidate.validity),
  );
  if (malformed.length > 0) {
    return failed(
      "publication-invalid-validity",
      "A publication candidate has malformed FHIR validity.",
      malformed,
    );
  }
  const unidentified = candidates.filter(
    (candidate) =>
      candidate.arm !== "inferred" &&
      (candidate.retrievedInputIdentity === undefined || candidate.retrievedInputIdentity === ""),
  );
  if (unidentified.length > 0) {
    return failed(
      "publication-missing-input-identity",
      "A retrieved publication candidate requires an input identity in the evaluation dataset.",
      unidentified,
    );
  }

  // Repeated stable keys are invalid even for inferred candidates. Compare rows by occurrence below,
  // never by key equality; a repeated key must not exempt a second row from arbitration.
  const byKey = new Map<string, PublicationCandidate<T>[]>();
  const byContributorInput = new Map<string, Map<string, PublicationCandidate<T>[]>>();
  for (const candidate of candidates) {
    const keyGroup = byKey.get(candidate.key) ?? [];
    keyGroup.push(candidate);
    byKey.set(candidate.key, keyGroup);
    if (candidate.retrievedInputIdentity === undefined) continue;
    const contributor =
      byContributorInput.get(candidate.contributorId) ??
      new Map<string, PublicationCandidate<T>[]>();
    const inputGroup = contributor.get(candidate.retrievedInputIdentity) ?? [];
    inputGroup.push(candidate);
    contributor.set(candidate.retrievedInputIdentity, inputGroup);
    byContributorInput.set(candidate.contributorId, contributor);
  }
  const duplicateGroups = [
    ...byKey.values(),
    ...[...byContributorInput.values()].flatMap((contributor) => [...contributor.values()]),
  ].filter((group) => group.length > 1);
  if (duplicateGroups.length > 0) {
    const duplicateRows = new Set(duplicateGroups.flat());
    return failed(
      "publication-duplicate-input",
      "Publication candidate keys must be unique, and retrieved input identities must be unique within each contributor.",
      candidates.filter((candidate) => duplicateRows.has(candidate)),
    );
  }

  if (candidates.length === 0) return { state: "missing" };
  if (candidates.length === 1) return { state: "selected", candidate: candidates[0] };
  // REFACTOR:grounded (557 round 3): another dated answer cannot order an undated row. Name the
  // offending inputs so the application can correct their validity; do not silently rank them below.
  if (!candidates.every(hasValidity)) {
    return failed(
      "publication-undated-input",
      "Multiple publication candidates include undated input; correct its validity before selecting.",
      candidates.filter((candidate) => !hasValidity(candidate)),
    );
  }

  // Pairwise dominance avoids a sorting comparator pretending that unknown order is equality.
  // Old losing ties/incomparability are harmless when a newer row provably dominates every row.
  const comparisons: FhirTemporalComparison[][] = candidates.map(() => []);
  const incomparable: PublicationComparisonContext[] = [];
  for (let left = 0; left < candidates.length; left++) {
    comparisons[left][left] = "equal";
    for (let right = left + 1; right < candidates.length; right++) {
      const a = candidates[left];
      const b = candidates[right];
      const comparison = comparePublicationValidity(a.validity, b.validity);
      comparisons[left][right] = comparison;
      comparisons[right][left] =
        comparison === "before" ? "after" : comparison === "after" ? "before" : comparison;
      if (!["before", "after", "equal"].includes(comparison)) {
        const [first, second] = [contextOf(a), contextOf(b)].sort(displayOrder);
        incomparable.push({ left: first, right: second, comparison });
      }
    }
  }
  const latest = candidates.filter((_, index) =>
    comparisons[index].every((comparison) => comparison === "after" || comparison === "equal"),
  );
  if (latest.length === 1) return { state: "selected", candidate: latest[0] };
  if (latest.length === 0) {
    incomparable.sort((a, b) => displayOrder(a.left, b.left) || displayOrder(a.right, b.right));
    return failed(
      "publication-incomparable-validity",
      incomparable.some((pair) => pair.comparison === "unsupported")
        ? "No candidate is demonstrably latest: unsupported comparison of validity. Correct or exclude the unsupported input before selecting."
        : "No candidate is demonstrably latest: overlapping precision of validity. Supply sufficiently precise validity or an authored eligibility policy; equal-time preference does not resolve overlap.",
      candidates,
      incomparable,
    );
  }

  // Every row in latest is demonstrably >= every alternative, so these maxima really are equal-time.
  if (options.equalTime === "preferLocal") {
    const local = latest.filter((candidate) => candidate.arm === "local");
    if (local.length === 1) return { state: "selected", candidate: local[0] };
  }
  return failed(
    "publication-ambiguous-selection",
    "Multiple candidates have equal maximal validity and the authored equal-time policy does not select one.",
    latest,
  );
}
