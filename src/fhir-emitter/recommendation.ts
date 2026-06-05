/**
 * CRL Activity → cpg-recommendationdefinition PlanDefinition emit
 * (Todo 3, Recommendation lane).
 *
 * Per plan v3.2 [065]: each CRL `activity "X"` produces TWO FHIR
 * resources — a Recommendation PlanDef wrapping the ActivityDef + the
 * existing ActivityDef from Todo 2b. The Recommendation is the layer
 * that strategies and sub-decisions reference (Strategy →
 * Recommendation → Activity), satisfying the CPG IG profile-target
 * constraints.
 *
 * 1:1 wrapping for v0: each CRL `activity X` → 1 Recommendation
 * containing 1 wrapping action that `definitionCanonical`s the
 * sibling ActivityDef. The published cc-screening example uses 1:N
 * (one Recommendation wrapping 4 alternative activities with
 * `cpg-option-recommended` flags); CRL has no syntax for alternative
 * groups in v0, so 1:1 is the natural map. Documented as Drift A in
 * the fixture README.
 *
 * Recommendation profile: `[cpg-recommendationdefinition,
 * cpg-publishableplandefinition]`, type `eca-rule`. No `version`
 * field (per `feedback_no-version-on-emitted-artifacts` memory rule).
 * knowledgeCapability emits 3 (`shareable + computable + publishable`;
 * NOT `executable` per round-2 Gemini disposition — overclaim).
 *
 * Slug rule: `recommendation-id = capSlugForSuffix(<librarySlug>-
 * <activitySlug>, "-recommendation")`. The pre-cap base ≤ 49 chars
 * + 15-char suffix = ≤ 64 total. No cross-Activity-Recommendation
 * boundary collision (round-3 F1 fix).
 *
 * v0 collision detection scope: this wrapper detects only intra-kind
 * (Recommendation-vs-Recommendation) collisions. Cross-kind PlanDef
 * collisions (Recommendation id vs Decision id) are deferred to Todo 4
 * closure step per round-5 gpt55 C1.
 */

import type { Activity } from "../ast/types";
import type { CRLError } from "../types/errors";
import { libraryCanonicalUrl } from "./library";
import { activityDefinitionCanonicalUrl } from "./activity";
import { capSlug, capSlugForSuffix, pascalCaseName, slugify } from "./slug";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

const CPG_BASE = "http://hl7.org/fhir/uv/cpg/StructureDefinition";
const REC_PROFILES: readonly string[] = [
  `${CPG_BASE}/cpg-recommendationdefinition`,
  `${CPG_BASE}/cpg-publishableplandefinition`,
];
const KNOWLEDGE_CAPABILITY_EXT = `${CPG_BASE}/cpg-knowledgeCapability`;
const KNOWLEDGE_REPRESENTATION_EXT = `${CPG_BASE}/cpg-knowledgeRepresentationLevel`;
const PLAN_DEFINITION_TYPE_CS = "http://terminology.hl7.org/CodeSystem/plan-definition-type";
const ACTION_TYPE_CS = "http://terminology.hl7.org/CodeSystem/action-type";
const CPG_COMMON_PROCESS_CS = "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-common-process-cs";

const REC_SUFFIX = "-recommendation";

/**
 * EXPORTED helper. Single source of truth for Recommendation PlanDef
 * canonical URLs. Imported by `decision.ts` so the Strategy's
 * action.definitionCanonical → Recommendation reference byte-equals
 * the Recommendation's `url` (same anti-drift contract as Todo 2's
 * `libraryCanonicalUrl` and `activityDefinitionCanonicalUrl`).
 *
 * Not re-exported at the package root (parallel to the Todo 2
 * canonical-URL helper scoping).
 */
export function recommendationDefinitionCanonicalUrl(
  canonicalBase: string,
  libraryName: string,
  activityName: string,
): string {
  return `${canonicalBase}/PlanDefinition/${recommendationId(libraryName, activityName)}`;
}

function recommendationId(libraryName: string, activityName: string): string {
  const base = `${slugify(libraryName)}-${slugify(activityName)}`;
  return capSlugForSuffix(base, REC_SUFFIX);
}

/**
 * Emit one Recommendation PlanDef wrapping a single CRL Activity.
 * The wrapping action's `definitionCanonical` points at the sibling
 * ActivityDef (via Todo 2b's `activityDefinitionCanonicalUrl`).
 */
