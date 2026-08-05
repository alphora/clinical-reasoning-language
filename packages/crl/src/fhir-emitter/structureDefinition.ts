/**
 * CRL decision case-feature concept → FHIR `StructureDefinition` (case-feature
 * profile) emit.
 *
 * Per collected case-feature concept (a `code is` / LocalSource concept reached by
 * the recursive `code is` closure of a decision `when` condition — the
 * LocalSource-always-boolean rule: every `code is` concept is a boolean case
 * feature regardless of declared value type), emit ONE `StructureDefinition`
 * constraining `Observation` — a CPG publishable case feature. The PA app's
 * questionnaire submits an instance of this profile to assert the local-source
 * boolean determination.
 *
 * Reference shape verified against the DTR
 * `aslp-paa-comorbid-screening-casefeature.json` example. Deviations from that
 * reference are deliberate and commented (the `executable` knowledgeCapability is
 * DROPPED — we emit no run-time forms).
 *
 * Anti-drift contracts:
 *   - The collected set comes from the per-decision-condition recursive `code is`
 *     closure (`caseFeatureCollection.collectCodeIsConceptsInInferenceOrder`,
 *     unioned per source in `closureOrchestrator.collectCaseFeatures`) — the SAME
 *     single source the action-level `input[]` resolver consumes, so an emitted SD
 *     and the `action.input` that addresses it are the same set by construction.
 *     The `cpg-featureExpression` then points at the policy's `-LocalSource`
 *     Library (where the `code is` define lives), NOT the Interface re-export.
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
import { pascalCaseName, policyIdBase, rawSlug, uniqueCapSlug } from "./slug";
import {
  cpgCaseFeatureExtensions,
  isPublishablePlus,
} from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource } from "./types";

// These CPG extension URLs (in types.ts) + this profile canonical + the
// Observation differential shape below were VERIFIED against the DTR reference
// `aslp-paa-comorbid-screening-casefeature.json` (the external verification
// source for the case-feature profile shape).
const CPG_CASEFEATURE_PROFILE =
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-publishablecasefeature";
const OBSERVATION_SD = "http://hl7.org/fhir/StructureDefinition/Observation";
const PATIENT_SD = "http://hl7.org/fhir/StructureDefinition/Patient";
const SDC_DEFINITION_EXTRACT_VALUE =
  "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtractValue";

// Build an sdc-questionnaire-definitionExtractValue extension. On DTR/SDC
// QuestionnaireResponse extraction, it populates `<profileUrl>#<elementId>` from
// the fhirpath `expression` (evaluated with `%resource` = the QuestionnaireResponse).
// Without it the extracted Observation's subject/effective are unset → an orphan
// out-of-context resource that downstream evaluation does not pick up.
function sdcExtractValue(profileUrl: string, elementId: string, expression: string) {
  return {
    url: SDC_DEFINITION_EXTRACT_VALUE,
    extension: [
      { url: "definition", valueCanonical: `${profileUrl}#${elementId}` },
      {
        url: "expression",
        valueExpression: { language: "text/fhirpath", expression },
      },
    ],
  };
}

/**
 * The case-feature StructureDefinition `id` for an interface concept name.
 * `uniqueCapSlug(rawSlug(<policyIdBase>-<conceptName>))` — the policy id +
 * concept-name slug, made TRUNCATION-collision-safe against the FHIR id 64-char
 * limit. NO `-casefeature` suffix: the locked truth-set example goldens
 * (example-{direct,bothrep,nested,semand,for-emit}) fix the case-feature SD id as
 * exactly `<policyId>-<conceptSlug>` (e.g. `example-bothrep-implanted-estrogen-pellets`).
 * The case-feature lives in its own `StructureDefinition/` resource bucket, so
 * dropping the suffix cannot collide with a decision/activity/recommendation id
 * (those are PlanDefinition/ActivityDefinition resources). Exported so the PlanDef
 * action `input` can reference the same canonical SHAPE.
 *
 * Uses `uniqueCapSlug` (not the bare-capping `slugify`) because case-feature
 * concept names are the LONGEST declaration names in the corpus: two distinct
 * concepts whose names agree past the ~64-char truncation boundary would collapse
 * to the same id AND (since `caseFeatureCanonicalUrl` reuses this id) the same
 * canonical url. `uniqueCapSlug` is a PURE function of the concept name, so the
 * two independent derivation sites — the SD's own `url` (line ~138) and the
 * PlanDefinition `action.input.profile` re-derivation in the closure orchestrator
 * — stay byte-equal by construction (design review Claude C1: a collision-only
 * scheme can't, because the input resolver sees one concept at a time and never
 * has the colliding set). Note we feed `rawSlug` (UNcapped) — feeding `slugify`
 * would truncate the discriminating tail before the hash could see it.
 */
export function caseFeatureId(metadata: CpgMetadata, conceptName: string): string {
  // #237/T1 — component-wise `rawSlug` (was whole-composite `rawSlug(`${base}-${name}`)`,
  // which collapses an empty-strip concept name's `"unnamed"` to a bare `policyIdBase`
  // = the Library id base, a latent collision). Per-part keeps one composition rule.
  return uniqueCapSlug(`${policyIdBase(metadata)}-${rawSlug(conceptName)}`);
}

/** The case-feature StructureDefinition canonical url for an interface concept. */
export function caseFeatureCanonicalUrl(metadata: CpgMetadata, conceptName: string): string {
  return `${metadata.canonicalBase}/StructureDefinition/${caseFeatureId(metadata, conceptName)}`;
}

