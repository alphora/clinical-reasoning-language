/**
 * CRL decision interface concept → FHIR `StructureDefinition` (case-feature
 * profile) emit.
 *
 * Per eligible interface concept (a decision/action-guard-referenced concept that
 * is a LocalSource determination whose value type resolves to boolean), emit ONE
 * `StructureDefinition` constraining `Observation` — a CPG publishable case
 * feature. The PA app's questionnaire submits an instance of this profile to
 * assert the local-source boolean determination.
 *
 * Reference shape verified against the DTR
 * `aslp-paa-comorbid-screening-casefeature.json` example. Deviations from that
 * reference are deliberate and commented (the `executable` knowledgeCapability is
 * DROPPED — we emit no run-time forms).
 *
 * Anti-drift contracts:
 *   - The eligible set + each concept's source layer come from
 *     `interfaceSurface(loweredAst)` (cql-emitter) — the SAME single source of
 *     truth the Interface re-export synthesis uses. A case-feature profile can
 *     therefore never address a concept the Interface does not re-export.
 *   - The `patternCodeableConcept` `code` comes from `lowerLocalCodes().localCodes`
 *     (keyed by concept name) — the SAME `localCodes` that drives the local
 *     CodeSystem `concept[].code`. `lowerLocalCodes` CLEARS `Concept.code`, so the
 *     code is NOT read from the raw AST.
 *   - The `patternCodeableConcept` `system` is `localCodeSystemUrl(canonicalBase,
 *     name)` EXACTLY — byte-equal with the CodeSystem `url` and the CQL
 *     `codesystem '<url>'`.
 *
 * Metadata pattern mirrors `emitLibrary` / `emitLocalCodeSystem`: same metadata
 * defaulting (`title`/`description` fall back), same publishable+ date-gating.
 */

import type { CRLError } from "../types/errors";

import { localCodeSystemUrl } from "../cql-emitter/lowerLocalCodes";
import { libraryCanonicalUrl } from "./library";
import { capSlugForSuffix, pascalCaseName, policyIdBase, slugify } from "./slug";
import {
  cpgCaseFeatureExtensions,
  isPublishablePlus,
} from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource } from "./types";

const CASEFEATURE_SUFFIX = "-casefeature";
// These CPG extension URLs (in types.ts) + this profile canonical + the
// Observation differential shape below were VERIFIED against the DTR reference
// `aslp-paa-comorbid-screening-casefeature.json` (the external verification
// source for the case-feature profile shape).
const CPG_CASEFEATURE_PROFILE =
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishablecasefeature";
const OBSERVATION_SD = "http://hl7.org/fhir/StructureDefinition/Observation";
const PATIENT_SD = "http://hl7.org/fhir/StructureDefinition/Patient";

/**
 * The case-feature StructureDefinition `id` for an interface concept name.
 * `capSlugForSuffix(slugify(<policyIdBase>-<conceptName>), "-casefeature")` —
 * the base (policy id + concept name) is capped to `64 - len("-casefeature")`,
 * then the suffix appended, so a long policy id / concept name can never truncate
 * the `-casefeature` suffix away (matching codeSystem.ts `-local`,
 * recommendation.ts `-recommendation`). Exported so the next slice's PlanDef
 * action `input` can reference the same canonical SHAPE.
 */
export function caseFeatureId(metadata: CpgMetadata, conceptName: string): string {
  const base = slugify(`${policyIdBase(metadata)}-${conceptName}`);
  return capSlugForSuffix(base, CASEFEATURE_SUFFIX);
}

/** The case-feature StructureDefinition canonical url for an interface concept. */
export function caseFeatureCanonicalUrl(metadata: CpgMetadata, conceptName: string): string {
  return `${metadata.canonicalBase}/StructureDefinition/${caseFeatureId(metadata, conceptName)}`;
}

/**
 * Emit ONE case-feature StructureDefinition for a LocalSource boolean interface
 * concept. The caller (closureOrchestrator) gates eligibility (LocalSource +
 * boolean) and supplies the resolved `code` (from `lowerLocalCodes().localCodes`).
 *
 * `interfaceLibrarySuffix` is the layer token of the Interface re-export library
 * (`"interface"`), used to build the `cpg-featureExpression.reference` canonical.
 * REQUIRED + non-empty: the caller (closureOrchestrator) only invokes this once it
 * has confirmed a `role:"interface"` manifest entry, so the suffix always resolves
 * to the `<policyId>-Interface` Library. An empty suffix would build a ROOT-pointing
 * reference (a silent dangling/wrong target) — fail fast instead.
 */
