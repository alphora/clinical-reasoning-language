/**
 * CRL Activity → FHIR `cpg-<lowercase>activity` ActivityDefinition emit
 * (Todo 2b sub-lane).
 *
 * Per plan v2.1 [060] + verified against published CPG IG
 * StructureDefinition JSONs:
 *   - `meta.profile[0]` claims the cpg-<lowercase>activity profile.
 *   - `kind` fixed per profile (table lookup).
 *   - `profile` (singular) fixed per profile → target Request profile
 *     canonical (the resource shape produced when the ActivityDefinition
 *     is applied).
 *   - `intent` fixed to "proposal".
 *   - `code.coding[0]` patterned (NOT fixed) to the activity-type code
 *     from `cpg-activity-type-cs`; emitter writes one Coding, consumers
 *     may add more.
 *   - `doNotPerform` required `1..1 MS`; always emitted as boolean.
 *   - `library[0]` points at the sibling FHIR Library (see `library.ts`)
 *     so the dynamicValue.expression has CQL scope.
 *   - `dynamicValue[0]` carries the `with` terminology binding when
 *     present; expression is `text/cql-identifier` with the local
 *     valueset name declared in the referenced Library.
 *
 * `with` handling per CRL grammar (`ActivityWith.terminologyReference?`
 * + `ActivityWith.activityTypeValue?`):
 *   - terminologyReference present: emit dynamicValue with the resolved
 *     CQL identifier (the quoted local name from the CQL library).
 *   - activityTypeValue present (free-text): emit
 *     `unsupported-with-text` UnmatchedReference for v0 across all
 *     profiles. Per plan v2.1 C2 disposition.
 *   - both present: emit `malformed-activity-with` error (defensive —
 *     grammar shouldn't allow this but AST contract permits it).
 *   - neither present: emit without dynamicValue + no diagnostic.
 *
 * Slug / metadata pipeline mirrors Todo 1 (`valueSet.ts`).
 */

import type { Activity, ActivityWith } from "../ast/types";
import type { ReferenceName } from "../ast/types";
import { refDisplay } from "../ast/types";
import type { CRLError } from "../types/errors";

import {
  CPG_ACTIVITY_TYPE_CODE_SYSTEM,
  type CpgActivityProfile,
  lookupCpgActivityProfile,
} from "./cpgActivityProfiles";
import { libraryCanonicalUrl } from "./library";
import { capSlug, pascalCaseName, slugify } from "./slug";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

/**
 * Resolves a CRL `with "Term"` (or `"Lib"."Term"`) reference to the
 * CQL identifier the dynamicValue expression should reference. The
 * resolver is caller-provided so tests can synthesize resolution
 * without instantiating the full project graph.
 *
 * Returns null when the terminology can't be found in the closure.
 */
export type TerminologyResolver = (termName: ReferenceName) => string | null;

// `library[0]` URL helper imported from `library.ts` — single source
// of truth so the ActivityDefinition's library reference byte-equals
// the emitted Library's `url`.

/**
 * Canonical URL the emitted ActivityDefinition claims (`ActivityDefinition.url`)
 * AND the URL a PlanDefinition action's `definitionCanonical` references
 * for that CRL activity (Todo 3). Both sides MUST byte-equal — this helper
 * is the single source of truth, preventing the same class of bug that
 * round-2 caught for Library URLs.
 *
 * Slug rule is `capSlug(<librarySlug>-<activitySlug>)`, identical to
 * what `emitActivityDefinition` uses for the resource id. canonicalBase
 * is assumed pre-normalized by the metadata loader (no trailing slash).
 */
export function activityDefinitionCanonicalUrl(
  canonicalBase: string,
  libraryName: string,
  activityName: string,
): string {
  const id = capSlug(`${slugify(libraryName)}-${slugify(activityName)}`);
  return `${canonicalBase}/ActivityDefinition/${id}`;
}

/**
 * Emit one cpg-<lowercase>activity ActivityDefinition from a single CRL
 * Activity. Mirrors `emitValueSet`'s envelope shape.
 */
