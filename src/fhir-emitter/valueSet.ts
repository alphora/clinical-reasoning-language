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

import type { Terminology, TerminologyBodyLine } from "../ast/types";
import type { CRLError } from "../types/errors";

import { capSlug, pascalCaseName, slugify } from "./slug";
import { isPublishablePlus } from "./types";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

// #104: shareable-valueset lifecycle profile moved from CPG STU1's uv/cpg
// namespace to CRMI IG (uv/crmi) in CPG 2.0.0. Consumers should add
// hl7.fhir.uv.crmi to their IG deps alongside the CPG package — CPG 2.0.0
// itself does NOT declare a CRMI dependency. CRMI 1.0.0: shareable profile
// requires `version` (1..1); publishable adds `date` (1..1).
const SHAREABLE_PROFILE_URL =
  "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-shareablevalueset";
const PUBLISHABLE_PROFILE_URL =
  "http://hl7.org/fhir/uv/crmi/StructureDefinition/crmi-publishablevalueset";

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

  // Round-2 (gpt55 C1): cap the COMBINED slug at 64 — slugify already
  // caps each component, but the concatenation can still exceed the
  // FHIR id limit.
  const id = capSlug(`${librarySlug}-${terminologySlug}`);
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
  const url = `${metadata.canonicalBase}/ValueSet/${id}`;

  const compose = buildCompose(terminology.body, terminology, unmatched);

  const resource: Record<string, unknown> = {
    resourceType: "ValueSet",
    id,
    meta: { profile: [publishable ? PUBLISHABLE_PROFILE_URL : SHAREABLE_PROFILE_URL] },
    url,
    // version: CRMI requires `version` (1..1) at the shareable floor; sourced
    // from the npm package (authoritative SoT).
    version: metadata.version,
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    // date: CRMI requires `date` only at publishable+ — omitted below that.
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    compose,
  };

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
  const librarySlug = slugify(libraryName);
  for (const t of terminologies) {
    const tSlug = slugify(t.name);
    const id = capSlug(`${librarySlug}-${tSlug}`);
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
    const tSlug = slugify(t.name);
    const id = capSlug(`${librarySlug}-${tSlug}`);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } = emitValueSet(t, libraryName, metadata, opts);
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
