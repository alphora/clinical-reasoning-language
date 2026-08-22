import { localDomainIdFor } from "./slug";

/**
 * REFACTOR:grounded (#189 CEL-writer T3b, panel disc 490). The ONE local-domain-id resolver shared by every
 * lane that composes a local CodeSystem identity — the CQL lowering lane (`imports/emit.ts`), the FHIR lane
 * (`fhir-emitter/closureOrchestrator.ts`), and the CEL instance lane (`cel/emitter/emitFhir.ts` derive-local).
 * Extracted to kill the two duplicated inline copies that could drift a byte and silently break the local read
 * round-trip (the dme101-030 failure class: a domain mismatch makes the retrieve find nothing → wrong PA
 * determination, with NO emit error).
 *
 * #198 (Option B) rule, unchanged: the PRIMARY (closure-seed) library keeps the bare `<policyId>` domain; a
 * SIBLING library (pulled into the closure via a cross-lib ref — NOT in the include-walked seed) that ALSO
 * declares concept-level `code is` gets a `-<librarySlug>` disambiguator so its local CodeSystem url no longer
 * collides with the primary's. A non-`code is` sibling synthesizes no local CodeSystem, so it keeps the bare
 * base (no golden drift for existing `coded from`/decision-only multi-library fixtures).
 *
 * INTENTIONALLY takes IMMUTABLE SETS keyed on `RegistryEntry.filePath`, NOT a `hasConceptLocalCode` callback
 * (panel disc 490, gpt56 [important] + Fable #7). The `localCodePaths` predicate is LOWERING-STABLE only at the
 * RAW (un-lowered) AST boundary: `lowerLocalCodes` CLEARS `Concept.code`, so `astHasConceptLocalCode` on a
 * lowered ast reads false. Each caller MUST compute `localCodePaths` from its raw closure and pass the resolved
 * set — a callback would let a future caller close over a lowered entry and reintroduce that exact false
 * negative. The resolver is then a pure function of `entry.filePath`. Metadata reading (canonicalBase/policyId)
 * stays in the callers; this helper does not touch the filesystem.
 */

/** The minimal identity a caller must supply per library — `RegistryEntry` satisfies it structurally, as does a
 *  `{ filePath, name: libraryName }` projection. `name` is nullable (parse-failure placeholders); callers that
 *  need a non-empty fallback apply it OUTSIDE (`domainIdFor(entry) ?? entry.ast.library.name`, per the CQL
 *  lane's metadata-less fallback — disc 490 Fable #12). */
export interface LocalDomainEntryId {
  filePath: string;
  name: string | null;
}

export interface LocalDomainResolver {
  /** The per-library local-domain id: bare `<policyId>` for a primary/non-`code is` entry, `<policyId>-<slug>`
   *  for a disambiguated cross-lib `code is` sibling. `undefined` when `policyId` is absent (metadata-less
   *  single-file callers) — the caller then falls back to the source library name downstream. */
  domainIdFor(entry: LocalDomainEntryId): string | undefined;
  /** The disambiguated base ONLY when the entry is actually disambiguated (a cross-lib `code is` sibling);
   *  `undefined` otherwise (primary seed, non-`code is`, or metadata-less). Feeds the CQL lane's manifest
   *  `localUrnDisambiguated` signal; no CEL consumer, but kept here so the one resolver owns both outputs. */
  disambiguatedBaseFor(entry: LocalDomainEntryId): string | undefined;
}

export function createLocalDomainResolver(args: {
  /** filePaths of the include-walked closure seed (the PRIMARY libraries). */
  primarySeedPaths: ReadonlySet<string>;
  /** filePaths of libraries that declare concept-level `code is`, computed at the RAW-AST boundary. */
  localCodePaths: ReadonlySet<string>;
  /** The project policy id (`package.json` name). `undefined` for metadata-less single-file callers. */
  policyId: string | undefined;
}): LocalDomainResolver {
  const { primarySeedPaths, localCodePaths, policyId } = args;
  const isDisambiguated = (entry: LocalDomainEntryId): boolean =>
    !primarySeedPaths.has(entry.filePath) && localCodePaths.has(entry.filePath);
  return {
    domainIdFor(entry) {
      if (policyId === undefined) return undefined;
      return localDomainIdFor(policyId, entry.name ?? "", !isDisambiguated(entry));
    },
    disambiguatedBaseFor(entry) {
      if (policyId === undefined) return undefined;
      return isDisambiguated(entry) ? localDomainIdFor(policyId, entry.name ?? "", false) : undefined;
    },
  };
}
