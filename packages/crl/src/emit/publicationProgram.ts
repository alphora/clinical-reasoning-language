import type { Concept, CRL, Location, ReferenceName } from "../ast/types";
import { bmiRetirementReason } from "../template-match/bmiPublication";
import type { CRLError } from "../types/errors";
import { localCodeSystemUrl, caseFeatureUrlFromPolicyId } from "../fhir-emitter/slug";
import { inlineAnswerSet } from "../fhir-emitter/inlineAnswerSet";
import { emittedValueSetUrl } from "../fhir-emitter/valueSet";
import { matchNarrative } from "../template-match/matcher";
import { publicationCodeKey, normalizePublicationCodes, readFinitePublicationTerminology } from "./publicationDomain";
import type { PublicationCandidate } from "./publicationSelection";
import { publicationSourceAdmissionReason, type PublicationSource } from "./publicationSource";
import { readAgeProjection } from "./publicationAge";
import { readPublicationBMI } from "./publicationBMI";
import { readPublicationQuantity, isPublicationComparisonDecimal } from "./publicationQuantity";
import {
  createPublicationContext,
  type PublicationContext,
  type QualifiedConceptIdentity,
  type PublicationArtifactIdentity,
  type PublicationLibrary,
  type PublicationPackageIdentity,
} from "./publicationContext";

// REFACTOR:grounded (#320, review 560): opt-in admission uses the raw declaration.
// Older lowering families are implementation history, not the meaning of this form.
export interface PublicationDescriptor {
  readonly identity: QualifiedConceptIdentity;
  readonly conceptId: string;
  readonly localContributorId?: string;
  readonly localCode?: PublicationCode;
  readonly title: string;
  readonly profileUrl?: string;
  readonly resourceType: "Observation";
  readonly valueType: PublicationValueType;
  readonly valueElement: "value";
  readonly selector: { readonly kind: "mostRecent"; readonly equalTime: "error" | "preferLocal" };
  readonly valueDomain?: readonly PublicationCode[];
  readonly answerOptions?: { readonly valueSetUrl: string; readonly codes: readonly PublicationCode[] };
  readonly producer?: PublicationProducer;
  readonly sources?: readonly PublicationSource[];
}

export type PublicationValueType = "boolean" | "CodeableConcept" | "Quantity";
export interface PublicationCode { readonly system: string; readonly code: string }
export interface PublicationMembershipProducer {
  readonly kind: "membership";
  readonly producerId: string;
  readonly operand: QualifiedConceptIdentity;
  readonly domain: readonly PublicationCode[];
  readonly qualifying: readonly PublicationCode[];
}
export interface PublicationThresholdProducer {
  readonly kind: "quantityThreshold";
  readonly producerId: string;
  readonly operand: QualifiedConceptIdentity;
  readonly threshold: { readonly value: number; readonly unit: string };
}

// REFACTOR:grounded (#320, plan589): ordered dependencies and validity are distinct.
export interface PublicationBMIProducer {
  readonly kind: "bodyMassIndex";
  readonly producerId: string;
  readonly operands: readonly [QualifiedConceptIdentity, QualifiedConceptIdentity];
  readonly validityOperand: 0 | 1;
}
export type PublicationProducer = PublicationMembershipProducer | PublicationThresholdProducer | PublicationBMIProducer;
export function publicationProducerOperands(p: PublicationProducer | undefined): readonly QualifiedConceptIdentity[] {
  return p === undefined ? [] : p.kind === "bodyMassIndex" ? p.operands : [p.operand];
}

// REFACTOR:grounded (#320, plan587): unary comparison contributes its own Boolean record.
export function readPublicationThreshold(concept: Readonly<Concept>): { operand: ReferenceName; threshold: { value: number; unit: string }; location: Location } | undefined {
  if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
  const call = matchNarrative(concept.definition.body);
  if (!call.known || call.pattern !== "AtLeast" || call.args.length !== 2) return undefined;
  const [operand, threshold] = call.args;
  if (operand.type !== "ConceptRefArg" || threshold.type !== "QuantityArg") return undefined;
  return { operand: operand.library === undefined ? operand.value : { type: "QualifiedReference", libraryName: operand.library, name: operand.value, location: operand.location },
    threshold: { value: threshold.value, unit: threshold.unit }, location: call.location };
}

