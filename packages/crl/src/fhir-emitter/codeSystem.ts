/**
 * CRL concept-level `code is` local codes → FHIR `CodeSystem` resource emit
 * (slice 4 of the CRL→FHIR-def deliverable).
 *
 * A concept may carry its OWN local source code (`- code is \`X\`.`) — the
 * implicit local domain of its SOURCE LIBRARY. The CQL lane lowers every such
 * `code is`-only concept into a synthetic CQL `codesystem`/`code` pair sharing
 * ONE local codesystem URL per source library (`lowerLocalCodes` →
 * `localCodeSystemUrl`). This lane materializes that local domain as ONE FHIR
 * `CodeSystem` resource per `code is` LIBRARY, carrying that library's codes as
 * `concept[]` entries. #198 (Option B) — the url + id slug from the per-library
 * local-domain base (`localDomainId`): the PRIMARY (closure-seed) library keeps the
 * bare policy id (`metadata.name`), and each cross-library `code is` SIBLING is
 * disambiguated to `<policyId>-<librarySlug>`, so MULTIPLE `code is` libraries under
 * one policy id emit DISTINCT local CodeSystems instead of colliding on one canonical
 * url. The imports preflight (`emit-local-codesystem-urn-collision`) now rejects only
 * the two residual collision cases: two SEED `code is` libraries, or two cross-lib
 * siblings whose names slugify identically.
 *
 * Operator decision (slice 4): emit ONLY a CodeSystem — NO local ValueSet. The
 * generated CQL retrieves bind individual codes, and the future case-feature
 * profile FIXES a code from this system, so a per-policy local ValueSet has no
 * consumer.
 *
 * Anti-drift contracts:
 *   - The CodeSystem `url` is `localCodeSystemUrl(metadata.canonicalBase,
 *     metadata.name)` — R1, slug from the POLICY ID — the SAME helper the CQL
 *     lane uses (threaded the same policy id), so the FHIR `url` and the emitted
 *     CQL `codesystem '<url>'` are byte-equal.
 *   - The selection of which codes to materialize is `lowerLocalCodes(ast)
 *     .localCodes` (consumed by the orchestrator) — the SAME code path that
 *     synthesizes the CQL terminology, so the CodeSystem carries EXACTLY the
 *     codes the CQL emits (no second predicate to drift).
 *
 * Metadata pattern mirrors `emitValueSet` / `emitLibrary` exactly: same slug /
 * pascal-name pipeline, same metadata defaulting (`title`/`description` fall
 * back to the library name), same `knowledgeExtensions(level)` (NO
 * representationLevel — a code system is terminology, not logic, matching the
 * ValueSet lane), same publishable+ date-gating, same empty-array omission.
 */

import type { CRLError } from "../types/errors";