export function emitRecommendationDefinition(
  activity: Activity,
  libraryName: string,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): {
  resource: EmittedResource | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  if (/[^\x00-\x7F]/.test(activity.name)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Activity "${activity.name}" contains non-ASCII characters which are stripped from the Recommendation FHIR id. Rename or transliterate for a meaningful id.`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
  }

  const id = recommendationId(libraryName, activity.name);
  const computableName = pascalCaseName(
    `${slugify(libraryName)} ${slugify(activity.name)}${REC_SUFFIX}`,
  );

  const title = activity.name;
  const description = activity.body.becauseClause?.rationale.trim() || title;
  if (!description) {
    errors.push({
      type: "Validation",
      kind: "missing-description",
      message: `Recommendation for activity "${activity.name}" has no description (becauseClause and title both empty).`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  const date = (opts.clock ?? defaultClock)().toISOString();
  const url = recommendationDefinitionCanonicalUrl(metadata.canonicalBase, libraryName, activity.name);
  const libraryUrl = libraryCanonicalUrl(metadata.canonicalBase, libraryName);
  const activityUrl = activityDefinitionCanonicalUrl(
    metadata.canonicalBase,
    libraryName,
    activity.name,
  );

  const resource: Record<string, unknown> = {
    resourceType: "PlanDefinition",
    id,
    meta: { profile: REC_PROFILES.slice() },
    extension: [
      { url: KNOWLEDGE_CAPABILITY_EXT, valueCode: "shareable" },
      { url: KNOWLEDGE_CAPABILITY_EXT, valueCode: "computable" },
      { url: KNOWLEDGE_CAPABILITY_EXT, valueCode: "publishable" },
      { url: KNOWLEDGE_REPRESENTATION_EXT, valueCode: "structured" },
    ],
    url,
    // `version` deliberately omitted — npm package owns the version
    // (memory: feedback_no-version-on-emitted-artifacts).
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    date,
    publisher: metadata.publisher,
    description,
    type: {
      coding: [{ system: PLAN_DEFINITION_TYPE_CS, code: "eca-rule" }],
    },
    library: [libraryUrl],
    action: [
      {
        title,
        description,
        code: [
          {
            coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }],
          },
        ],
        type: {
          coding: [{ system: ACTION_TYPE_CS, code: "create" }],
        },
        groupingBehavior: "logical-group",
        // No `selectionBehavior` — vacuous on a 1:1 single-action
        // wrapping (round-4 Claude F7 + Gemini); re-introduce when
        // CRL grammar adds 1:N alternative-group syntax.
        // No `action.condition` — applicability lives on the parent
        // Decision's action; the Recommendation wrapper is
        // unconditional once selected.
        definitionCanonical: activityUrl,
      },
    ],
  };

  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "PlanDefinition",
      relativePath: `PlanDefinition/${id}.json`,
      resource,
    },
    errors,
    unmatched,
  };
}

function defaultClock(): Date {
  return new Date();
}

/**
 * Closure-level wrapper. Detects intra-Recommendation slug collisions
 * (two activities whose pre-capped bases agree). Skips both colliders
 * on collision. Cross-kind PlanDef collisions (Recommendation vs
 * Decision) are deferred to Todo 4 closure step.
 */
export function emitRecommendationDefinitionsForLibrary(
  activities: ReadonlyArray<Activity>,
  libraryName: string,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): {
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const resources: EmittedResource[] = [];
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const slugMap = new Map<string, Activity[]>();
  for (const activity of activities) {
    const id = recommendationId(libraryName, activity.name);
    const existing = slugMap.get(id) ?? [];
    existing.push(activity);
    slugMap.set(id, existing);
  }

  for (const [id, list] of slugMap) {
    if (list.length > 1) {
      errors.push({
        type: "Validation",
        kind: "slug-collision",
        message: `Slug collision on Recommendation PlanDef id "${id}" between activities: ${list.map((a) => `"${a.name}"`).join(", ")}. Rename one of the CRL activities.`,
        line: list[0]?.location?.start.line,
        column: list[0]?.location?.start.column,
      });
    }
  }

  for (const activity of activities) {
    const id = recommendationId(libraryName, activity.name);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } = emitRecommendationDefinition(
      activity,
      libraryName,
      metadata,
      opts,
    );
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}

// Suppress unused-import warning — capSlug is part of the slug API
// surface and we may need it in future closure-level work.
void capSlug;