export function hasLocalPublicationContribution(descriptor: PublicationDescriptor): descriptor is PublicationDescriptor & {
  readonly localCode: PublicationCode; readonly localContributorId: string;
} {
  return descriptor.localCode !== undefined && descriptor.localContributorId !== undefined;
}

export interface PublicationMembershipSyntax {
  readonly operand: ReferenceName;
  readonly predicate: { readonly kind: "qualifying" } | { readonly kind: "terminology"; readonly reference: ReferenceName };
  readonly location: Location;
}

/** Exact unary production only; a legacy pipeline containing membership is not admitted by this helper. */
export function readPublicationMembership(concept: Readonly<Concept>): PublicationMembershipSyntax | undefined {
  if (concept.definition?.type !== "DefinitionIsDefinition") return undefined;
  const call = matchNarrative(concept.definition.body);
  if (!call.known || call.pattern !== "Membership" || call.args.length !== 2) return undefined;
  const [operand, predicate] = call.args;
  if (operand.type !== "ConceptRefArg") return undefined;
  const ref = (arg: { value: string; library?: string; location: Location }): ReferenceName =>
    arg.library === undefined ? arg.value : { type: "QualifiedReference", libraryName: arg.library, name: arg.value, location: arg.location };
  const term = predicate.type === "SubsetRefArg" && predicate.value === "qualifying"
    ? { kind: "qualifying" as const }
    : predicate.type === "TerminologyRefArg" ? { kind: "terminology" as const, reference: ref(predicate) } : undefined;
  return term === undefined ? undefined : { operand: ref(operand), predicate: term, location: call.location };
}

export interface PublicationNodeBinding {
  readonly descriptor: PublicationDescriptor;
  readonly role: "retrieve" | "public" | "interface";
  /** Physical source bindings, requalified independently of immutable semantic descriptors. */
  readonly sourceReferences?: readonly ReferenceName[];
  readonly source?: PublicationSource;
}

// FHIR R4 ObservationStatus value domain. Valid statuses do not supply a hidden final-only filter;
// the two explicit invalidation states below still require an eligibility/retraction policy.
export const PUBLICATION_OBSERVATION_STATUSES = Object.freeze([
  "registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown",
] as const);

export type PublicationLookup =
  | { readonly kind: "publication"; readonly descriptor: PublicationDescriptor }
  | { readonly kind: "legacy" }
  | { readonly kind: "error"; readonly diagnostic: CRLError };

export interface PublicationProgram {
  readonly declarations: PublicationContext;
  readonly diagnostics: readonly CRLError[];
  readonly warnings: readonly PublicationWarning[];
  readonly descriptors: readonly PublicationDescriptor[];
  get(identityKey: string): PublicationDescriptor | undefined;
  lookup(fromSourceIdentity: string, ref: ReferenceName, location?: Location): PublicationLookup;
}

// REFACTOR:grounded (#320, review 563): CRL diagnostic coordinates retain their owning source
// across CEL consumers. Portable semantic identity is unaffected by this local navigation metadata.
export interface PublicationWarning extends CRLError {
  readonly sourceIdentity: string;
  readonly filePath?: string;
}

