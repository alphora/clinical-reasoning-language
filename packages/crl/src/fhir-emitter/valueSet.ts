/**
 * CRL Terminology → FHIR `cpg-shareableValueSet` resource emit.
 *
 * Per Todo-1-discussion-057:
 *   - Δ5 — Slug collision: emitValueSetClosure (the per-library entry
 *     point) detects collisions by accumulating slugs across terminologies
 *     in the closure; emit fails with `kind: "slug-collision"`.
 *   - Δ6 — Non-ASCII slug fallback: when slugify returns "unnamed" from
 *     a non-empty CRL terminology name, emit a `non-ascii-slug-fallback`
 *     warning so authors notice.
 *   - Δ8 — `opts.clock` deterministic timestamp injection.
 *   - Δ13 — `useContext` / `jurisdiction` / `contact` omitted from emitted
 *     JSON when empty (cleaner output, no validator confusion).
 *   - Δ1 — `description` defaults to library name when metadata's is empty.
 *     `title` same.
 *
 * The wrapping ValueSet acts as a thin local handle pointing at the
 * source canonical (VSAC/NLM/etc.) when the CRL terminology body is
 * `valueset is <URL>`. When the body is `system is <URL>` + `code is X`
 * lines, the resource carries those codes inline under
 * `compose.include[0].concept[]`.
 */

import type { Terminology, TerminologyBodyLine, TerminologyValueset } from "../ast/types";
import type { CRLError } from "../types/errors";

import { pascalCaseName, slugify, valueSetIdFromPolicyId, valueSetUrl } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

// #104: ValueSet lifecycle profiles live in the CRMI IG (uv/crmi); consumers add
// hl7.fhir.uv.crmi to their IG deps alongside CPG. CRMI capability profiles are
// ADDITIVE (shareable → +computable → +publishable) — see crmiCapabilityProfiles.

// #237/T1 — the single exported ValueSet id helper (resource body + collision map
// both call THIS). Collision-safe via `uniqueCapSlug` over the component-wise
// `rawSlug` composite; the ValueSet `url` derives from this id, so id↔url stay
// byte-equal.
export function valueSetId(metadata: CpgMetadata, terminologyName: string): string {
  // Delegates to the shared `slug.ts` composition so the FHIR `ValueSet.id`/`url` and the CQL `valueset '<url>'`
  // cannot drift (#189 functional-VS slice). Byte-identical to the prior inline form for every existing id.
  return valueSetIdFromPolicyId(metadata.name, terminologyName);
}

/**
 * Emit one cpg-shareableValueSet from a single CRL Terminology.
 *
 * Returns `{resource, errors, unmatched}`. `resource` is null when a hard
 * error (slug collision is handled at the closure level, not here; this
 * emitter's only hard error is `missing-description` when metadata and
 * library name are both empty).
 */
