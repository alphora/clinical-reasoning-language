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
 *   - The CPG IG has no active Library profile, but CRMI does — we claim
 *     the additive CRMI library lifecycle profiles (crmi-shareable/computable/
 *     publishable-library, up to the target capability) via
 *     `crmiCapabilityProfiles`. No CPG `meta.profile` claim. (The executable
 *     tier — crmi-executablelibrary — needs ELM and is out of scope; see #113.)
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
import { capSlug, capSlugForSuffix, pascalCaseName, policyIdBase, slugify } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

const LIBRARY_TYPE_CS = "http://terminology.hl7.org/CodeSystem/library-type";
const LIBRARY_TYPE_CODE = "logic-library";

/**
 * R1 — the FHIR Library `id` from the policy-id base + an optional id suffix
 * (the layer slug for split entries; empty for the source-name-keeping Root).
 * Single source of truth so the Library id, its `url`, and every referrer's
 * `library[]` agree byte-for-byte.
 *
 * `idSuffix` is the already-slugified layer token (e.g. `"concepts"`,
 * `"asserted"`, `"inferred"`), or `""`/undefined for the Root. For a non-empty
 * suffix the combined id uses `capSlugForSuffix` (caps the base to
 * `64 - len("-<suffix>")`, then appends), so a long policy id can never truncate
 * the layer suffix away — mirroring codeSystem.ts (`-local`) and
 * recommendation.ts (`-recommendation`). The Root (empty suffix) is the bare
 * `capSlug(policyIdBase)`.
 */
export function libraryId(metadata: CpgMetadata, idSuffix = ""): string {
  const base = policyIdBase(metadata);
  return idSuffix ? capSlugForSuffix(base, `-${idSuffix}`) : base;
}

/**
 * Canonical URL the emitted Library claims (`Library.url`) AND the URL
 * an ActivityDefinition's `library[0]` references for that CRL library.
 * Both sides MUST byte-equal — this helper is the single source of truth.
 *
 * R1 — the id BASE is the policy id (`policyIdBase(metadata)`), NOT the human
 * library-name slug. `idSuffix` selects the split entry (Concepts/Asserted/…)
 * via the manifest role; empty = the source-name-keeping Root.
 */
export function libraryCanonicalUrl(metadata: CpgMetadata, idSuffix = ""): string {
  return `${metadata.canonicalBase}/Library/${libraryId(metadata, idSuffix)}`;
}

/**
 * Emit one FHIR Library wrapping the CRL library's CQL output. The
 * `dependsOnCanonicals` argument is the closure of canonical URLs the
 * library depends-on — author ValueSet canonicals (concept `coded from` +
 * activity `with` resolved) PLUS, since slice 4, the library's emitted local
 * CodeSystem url (the `code is` local domain). Caller threads it from the
 * import-graph walk. Order is preserved as-given; dedup happens at this layer
 * so the caller can pass through raw walk output.
 *
 * `cqlFileName` is the relative path the `content[0].attachment.url`
 * references — typically `<library-slug>.cql` for a sibling-file
 * arrangement, matching the CRL→CQL emit convention.
 */
export function emitLibrary(
  libraryName: string,
  metadata: CpgMetadata,
  dependsOnCanonicals: ReadonlyArray<string>,
  cqlFileName: string,
  opts: EmitOptions = {},
  // R1 — the policy-id id suffix for split entries (e.g. "concepts"); empty for
  // the source-name-keeping Root. Selects which Library id/url this entry claims.
  idSuffix = "",
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
      message: `Library "${libraryName}" contains non-ASCII characters which are stripped from the FHIR computable name (slug: "${librarySlug}"). Rename or transliterate for a meaningful id.`,
    });
  }

  // R1 — id/url BASE is the policy id; `librarySlug` remains the source of the
  // human-facing `name`/`title` (per-library identity, not the resource id).
  const id = libraryId(metadata, idSuffix);
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
  const url = libraryCanonicalUrl(metadata, idSuffix);

  const resource: Record<string, unknown> = {
    resourceType: "Library",
    id,
    meta: { profile: crmiCapabilityProfiles("library", level) },
    // cqf-knowledgeCapability (mustSupport on the CRMI shareable Library profile)
    // + representationLevel `structured`: the Library carries CQL SOURCE (a
    // `text/cql` attachment), which is structured-computable. `executable` is
    // reserved for compiled ELM.
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

  // relatedArtifact: depends-on per unique dependency canonical (author
  // ValueSets + the local CodeSystem), preserving first-seen order so output is
  // deterministic.
  const seen = new Set<string>();
  const relatedArtifact: Array<Record<string, unknown>> = [];
  for (const canonical of dependsOnCanonicals) {
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
 * #187 — emit a FHIR Library for a SHARED CATALOG library (CRLCommon /
 * CaseFeatureCommon). Unlike `emitLibrary`, the id / `name` / url-tail are the
 * catalog library's OWN identifier (`CRLCommon` / `CaseFeatureCommon`), NOT the
 * policy id — the engine resolves the policy layers' `include CRLCommon` /
 * `include CaseFeatureCommon` by that fixed `Library.name`. `name == url-tail ==
 * CQL header` (all already simple hyphen-free identifiers), satisfying cqf
 * resolution. Content is the sibling `../../cql/<name>.cql` (`text/cql`), matching
 * the layered-Library content convention. No `relatedArtifact` (catalog libraries
 * have no author-ValueSet / local-CodeSystem depends-on edges). FHIRHelpers gets
 * NO Library (the engine auto-provides it) — the caller emits only CRLCommon +
 * CaseFeatureCommon.
 *
 * `libraryName` is the catalog identifier (used as the id/name/url-tail);
 * `version` is the catalog CQL header version pin. `metadata` supplies the
 * canonicalBase + publisher/status/etc. (shared across the policy package).
 *
 * VERSION BY DESIGN (#187): a catalog Library carries the CATALOG CQL-HEADER
 * version (CRLCommon 0.2.0 / CaseFeatureCommon 1.0.0), NOT the policy's package
 * version — these are fixed emitter assets independent of any policy, so their
 * FHIR Library version matches their own CQL content. Every OTHER emitted Library
 * (the policy layers) carries the package version via `emitLibrary`. A focused
 * test in closureOrchestrator.test.ts pins this split so a future catalog helper
 * can't silently drift onto the package version (or vice-versa).
 *
 * CANONICAL URL BY DESIGN (#187): the url is per-policy
 * (`<canonicalBase>/Library/CRLCommon`), so each emitted policy package is
 * self-contained (it ships its own catalog Library copy). A combined-IG consumer
 * that loads MANY policies at once would see N same-name / different-url copies of
 * CRLCommon/CaseFeatureCommon; cqf resolves `include` by NAME so execution is
 * unaffected, but canonical-url uniqueness across a merged bundle is a known
 * constraint tracked for the #72 companion-package distribution model (a shared
 * catalog canonical would live there, not in the per-policy emit).
 */
export function emitCatalogLibrary(
  libraryName: string,
  version: string,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): EmittedResource {
  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const id = libraryName;
  const url = `${metadata.canonicalBase}/Library/${libraryName}`;
  const description = `Shared CRL catalog library ${libraryName}.`;

  const resource: Record<string, unknown> = {
    resourceType: "Library",
    id,
    meta: { profile: crmiCapabilityProfiles("library", level) },
    extension: knowledgeExtensions(level, "structured"),
    url,
    version,
    name: libraryName,
    title: libraryName,
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

  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  resource.content = [
    {
      contentType: "text/cql",
      url: `../../cql/${libraryName}.cql`,
    },
  ];

  return {
    resourceType: "Library",
    relativePath: `Library/${id}.json`,
    resource,
    sourceKind: "Library",
    sourceName: libraryName,
  };
}

/**
 * Closure-level wrapper. Emits one Library per CRL library in the
 * closure. Slug collision detection mirrors Todo 1's `emitValueSets-
 * ForLibrary` (skip both colliding entries; emit error).
 */
export function emitLibrariesForClosure(
  libraries: ReadonlyArray<{
    libraryName: string;
    dependsOnCanonicals: ReadonlyArray<string>;
    cqlFileName: string;
    // R1 — the policy-id id suffix for this entry (e.g. "asserted"); empty for
    // the source-name-keeping Root. Distinct suffixes keep the per-policy Library
    // ids distinct under a single policyIdBase.
    idSuffix?: string;
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

  // R1 — collision detection on the policy-id-derived Library id (base + suffix).
  const slugMap = new Map<string, string[]>();
  for (const lib of libraries) {
    const id = libraryId(metadata, lib.idSuffix ?? "");
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
    const id = libraryId(metadata, lib.idSuffix ?? "");
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const { resource, errors: rErrors, unmatched: rUnmatched } = emitLibrary(
      lib.libraryName,
      metadata,
      lib.dependsOnCanonicals,
      lib.cqlFileName,
      opts,
      lib.idSuffix ?? "",
    );
    if (resource) resources.push(resource);
    errors.push(...rErrors);
    unmatched.push(...rUnmatched);
  }

  return { resources, errors, unmatched };
}