/** Pure declaration check shared with authoring validation; artifact metadata is checked separately. */
export function publicationAdmissionReason(concept: Readonly<Concept>): string | undefined {
  if (concept.shapeReduction === undefined) return "No shape reduction was authored.";
  if (concept.shape !== "Record") return "This shape reduction currently requires explicit `shape is Record`.";
  // REFACTOR:grounded (#320, plan587): a selected measurement retains its Quantity and metadata.
  if (concept.conceptType !== "Observation" || concept.valueTypes.length !== 1 || !["boolean", "CodeableConcept", "Quantity"].includes(concept.valueTypes[0]))
    return "This publication slice supports Observation with exactly one boolean, CodeableConcept or Quantity value type.";
  const membership = readPublicationMembership(concept);
  const threshold = readPublicationThreshold(concept);
  const bmi = readPublicationBMI(concept);
  if (concept.code !== undefined && concept.code.trim().length === 0) return "A local `code is` must be nonempty.";
  // REFACTOR:grounded (#320, plan585): an age calculation needs no invented answer identity.
  if (concept.code === undefined && membership === undefined && threshold === undefined && bmi === undefined && concept.representations.length === 0) return "A publication requires a local code or an admitted producer/source.";
  if (concept.definition !== undefined && membership === undefined && threshold === undefined && bmi === undefined)
    return "Supported production is selected-value membership, quantity threshold, or body mass index with an explicit validity operand; other definitions cannot be ignored.";
  const sourceReason = publicationSourceAdmissionReason(concept);
  if (sourceReason !== undefined) return sourceReason;
  if (membership !== undefined && concept.valueTypes[0] !== "boolean") return "Membership produces an Observation with a boolean value.";
  if (threshold !== undefined && concept.valueTypes[0] !== "boolean") return "A quantity comparison produces an Observation with a boolean value.";
  if (bmi !== undefined && concept.valueTypes[0] !== "Quantity") return "Body mass index produces an Observation with a Quantity value.";
  if (concept.valueElement !== undefined && concept.valueElement.path !== "value")
    return "An Observation<boolean> publication reads its `value` element.";
  if (concept.valueFrom !== undefined && concept.valueTypes[0] !== "CodeableConcept")
    return "Coded answer domains are not part of the Boolean publication slice.";
  if (concept.valueTypes[0] === "CodeableConcept" && concept.valueDomain === undefined)
    return "A selected CodeableConcept publication requires an explicit `value domain is` clause.";
  if (concept.valueTypes[0] !== "CodeableConcept" && concept.valueDomain !== undefined)
    return "An interpreted value domain belongs only to a CodeableConcept publication.";
  if (concept.shapeReduction.kind !== "mostRecent" || !["error", "preferLocal"].includes(concept.shapeReduction.equalTime))
    return "This publication slice supports most-recent selection and the authored local equal-time preference.";
  return undefined;
}

export function isLocalBooleanPublication(concept: Readonly<Concept> | undefined): boolean {
  return concept !== undefined && concept.shapeReduction !== undefined && concept.valueTypes[0] === "boolean" &&
    concept.code !== undefined && concept.definition === undefined && publicationAdmissionReason(concept) === undefined;
}

function diagnostic(message: string, location?: Location, kind = "publication-unsupported-form"): CRLError {
  return { type: "Validation", kind, message, line: location?.start.line ?? 1, column: location?.start.column ?? 0 };
}

