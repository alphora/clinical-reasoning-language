/**
 * CRL concept-level `code is` local codes → FHIR `CodeSystem` resource emit
 * (slice 4 of the CRL→FHIR-def deliverable).
 *
 * A concept may carry its OWN local source code (`- code is \`X\`.`) — the
 * single implicit local domain of its library. The CQL lane lowers every such
 * `code is`-only concept into a synthetic CQL `codesystem`/`code` pair sharing
 * ONE local codesystem URL (`lowerLocalCodes` → `localCodeSystemUrl`). This lane
 * materializes that shared local domain as ONE FHIR `CodeSystem` resource per
 * library that has local codes, carrying the N codes as `concept[]` entries.
 *
 * Operator decision (slice 4): emit ONLY a CodeSystem — NO local ValueSet. The
 * generated CQL retrieves bind individual codes, and the future case-feature
 * profile FIXES a code from this system, so a per-policy local ValueSet has no
 * consumer.
 *
 * Anti-drift contracts:
 *   - The CodeSystem `url` is `localCodeSystemUrl(metadata.canonicalBase,
 *     libraryName)` — the SAME helper the CQL lane uses, so the FHIR `url` and
 *     the emitted CQL `codesystem '<url>'` are byte-equal.
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

import { capSlugForSuffix, pascalCaseName, slugify } from "./slug";
import { localCodeSystemUrl } from "../cql-emitter/lowerLocalCodes";
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

  // id: `capSlugForSuffix` caps the base to `64 - len("-local")` and appends the
  // suffix, so the `-local` suffix always survives truncation (mirrors
  // recommendation.ts' suffix-aware capping). `slugify` already applied the base
  // 64-cap to `librarySlug`, so no extra `capSlug` is needed here.
  const id = capSlugForSuffix(librarySlug, LOCAL_SUFFIX);
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
  const url = localCodeSystemUrl(metadata.canonicalBase, libraryName);

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

function defaultClock(): Date {
  return new Date();
}
