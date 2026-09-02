import type { CRL, Concept, InlineAnswerOption } from "../ast/types";

import { pascalCaseName, rawSlug, uniqueCapSlugForSuffix } from "./slug";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource } from "./types";

/**
 * ⭐⭐ THE ONE AUTHORITY for what a concept's INLINE `value from:` options materialize as (#189).
 *
 * Every lane reads THIS: the FHIR CodeSystem/ValueSets, the CQL `valueset` declarations, the CEL writer's
 * `coding.system`, and the CRE's member set. Re-deriving any of these names independently would recreate
 * exactly the drift #189 exists to remove — two readings of one decision that are free to diverge.
 *
 * ⭐ WHY A CONCEPT-OWNED CodeSystem, AND NOT THE ARTIFACT-LOCAL ONE (operator, 2026-09-02):
 * *"I agree it shouldn't go in the same CS or VS as local codes. those are a different thing. the best
 * solution is concept level CSs. That's what fhir does."* The precedent is LOINC's LL/LA answer lists, where
 * the answer list is its own vocabulary distinct from the question's identity code.
 *
 * It is not only tidier, it is what makes the change SMALL: `lowerLocalCodes` is not touched at all. That
 * function's `localCodes` is keyed by CONCEPT and doubles as the eligibility test for CASE FEATURES
 * (`lowerLocalCodes.ts` "the ONE eligibility"; `caseFeatureCollection.ts`) and the source of
 * `patternCodeableConcept`. Putting option codes in it would have minted a case-feature StructureDefinition
 * PER ANSWER OPTION. An earlier draft proposed exactly that and had to be corrected.
 *
 * ⭐ IDENTITY IS KEYED ON THE CONCEPT'S LOCAL `code is`, NOT ITS NAME. Renaming a concept must not silently
 * change the system of every persisted answer coding. `value from` already requires a local code, so keying
 * on it is total.
 *
 * ⚠ CHANGING THAT `code is` DOES move these ids — AND THAT IS NOT A BREAKAGE (operator, 2026-09-02). These
 * resources SHIP WITH THE ARTIFACT: nothing external pins them, so the next version simply carries new and
 * corrected terminology beside the content that uses it, and the two cannot disagree. Do NOT "protect" this
 * by freezing ids or declaring a shipped `code is` immutable — an earlier draft did, over-applying the rule
 * that governs CUSTOMER-FACING canonicals (a REFERENCE value set's url, which a deployment binds and
 * customizes in place — see `valueSet.ts::resolveReferenceStub`). The two postures are opposite and must
 * not be conflated.
 *
 * ⚠ THE SUFFIX IS REQUIRED, not decorative: the CodeSystem bucket already holds `<policyId>-local`, so a
 * suffixless scheme would put a concept named "Local" one slug away from the artifact CodeSystem.
 * `uniqueCapSlugForSuffix` preserves the suffix on the overflow branch, so the distinction survives capping.
 */
export interface InlineAnswerSet {
  /** The library that owns the concept — part of the identity, since siblings may reuse a concept name. */
  ownerLibrary: string;
  ownerConcept: string;
  /** The concept's local `code is` — the stable component of every id below. */
  ownerLocalCode: string;
  /** The concept's own answer vocabulary. ONE, however many subsets. */
  codeSystem: { id: string; url: string };
  /** Every offered option — the StructureDefinition binding target (the dropdown). */
  allOptions: { id: string; url: string };
  /**
   * The `qualifying` subset — the `in qualifying` comparand.
   *
   * ⚠ EMITTED EVEN WHEN NO PREDICATE REFERENCES IT. The emitter emits all declared objects and does not
   * filter by reachability; making a concept's terminology output depend on its consumers would mean a
   * library emits differently according to who reads it.
   */
  qualifying: { id: string; url: string };
  options: readonly InlineAnswerOption[];
}

/**
 * Build the descriptor for a concept, or `null` when it has no inline options.
 *
 * `localDomainId` is the per-library local-domain base (`localDomainIdFor` output) — the same axis the local
 * CodeSystem uses, so sibling libraries reusing a concept name are already disambiguated.
 */
export function inlineAnswerSet(
  concept: Concept,
  localDomainId: string,
  canonicalBase: string,
): InlineAnswerSet | null {
  if (concept.valueFrom?.kind !== "inline") return null;
  // `value from` without a local `code is` is an `answer-options-unanswerable` error, so this is defensive:
  // reaching emit without one means validation was skipped, and a fabricated key would be worse than none.
  if (concept.code === undefined || concept.code === "") return null;

  const base = rawSlug(`${localDomainId}-${concept.code}`);
  const csId = uniqueCapSlugForSuffix(base, "-answer-codes");
  const allId = uniqueCapSlugForSuffix(base, "-answer-options");
  const qualId = uniqueCapSlugForSuffix(base, "-answer-options-qualifying");

  return {
    ownerLibrary: localDomainId,
    ownerConcept: concept.name,
    ownerLocalCode: concept.code,
    codeSystem: { id: csId, url: `${canonicalBase}/CodeSystem/${csId}` },
    allOptions: { id: allId, url: `${canonicalBase}/ValueSet/${allId}` },
    qualifying: { id: qualId, url: `${canonicalBase}/ValueSet/${qualId}` },
    options: concept.valueFrom.options,
  };
}