/**
 * Emit ONE case-feature StructureDefinition for a LocalSource boolean interface
 * concept. The caller (closureOrchestrator) collects the eligible concept (a
 * `code is` concept reachable from a decision `when` condition, the LocalSource-
 * always-boolean rule) and supplies the resolved `code` (from
 * `lowerLocalCodes().localCodes`).
 *
 * `featureExpressionLibrarySuffix` is the #186 unified IDENTITY `S` of the
 * LocalSource library (the opaque hyphen-free PascalCase name, e.g.
 * `ExampleSemandLocalsource`) — where the concept's `code is` define lives — used
 * to build the `cpg-featureExpression.reference` canonical
 * (`libraryCanonicalUrl(metadata, S)`). The truth-set lane points the
 * featureExpression at the LocalSource Library (NOT the Interface re-export), so
 * the case-feature submission resolves the bare `code is` boolean retrieve.
 * REQUIRED + non-empty: the caller only invokes this once it has confirmed the
 * LocalSource Library is in the manifest. An empty identity would build a
 * ROOT-pointing reference (a silent dangling/wrong target) — fail fast instead.
 */
export function emitCaseFeatureStructureDefinition(
  conceptName: string,
  code: string,
  metadata: CpgMetadata,
  opts: EmitOptions,
  featureExpressionLibrarySuffix: string,
  // #198 (Option B) — the per-library local-domain BASE whose CodeSystem this
  // case-feature's code lives in. Defaults to the policy id (`metadata.name`) —
  // byte-identical to pre-#198 for a PRIMARY library. A SIBLING `code is` library
  // passes its disambiguated `<policyId>-<librarySlug>` so the emitted
  // `patternCodeableConcept.coding.system` byte-equals THAT sibling's local
  // CodeSystem url (not the primary's), matching the code the CQL lane lowered.
  localDomainId: string = metadata.name,
): { resource: EmittedResource | null; errors: CRLError[] } {
  if (featureExpressionLibrarySuffix === "") {
    throw new Error(
      `internal invariant violated: emitCaseFeatureStructureDefinition for "${conceptName}" was ` +
        `called with an empty featureExpressionLibrarySuffix. The case-feature featureExpression ` +
        `reference must resolve to the policy's LocalSource Library (where the \`code is\` define ` +
        `lives); the caller must confirm a \`localsource\` manifest entry before emitting any ` +
        `case-feature profile.`,
    );
  }
  const errors: CRLError[] = [];

  // F1 (impl-review) — defensive missing-code guard. The orchestrated path only
  // ever supplies a concept that HAS a lowered local `code is` (the collector
  // appends iff a code exists), so the orchestrator can never hit this. But this
  // function is exported + unit-tested, so a direct caller passing an empty/
  // undefined code must NOT silently emit an empty-code `patternCodeableConcept`
  // (a CodeableConcept with `code: ""` is a malformed, never-matching profile).
  // Raise a structured hard error and emit NO StructureDefinition instead.
  if (code === undefined || code === "") {
    errors.push({
      type: "Validation",
      kind: "emit-casefeature-missing-code",
      message: `Case-feature concept "${conceptName}" has no local \`code is\` code; a case-feature StructureDefinition requires a non-empty patternCodeableConcept code. (This is unreachable from the orchestrated recursive-collection path, which only collects concepts that have a lowered local code.)`,
    });
    return { resource: null, errors };
  }

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
  // `codesystem '<url>'` (one source of truth — the per-library local domain, #198).
  const system = localCodeSystemSystemUrl(metadata, localDomainId);

  // The featureExpression references the LocalSource library by canonical (where
  // the `code is` define lives); its `expression` is the bare concept name (a
  // `text/cql-identifier`).
  const featureExpressionCanonical = libraryCanonicalUrl(metadata, featureExpressionLibrarySuffix);

  const resource: Record<string, unknown> = {
    resourceType: "StructureDefinition",
    id,
    meta: { profile: [CPG_CASEFEATURE_PROFILE] },
    // CPG IG extensions (cpg-, NOT cqf-): knowledgeCapability (DROP `executable` —
    // no run-time forms), knowledgeRepresentationLevel `structured`, and the
    // featureExpression pointing at the LocalSource library's CQL identifier (the
    // bare `code is` define).
    extension: cpgCaseFeatureExtensions(level, {
      language: "text/cql-identifier",
      expression: conceptName,
      reference: featureExpressionCanonical,
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
          // sdc-questionnaire-definitionExtractValue: populate the EXTRACTED
          // Observation's subject from the QuestionnaireResponse (`%resource`)
          // so it is in-context (not an orphan) for downstream evaluation.
          extension: [sdcExtractValue(url, "Observation.subject", "%resource.subject")],
          id: "Observation.subject",
          path: "Observation.subject",
          min: 1,
          max: "1",
          mustSupport: true,
          type: [{ code: "Reference", targetProfile: [PATIENT_SD] }],
        },
        {
          // Effective time extracted from the QuestionnaireResponse.authored so
          // the extracted Observation carries a clinically-meaningful timestamp.
          extension: [sdcExtractValue(url, "Observation.effective[x]", "%resource.authored")],
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
function localCodeSystemSystemUrl(metadata: CpgMetadata, localDomainId: string = metadata.name): string {
  return localCodeSystemUrl(metadata.canonicalBase, localDomainId);
}

function defaultClock(): Date {
  return new Date();
}
