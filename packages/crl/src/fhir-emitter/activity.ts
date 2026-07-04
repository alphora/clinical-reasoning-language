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
 *   - activityTypeValue present (free-text): IGNORED (#181) — emit the
 *     ActivityDefinition without a dynamicValue and WITHOUT any
 *     `unmatched` entry (a free-text `with` carries no machine signal;
 *     routing it to `unmatched` would silently pin `success:false`).
 *   - both present: emit `malformed-activity-with` error (defensive —
 *     grammar shouldn't allow this but AST contract permits it).
 *   - neither present: emit without dynamicValue + no diagnostic.
 *
 * Slug / metadata pipeline mirrors Todo 1 (`valueSet.ts`).
 */

import type { Activity, ActivityWith } from "../ast/types";
import type { ReferenceName } from "../ast/types";
import { refDisplay } from "../ast/types";
import { cqlStringLiteral, escapeCqlString } from "../cql-emitter/cqlStrings";
import { REVIEW_ACTION_SYSTEM } from "../dispositions/categories";
import { resolveDeterminationLeaf } from "../dispositions/config";
import type { ResolvedOption } from "../dispositions/types";
import type { CRLError } from "../types/errors";

import {
  CPG_ACTIVITY_TYPE_CODE_SYSTEM,
  type CpgActivityProfile,
  lookupCpgActivityProfile,
} from "./cpgActivityProfiles";
import { libraryCanonicalUrl } from "./library";
import { capSlug, pascalCaseName, policyIdBase, slugify } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
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
 * R1 — slug rule is `capSlug(<policyIdBase>-<activitySlug>)`: the id BASE is the
 * policy id (`metadata.name`), the SUFFIX is the activity declaration-name slug.
 * Identical to what `emitActivityDefinition` uses for the resource id.
 * canonicalBase is assumed pre-normalized by the metadata loader (no trailing
 * slash).
 */
export function activityDefinitionCanonicalUrl(
  metadata: CpgMetadata,
  activityName: string,
): string {
  const id = capSlug(`${policyIdBase(metadata)}-${slugify(activityName)}`);
  return `${metadata.canonicalBase}/ActivityDefinition/${id}`;
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
  // #186 — the `library[]` Library IDENTITY `S`: the Interface re-export library's
  // unified `S` when the source emitted a `role:"interface"` re-export library,
  // else `undefined` (Root / cms `none` path — resolves to `policyIdBase`).
  // Threaded by the orchestrator so the `library[]` target is one source of truth
  // across decision/activity/recommendation.
  libraryReferenceSuffix: string | undefined = undefined,
  // #186 — whether this activity's `library[]` is the Interface re-export (the
  // decision-bearing split path). Was previously inferred by string-matching the
  // suffix `=== "interface"`; now the identity is an opaque `S`, so the
  // orchestrator passes the boolean directly. Drives the F4 terminology-`with`
  // guard below.
  isInterfaceScoped = false,
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

  // R1 — id BASE is the policy id; the activity-name slug is the SUFFIX.
  const id = capSlug(`${policyIdBase(metadata)}-${activitySlug}`);
  const computableName = pascalCaseName(`${librarySlug} ${activitySlug}`);

  // A configured PA determination (`<category>.<key>` in `crl.dispositions`) is customized ONLY on its
  // `dynamicValue` (below). Its `title`/`description`/`code` follow the SAME path as any other activity —
  // the stable activity name drives the id/name/url/title; the config LABEL surfaces at runtime on the
  // produced CommunicationRequest (`payload`), NOT on the artifact's title.
  const determination = opts.dispositionConfig?.configured
    ? resolveDeterminationLeaf(opts.dispositionConfig, activity.name)
    : undefined;

  // Impl-review I3: a bare `<category>` activity name is a determination ONLY when that category has exactly one
  // option; with ≠1 it silently falls through to a non-determination emit. Flag the ambiguous case so an author
  // who meant a determination (but whose category has multiple options) isn't silently mis-emitted with no coded
  // outcome — they must disambiguate with `<category>.<key>`.
  if (!determination && opts.dispositionConfig?.configured) {
    const sameCategory = opts.dispositionConfig.options.filter((o) => o.category === activity.name);
    if (sameCategory.length > 1) {
      errors.push({
        type: "Validation",
        kind: "disposition-ambiguous-category",
        message: `Activity "${activity.name}" names disposition category "${activity.name}", which has ${sameCategory.length} configured options — a bare category name resolves to a determination only when its category has exactly one option. Use "${activity.name}.<key>".`,
        line: activity.location?.start.line,
        column: activity.location?.start.column,
      });
    }
  }

  const title = activity.name;
  const description = activity.body.becauseClause?.rationale.trim() || activity.name;
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

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const url = activityDefinitionCanonicalUrl(metadata, activity.name);
  // #186 — `library[]` → the Interface re-export Library (its identity `S`) for a
  // decision-bearing split source, else the source-name-keeping Root (`undefined`).
  const libraryUrl = libraryCanonicalUrl(metadata, libraryReferenceSuffix);

  const doNotPerform = activity.body.request.doNotPerform === true;

  const resource: Record<string, unknown> = {
    resourceType: "ActivityDefinition",
    id,
    meta: { profile: [profile.profileUrl, ...crmiCapabilityProfiles("activitydefinition", level)] },
    // cqf-knowledgeCapability (mustSupport on the CRMI shareable AD profile) +
    // representationLevel `structured` (matches the cc-screening reference).
    extension: knowledgeExtensions(level, "structured"),
    url,
    // version: CRMI requires `version` (1..1) at the shareable floor; from the
    // npm package (authoritative). date: CRMI requires it only at publishable+.
    version: metadata.version,
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
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

  // F4 (impl-review) — guard the activity-`with`-terminology → Interface edge.
  // When this activity's `library[]` is rewired to the Interface re-export
  // (`isInterfaceScoped`, the decision-bearing split path)
  // AND its `with` clause references a TERMINOLOGY, the dynamicValue's CQL
  // identifier would resolve against the Interface library — but the Interface
  // re-exports CONCEPTS, not terminologies, so the reference dangles. This is a
  // deferred edge (the deliverable's activities are text dispositions with no
  // `with` terminology); guard it loudly rather than emit a dangling reference.
  // Do NOT solve the general case here.
  // Round-2 I1: exclude determinations here too — a determination never binds a terminology (its `with` is a
  // free-text narrative), so on the Interface split path it must fall through to the determination handling
  // below (which ignores a non-free-text `with`), NOT hard-error via this Interface-edge guard. Keeps the
  // determination's terminology-`with` behavior consistent between the direct and Interface-scoped paths.
  const withClause = activity.body.withClause;
  if (isInterfaceScoped && !determination && withClause?.terminologyReference !== undefined) {
    errors.push({
      type: "Validation",
      kind: "emit-activity-terminology-interface-unsupported",
      message:
        `activity "${activity.name}" references terminology "${refDisplay(withClause.terminologyReference)}" ` +
        "via `with`; terminology references from an Interface-scoped activity are not yet supported.",
      line: withClause.location?.start.line,
      column: withClause.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  // dynamicValue handling — assemble in emit order. A `with` clause lowers to EITHER a terminology-bound
  // dynamicValue (path per profile, via buildDynamicValue) OR a free-text narrative routed below. All
  // dynamicValue expressions the emitter authors are static CQL (`text/cql-expression`).
  const dynamicValues: Record<string, unknown>[] = [];
  // Impl-review I1: a determination's `with` is always a free-text narrative (→ `note.text` below); a
  // determination never binds a terminology, so SKIP the terminology-lowering path for it — otherwise a
  // determination whose `with` were a terminology ref would push a spurious
  // `unsupported-communication-with-terminology` (pinning success:false) AND still emit the determination, a
  // confusing half-state. For non-determinations, buildDynamicValue handles terminology (free-text → null).
  if (withClause && !determination) {
    const dvResult = buildDynamicValue(activity, withClause, profile, terminologyResolver);
    errors.push(...dvResult.errors);
    unmatched.push(...dvResult.unmatched);
    if (dvResult.entry) dynamicValues.push(dvResult.entry);
  }

  // A free-text `with` narrative (backtick text, not a terminology reference).
  const withNarrative =
    withClause && withClause.terminologyReference === undefined ? withClause.activityTypeValue : undefined;
  const isCommunication = activity.body.request.activityType === "CPGCommunicationRequest";

  if (determination && !isCommunication) {
    // Impl-review I2: a configured determination MUST be a CPGCommunicationRequest (also validated as
    // `disposition-request-type`). Defend the emit path so a leaf mis-authored as e.g. CPGServiceRequest never
    // gets CommunicationRequest dynamicValues (payload/note/reasonCode) written onto a non-CR ActivityDefinition
    // — fail loudly instead of emitting an invalid resource.
    errors.push({
      type: "Validation",
      kind: "disposition-request-type",
      message: `Configured determination "${activity.name}" must be a CPGCommunicationRequest, not ${activity.body.request.activityType}; no determination dynamicValue emitted.`,
      line: activity.location?.start.line,
      column: activity.location?.start.column,
    });
  } else if (determination) {
    // Configurable PA determinations (feature: configurable PA leaves) — the produced CommunicationRequest
    // (derived by the service from `kind`) carries the outcome three ways (R4 shape): the config LABEL is the
    // human message (`payload.contentString`); the `with` narrative is a supplementary `note.text`; and the
    // machine-readable PAS review-action Coding (+ the option's config reason Coding) is the `reasonCode`.
    // Retires the coded-HCR01 boundary — the X12 278 HCR01 outcome is now coded on the produced resource.
    dynamicValues.push(cqlDynamicValue("payload.contentString", cqlStringLiteral(determination.label)));
    if (withNarrative !== undefined) {
      dynamicValues.push(cqlDynamicValue("note.text", cqlStringLiteral(withNarrative)));
    }
    dynamicValues.push(cqlDynamicValue("reasonCode", reviewActionCql(determination)));
  } else if (isCommunication && withNarrative !== undefined) {
    // A plain (non-determination) CommunicationRequest activity: the `with` narrative IS the message body
    // (per the cqf sendmessage ActivityDefinition example; resolves #181 for CommunicationRequest).
    dynamicValues.push(cqlDynamicValue("payload.contentString", cqlStringLiteral(withNarrative)));
  }

  if (dynamicValues.length > 0) resource.dynamicValue = dynamicValues;

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

/** A `dynamicValue` entry setting `path` from the static CQL `expression`. */
function cqlDynamicValue(path: string, expression: string): Record<string, unknown> {
  return { path, expression: { language: "text/cql-expression", expression } };
}

/**
 * A CQL `FHIR.Coding` instance selector. Each FHIR primitive field MUST be constructed with its wrapper type
 * (`system: uri { value: '…' }`, NOT a bare `System.String`) — verified against cqf-fhir-cr's CQL engine (the bare
 * form fails translation: "Expected an expression of type 'uri', but found 'System.String'"). Matches the proven
 * cc-screening reference idiom (`Extension { url: uri { value: … } }`).
 */
function codingCql(system: string, code: string, display?: string): string {
  const parts = [
    `system: uri { value: '${escapeCqlString(system)}' }`,
    `code: code { value: '${escapeCqlString(code)}' }`,
  ];
  if (display !== undefined) parts.push(`display: string { value: '${escapeCqlString(display)}' }`);
  return `Coding { ${parts.join(", ")} }`;
}

/**
 * The INLINE static CQL expression that constructs the reasonCode CodeableConcept for a determination: the PAS
 * review-action Coding (X12 278 HCR01, `REVIEW_ACTION_SYSTEM`) + the option's config reason Coding when present.
 * Inline FHIR-instance construction needs no `codesystem` declaration (self-contained on the ActivityDefinition).
 */
function reviewActionCql(leaf: ResolvedOption): string {
  const codings = [codingCql(REVIEW_ACTION_SYSTEM, leaf.reviewActionCode, leaf.reviewActionDisplay)];
  if (leaf.code) {
    codings.push(codingCql(leaf.code.system, leaf.code.code));
  }
  return `CodeableConcept { coding: { ${codings.join(", ")} } }`;
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

  // Free-text branch — handled by the caller (emitActivityDefinition), which has the disposition context to
  // route it: a CommunicationRequest `with` narrative becomes `payload.contentString` (plain) or `note.text`
  // (determination); any other kind's free-text `with` is dropped (#181). Nothing to lower here; NOT routed to
  // `unmatched` (which would silently pin the whole emit's `success:false`).
  if (hasFreeText) {
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
  // #186 — the conditional `library[]` Interface IDENTITY `S` (see
  // emitActivityDefinition). `undefined` = Root / cms path.
  libraryReferenceSuffix: string | undefined = undefined,
  // #186 — whether `library[]` is the Interface re-export (drives the F4 guard).
  isInterfaceScoped = false,
): {
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const resources: EmittedResource[] = [];
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const base = policyIdBase(metadata);
  const slugMap = new Map<string, Activity[]>();
  for (const a of activities) {
    const id = capSlug(`${base}-${slugify(a.name)}`);
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
    const id = capSlug(`${base}-${slugify(a.name)}`);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } =
      emitActivityDefinition(
        a,
        libraryName,
        metadata,
        terminologyResolver,
        opts,
        libraryReferenceSuffix,
        isInterfaceScoped,
      );
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