export function preparePublicationProgram(declarations: PublicationContext): PublicationProgram {
  const byIdentity = new Map<string, PublicationDescriptor>();
  const rejected = new Map<string, CRLError>();
  const diagnostics: CRLError[] = [];
  const warnings: PublicationWarning[] = [];
  const visiting = new Set<string>();
  const finiteTerms = new Map<string, readonly PublicationCode[]>();
  const offeredSets = new Map<string, readonly PublicationCode[]>();
  const normalized = normalizePublicationCodes;
  const fail = (message: string, location: Location | undefined, kind: string): never => {
    throw diagnostic(message, location, kind);
  };
  const finiteTerminology = (owner: string, ref: ReferenceName, location: Location): { key: string; codes: readonly PublicationCode[] } => {
    const hit = declarations.lookupTerminology(owner, ref, location);
    if (hit.kind !== "hit") return fail(`Value terminology cannot resolve in its owning scope: ${hit.kind}.`, location, "publication-domain-resolution");
    const cached = finiteTerms.get(hit.identity.key);
    if (cached !== undefined) return { key: hit.identity.key, codes: cached };
    const result = readFinitePublicationTerminology(hit.node);
    if (result.kind === "error") return fail(result.message, result.location ?? location, result.code);
    finiteTerms.set(hit.identity.key, result.codes);
    return { key: hit.identity.key, codes: result.codes };
  };
  const offered = (library: PublicationLibrary, concept: Readonly<Concept>): readonly PublicationCode[] => {
    if (concept.valueFrom === undefined) return [];
    const key = JSON.stringify([library.sourceIdentity, concept.name]);
    const cached = offeredSets.get(key);
    if (cached !== undefined) return cached;
    if (concept.valueFrom.kind === "terminology") {
      const result = finiteTerminology(library.sourceIdentity, concept.valueFrom.terminologyName, concept.valueFrom.location).codes;
      offeredSets.set(key, result);
      return result;
    }
    const set = inlineAnswerSet(concept as Concept, library.artifact.localDomainId ?? library.libraryName, library.artifact.canonicalBase!);
    if (set === null) return fail("Inline answer domains require an owning local code.", concept.valueFrom.location, "publication-domain-answer-options");
    const result = normalized(set.options.map((option) => ({ system: set.codeSystem.url, code: option.code })));
    offeredSets.set(key, result);
    return result;
  };
  const domainFor = (library: PublicationLibrary, concept: Readonly<Concept>): readonly PublicationCode[] => {
    const codes: PublicationCode[] = [];
    const terms = new Set<string>();
    for (const term of concept.valueDomain?.terms ?? []) {
      const resolved = term.type === "AnswerOptionsDomainTerm"
        ? { key: "answer-options", codes: offered(library, concept) }
        : finiteTerminology(library.sourceIdentity, term.terminologyName, term.location);
      if (terms.has(resolved.key)) return fail("A value domain repeats the same resolved term.", term.location, "publication-domain-duplicate-term");
      if (resolved.codes.length === 0) return fail("The answer-options domain term requires a finite nonempty offered answer set.", term.location, "publication-domain-answer-options");
      terms.add(resolved.key);
      codes.push(...resolved.codes);
    }
    const domain = normalized(codes);
    const keys = new Set(domain.map(publicationCodeKey));
    if (domain.length === 0) return fail("The interpreted value domain must be explicitly finite and nonempty.", concept.valueDomain?.location ?? concept.location, "publication-domain-not-finite");
    if (offered(library, concept).some((code) => !keys.has(publicationCodeKey(code))))
      return fail("Every offered answer must belong to the interpreted value domain.", concept.valueFrom?.location ?? concept.location, "publication-domain-answer-coverage");
    return domain;
  };
  const prepare = (library: PublicationLibrary, concept: Readonly<Concept>): PublicationDescriptor | undefined => {
    const hit = declarations.lookupConcept(library.sourceIdentity, concept.name, concept.location);
    if (hit.kind !== "hit") {
      diagnostics.push(diagnostic(`Cannot resolve publication "${concept.name}": ${hit.kind}.`, concept.location, "publication-declaration-resolution"));
      return undefined;
    }
    if (byIdentity.has(hit.identity.key)) return byIdentity.get(hit.identity.key);
    if (rejected.has(hit.identity.key)) return undefined;
    if (visiting.has(hit.identity.key)) return fail(`Publication dependency cycle at "${concept.name}".`, concept.location, "publication-dependency-cycle");
    visiting.add(hit.identity.key);
    try {
      const reason = publicationAdmissionReason(concept);
      if (reason !== undefined) fail(`Concept "${concept.name}": ${reason}`, concept.shapeReduction?.location, "publication-unsupported-form");
      const base = library.artifact.canonicalBase;
      if (base === undefined || base.trim() === "") fail(`Concept "${concept.name}" requires the owning canonical URL base for its identity.`, concept.location, "missing-canonical-url-base");
      const localCode = concept.code === undefined ? undefined : Object.freeze({
        system: localCodeSystemUrl(base!, library.artifact.localDomainId ?? library.libraryName), code: concept.code.trim(),
      });
      const portableTuple = [base, library.artifact.policyId ?? null, library.libraryName,
        library.packageIdentity?.name ?? null, library.packageIdentity?.version ?? null, concept.name];
      const conceptId = localCode === undefined ? `crl:concept:v1:${encodeURIComponent(JSON.stringify(portableTuple))}`
        : `${localCode.system}#${encodeURIComponent(localCode.code)}`;
      const valueDomain = concept.valueTypes[0] === "CodeableConcept" ? domainFor(library, concept) : undefined;
      // REFACTOR:grounded (#320, review 564): prepare every declared source before lowering.
      if (localCode !== undefined && concept.representations.length > 0 && !library.artifact.policyId)
        fail("A source-produced Case Feature requires an owning policy identity.", concept.location, "publication-source-profile-required");
      const sources = concept.representations.map((rep, index): PublicationSource => {
        const contributorId = `crl:source:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["source", index]]))}`;
        const age = readAgeProjection(rep);
        return age ? Object.freeze({ ...age, contributorId }) : Object.freeze({ kind: rep.conceptType === "Observation" ? "observationQuantity" : "serviceRequestWitness", contributorId,
          terminology: rep.terminologyName!, codes: finiteTerminology(library.sourceIdentity, rep.terminologyName!, rep.location).codes });
      });
      let answerOptions: PublicationDescriptor["answerOptions"];
      if (concept.valueFrom?.kind === "inline") {
        const set = inlineAnswerSet(concept as Concept, library.artifact.localDomainId ?? library.libraryName, base!);
        if (set !== null) answerOptions = Object.freeze({ valueSetUrl: set.allOptions.url, codes: offered(library, concept) });
      } else if (concept.valueFrom?.kind === "terminology") {
        const term = declarations.lookupTerminology(library.sourceIdentity, concept.valueFrom.terminologyName, concept.valueFrom.location);
        if (term.kind !== "hit") fail("The offered answer terminology cannot resolve.", concept.valueFrom.location, "publication-domain-resolution");
        else {
          if (!term.library.artifact.canonicalBase || !term.library.artifact.policyId)
            fail("An offered terminology requires its owning canonical base and policy identity for FHIR publication.", concept.valueFrom.location, "publication-answer-identity-missing");
          answerOptions = Object.freeze({ valueSetUrl: emittedValueSetUrl(term.node as import("../ast/types").Terminology,
            term.library.artifact.canonicalBase!, term.library.artifact.policyId!), codes: offered(library, concept) });
        }
      }
      const syntax = readPublicationMembership(concept);
      let producer: PublicationProducer | undefined;
      if (syntax !== undefined) {
        // REFACTOR:grounded (#320, code review 563): a coded computation promises
        // its own CF profile. Missing metadata cannot silently make it uncoded-like.
        if (localCode !== undefined && !library.artifact.policyId)
          return fail("A coded membership producer requires an owning policy identity to publish its Case Feature profile.", concept.location, "publication-producer-profile-identity-missing");
        const operand = declarations.lookupConcept(library.sourceIdentity, syntax.operand, syntax.location);
        if (operand.kind !== "hit") return fail(`Membership operand cannot resolve: ${operand.kind}.`, syntax.location, "publication-reference-resolution");
        if (operand.node.shapeReduction === undefined) return fail("Membership production requires an explicitly selected Record publication operand; legacy operands are not silently migrated.", syntax.location, "publication-membership-operand-unsupported");
        const prepared = prepare(operand.library, operand.node);
        if (prepared === undefined) return fail("Membership operand preparation failed.", syntax.location, "publication-dependency-failed");
        if (prepared.valueType !== "CodeableConcept" || prepared.valueDomain === undefined)
          return fail("Membership consumes a CodeableConcept-valued publication, not a Boolean producer result.", syntax.location, "publication-membership-operand-unsupported");
        const domain = prepared.valueDomain;
        let qualifying: readonly PublicationCode[];
        if (syntax.predicate.kind === "terminology") qualifying = finiteTerminology(library.sourceIdentity, syntax.predicate.reference, syntax.location).codes;
        else {
          if (operand.node.valueFrom?.kind !== "inline") return fail("`in qualifying` requires the operand's own inline answer options.", syntax.location, "publication-membership-inline-options-required");
          const set = inlineAnswerSet(operand.node as Concept, operand.library.artifact.localDomainId ?? operand.library.libraryName, operand.library.artifact.canonicalBase!);
          if (set === null || set.options.some((option) => option.qualifying === undefined))
            return fail("Every inline option must explicitly state qualifying or not qualifying for this predicate.", syntax.location, "publication-membership-marker-required");
          const classified = new Set(set.options.map((option) => publicationCodeKey({ system: set.codeSystem.url, code: option.code })));
          if (domain.some((code) => !classified.has(publicationCodeKey(code))))
            return fail("`in qualifying` requires explicit classification of every domain member by the operand's inline options.", syntax.location, "publication-membership-marker-required");
          qualifying = normalized(set.options.filter((option) => option.qualifying === true).map((option) => ({ system: set.codeSystem.url, code: option.code })));
        }
        const domainKeys = new Set(domain.map(publicationCodeKey));
        if (qualifying.some((code) => !domainKeys.has(publicationCodeKey(code))))
          return fail("Every qualifying code must belong to the operand's interpreted domain.", syntax.location, "publication-membership-domain-coverage");
        if (qualifying.length === domain.length) warnings.push(Object.freeze({
          ...diagnostic(`Membership producer "${concept.name}" has no negative value in its explicit domain.`, syntax.location, "publication-membership-no-negative-domain"),
          sourceIdentity: library.sourceIdentity,
          ...(library.filePath === undefined ? {} : { filePath: library.filePath }),
        }));
        producer = Object.freeze({ kind: "membership", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["membership", 0]]))}`,
          operand: prepared.identity, domain, qualifying: normalized(qualifying) });
      }
      const comparison = readPublicationThreshold(concept);
      if (comparison !== undefined) {
        if (localCode !== undefined && !library.artifact.policyId) return fail("A coded producer requires an owning policy identity.", concept.location, "publication-producer-profile-identity-missing");
        const hit = declarations.lookupConcept(library.sourceIdentity, comparison.operand, comparison.location);
        if (hit.kind !== "hit") return fail("The quantity operand cannot resolve.", comparison.location, "publication-reference-resolution");
        if (hit.node.shapeReduction === undefined) return fail("Quantity comparison requires an explicitly selected Record operand.", comparison.location, "publication-quantity-operand-unsupported");
        const operand = prepare(hit.library, hit.node);
        if (operand?.valueType !== "Quantity") return fail("Quantity comparison requires a Quantity-valued publication.", comparison.location, "publication-quantity-operand-unsupported");
        if (!isPublicationComparisonDecimal(comparison.threshold.value) || !["m", "cm", "kg", "g", "kg/m2"].includes(comparison.threshold.unit))
          return fail("Quantity threshold requires a finite value and a supported unit: m, cm, kg, g, kg/m2.", comparison.location, "publication-quantity-unit-unsupported");
        producer = Object.freeze({ kind: "quantityThreshold", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["quantityThreshold", 0]]))}`,
          operand: operand.identity, threshold: Object.freeze(comparison.threshold) });
      }
      // REFACTOR:grounded (#320, plan589): prepare both selected inputs and resolve anchor identity.
      const bmi = readPublicationBMI(concept);
      if (bmi !== undefined) {
        if (localCode !== undefined && !library.artifact.policyId) return fail("A coded producer requires an owning policy identity.", concept.location, "publication-producer-profile-identity-missing");
        const operands = [bmi.weight, bmi.height].map(ref => {
          const dependency = declarations.lookupConcept(library.sourceIdentity, ref, bmi.location);
          if (dependency.kind !== "hit") return fail("A BMI operand cannot resolve.", bmi.location, "publication-reference-resolution");
          if (dependency.node.shapeReduction === undefined) return fail("BMI requires explicitly selected Record operands.", bmi.location, "publication-bmi-operand-unsupported");
          const prepared = prepare(dependency.library, dependency.node);
          if (prepared?.valueType !== "Quantity") return fail("BMI requires Quantity-valued publications.", bmi.location, "publication-bmi-operand-unsupported");
          return prepared.identity;
        }) as [QualifiedConceptIdentity, QualifiedConceptIdentity];
        const anchor = declarations.lookupConcept(library.sourceIdentity, bmi.validity, bmi.location);
        const index = anchor.kind === "hit" ? operands.findIndex(operand => operand.key === anchor.identity.key) : -1;
        if (index < 0) return fail("BMI validity must name one of its two operands.", bmi.location, "publication-bmi-validity-operand");
        producer = Object.freeze({ kind: "bodyMassIndex", producerId: `crl:producer:v1:${encodeURIComponent(JSON.stringify([...portableTuple, ["bodyMassIndex", 0]]))}`,
          operands: Object.freeze(operands), validityOperand: index as 0 | 1 });
      }
      const descriptor: PublicationDescriptor = Object.freeze({ identity: hit.identity, conceptId, title: concept.name,
        ...(localCode === undefined ? {} : { localCode, localContributorId: `${conceptId}/local`,
          ...(library.artifact.policyId === undefined ? {} : { profileUrl: caseFeatureUrlFromPolicyId(base!, library.artifact.localDomainId ?? library.artifact.policyId, concept.name) }) }),
        resourceType: "Observation", valueType: concept.valueTypes[0] as PublicationValueType, valueElement: "value",
        selector: Object.freeze({ kind: "mostRecent", equalTime: concept.shapeReduction!.equalTime }),
        ...(valueDomain === undefined ? {} : { valueDomain }), ...(producer === undefined ? {} : { producer }),
        ...(answerOptions === undefined ? {} : { answerOptions }),
        ...(sources.length === 0 ? {} : { sources: Object.freeze(sources) }),
      });
      byIdentity.set(hit.identity.key, descriptor);
      return descriptor;
    } catch (error) {
      const item = error as CRLError;
      if (item.type !== "Validation") throw error;
      rejected.set(hit.identity.key, item);
      diagnostics.push(item);
      return undefined;
    } finally { visiting.delete(hit.identity.key); }
  };
  // REFACTOR:grounded (#320, plan595): prepared closures reject old BMI even when no publication was declared.
  for (const library of declarations.getLibraries()) for (const concept of library.ast.statements) {
    if (concept.type !== "Concept") continue;
    const retirement = bmiRetirementReason(concept);
    if (retirement !== undefined) {
      const item = diagnostic(`${library.libraryName} (${library.sourceIdentity}): ${retirement}`, concept.location, "emit-bmi-form-retired");
      diagnostics.push(item);
      const hit = declarations.lookupConcept(library.sourceIdentity, concept.name, concept.location);
      if (hit.kind === "hit") rejected.set(hit.identity.key, item);
    }
  }
  // Establish every retirement before recursive preparation, independent of declaration order.
  for (const library of declarations.getLibraries()) for (const concept of library.ast.statements) {
    if (concept.type !== "Concept") continue;
    if (concept.shapeReduction !== undefined && concept.__publication === undefined) prepare(library, concept);
  }
  return Object.freeze({
    declarations,
    diagnostics: Object.freeze(diagnostics),
    warnings: Object.freeze(warnings),
    descriptors: Object.freeze([...byIdentity.values()]),
    get: (key: string): PublicationDescriptor | undefined => byIdentity.get(key),
    lookup(fromSourceIdentity: string, ref: ReferenceName, location?: Location): PublicationLookup {
      const hit = declarations.lookupConcept(fromSourceIdentity, ref, location);
      if (hit.kind !== "hit") return { kind: "error", diagnostic: diagnostic(`Publication reference cannot resolve: ${hit.kind}.`, location, "publication-reference-resolution") };
      const error = rejected.get(hit.identity.key);
      if (error !== undefined) return { kind: "error", diagnostic: error };
      const descriptor = byIdentity.get(hit.identity.key);
      return descriptor === undefined ? { kind: "legacy" } : { kind: "publication", descriptor };
    },
  });
}