export function emitCaseFeatureStructureDefinition(
  conceptName: string,
  code: string,
  metadata: CpgMetadata,
  opts: EmitOptions,
  interfaceLibrarySuffix: string,
): { resource: EmittedResource | null; errors: CRLError[] } {
  if (interfaceLibrarySuffix === "") {
    throw new Error(
      `internal invariant violated: emitCaseFeatureStructureDefinition for "${conceptName}" was ` +
        `called with an empty interfaceLibrarySuffix. The case-feature featureExpression reference ` +
        `must resolve to the policy's Interface re-export Library; the caller must gate on a ` +
        `\`role:"interface"\` manifest entry before emitting any case-feature profile.`,
    );
  }
  const errors: CRLError[] = [];

  if (/[^\x00-\x7F]/.test(conceptName)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Case-feature concept "${conceptName}" contains non-ASCII characters which are stripped from the FHIR computable name. Rename or transliterate for a meaningful id.`,
    });
  }

  const id = caseFeatureId(metadata, conceptName);
  const url = caseFeatureCanonicalUrl(metadata, conceptName);
  const name = pascalCaseName(conceptName);
  // Per-concept identity for the human-facing fields (NOT the package title).
  // `description` is PER-CONCEPT — `metadata.description` is the PACKAGE blurb and
  // would leak onto every case-feature profile (the `title` is already per-concept).
  const title = conceptName;
  const description = `${conceptName} case feature determination`;

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);

  // The `code` system byte-equals the local CodeSystem url + the CQL
  // `codesystem '<url>'` (one source of truth — the policy-id-slugged local domain).
  const system = localCodeSystemSystemUrl(metadata);

  // The featureExpression references the Interface re-export library by canonical;
  // its `expression` is the bare concept name (a `text/cql-identifier`).
  const interfaceCanonical = libraryCanonicalUrl(metadata, interfaceLibrarySuffix);

  const resource: Record<string, unknown> = {
    resourceType: "StructureDefinition",
    id,
    meta: { profile: [CPG_CASEFEATURE_PROFILE] },
    // CPG IG extensions (cpg-, NOT cqf-): knowledgeCapability (DROP `executable` —
    // no run-time forms), knowledgeRepresentationLevel `structured`, and the
    // featureExpression pointing at the Interface library's CQL identifier.
    extension: cpgCaseFeatureExtensions(level, {
      language: "text/cql-identifier",
      expression: conceptName,
      reference: interfaceCanonical,
    }),
    url,
    version: metadata.version,
    name,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    kind: "resource",
    abstract: false,
    type: "Observation",
    baseDefinition: OBSERVATION_SD,
    derivation: "constraint",
    differential: {
      element: [
        { id: "Observation", path: "Observation" },
        {
          id: "Observation.code",
          path: "Observation.code",
          min: 1,
          max: "1",
          mustSupport: true,
          patternCodeableConcept: {
            coding: [{ system, code, display: conceptName }],
          },
        },
        {
          id: "Observation.value[x]",
          path: "Observation.value[x]",
          min: 1,
          max: "1",
          mustSupport: true,
          type: [{ code: "boolean" }],
        },
        {
          id: "Observation.subject",
          path: "Observation.subject",
          min: 1,
          max: "1",
          mustSupport: true,
          type: [{ code: "Reference", targetProfile: [PATIENT_SD] }],
        },
        {
          id: "Observation.effective[x]",
          path: "Observation.effective[x]",
          min: 1,
          max: "1",
          mustSupport: true,
          type: [{ code: "dateTime" }],
        },
      ],
    },
  };

  // Empty-array omission carries forward from the other lanes.
  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "StructureDefinition",
      relativePath: `StructureDefinition/${id}.json`,
      resource,
      sourceKind: "CaseFeature",
      sourceName: conceptName,
    },
    errors,
  };
}

/**
 * The local code domain system url — the policy-id-slugged
 * `<canonicalBase>/CodeSystem/<policyId>-local`. Re-derived here via
 * `localCodeSystemUrl` so the case-feature `patternCodeableConcept.coding.system`
 * byte-equals the emitted CodeSystem `url`.
 */
function localCodeSystemSystemUrl(metadata: CpgMetadata): string {
  return localCodeSystemUrl(metadata.canonicalBase, metadata.name);
}

function defaultClock(): Date {
  return new Date();
}