export function emitValueSet(
  terminology: Terminology,
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

  // R1 — id/url BASE is the policy id (`policyIdBase(metadata)`); the human
  // library-name slug remains the source of the computable `name`/`title` only.
  const librarySlug = slugify(libraryName);
  const terminologySlug = slugify(terminology.name);

  // Δ6 — warn whenever the CRL name contains non-ASCII codepoints,
  // not only when slugify fully falls back to "unnamed". Partial-strip
  // cases (e.g. "高血圧 Codes" → "codes") silently lose author intent
  // and deserve the same warning surface.
  if (/[^\x00-\x7F]/.test(terminology.name)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Terminology "${terminology.name}" contains non-ASCII characters which are stripped from the FHIR id (slug: "${terminologySlug}"). Rename or transliterate for a meaningful id.`,
      line: terminology.location?.start.line,
      column: terminology.location?.start.column,
    });
  }

  // #189 piece 3 — a PURE single-reference terminology (`valueset is <url>`, no system/code lines) emits a
  // self-contained membership STUB at the DECLARED canonical, so the FHIR ValueSet resolves at the url the CQL
  // `valueset` decl already binds. FHIR requirement (verified against ecQM QICore external VSs, 2026-08-24):
  // `url` = the declared canonical verbatim; `id` = its LAST path segment (the OID / slug tail — a legal FHIR id,
  // dots allowed), consistent so the resource resolves by canonical AND by `ValueSet/<id>.json`. Our stub
  // CONVENTION: one per-VS code (the id) under a dedicated `reference-vs-stub` CodeSystem + expansion +
  // `experimental=true` (a REAL value set is `experimental=false` with real content; packaging swaps the real
  // content in at the same url at package/runtime and drops the experimental stub).
  const refLines = terminology.body.filter((l): l is TerminologyValueset => l.type === "TerminologyValueset");
  const isPureReference =
    refLines.length === 1 && terminology.body.every((l) => l.type === "TerminologyValueset");
  let referenceStub: { url: string; id: string; compose: { include: Array<Record<string, unknown>> } } | null = null;
  if (isPureReference) {
    const declaredUrl = refLines[0].valuesetName;
    const refId = declaredUrl.split("/").filter(Boolean).pop() ?? "";
    // Apply the stub model ONLY to a proper canonical whose last path segment is a legal FHIR id (an http(s)
    // canonical like `.../ValueSet/<oid>` or `.../ValueSet/<slug>`). A URN / placeholder (e.g.
    // `urn:example:placeholder`) has no FHIR-id-legal tail → fall back to the pre-existing pointer emission (our
    // slug id/url), unchanged — it is not a resolvable reference the stub could stand in for.
    if (/^[A-Za-z0-9.-]{1,64}$/.test(refId)) {
      referenceStub = {
        url: declaredUrl,
        id: refId,
        compose: { include: [{ system: `${metadata.canonicalBase}/CodeSystem/reference-vs-stub`, concept: [{ code: refId }] }] },
      };
    }
  }

  // #237/T1 — one exported id helper, collision-safe via `uniqueCapSlug` over the component-wise `rawSlug`
  // composite (for an INSTANTIATED VS the `url` derives from `id`, so id↔url stay byte-equal). A reference stub
  // instead takes id/url from the declared canonical (above).
  const id = referenceStub ? referenceStub.id : valueSetId(metadata, terminology.name);
  const computableName = pascalCaseName(`${librarySlug} ${terminologySlug}`);

  const title = metadata.title || libraryName;
  const description = metadata.description || libraryName;
  if (!description) {
    errors.push({
      type: "Validation",
      kind: "missing-description",
      message: `ValueSet for terminology "${terminology.name}" has no description (library name and package.json description both empty)`,
      line: terminology.location?.start.line,
      column: terminology.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const url = referenceStub ? referenceStub.url : valueSetUrl(metadata.canonicalBase, metadata.name, terminology.name);

  const compose = referenceStub ? referenceStub.compose : buildCompose(terminology.body, terminology, unmatched);

  // #189 functional-VS slice — a pre-computed `expansion` for an ENUMERATED VS (system+concept includes), so the
  // `$apply` terminology provider evaluates membership from the expansion directly rather than falling back to
  // `compose` (which it WARNS "may produce incorrect results" — probe-verified 2026-08-24). A reference
  // (`{valueSet:[url]}`) include is not enumerated → contributes nothing → a pure-reference VS emits no expansion.
  const expansionContains = compose.include.flatMap((inc) => {
    const system = (inc as { system?: string }).system;
    const concepts = (inc as { concept?: Array<{ code: string }> }).concept;
    if (system === undefined || concepts === undefined) return [];
    return concepts.map((c) => ({ system, code: c.code }));
  });

  const resource: Record<string, unknown> = {
    resourceType: "ValueSet",
    id,
    meta: { profile: crmiCapabilityProfiles("valueset", level) },
    // cqf-knowledgeCapability is mustSupport on the CRMI shareable ValueSet
    // profile. No representationLevel — a value set is terminology, not logic.
    extension: knowledgeExtensions(level),
    url,
    // version: CRMI requires `version` (1..1) at the shareable floor; sourced
    // from the npm package (authoritative SoT).
    version: metadata.version,
    name: computableName,
    title,
    status: metadata.status,
    // #189 piece 3 — a reference STUB is `experimental=true` (authoring/test scaffolding, swapped for the real VS
    // at package/runtime); an instantiated/own VS keeps the authored package metadata.
    experimental: referenceStub ? true : metadata.experimental,
    // date: CRMI requires `date` only at publishable+ — omitted below that.
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    compose,
  };

  if (expansionContains.length > 0) {
    resource.expansion = {
      timestamp: (opts.clock ?? defaultClock)().toISOString(),
      contains: expansionContains,
    };
  }

  // Δ13 — omit empty arrays from JSON.
  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "ValueSet",
      relativePath: `ValueSet/${id}.json`,
      resource,
      sourceKind: "Terminology",
      sourceName: terminology.name,
      ...(terminology.location ? { location: terminology.location } : {}),
    },
    errors,
    unmatched,
  };
}

function defaultClock(): Date {
  return new Date();
}

/**
 * Build `ValueSet.compose` from the terminology body lines. Multiple
 * lines accumulate into multiple `include[]` entries (Δ-G2 mixed-body
 * support). Empty body emits an empty `include[]` and an `empty-
 * terminology` UnmatchedReference for the caller to surface.
 */
function buildCompose(
  body: TerminologyBodyLine[],
  terminology: Terminology,
  unmatched: UnmatchedReference[],
): { include: Array<Record<string, unknown>> } {
  const include: Array<Record<string, unknown>> = [];
  let lastSystem: string | null = null;

  if (body.length === 0) {
    unmatched.push({
      kind: "empty-terminology",
      text: terminology.name,
      line: terminology.location?.start.line,
      column: terminology.location?.start.column,
    });
    return { include };
  }

  for (const line of body) {
    if (line.type === "TerminologyValueset") {
      include.push({ valueSet: [line.valuesetName] });
      lastSystem = null;
    } else if (line.type === "TerminologySystem") {
      // Start a new include entry rooted at this system. Subsequent
      // `code is` lines accumulate under it.
      include.push({ system: line.system, concept: [] });
      lastSystem = line.system;
    } else if (line.type === "TerminologyCode") {
      if (lastSystem === null) {
        // `code is` with no preceding `system is` — already a CRL validator
        // error upstream; defensive skip here.
        continue;
      }
      const last = include[include.length - 1] as { concept?: Array<{ code: string }> };
      last.concept = last.concept ?? [];
      last.concept.push({ code: line.code });
    }
  }

  if (include.length === 0) {
    unmatched.push({
      kind: "empty-terminology",
      text: terminology.name,
      line: terminology.location?.start.line,
      column: terminology.location?.start.column,
    });
  }

  return { include };
}

/**
 * Δ5 — Closure-level wrapper. Emits ValueSets for all terminologies in
 * one CRL library; detects slug collisions across the whole list.
 */
export function emitValueSetsForLibrary(
  terminologies: Terminology[],
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

  // Round-2 (gpt55 C1 + gpt55-Δ11-cheap-invariant): detect collisions
  // on the CAPPED combined id, not the uncapped concatenation. Two
  // long library/terminology names that differ only past char 64 would
  // otherwise emit non-conformant non-unique ids.
  const slugMap = new Map<string, Terminology[]>();
  // R1 — id BASE is the policy id; the terminology-name slug is the suffix.
  for (const t of terminologies) {
    const id = valueSetId(metadata, t.name);
    const existing = slugMap.get(id) ?? [];
    existing.push(t);
    slugMap.set(id, existing);
  }

  for (const [id, ts] of slugMap) {
    if (ts.length > 1) {
      errors.push({
        type: "Validation",
        kind: "slug-collision",
        message:
          `Slug collision on FHIR id "${id}" between terminologies: ${ts.map((t) => `"${t.name}"`).join(", ")}. Rename one of the CRL declarations.`,
        line: ts[0]?.location?.start.line,
        column: ts[0]?.location?.start.column,
      });
    }
  }

  // Even with collisions, emit non-colliding ValueSets for partial
  // inspection. Caller's `success: false` already gates on errors.
  for (const t of terminologies) {
    const id = valueSetId(metadata, t.name);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } = emitValueSet(t, libraryName, metadata, opts);
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