/**
 * The options that count as `qualifying`.
 *
 * ⚠ `qualifying === true` ONLY. An UNMARKED option is NOT a member: absence is not "no". The validator
 * requires a marker precisely when the concept is predicated on, so an unmarked option reaching here means
 * validation was skipped — and silently counting it either way would turn an honest answer into a
 * determinate verdict nobody authored.
 */
export function qualifyingOptions(set: InlineAnswerSet): readonly InlineAnswerOption[] {
  return set.options.filter((o) => o.qualifying === true);
}

/**
 * ⭐⭐ #189 — the pre-split `concept name → inline answer set` map (`EmitOptions.inlineAnswerSetsByName`).
 *
 * Built ONCE where every concept is visible, exactly like `buildConceptShapeMap` above and for the same
 * reason: the concept that DECLARES inline options and the concept that PREDICATES on it
 * (`"X" in qualifying`) generally land in DIFFERENT emitted layers, so the predicate's layer emitter cannot
 * see the subject in its own `conceptByName`.
 *
 * ⚠ It carries the SAME descriptor the FHIR lane emits from (`fhir-emitter/inlineAnswerSet.ts`), so the CQL
 * `valueset '<url>'` and the emitted `ValueSet.url` cannot drift — the anti-drift contract every other
 * terminology already obeys.
 */
export function buildInlineAnswerSetMap(
  ast: CRL,
  localDomainId: string,
  canonicalBase: string,
): Map<string, InlineAnswerSet> {
  const out = new Map<string, InlineAnswerSet>();
  for (const stmt of ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name) continue;
    const set = inlineAnswerSet(stmt, localDomainId, canonicalBase);
    if (set) out.set(stmt.name, set);
  }
  return out;
}

function defaultClock(): Date {
  return new Date();
}

/**
 * The concept's OWN answer vocabulary, plus the two ValueSets over it.
 *
 * ⚠ EVERY SET IS ENUMERATED — `compose` with explicit concepts PLUS a matching `expansion`. The `$apply`
 * terminology provider evaluates from the EXPANSION (it warns that `compose` "may produce incorrect
 * results"), and the generated questionnaire's `answerOption` list comes from the same place. An
 * unexpanded set would render an empty dropdown.
 *
 * ⚠ THE DISPLAY RIDES INTO ALL THREE PLACES — `CodeSystem.concept.display`, `ValueSet.compose…display` and
 * `ValueSet.expansion.contains.display`. A display present only on the CodeSystem may never reach the
 * questionnaire, which would leave a clinician reading raw slugs and defeat the point of REQUIRING one.
 *
 * ⚠ `content: "complete"` and package metadata for status/experimental. These are PRODUCTION answer
 * vocabulary — do NOT copy the reference-stub convention (`experimental: true`), which marks scaffolding
 * meant to be superseded. Same resource type, opposite ship postures.
 */
export function emitInlineAnswerResources(
  set: InlineAnswerSet,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
): EmittedResource[] {
  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const now = (opts.clock ?? defaultClock)().toISOString();
  const title = metadata.title || metadata.name;
  const description = metadata.description || metadata.name;

  const common = (kind: "CodeSystem" | "ValueSet", id: string, url: string, name: string) => ({
    resourceType: kind,
    id,
    meta: { profile: crmiCapabilityProfiles(kind === "CodeSystem" ? "codesystem" : "valueset", level) },
    extension: knowledgeExtensions(level),
    url,
    version: metadata.version,
    name,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    ...(publishable ? { date: now } : {}),
    publisher: metadata.publisher,
    description,
    ...(metadata.contact.length > 0 ? { contact: metadata.contact } : {}),
    ...(metadata.jurisdiction.length > 0 ? { jurisdiction: metadata.jurisdiction } : {}),
    ...(metadata.useContext.length > 0 ? { useContext: metadata.useContext } : {}),
  });

  const wrap = (
    kind: "CodeSystem" | "ValueSet",
    id: string,
    resource: Record<string, unknown>,
  ): EmittedResource => ({
    resourceType: kind,
    relativePath: `${kind}/${id}.json`,
    resource,
    sourceKind: "InlineAnswerOptions",
    sourceName: set.ownerConcept,
  });

  const codeSystem: Record<string, unknown> = {
    ...common("CodeSystem", set.codeSystem.id, set.codeSystem.url, pascalCaseName(set.codeSystem.id)),
    caseSensitive: true,
    content: "complete",
    concept: set.options.map((o) => ({ code: o.code, display: o.display })),
  };

  const valueSet = (
    id: string,
    url: string,
    members: readonly InlineAnswerOption[],
  ): Record<string, unknown> => ({
    ...common("ValueSet", id, url, pascalCaseName(id)),
    compose: {
      include: [
        {
          system: set.codeSystem.url,
          concept: members.map((o) => ({ code: o.code, display: o.display })),
        },
      ],
    },
    expansion: {
      timestamp: now,
      contains: members.map((o) => ({ system: set.codeSystem.url, code: o.code, display: o.display })),
    },
  });

  return [
    wrap("CodeSystem", set.codeSystem.id, codeSystem),
    wrap("ValueSet", set.allOptions.id, valueSet(set.allOptions.id, set.allOptions.url, set.options)),
    wrap(
      "ValueSet",
      set.qualifying.id,
      valueSet(set.qualifying.id, set.qualifying.url, qualifyingOptions(set)),
    ),
  ];
}