/** Single raw AST entry; layered callers must pass the original prepared program instead. */
export function prepareSingleLibraryPublication(
  ast: CRL,
  artifact: PublicationArtifactIdentity,
  sourceIdentity = ast.library.name,
  packageIdentity?: PublicationPackageIdentity,
): PublicationProgram {
  return preparePublicationProgram(createPublicationContext({
    libraries: [{ sourceIdentity, ast, artifact,
      ...(packageIdentity === undefined ? {} : { packageIdentity }),
    }],
    resolveLibrary: () => ({ kind: "not-visible", detail: "single-library-entry" }),
  }));
}

export interface PublicationEmitScope {
  readonly program: PublicationProgram;
  readonly fromSourceIdentity: string;
  readonly renderedSourceByLibrary: ReadonlyMap<string, string>;
  publicTarget(identityKey: string): { readonly libraryName: string; readonly define: string } | undefined;
}

/** Call only in a Boolean operand position. A record reference elsewhere remains a record. */
export function publicationBooleanRead(recordExpression: string): string {
  return `FHIRHelpers.ToBoolean((${recordExpression}).value as FHIR.boolean)`;
}

/** REFACTOR:grounded (#320, plan587): local and projected measurements share wire validation. */
export function publicationResourceError(descriptor: PublicationDescriptor, resource: Record<string, unknown>):
  { kind: "error"; code: string; message: string } | undefined {
  const fail = (code: string, message: string): { kind: "error"; code: string; message: string } =>
    ({ kind: "error", code, message: descriptor.conceptId + ": " + message });
  if (resource.resourceType !== "Observation")
    return fail("publication-invalid-resource", "Expected an Observation candidate.");
  if (!PUBLICATION_OBSERVATION_STATUSES.some((status) => status === resource.status))
    return fail("publication-invalid-status", "Expected a present, valid FHIR Observation status.");
  if (resource.status === "entered-in-error" || resource.status === "cancelled")
    return fail("publication-invalidated-record", "Explicitly invalidated or cancelled candidates need an authored eligibility policy.");
  const choice = `value${descriptor.valueType === "boolean" ? "Boolean" : descriptor.valueType}`;
  const value = resource[choice];
  if (Object.keys(resource).some((key) => /^_?value[A-Z]/.test(key) && key !== choice &&
      !(descriptor.valueType === "boolean" && key === "_valueBoolean")) ||
      (value != null && (descriptor.valueType === "boolean" ? typeof value !== "boolean"
        : typeof value !== "object" || Array.isArray(value))))
    return fail("publication-invalid-value", `A present answer must be a FHIR ${descriptor.valueType}; absence remains unknown.`);
  if (descriptor.valueType === "Quantity") {
    const quantity = readPublicationQuantity(value);
    if (quantity.kind === "error") return fail(quantity.code, quantity.message);
  }
  if (Object.keys(resource).some((key) => /^_?effective[A-Z]/.test(key) && key !== "effectiveDateTime" && key !== "_effectiveDateTime") ||
      (resource.effectiveDateTime != null && typeof resource.effectiveDateTime !== "string"))
    return fail("publication-invalid-validity-choice", "This publication accepts effectiveDateTime or absent validity.");
}