import { localCodeSystemSlug, localCodeSystemUrl, pascalCaseName, slugify } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type {
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

const LOCAL_SUFFIX = "-local";

/** A single local code to materialize as a CodeSystem `concept[]` entry. */
export interface LocalCodeConcept {
  /** The CRL concept name → CodeSystem concept `display`. */
  concept: string;
  /** The `code is` literal → CodeSystem concept `code`. */
  code: string;
}

/**
 * Emit ONE FHIR CodeSystem for a library's local `code is` codes. Returns a
 * null resource (with no error) when the library has no local codes — the
 * orchestrator only calls this when `codeConcepts` is non-empty, but the guard
 * keeps the contract explicit.
 */
export function emitLocalCodeSystem(
  libraryName: string,
  codeConcepts: ReadonlyArray<LocalCodeConcept>,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
  // #198 (Option B) — the local-domain BASE for this library's CodeSystem `id` +
  // `url`. Defaults to the policy id (`metadata.name`) — byte-identical to pre-#198
  // for the PRIMARY (closure-seed) library. A SIBLING `code is` library passes its
  // disambiguated `<policyId>-<librarySlug>` so its CodeSystem no longer collides
  // with the primary's on the per-policy `<policyId>-local` canonical url. The CQL
  // lane threads the SAME base to `localCodeSystemUrl`, keeping `codesystem '<url>'`
  // == `CodeSystem.url`.
  localDomainId: string = metadata.name,
): {
  resource: EmittedResource | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  if (codeConcepts.length === 0) {
    return { resource: null, errors, unmatched };
  }

  const librarySlug = slugify(libraryName);

  if (/[^\x00-\x7F]/.test(libraryName)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Library "${libraryName}" contains non-ASCII characters which are stripped from the local CodeSystem FHIR id (slug: "${librarySlug}"). Rename or transliterate for a meaningful id.`,
    });
  }

  // id: BASE is the per-library local domain (#198: `localDomainId`, defaulting to
  // the policy id `metadata.name` for the primary). #237/T1 (scope B) — the id is now
  // `localCodeSystemSlug(localDomainId)`, the SAME collision-safe identity that
  // `localCodeSystemUrl` uses for the url-tail, so `CodeSystem.id`, `CodeSystem.url`,
  // the CQL `codesystem '<url>'`, and every `coding.system` are BYTE-EQUAL at all
  // lengths (`-local` preserved on the overflow branch). The computable `name` still
  // derives from the human library name (per-library identity, not the resource id).
  const id = localCodeSystemSlug(localDomainId);
  const computableName = pascalCaseName(`${librarySlug}${LOCAL_SUFFIX}`);

  // Title falls back to the CRL library name when package.json has none,
  // matching emitValueSet/emitLibrary exactly; description falls back to the
  // library name like the ValueSet lane.
  const title = metadata.title || libraryName;
  const description = metadata.description || libraryName;
  if (!description) {
    errors.push({
      type: "Validation",
      kind: "missing-description",
      message: `Local CodeSystem for library "${libraryName}" has no description (library name and package.json description both empty)`,
    });
    return { resource: null, errors, unmatched };
  }

  // Defensive duplicate-code guard. The orchestrator passes codes already
  // de-duped by `lowerLocalCodes`, but this function is exported/public — two
  // entries sharing a `code` (including the empty string) would emit an invalid
  // CodeSystem with non-unique `concept.code`. Refuse rather than emit it.
  const seenCodes = new Map<string, string>();
  for (const c of codeConcepts) {
    const prior = seenCodes.get(c.code);
    if (prior !== undefined) {
      errors.push({
        type: "Validation",
        kind: "emit-duplicate-local-code",
        message: `Local CodeSystem for library "${libraryName}" has a duplicate code "${c.code}" shared by concepts "${prior}" and "${c.concept}". Each local code must be unique within the system.`,
      });
      return { resource: null, errors, unmatched };
    }
    seenCodes.set(c.code, c.concept);
  }

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  // url: the SHARED helper → byte-equal with the CQL lane's `codesystem '<url>'`.
  // #198 — the local-domain slug is the per-library base (`localDomainId`, = the
  // POLICY ID `metadata.name` for the primary; `<policyId>-<librarySlug>` for a
  // disambiguated sibling), so the CodeSystem `url` and the policy-id FHIR resource
  // ids share one base. The CQL lane threads the same base (see emitCQLImports /
  // lowerLocalCodes), keeping `codesystem '<url>'` == `CodeSystem.url`.
  const url = localCodeSystemUrl(metadata.canonicalBase, localDomainId);

  const resource: Record<string, unknown> = {
    resourceType: "CodeSystem",
    id,
    meta: { profile: crmiCapabilityProfiles("codesystem", level) },
    // cqf-knowledgeCapability is mustSupport on the CRMI shareable profile. No
    // representationLevel — a code system is terminology, not logic (matching
    // the ValueSet lane).
    extension: knowledgeExtensions(level),
    url,
    // version: CRMI requires `version` (1..1) at the shareable floor; from the
    // npm package (authoritative SoT).
    version: metadata.version,
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    // date: CRMI requires `date` only at publishable+ — omitted below that.
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    // A complete, case-sensitive local code domain. `content: "complete"` — the
    // resource enumerates every concept it contains.
    caseSensitive: true,
    content: "complete",
    concept: codeConcepts.map((c) => ({ code: c.code, display: c.concept })),
  };

  // Empty-array omission carries forward from the other lanes.
  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "CodeSystem",
      relativePath: `CodeSystem/${id}.json`,
      resource,
      sourceKind: "LocalCodeSystem",
      sourceName: libraryName,
    },
    errors,
    unmatched,
  };
}

/**
 * ⭐⭐ #189 PRECURSOR A — THE ONE `reference-vs-stub` CodeSystem for a closure.
 *
 * A PURE reference terminology (`valueset is <url>`) emits a membership STUB carrying one synthetic code
 * under a shared `<canonicalBase>/CodeSystem/reference-vs-stub` system (`valueSet.ts::referenceStubCoding`).
 * Until now NOTHING emitted that CodeSystem, so every stub ValueSet referenced a system no resource declared.
 *
 * ⚠ MEASURED on `tmp/bleph` (2026-09-02): 2 of 14 dangling codes were these. Two review arms missed it
 * across two rounds; a `dangle.ts` sweep over the emitted package found it.
 *
 * ⚠ THE CODES ARE COLLECTED FROM THE EMITTED VALUESETS, NOT RE-DERIVED. `referenceStubCoding` is the single
 * authority for a stub `{system, code}`, and reading back what the ValueSets actually emitted puts this
 * DOWNSTREAM of that authority rather than beside it — a second predicate over the terminology AST could
 * drift from what was emitted, which is the exact failure mode the local-CodeSystem lane guards against.
 *
 * ⚠ `experimental: true`, NOT the package metadata — mirroring the stub ValueSet convention
 * (`valueSet.ts`: a real value set is `experimental=false` with real content; packaging swaps the real
 * content in at the same url and drops the stub). This is scaffolding that MUST NOT SHIP. It is the exact
 * opposite of a concept-level answer-option CodeSystem, which is production vocabulary — do not unify them.
 *
 * ⚠ NO `display`. A stub code is a value set canonical's last path segment, not a clinical term; a display
 * would be manufactured content. FHIR makes `concept.display` optional, so omission is legal and honest.
 *
 * ⭐⭐ THE TWO IDENTIFIER INVARIANTS — ESSENTIAL, AND THEY POINT OPPOSITE WAYS. (Operator, 2026-09-02,
 * stated as essential and protected here by request. Conflating them was an actual error in design review,
 * caught by the operator, so the contrast is written out rather than assumed.)
 *
 *   1. A CUSTOMER-FACING CANONICAL MUST NEVER MOVE. A REFERENCE value set's url/id is bound by a deployment:
 *      production swaps the real value set in AT THE SAME CANONICAL, and a customer customizes the INSTANCE
 *      there — adding or removing codes for their environment. Wrong content is fixed by changing the
 *      instance's CODES, never by re-pointing the identifier. See `valueSet.ts::resolveReferenceStub`, which
 *      is where that id is decided and where the full rule lives.
 *
 *   2. A GENERATED RESOURCE THAT SHIPS WITH THE ARTIFACT MAY HAVE ITS ID MOVE, AND THAT IS NOT A BREAKAGE.
 *      Nothing external pins it. If a concept's `code is` changes, the artifact's next version simply
 *      carries a new and corrected ValueSet/CodeSystem beside the content that uses it — terminology and
 *      content ship together, so they cannot disagree. ⚠ DO NOT "protect" these by freezing derived ids or
 *      by declaring a shipped `code is` immutable; an earlier draft did exactly that, over-applying rule 1,
 *      and it would forbid ordinary authoring for no gain.
 *
 * ⚠ THIS resource is rule 1's neighbour but is itself rule 2: it is OUR scaffolding, `experimental`, and it
 * is what DECLARES the synthetic code sitting inside a stub body. It never touches the stub ValueSet's
 * customer-facing id. Keep those two facts apart when editing either.
 *
 * ⚠ And do NOT unify this with a per-concept answer-option CodeSystem. Same resource type, OPPOSITE ship
 * postures: answer options are production vocabulary carrying package metadata; this is scaffolding meant to
 * be superseded. Unifying them would either ship the stub or misfile the vocabulary.
 */
export function emitReferenceStubCodeSystem(
  stubCodes: ReadonlyArray<string>,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): { resource: EmittedResource | null; errors: CRLError[] } {
  const errors: CRLError[] = [];
  if (stubCodes.length === 0) return { resource: null, errors };

  const id = "reference-vs-stub";
  const url = `${metadata.canonicalBase}/CodeSystem/${id}`;
  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const title = metadata.title || metadata.name;
  const description =
    metadata.description ||
    "Synthetic per-value-set stub codes for REFERENCE value sets. Authoring/test scaffolding — replaced when real value set content is swapped in at the same canonical.";

  const resource: Record<string, unknown> = {
    resourceType: "CodeSystem",
    id,
    meta: { profile: crmiCapabilityProfiles("codesystem", level) },
    extension: knowledgeExtensions(level),
    url,
    version: metadata.version,
    name: pascalCaseName("reference vs stub"),
    title,
    status: metadata.status,
    // ⚠ Scaffolding, so ALWAYS experimental — never `metadata.experimental`. See the header.
    experimental: true,
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    caseSensitive: true,
    content: "complete",
    concept: [...stubCodes].sort().map((code) => ({ code })),
  };

  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "CodeSystem",
      relativePath: `CodeSystem/${id}.json`,
      resource,
      sourceKind: "ReferenceStubCodeSystem",
      sourceName: metadata.name,
    },
    errors,
  };
}

function defaultClock(): Date {
  return new Date();
}
