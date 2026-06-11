/**
 * CRL → FHIR Library emit (Todo 2a sub-lane).
 *
 * Wraps the existing CRL→CQL emit output (v2.2.6 `.cql` files) as a base
 * FHIR R4 Library resource. The Library is the bridge that gives the
 * `ActivityDefinition.dynamicValue.expression` CQL identifier the scope
 * to resolve against — `ActivityDefinition.library[0]` points at the
 * emitted Library, which carries the CQL bytes in `content[0]` and
 * declares the valueset identifiers referenced by the expression.
 *
 * Per `docs/cpg-ig-alignment.md` + plan v2.1 [060]:
 *   - The CPG IG has NO active Library profile (the cpg-shareable/computable/
 *     publishable-library FSH files are in `_unused-fsh/`). We emit base
 *     FHIR R4 Library without a CPG `meta.profile` claim.
 *   - `Library.type = #logic-library` (CodeableConcept from FHIR R4
 *     `library-type` valueset; CRL libraries contain CQL logic).
 *   - `Library.relatedArtifact[]` enumerates `depends-on` entries per
 *     ValueSet the library references, per Quality Measure IG Conformance
 *     Requirement 3.5 + CPG IG examples.
 *   - `Library.content[0]` references the sibling `.cql` file via
 *     `attachment.url` (relative path; consumers resolve against the
 *     containing FHIR Bundle / package).
 *
 * Slug / metadata pipeline mirrors Todo 1 (`valueSet.ts`): same
 * `slugify` + `capSlug` + `pascalCaseName` + metadata defaulting +
 * deterministic `clock` injection + empty-array omission rules.
 */

import type { CRLError } from "../types/errors";
import { capSlug, pascalCaseName, slugify } from "./slug";
import { isPublishablePlus } from "./types";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

const LIBRARY_TYPE_CS = "http://terminology.hl7.org/CodeSystem/library-type";
const LIBRARY_TYPE_CODE = "logic-library";

/**
 * Canonical URL the emitted Library claims (`Library.url`) AND the URL
 * an ActivityDefinition's `library[0]` references for that CRL library.
 * Both sides MUST byte-equal — this helper is the single source of truth.
 * Slug rule is `capSlug(slugify(libraryName))` (post-cap, FHIR id-safe).
 */
export function libraryCanonicalUrl(canonicalBase: string, libraryName: string): string {
  return `${canonicalBase}/Library/${capSlug(slugify(libraryName))}`;
}

/**
 * Emit one FHIR Library wrapping the CRL library's CQL output. The
 * `valueSetCanonicals` argument is the closure of ValueSet canonical
 * URLs the library references (concept `coded from` + activity `with`
 * resolved); caller threads it from the import-graph walk. Order is
 * preserved as-given; dedup happens at this layer so the caller can
 * pass through raw walk output.
 *
 * `cqlFileName` is the relative path the `content[0].attachment.url`
 * references — typically `<library-slug>.cql` for a sibling-file
 * arrangement, matching the CRL→CQL emit convention.
 */
export function emitLibrary(
  libraryName: string,
  metadata: CpgMetadata,
  valueSetCanonicals: ReadonlyArray<string>,
  cqlFileName: string,
  opts: EmitOptions = {},
): {
  resource: EmittedResource | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  const librarySlug = slugify(libraryName);

  if (/[^\x00-\x7F]/.test(libraryName)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Library "${libraryName}" contains non-ASCII characters which are stripped from the FHIR id (slug: "${librarySlug}"). Rename or transliterate for a meaningful id.`,
    });
  }

  const id = capSlug(librarySlug);
  const computableName = pascalCaseName(librarySlug);

  // Title defaults to the CRL library name (per-library identity), NOT the
  // package-level metadata.title — round-2 gpt55 I1: a single closure with
  // multiple Libraries would otherwise share a title. `metadata.title`
  // describes the project; the per-Library title describes the library.
  const title = libraryName;
  const description = metadata.description || libraryName;
  if (!description) {
    errors.push({
      type: "Validation",
      kind: "missing-description",
      message: `Library "${libraryName}" has no description (library name and package.json description both empty)`,
    });
    return { resource: null, errors, unmatched };
  }

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const url = libraryCanonicalUrl(metadata.canonicalBase, libraryName);

  const resource: Record<string, unknown> = {
    resourceType: "Library",
    id,
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
    type: {
      coding: [
        {
          system: LIBRARY_TYPE_CS,
          code: LIBRARY_TYPE_CODE,
        },
      ],
    },
  };

  // Δ13-style empty-array omission carries forward from Todo 1.
  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  // relatedArtifact: depends-on per unique ValueSet canonical, preserving
  // first-seen order so output is deterministic.
  const seen = new Set<string>();
  const relatedArtifact: Array<Record<string, unknown>> = [];
  for (const canonical of valueSetCanonicals) {
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    relatedArtifact.push({ type: "depends-on", resource: canonical });
  }
  if (relatedArtifact.length > 0) resource.relatedArtifact = relatedArtifact;

  resource.content = [
    {
      contentType: "text/cql",
      url: cqlFileName,
    },
  ];

  return {
    resource: {
      resourceType: "Library",
      relativePath: `Library/${id}.json`,
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
 * Closure-level wrapper. Emits one Library per CRL library in the
 * closure. Slug collision detection mirrors Todo 1's `emitValueSets-
 * ForLibrary` (skip both colliding entries; emit error).
 */
export function emitLibrariesForClosure(
  libraries: ReadonlyArray<{
    libraryName: string;
    valueSetCanonicals: ReadonlyArray<string>;
    cqlFileName: string;
  }>,
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

  // Collision detection on the capped library slug.
  const slugMap = new Map<string, string[]>();
  for (const lib of libraries) {
    const id = capSlug(slugify(lib.libraryName));
    const existing = slugMap.get(id) ?? [];
    existing.push(lib.libraryName);
    slugMap.set(id, existing);
  }

  for (const [id, names] of slugMap) {
    if (names.length > 1) {
      errors.push({
        type: "Validation",
        kind: "slug-collision",
        message: `Slug collision on FHIR Library id "${id}" between libraries: ${names.map((n) => `"${n}"`).join(", ")}. Rename one of the CRL libraries.`,
      });
    }
  }

  for (const lib of libraries) {
    const id = capSlug(slugify(lib.libraryName));
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } = emitLibrary(
      lib.libraryName,
      metadata,
      lib.valueSetCanonicals,
      lib.cqlFileName,
      opts,
    );
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