/** Observable resource violations are errors, not missing answers. The selector stays opaque. */
export function adaptPublicationCandidate<T extends Record<string, unknown>>(
  descriptor: PublicationDescriptor,
  resource: T,
): { kind: "candidate"; candidate: PublicationCandidate<T> } | { kind: "error"; code: string; message: string } {
  const fail = (code: string, message: string): { kind: "error"; code: string; message: string } =>
    ({ kind: "error", code, message: `${descriptor.conceptId}: ${message}` });
  if (!hasLocalPublicationContribution(descriptor)) return fail("publication-no-local-contributor", "This publication has no local answer representation.");
  const violation = publicationResourceError(descriptor, resource);
  if (violation !== undefined) return violation;
  const identity = typeof resource.id === "string" && resource.id.trim() !== "" ? `Observation/${resource.id}` : undefined;
  return { kind: "candidate", candidate: {
    key: identity ?? "Observation/<missing-id>",
    contributorId: descriptor.localContributorId,
    arm: "local",
    resource,
    ...(identity === undefined ? {} : { retrievedInputIdentity: identity }),
    ...(typeof resource.effectiveDateTime === "string" ? { validity: resource.effectiveDateTime } : {}),
  } };
}

/** Compatibility name for the first Boolean slice; delegates to the descriptor's typed adapter. */
export function adaptBooleanPublicationCandidate<T extends Record<string, unknown>>(
  descriptor: PublicationDescriptor, resource: T,
): ReturnType<typeof adaptPublicationCandidate<T>> {
  return adaptPublicationCandidate(descriptor, resource);
}