export function emitActivityDefinition(
  activity: Activity,
  libraryName: string,
  metadata: CpgMetadata,
  terminologyResolver: TerminologyResolver,
  opts: EmitOptions = {},
): {
  resource: EmittedResource | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const profile = lookupCpgActivityProfile(activity.body.request.activityType);
  if (!profile) {
    errors.push({
      type: "Validation",
      kind: "unsupported-activity-token",
      message: `Activity "${activity.name}" uses unknown CRL token "${activity.body.request.activityType}" — no CPG IG profile mapping. Defensive (grammar allowlist shouldn't admit unknown tokens).`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  const librarySlug = slugify(libraryName);
  const activitySlug = slugify(activity.name);

  if (/[^\x00-\x7F]/.test(activity.name)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Activity "${activity.name}" contains non-ASCII characters which are stripped from the FHIR id (slug: "${activitySlug}"). Rename or transliterate for a meaningful id.`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
  }

  const id = capSlug(`${librarySlug}-${activitySlug}`);
  const computableName = pascalCaseName(`${librarySlug} ${activitySlug}`);

  const title = activity.name;
  const description = activity.body.becauseClause?.rationale.trim() || title;
  if (!description) {
    errors.push({
      type: "Validation",
      kind: "missing-description",
      message: `Activity "${activity.name}" has no description (becauseClause empty and title empty)`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  const date = (opts.clock ?? defaultClock)().toISOString();
  const url = activityDefinitionCanonicalUrl(metadata.canonicalBase, libraryName, activity.name);
  const libraryUrl = libraryCanonicalUrl(metadata.canonicalBase, libraryName);

  const doNotPerform = activity.body.request.doNotPerform === true;

  const resource: Record<string, unknown> = {
    resourceType: "ActivityDefinition",
    id,
    meta: { profile: [profile.profileUrl] },
    url,
    // `version` deliberately omitted — npm package owns the version.
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    date,
    publisher: metadata.publisher,
    description,
    library: [libraryUrl],
    kind: profile.kind,
    profile: profile.targetProfile,
    intent: "proposal",
    doNotPerform,
    code: {
      coding: [
        {
          system: CPG_ACTIVITY_TYPE_CODE_SYSTEM,
          code: profile.activityTypeCode,
        },
      ],
    },
  };

  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  // dynamicValue handling — only emit when the `with` clause has a
  // terminology reference AND the profile has a non-null dynamicValuePath.
  const withClause = activity.body.withClause;
  if (withClause) {
    const dvResult = buildDynamicValue(activity, withClause, profile, terminologyResolver);
    errors.push(...dvResult.errors);
    unmatched.push(...dvResult.unmatched);
    if (dvResult.entry) resource.dynamicValue = [dvResult.entry];
  }

  return {
    resource: {
      resourceType: "ActivityDefinition",
      relativePath: `ActivityDefinition/${id}.json`,
      resource,
      sourceKind: "Activity",
      sourceName: activity.name,
      ...(activity.location ? { location: activity.location } : {}),
    },
    errors,
    unmatched,
  };
}

function defaultClock(): Date {
  return new Date();
}

/**
 * Build the optional `dynamicValue[0]` entry for an activity, given its
 * `with` clause and the lookup-table profile. Returns the entry (or
 * null when nothing should emit) + any diagnostics this branch
 * produced.
 */
function buildDynamicValue(
  activity: Activity,
  withClause: ActivityWith,
  profile: CpgActivityProfile,
  terminologyResolver: TerminologyResolver,
): {
  entry: Record<string, unknown> | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const hasTermRef = withClause.terminologyReference !== undefined;
  const hasFreeText = withClause.activityTypeValue !== undefined;

  // Defensive — grammar shouldn't admit both, but the AST contract permits it.
  if (hasTermRef && hasFreeText) {
    errors.push({
      type: "Validation",
      kind: "malformed-activity-with",
      message: `Activity "${activity.name}" has BOTH terminologyReference and activityTypeValue on its with clause — only one is permitted. Skipping dynamicValue.`,
      line: withClause.location?.start.line,
      column: withClause.location?.start.column,
    });
    return { entry: null, errors, unmatched };
  }

  // Free-text branch — v0 deferral per plan v2.1.
  if (hasFreeText) {
    unmatched.push({
      kind: "unsupported-with-text",
      text: `${activity.body.request.activityType}: ${withClause.activityTypeValue}`,
      line: withClause.location?.start.line,
      column: withClause.location?.start.column,
    });
    return { entry: null, errors, unmatched };
  }

  // Terminology-reference branch.
  if (!hasTermRef) {
    // Neither set — no diagnostic, no entry. Defensive (grammar shouldn't
    // produce an empty with).
    return { entry: null, errors, unmatched };
  }

  const ref = withClause.terminologyReference as ReferenceName;

  // Profile has no IG-conformant slot — distinct kinds per activity
  // type so consumers can filter unambiguously.
  if (profile.dynamicValuePath === null) {
    const activityType = activity.body.request.activityType;
    const kind: UnmatchedReference["kind"] =
      activityType === "CPGCommunicationRequest"
        ? "unsupported-communication-with-terminology"
        : activityType === "CPGQuestionnaire"
          ? "unsupported-questionnaire-with"
          : "unresolved-terminology";
    unmatched.push({
      kind,
      text: `${activityType} with ${refDisplay(ref)}`,
      line: withClause.location?.start.line,
      column: withClause.location?.start.column,
    });
    return { entry: null, errors, unmatched };
  }

  const cqlIdentifier = terminologyResolver(ref);
  if (cqlIdentifier === null) {
    unmatched.push({
      kind: "unresolved-terminology",
      text: refDisplay(ref),
      line: withClause.location?.start.line,
      column: withClause.location?.start.column,
    });
    return { entry: null, errors, unmatched };
  }

  return {
    entry: {
      path: profile.dynamicValuePath,
      expression: {
        language: "text/cql-identifier",
        expression: cqlIdentifier,
      },
    },
    errors,
    unmatched,
  };
}

/**
 * Closure-level wrapper. Detects slug collisions on the capped combined
 * id (per Todo 1's pattern); skips both colliding activities + reports
 * `slug-collision` error.
 */
export function emitActivityDefinitionsForLibrary(
  activities: ReadonlyArray<Activity>,
  libraryName: string,
  metadata: CpgMetadata,
  terminologyResolver: TerminologyResolver,
  opts: EmitOptions = {},
): {
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const resources: EmittedResource[] = [];
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const librarySlug = slugify(libraryName);
  const slugMap = new Map<string, Activity[]>();
  for (const a of activities) {
    const id = capSlug(`${librarySlug}-${slugify(a.name)}`);
    const existing = slugMap.get(id) ?? [];
    existing.push(a);
    slugMap.set(id, existing);
  }

  for (const [id, list] of slugMap) {
    if (list.length > 1) {
      errors.push({
        type: "Validation",
        kind: "slug-collision",
        message: `Slug collision on FHIR ActivityDefinition id "${id}" between activities: ${list.map((a) => `"${a.name}"`).join(", ")}. Rename one of the CRL activities.`,
        line: list[0]?.location?.start.line,
        column: list[0]?.location?.start.column,
      });
    }
  }

  for (const a of activities) {
    const id = capSlug(`${librarySlug}-${slugify(a.name)}`);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } =
      emitActivityDefinition(a, libraryName, metadata, terminologyResolver, opts);
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
