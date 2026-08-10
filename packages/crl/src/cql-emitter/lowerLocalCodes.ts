/**
 * Pre-emit lowering pass for concept-level local source codes (`- code is `…`.`).
 *
 * SLICE 3 of the CRL CQL emit deliverable. A concept may carry its OWN local
 * source code (`Concept.code`, ast/types.ts:298) — the single implicit local
 * domain. Today `emitConcept` (emitCQL.ts) stubs such a definition-less concept
 * with a TODO comment, and slice-2 `classifyStatementLayer` rejects any
 * `code`-bearing concept. This pass LOWERS each `code is`-ONLY concept into the
 * EXISTING AST shapes so the whole unchanged downstream pipeline (indexNames /
 * detectCollisions / classify / requalify / include-collect / emit) handles it:
 *
 *   - A synthetic local `Terminology` named after the concept, carrying ONE
 *     `code` entry (the `code is` literal) from a deterministic local
 *     codesystem URN `urn:crl:codesystem:<slug>-local` (R1 — slug = lowercase-
 *     hyphen of the per-library local-domain base `localDomainId` when the FHIR/
 *     imports lane threads it: the POLICY ID for the primary seed, or #198 Option B's
 *     disambiguated `<policyId>-<librarySlug>` for a cross-lib `code is` sibling. Every
 *     local code IN ONE SOURCE LIBRARY shares that library's domain. Falls back to the
 *     source LIBRARY name only for direct metadata-less callers). The CQL emitter stays
 *     FHIR-free: no canonicalBase, just a URN.
 *     `detectCollisions` (emitCQL.ts) sees the synthetic terminology collide
 *     with the same-named concept and suffixes its emit name to `"<Concept>
 *     Code"` (per-CRL path only — see the EMITTED IDENTIFIER NOTE below for why
 *     the layered path does NOT suffix), exactly mirroring the hand-split cms22
 *     `code "X Code"` shape on the per-CRL path.
 *
 *   - A synthetic `CodedFromDefinition` on the concept whose `terminologyName`
 *     is a BARE ref to that local code's name, so `emitCodedFrom` emits the
 *     retrieve `[<conceptType>: "<Concept> Code"]` and slice-2's re-qualifier /
 *     include-collector / collision detector all see the ref and handle it
 *     (layered: requalified to `"<Lib> Concepts"."<Concept> Code"` + include;
 *     per-CRL inline: bare same-library ref).
 *
 * IDEMPOTENCY. The transform CLEARS `Concept.code` once it installs the
 * synthetic definition. So a second run (the layered path's `emitLayered` calls
 * `emitCQLFromAST`, which lowers again) is a no-op: the lowered concept has no
 * `code` and a `CodedFromDefinition`, indistinguishable from a hand-authored
 * `coded from` concept. The pass is PURE — it does NOT mutate the input AST; it
 * shallow-copies rewritten concepts and constructs new synthetic statements
 * (the resolved-graph AST is shared
 * across emit paths; mutating it would leak synthetic statements). It does NOT
 * mutate the input AST: it shallow-copies the rewritten concepts
 * (`{ ...c, definition }`) and constructs new synthetic statements; untouched
 * statements pass through by reference.
 *
 * SCOPE (this slice). Lowers `code` + NO original top-level `definition` only.
 * A MIXED `code` + `definition` concept and an empty `code` value are HARD ERRORS
 * surfaced in `EmitResult.errors[]`; a `code is` concept with no `type is` (no
 * `conceptType`) is a hard error too (do NOT default to Observation — the
 * retrieve resource must be explicit). A `representations`-bearing `code`
 * concept is NOT an error and is NOT lowered: the external-source-representation
 * lane is out of scope, so its `code` is left intact and the existing layered
 * guard / per-CRL stub handles it (lowering it would silently drop the
 * representation side).
 *
 * EMITTED IDENTIFIER NOTE. The synthetic local CodeSystem/code identifiers are
 * an INTERNAL implementation detail of the emit and are NOT a stable public
 * surface. They can differ by emit PATH: in the per-CRL path the synthetic
 * terminology and its concept share one emitted library, so `detectCollisions`
 * suffixes the code name to `"<Concept> Code"`; in the layered path they land
 * in separate libraries (Concepts vs Asserted), so no suffix fires and the code
 * is named `"<Concept>"`. Each emitted library is self-consistent (its retrieve
 * references the exact name it declared), so this is benign — but downstream
 * consumers must reference the generated CONCEPT `define`s, never the synthetic
 * code declarations.
 *
 * SLICE-4 DEDUP CONSTRAINT. This pass keeps N synthetic terminologies (one per
 * `code is` concept), each still NAMED AFTER ITS CONCEPT so resolution / layered
 * maps / collision suffix / re-qualification are all unchanged. They ALL SHARE
 * ONE URN — `urn:crl:codesystem:<slug>-local`, the single implicit local domain.
 *
 *   - CQL side (slice 4b): every synthetic terminology's `TerminologySystem`
 *     line carries a SHARED `name` — the domain codesystem decl name
 *     `<sourceLibraryName> Local Codes` (e.g. library "Code Is Basic" →
 *     "Code Is Basic Local Codes"). The emitter (`emitTerminologyLine` /
 *     `emitOneTerminology` / `emitTerminologies`) emits that ONE shared
 *     `codesystem "<domain>": '<urn>'` declaration ONCE (name-keyed dedup) and
 *     N `code "<Concept>[ Code]": '<value>' from "<domain>"` lines — instead of
 *     N distinct `"<Concept> System"` codesystem decls all sharing one URN.
 *     D2 — the shared domain decl name is now collision-CHECKED against the
 *     library's other top-level CQL identifiers (concept / parameter / valueset /
 *     codesystem / terminology names): a library that already declares an
 *     identifier literally named "<Lib> Local Codes" raises
 *     `emit-local-codesystem-name-collision` rather than emitting a duplicate
 *     top-level identifier (invalid CQL).
 *
 *   - FHIR side (slice 4): when the FHIR `CodeSystem` emit materializes these it
 *     MUST dedup them by URL into ONE FHIR `CodeSystem` resource (the shared
 *     URN) carrying N `concept` entries — emitting N separate `CodeSystem`
 *     resources that share the same canonical `url` is INVALID FHIR.
 *
 * This shared-domain shape is a DELIBERATE choice; the FHIR lane (URL-keyed
 * dedup over `localCodes[]`) and the CQL lane (name-keyed dedup over the shared
 * `TerminologySystem.name`) collapse the same domain along their own keys.
 */

import type {
  AgeComputeFn,
  AgeRecencyOp,
  CRL,
  Concept,
  CodedFromDefinition,
  DefinitionIsDefinition,
  Statement,
  Terminology,
  TerminologyBodyLine,
  Location,
} from "../ast/types";
import { localCodeSystemSlug } from "../fhir-emitter/slug";
import { isAgeTodayPrefix } from "../template-match/agePredicate";
import {
  ageRetirementMessage,
  isRetiredAgeTodayDefinition,
  resolveAgeConcept,
  resolveRecencyProjection,
  type AgeProjectionArgs,
} from "../template-match/recencyProjectionOverride";
import type { CRLError } from "../types/errors";

/** The result of a lowering pass: the (possibly transformed) AST + any hard errors. */
export interface LowerLocalCodesResult {
  ast: CRL;
  errors: CRLError[];
  /**
   * Slice 4 — the EXACT concepts this pass lowered into the shared local
   * codesystem, surfaced for the FHIR lane so it materializes precisely the
   * codes the CQL emits (one source of truth, no second predicate to drift).
   * Populated inside the synthesis loop at the point each valid concept is
   * lowered, so it cannot diverge from the synthetic terminology. Empty on the
   * fast-path early return (nothing to lower) and on the error/skip-only path.
   */
  localCodes: Array<{ concept: string; code: string; conceptType: string }>;
}

/** Options for the lowering pass. */
export interface LowerLocalCodesOptions {
  /**
   * Slice 4 — the project's `crl.canonicalBase`. When set, the synthetic local
   * codesystem's URL is published under it (`<base>/CodeSystem/<slug>-local`);
   * when undefined (direct callers without a package.json), the URN fallback is
   * used. Threaded through to `localCodeSystemUrl` so the CQL and FHIR identities
   * stay byte-equal.
   */
  canonicalBase?: string;
  /**
   * R1 — the POLICY ID (`metadata.name` / package.json `name`) that slugs the
   * local-domain CodeSystem URL. The FHIR lane derives its `CodeSystem.url` (and
   * every other resource id) from the policy id, so the CQL lane's synthetic
   * `codesystem '<url>'` MUST slug from the SAME policy id to stay byte-equal.
   * When undefined (direct CLI/single-file callers without package.json metadata),
   * the url falls back to slugging the source library name — the pre-R1 behavior —
   * so those callers (which have no FHIR lane to diverge from) are unaffected.
   */
  localDomainId?: string;
}

/**
 * Deterministic local-domain codesystem URL for a library — the single implicit
 * local domain shared by every `code is` code in the library. Slug = lowercase,
 * non-alphanumeric → hyphen, collapse/trim hyphens; empty (e.g. a pure non-ASCII
 * library name) falls back to `unnamed` so the URL is always well-formed.
 *
 * Slice 4 — when `canonicalBase` is provided (the imports/FHIR lane loads it from
 * `crl.canonicalBase`), the local codesystem URL is published UNDER canonicalBase
 * (`<base>/CodeSystem/<slug>-local`) for FHIR closure integrity + publishability;
 * the future case-feature profile fixes a code from this system. When canonicalBase
 * is undefined — the fallback for direct callers (CLI / single-file `emitCQL`)
 * without a package.json — it falls back to the plain URN
 * `urn:crl:codesystem:<slug>-local`. The CQL and FHIR identities MUST stay
 * byte-equal, so BOTH lanes call THIS helper.
 *
 * R1 — `localDomainId` is the slug SOURCE: the FHIR/imports lanes pass the POLICY
 * ID (`metadata.name`) so the local-domain url shares the policy-id base with
 * every other emitted FHIR resource id; direct callers without metadata pass the
 * source LIBRARY NAME (pre-R1 behavior). The function just slugs whatever it is
 * given — the CALLER decides which identity is authoritative for the domain.
 */
export function localCodeSystemUrl(
  canonicalBase: string | undefined,
  localDomainId: string,
): string {
  // #237/T1 (scope B) — the url-tail is the SAME collision-safe identity the FHIR
  // `CodeSystem.id` uses (`localCodeSystemSlug`, which returns the full `<…>-local`
  // tail), so id, url-tail, `codesystem '<url>'`, and every `coding.system` are
  // byte-equal at ALL lengths — including the >64 case the old uncapped `localSlug`
  // left divergent, and dotted domains where `rawSlug` (dot→hyphen) now matches the
  // id instead of the old `localSlug` (dot-stripping) mismatch.
  const tail = localCodeSystemSlug(localDomainId);
  if (canonicalBase) {
    // Normalize a trailing slash so the url is stable regardless of whether the
    // caller's canonicalBase ends in `/`. The FHIR-metadata loader already
    // strips it, but a direct `emitCQLFromAST({ canonicalBase })` caller may
    // not — and both lanes MUST produce a byte-equal url.
    const base = canonicalBase.replace(/\/+$/, "");
    return `${base}/CodeSystem/${tail}`;
  }
  return `urn:crl:codesystem:${tail}`;
}

/**
 * Title-case a policy-id slug for the human-readable local codesystem DECL name:
 * lowercase-hyphen-slug the id, then split on `-` and capitalize each token —
 * `example-direct` → "Example Direct", `example-for-emit` → "Example For Emit".
 * This is a DISPLAY name only (not an id/url). It keeps the uncapped, dot-stripping
 * `localSlug` for human readability; the local-domain id/URL now use the collision-safe
 * `localCodeSystemSlug` (dot→hyphen, hashed at >64), so the decl name and the URL can
 * differ on a dotted or >64 domain. That is fine — the name is not an identity key.
 */
function titleCaseSlug(id: string): string {
  return localSlug(id)
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Lowercase-hyphen slug of a name; `unnamed` when empty after stripping. */
function localSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unnamed"
  );
}

/**
 * A `code`-bearing concept this slice INSPECTS. This predicate deliberately does
 * NOT pre-exclude representations-bearing concepts: every `code`-bearing concept
 * must enter the loop so its diagnostics (empty `code`, mixed `code` +
 * top-level `definition`) fire BEFORE the representation lane is considered.
 * Pre-excluding representations here would let `code is \`\`` + representation
 * (empty) and `code is X` + `defined as` + representation (mixed) escape their
 * hard errors — and the mixed one would then emit only the definition, silently
 * dropping the code-source side. The representation SKIP (out of scope: keep
 * `code` intact, do not lower, no error) happens INSIDE the loop, AFTER the
 * empty + mixed checks — see `lowerLocalCodes`.
 */
function isLowerableConcept(stmt: Statement): stmt is Concept {
  return stmt.type === "Concept" && stmt.code !== undefined;
}

/**
 * #198 — true iff `ast` declares at least one concept-level `code is` (the SOLE
 * trigger for a synthetic per-policy local CodeSystem + the policy-id-keyed layered
 * identities that collide across two such libraries). Mirrors `lowerLocalCodes`'
 * own fast-path predicate, so "would lower a local code" and "gets an Option-B
 * disambiguated local domain" are decided by ONE source of truth. A library WITHOUT
 * a `code is` keeps the bare policy-id base (no local CodeSystem to collide, so no
 * disambiguation — keeps its emit byte-identical).
 */
export function astHasConceptLocalCode(ast: CRL): boolean {
  return ast.statements.some(isLowerableConcept);
}

/**
 * Lower every `code is`-ONLY concept in `ast` into a synthetic local
 * `Terminology` + `CodedFromDefinition`, returning a NEW AST (input untouched).
 *
 * Hard errors (out of scope / malformed) are collected into `errors`; when any
 * are present the caller MUST short-circuit emit (the partially-lowered AST is
 * still returned but should not be emitted). Diagnostics:
 *   - empty `code is` value                          → `emit-empty-local-code`
 *   - `code` + top-level `definition` (mixed)        → `emit-mixed-code-and-definition`
 *   - `code is` with no `type is` (conceptType)      → `emit-local-code-missing-type`
 *   - two valid (lowerable) concepts with the SAME
 *     `code` value                                   → `emit-duplicate-local-code`
 *   - two valid (lowerable) concepts with the SAME
 *     NAME (would synthesize colliding terminologies) → `emit-duplicate-local-concept`
 *   - synthetic terminology name collides with an
 *     EXISTING terminology of the same name          → `emit-local-code-terminology-collision`
 *
 * Per `code`-bearing concept, in order: (1) empty `code` → empty error; (2)
 * `code` + top-level `definition` (mixed) → mixed error; (3) representation-
 * bearing (`code` + representation, no top-level definition, non-empty) → SKIP
 * (out of scope: no error, `code` left intact, NOT lowered); (4) else
 * (code-only) → missing-type / duplicate-value / duplicate-name / terminology-
 * collision checks + lower. The representation lane is checked AFTER empty +
 * mixed so a malformed representation-bearing concept still gets its hard error.
 */
export function lowerLocalCodes(
  ast: CRL,
  opts: LowerLocalCodesOptions = {},
): LowerLocalCodesResult {
  const errors: CRLError[] = [];

  // Fast path: nothing to lower → return the input untouched (no clone churn).
  if (!ast.statements.some(isLowerableConcept)) {
    return { ast, errors, localCodes: [] };
  }

  // Existing terminology names (so a synthetic name can't silently collide with
  // a hand-authored terminology — a legal cross-kind same-name, since name
  // uniqueness is per-kind). If the names match the emitter's two terminologies
  // would collapse in its name-keyed maps; diagnose instead of emit broken CQL.
  //
  // D2 — the SAME pass also collects every other top-level CQL identifier name
  // the library will emit (Concept names, Parameter names, and the valueset /
  // codesystem decl names declared inside terminology bodies). In CQL,
  // `codesystem` decls share the top-level identifier namespace with `define` /
  // `code` / `valueset` / `parameter` / other terminologies, so the synthetic
  // shared `localCodesystemName` must be checked against ALL of them — a library
  // that happens to contain a concept/parameter/terminology literally named
  // "<Lib> Local Codes" would otherwise emit a duplicate top-level identifier
  // (invalid CQL). The check fires below, once `localCodesystemName` is derived.
  const existingTerminologyNames = new Set<string>();
  const topLevelIdentifierNames = new Set<string>();
  for (const stmt of ast.statements) {
    if (stmt.type === "Terminology" && stmt.name) {
      existingTerminologyNames.add(stmt.name);
      topLevelIdentifierNames.add(stmt.name);
      // Valueset / codesystem decl names declared inside this terminology body
      // (cheap to collect here — the body is already in hand).
      for (const bodyLine of stmt.body) {
        if (bodyLine.type === "TerminologySystem" && bodyLine.name) {
          topLevelIdentifierNames.add(bodyLine.name);
        }
      }
    } else if (stmt.type === "Concept" && stmt.name) {
      topLevelIdentifierNames.add(stmt.name);
    } else if (stmt.type === "Parameter" && stmt.name) {
      topLevelIdentifierNames.add(stmt.name);
    }
  }

  // De-dup local code VALUES across all lowered concepts (a duplicate local code
  // is ambiguous: two concepts asserting the same local domain code).
  const codeValueToConcept = new Map<string, string>();

  // De-dup synthetic terminology NAMES across lowered concepts. Two `code is`
  // concepts with the SAME name would each synthesize a same-named terminology
  // and collapse in the emitter's name-keyed maps (and in `loweredByName`
  // below). Concept-name uniqueness is normally a validator concern, but the
  // direct `emitCQL` / `emitCQLFromAST` entrypoints don't run the validator, so
  // diagnose it here rather than emit silently-clobbered CQL.
  const seenSyntheticNames = new Set<string>();

  const loweredConcepts: Concept[] = [];
  // Both-representation INFERRED twins (`code is` + `defined as`): the inference
  // half of a split, appended to the statement list AFTER the rewrite. Each keeps
  // the original `defined as` and carries `__bothRepFoldInLocalSource` so the emit
  // unions in the direct LocalSource retrieve. Keyed in declaration order.
  const bothRepInferredTwins: Concept[] = [];
  const localCodes: Array<{ concept: string; code: string; conceptType: string }> = [];
  const syntheticTerminologies: Terminology[] = [];
  // The local-domain URN slug source: R1 — the POLICY ID (`opts.localDomainId`,
  // from package.json `name`) when the imports/FHIR lane provides it, so the CQL
  // `codesystem '<url>'` byte-equals the FHIR `CodeSystem.url` (both policy-id
  // based). Falls back to the SOURCE policy library identity (`ast.library.name`)
  // for direct callers without metadata (CLI / single-file) — pre-R1 behavior.
  // It NEVER follows the emitted-layer library name (`emitCQLFromAST`'s
  // `options.libraryName` may be the layered "<Lib> Concepts"); the local domain
  // belongs to the source policy, not the layer.
  const urn = localCodeSystemUrl(opts.canonicalBase, opts.localDomainId ?? ast.library.name);

  // Slice 4b — the ONE shared domain `codesystem` DECLARATION name. R1/case-feature:
  // derived from the POLICY ID (`opts.localDomainId`, the package.json `name`) so the
  // human-readable decl name keys off the SAME identity as the local-domain URL slug
  // (`<base>/CodeSystem/<policy-id>-local`) and the FHIR lane — title-cased from the
  // policy-id slug (e.g. `example-direct` → "Example Direct Local Codes"). Falls back
  // to the SOURCE library name for direct callers without metadata (CLI/single-file),
  // preserving the pre-R1 emit for those. NOT the emitted-layer library name
  // (`options.libraryName` may be the layered "<Lib>-LocalConcepts"); the local domain
  // belongs to the source policy, not the layer. Every synthetic terminology's system
  // line carries THIS name so the emitter emits a single shared
  // `codesystem "<domain>": '<urn>'` (deduped) instead of N "<Concept> System" decls.
  // Fix 4 [nit] — the no-`localDomainId` fallback derives the decl name from the
  // SOURCE LIBRARY NAME, while the URL fallback (line ~321, `urn` above) slugs the
  // SAME `ast.library.name`. The shared-identity guarantee (decl name ↔ url share
  // one source) therefore holds for direct callers ONLY because both fall back to
  // `ast.library.name`; when `localDomainId` IS set, both key off the policy id
  // (`titleCaseSlug(opts.localDomainId)` here, `localSlug(opts.localDomainId)` in
  // the url) — same source, byte-aligned. Keep these two fallbacks in lock-step.
  const localCodesystemName = opts.localDomainId
    ? `${titleCaseSlug(opts.localDomainId)} Local Codes`
    : `${ast.library.name} Local Codes`;

  // D2 — the shared decl name is injected as a top-level CQL `codesystem`
  // identifier. If the library ALREADY declares a top-level identifier of that
  // exact name (a concept, parameter, terminology, or a valueset/codesystem decl
  // name inside a terminology body), the emit would produce a duplicate top-level
  // identifier — invalid CQL. Diagnose rather than emit broken CQL. (The
  // synthetic terminologies that carry `localCodesystemName` on their system line
  // are built below, AFTER this scan, so they can't false-match here.)
  if (topLevelIdentifierNames.has(localCodesystemName)) {
    errors.push(
      mkError(
        "emit-local-codesystem-name-collision",
        `The synthetic shared local codesystem decl "${localCodesystemName}" collides ` +
          `with an existing top-level identifier of the same name in library ` +
          `"${ast.library.name}". CQL codesystem declarations share the top-level ` +
          `identifier namespace with concepts, parameters, valuesets, and other ` +
          `terminologies, so this would emit a duplicate identifier (invalid CQL). ` +
          `Rename the conflicting declaration (or the library) so the synthesized ` +
          `local codesystem name "${localCodesystemName}" is unique.`,
        ast.library.location,
      ),
    );
  }

  for (const stmt of ast.statements) {
    if (!isLowerableConcept(stmt)) continue;
    // `c` is reassigned once an age `source representation` is CONSUMED (stripped) below,
    // so the downstream `code is` lowering sees a representation-free concept.
    let c: Concept = stmt;
    const codeValue = c.code as string;
    const loc = c.location;

    // (1) EMPTY `code is` value. Checked FIRST: an empty local code is malformed
    //     regardless of whatever else the concept carries (so an empty code +
    //     definition reports the empty-code error, not the mixed error).
    if (codeValue === "") {
      errors.push(
        mkError(
          "emit-empty-local-code",
          `Concept "${c.name}" has an empty \`code is\` value. A local source code ` +
            `must be a non-empty literal.`,
          loc,
        ),
      );
      continue;
    }

    // (AGE) `code is` + an age `source representation` (patient-age migration, #257).
    //     A posrep whose `value projection is age today <cmp> <Q>` over `Patient.birthDate`
    //     RECENCY-MERGES with the local `code is`. The WHOLE-CONCEPT shape is classified by the
    //     SHARED `resolveAgeConcept` — the SAME source the author-time validator consults, so
    //     validate and emit cannot drift on the concept-shape lattice (not just the comparator set).
    //     A `"recency"` verdict consumes the posrep and drives the existing recency machinery below
    //     via a definition SYNTHESIZED from the projection (marked `__synthesizedFromPosrep`), so
    //     classification + emit stay byte-identical to the retired `definition is age today`
    //     carve-out. Every age-shaped mis-authoring is a LOUD hard error (no silent stub). A
    //     `not-age` concept (non-age posrep, or none) falls through to the (2)/(3)/(4) flow.
    let ageMerge: { args: AgeProjectionArgs; overrideId: string } | null = null;
    let synthAgeDef: DefinitionIsDefinition | undefined;
    const ageShape = resolveAgeConcept(c);
    if (ageShape.kind === "error") {
      errors.push(mkError(ageShape.errorKind, ageShape.message, loc));
      continue;
    }
    if (ageShape.kind === "recency") {
      const rep = (c.representations ?? []).find((r) => resolveRecencyProjection(r).kind === "match")!;
      ageMerge = { args: ageShape.args, overrideId: ageShape.override.id };
      synthAgeDef = {
        type: "DefinitionIsDefinition",
        body: rep.valueProjection!.body,
        location: rep.valueProjection!.location,
      };
      // Strip the consumed posrep AND default the local type to the implicit-standard Observation
      // (so the `code is` retrieve + FHIR case-feature lower exactly as the retired form did).
      c = { ...c, representations: [], conceptType: c.conceptType ?? "Observation" };
    }
    // `ageShape.kind === "standalone"` cannot occur for a code-bearing concept (recency requires the
    // local `code is`); `resolveAgeConcept` never returns it here.

    // (2) MIXED `code` + top-level `definition`. BOTH-REPRESENTATION is SUPPORTED (the
    //     case-feature model): the concept SPLITS into a LocalSource retrieve twin (the
    //     direct local code) + an Inferred twin. Supported both-rep flavors:
    //       - `code is` + `defined as`                 → UNION fold-in (historical).
    //       - `code is` + an age `source representation` → RECENCY merge (patient-age;
    //         handled by the (AGE) block above, which strips the posrep + synthesizes the
    //         definition).
    //     `code is` + `definition is age today` is RETIRED (the migration target is the
    //     age posrep) — the pre-lowering retirement scan owns that error, so it is skipped
    //     here rather than double-reported. `code is` + `coded from` / any other
    //     `definition is` stay hard errors (they don't fold into the truth-set lane).
    if (c.definition !== undefined && c.definition.type !== "DefinedAsDefinition") {
      if (c.definition.type === "DefinitionIsDefinition" && isAgeTodayPrefix(c.definition.body)) {
        continue; // retired `definition is age today` — owned by checkRetiredAgeDefinitions
      }
      errors.push(
        mkError(
          "emit-mixed-code-and-definition",
          `Concept "${c.name}" carries BOTH a local \`code is\` and a top-level ` +
            `definition (\`${c.definition.type}\`). Only \`code is\` + \`defined as\` ` +
            `or \`code is\` + an age \`source representation\` (both-representation) is ` +
            `supported; \`code is\` + \`${c.definition.type}\` is out of scope — emit ` +
            `nothing rather than silently drop the local-code source side.`,
          loc,
        ),
      );
      continue;
    }
    const bothRepDefinedAs =
      c.definition !== undefined && c.definition.type === "DefinedAsDefinition"
        ? c.definition
        : undefined;
    // The RECENCY both-rep computed arm — the synthesized age definition + its parsed
    // {op, threshold}, present only when the (AGE) block consumed a Patient age posrep.
    const bothRepRecency: { threshold: string; op: AgeRecencyOp; computeFn: AgeComputeFn } | null =
      ageMerge
        ? { threshold: ageMerge.args.threshold, op: ageMerge.args.op, computeFn: ageMerge.args.computeFn }
        : null;
    const bothRepDefinitionIs = ageMerge !== null ? synthAgeDef : undefined;

    // (3a) BOTH-REP + `source representation` 3-way — out of scope this round.
    //      An ACCEPTED both-rep (`code is` + `defined as`, OR `code is` + the age
    //      `definition is`) that ALSO carries a `source representation` would fall
    //      through to the representation skip below and pass un-split — SILENTLY
    //      DROPPING the local-code side (violating "emit nothing rather than
    //      silently drop"). Diagnose loudly instead. Checked BEFORE the plain
    //      representation skip so the both-rep case is caught, not swallowed.
    if (
      (bothRepDefinedAs !== undefined || bothRepDefinitionIs !== undefined) &&
      c.representations &&
      c.representations.length > 0
    ) {
      errors.push(
        mkError(
          "emit-mixed-code-and-definition",
          `Concept "${c.name}" carries a local \`code is\`, a both-representation ` +
            `definition (\`${c.definition!.type}\`), AND a \`source representation\`. ` +
            `The \`code is\` + definition + \`source representation\` 3-way is out of ` +
            `scope this round — emit nothing rather than silently drop the local-code ` +
            `source side.`,
          loc,
        ),
      );
      continue;
    }

    // (3b) REPRESENTATION-bearing (`code` + representation, no top-level
    //     definition, non-empty code) — out of scope this slice. SKIP: leave
    //     `code` intact, do NOT lower, no error. Checked AFTER empty + mixed so
    //     a malformed representation-bearing concept still gets its hard error;
    //     lowering it would silently drop the external-source-representation side
    //     (the existing layered guard / per-CRL stub handles it).
    if (c.representations && c.representations.length > 0) {
      continue;
    }

    // (4) Missing `type is` (no FHIR resource for the retrieve). Do NOT default
    //     to Observation — the resource must be explicit.
    if (c.conceptType === undefined) {
      errors.push(
        mkError(
          "emit-local-code-missing-type",
          `Concept "${c.name}" has a local \`code is\` but no \`type is\`. A locally ` +
            `coded concept needs an explicit FHIR resource type for its retrieve ` +
            `(it is NOT defaulted to Observation).`,
          loc,
        ),
      );
      continue;
    }

    // (5) Duplicate local code VALUE across valid (lowerable) concepts. The
    //     value is recorded only AFTER the earlier validity checks pass, so this
    //     compares two valid concepts asserting the same local domain code.
    const prior = codeValueToConcept.get(codeValue);
    if (prior !== undefined) {
      errors.push(
        mkError(
          "emit-duplicate-local-code",
          `Local code \`${codeValue}\` is declared by both "${prior}" and "${c.name}". ` +
            `Each local source code must be unique within the library.`,
          loc,
        ),
      );
      continue;
    }

    // (6) Duplicate synthetic-terminology NAME across valid (lowerable)
    //     concepts. Two `code is` concepts sharing a name would synthesize two
    //     same-named terminologies that collapse in the emitter's name-keyed
    //     maps (and in `loweredByName` below), silently dropping one. Diagnose.
    if (seenSyntheticNames.has(c.name)) {
      errors.push(
        mkError(
          "emit-duplicate-local-concept",
          `Two local-coded concepts named "${c.name}" would each synthesize a ` +
            `terminology of that name, colliding in the emitted CQL. Concept names ` +
            `must be unique within the library.`,
          loc,
        ),
      );
      continue;
    }

    // (7) Synthetic-terminology name collides with a hand-authored terminology.
    if (existingTerminologyNames.has(c.name)) {
      errors.push(
        mkError(
          "emit-local-code-terminology-collision",
          `Lowering local-coded concept "${c.name}" would synthesize a terminology ` +
            `of the same name, but a terminology "${c.name}" already exists in this ` +
            `library. Rename one so the synthesized local code does not collide.`,
          loc,
        ),
      );
      continue;
    }

    codeValueToConcept.set(codeValue, c.name);
    seenSyntheticNames.add(c.name);

    // Record the lowered code from the SAME code path that synthesizes its
    // terminology (below), so the FHIR lane's selection cannot drift from what
    // the CQL lane emits. `conceptType` is defined here — checked at (4).
    localCodes.push({ concept: c.name, code: codeValue, conceptType: c.conceptType! });

    // Build the synthetic local Terminology (codesystem + single code) named
    // after the concept. Its system line carries the SHARED domain codesystem
    // decl name (`localCodesystemName`); the emitter emits ONE shared
    // `codesystem "<domain>": '<urn>'` (deduped across all synthetic
    // terminologies) and per-concept `code` lines `from "<domain>"`. The code
    // NAME still follows the concept: on the PER-CRL path detectCollisions
    // suffixes it to "<Concept> Code" (concept of the same name co-resides),
    // emitting `code "<Concept> Code": '<value>' from "<domain>"`; on the
    // LAYERED path no collision fires and the code is named bare "<Concept>"
    // (see the EMITTED IDENTIFIER NOTE in the file header).
    const syntheticTerminology = buildSyntheticTerminology(
      c.name,
      codeValue,
      localCodesystemName,
      urn,
      loc,
    );
    syntheticTerminologies.push(syntheticTerminology);

    // Replace the concept's `code` with a CodedFromDefinition bare-ref'ing the
    // synthetic code's NAME. Clearing `code` makes the transform idempotent.
    // Force the LOCAL-SOURCE retrieve to `[Observation: …]`: every `code is`
    // query is an Observation/boolean determination, regardless of the author's
    // `type is`. `retrieveResourceType` overrides ONLY the emitted retrieve
    // resource; the concept keeps its `conceptType` (and the `localCodes` entry
    // keeps the author's source type) for the Phase-2/3 inferred transform.
    const codedFrom: CodedFromDefinition = {
      type: "CodedFromDefinition",
      terminologyName: c.name,
      retrieveResourceType: "Observation",
      location: loc,
    };

    // R2 CO-INVARIANT ASSERT (F7) — the two synthetic-only discriminators
    // `classifyStatementLayer` keys on (LocalConcepts vs RecordConcepts; LocalSource
    // vs RecordSource) MUST be set TOGETHER for one lowered `code is` concept. The
    // synthetic Terminology's `TerminologySystem.name` marks LocalConcepts; the
    // synthetic `CodedFromDefinition.retrieveResourceType` marks LocalSource. A
    // future edit that sets one without the other would silently desync the two
    // source families (a LocalConcepts code with a RecordSource retrieve, or the
    // inverse) → a cross-family include downstream. Fail loudly here, matching the
    // loudness bar of the cross-family throw in `collectLayerIncludes`.
    const hasSyntheticDomainName = syntheticTerminology.body.some(
      (line) => line.type === "TerminologySystem" && line.name !== undefined,
    );
    if (!hasSyntheticDomainName || codedFrom.retrieveResourceType === undefined) {
      throw new Error(
        `internal invariant violated: lowered local-code concept "${c.name}" has a ` +
          `desynced source-family discriminator — synthetic TerminologySystem.name ` +
          `${hasSyntheticDomainName ? "set" : "UNSET"}, CodedFromDefinition.retrieveResourceType ` +
          `${codedFrom.retrieveResourceType === undefined ? "UNSET" : "set"}. Both must be set ` +
          `together (LocalConcepts ⟺ LocalSource) or the layered split would emit a cross-family include.`,
      );
    }

    // The LocalSource retrieve twin (or, for a pure `code is` concept, THE
    // lowered concept). `definition` is replaced with the synthetic retrieve and
    // `code` cleared (idempotent). For a both-rep concept this is the direct
    // local-source half; its `defined as` lives on the Inferred twin below.
    const lowered: Concept = { ...c, definition: codedFrom };
    delete lowered.code;
    loweredConcepts.push(lowered);

    // BOTH-REPRESENTATION: also synthesize the INFERRED twin carrying the original
    // definition, marked so the emit merges in the direct LocalSource retrieve.
    // Same name as the LocalSource twin — they land in different layer libraries;
    // `buildNameLayerMaps` resolves the name to Inferred (the public determination).
    //   - `defined as` twin → `__bothRepMerge: "union"` (asTruths() union inference).
    //   - age posrep twin → `__bothRepMerge: "recency"` (raw-Observation recency vs live
    //     computed age); the twin carries the threshold + comparator op + compute fn (`AgeAt`
    //     years / `AgeInMonths` months, #215/#257 T2) AND the stable `__recencyOverrideId` so the
    //     emit looks the override up (age is ONE caller). Its `definition` was SYNTHESIZED from the
    //     posrep projection, so it is
    //     flagged `__synthesizedFromPosrep` (the retirement guard must never fire on it).
    if (bothRepDefinedAs !== undefined) {
      const inferredTwin: Concept = {
        ...c,
        definition: bothRepDefinedAs,
        __bothRepFoldInLocalSource: c.name,
        __bothRepMerge: "union",
      };
      delete inferredTwin.code;
      bothRepInferredTwins.push(inferredTwin);
    } else if (bothRepDefinitionIs !== undefined && bothRepRecency !== null) {
      const inferredTwin: Concept = {
        ...c,
        definition: bothRepDefinitionIs,
        __bothRepFoldInLocalSource: c.name,
        __bothRepMerge: "recency",
        __bothRepRecencyThreshold: bothRepRecency.threshold,
        __bothRepRecencyOp: bothRepRecency.op,
        __recencyComputeFn: bothRepRecency.computeFn,
        __recencyOverrideId: ageMerge!.overrideId,
        __synthesizedFromPosrep: true,
      };
      delete inferredTwin.code;
      bothRepInferredTwins.push(inferredTwin);
    }
  }

  // Re-thread statements: replace each lowered concept in place, and append the
  // synthetic terminologies at the FRONT of the statement list (Concepts-layer
  // terminologies). Ordering among synthetic terminologies follows source
  // concept order (stable). The emitter sorts/sections terminologies vs concepts
  // itself, so absolute position only affects intra-terminology ordering.
  const loweredByName = new Map<string, Concept>();
  for (const c of loweredConcepts) loweredByName.set(c.name, c);

  // Nothing actually lowered — every `code`-bearing concept was either skipped
  // (representation lane) or errored. Return the input AST UNTOUCHED (===) so
  // callers that key off identity to detect "did this library synthesize a
  // local codesystem?" (e.g. `imports/emit.ts`'s `didLower = lowered.ast !==
  // entry.ast`) don't get a false positive from a same-content clone.
  if (loweredConcepts.length === 0) {
    return { ast, errors, localCodes };
  }

  const rewritten: Statement[] = ast.statements.map((stmt) => {
    if (stmt.type === "Concept" && loweredByName.has(stmt.name)) {
      return loweredByName.get(stmt.name) as Concept;
    }
    return stmt;
  });

  const outAst: CRL = {
    ...ast,
    // Synthetic local terminologies at the FRONT (Concepts layer); the
    // both-representation INFERRED twins APPENDED at the end (Inferred layer) —
    // they share a name with their LocalSource twin already present in
    // `rewritten`, so they cannot be the in-place replacement and must be added
    // as additional statements. The emitter sections by kind/layer, so absolute
    // position is immaterial beyond stable intra-layer ordering.
    statements: [...syntheticTerminologies, ...rewritten, ...bothRepInferredTwins],
  };

  return { ast: outAst, errors, localCodes };
}

/**
 * #257 (age slice) T1 — lower STANDALONE (1-representation) patient-age posreps: a concept with
 * a single age `source representation`, NO `code is` (no local override), and NO top-level
 * `definition`. This is the age determination WITHOUT a recency merge — there is no local twin, so
 * it simply becomes an Inferred `definition is` concept whose `definition` is SYNTHESIZED from the
 * posrep's `value projection` (flagged `__synthesizedFromPosrep`). It then rides the ordinary
 * `emitDefinitionIs` path — byte-identical to the retired standalone `definition is age today`.
 *
 * PURE (does not mutate the input AST): it shallow-copies only the rewritten concepts. Runs BEFORE
 * `lowerLocalCodes` in the emit pipeline; the 2-representation recency case (`code is` + age
 * posrep) is handled inside `lowerLocalCodes` instead (it reuses the `code is` lowering machinery).
 * The WHOLE-CONCEPT shape is classified by the SHARED `resolveAgeConcept`, so a no-code age-shaped
 * mis-authoring (unsanctioned / wrong-carrier / a second representation / a stray `definition`) is a
 * LOUD hard error — never a silent stub — and cannot drift from the author-time validator.
 */
export function lowerStandaloneAgePosreps(ast: CRL): { ast: CRL; errors: CRLError[] } {
  const errors: CRLError[] = [];
  let changed = false;
  const rewritten = ast.statements.map((stmt): Statement => {
    if (stmt.type !== "Concept") return stmt;
    const c = stmt;
    // A `code is` concept is the 2-rep recency case (`lowerLocalCodes` owns it); skip it here so its
    // age shape is not double-processed.
    if (c.code !== undefined) return stmt;
    const shape = resolveAgeConcept(c);
    if (shape.kind === "not-age") return stmt;
    if (shape.kind === "error") {
      // Includes the no-code `definition` + age posrep case (the classifier reports it as a shape
      // error), so a stray definition can no longer silently swallow the age representation.
      errors.push(mkError(shape.errorKind, shape.message, c.location));
      return stmt;
    }
    // A `"recency"` verdict requires a local `code is`, so it cannot occur on this no-code path.
    if (shape.kind !== "standalone") return stmt;
    const rep = (c.representations ?? []).find((r) => resolveRecencyProjection(r).kind === "match")!;
    changed = true;
    const synth: Concept = {
      ...c,
      representations: [],
      definition: {
        type: "DefinitionIsDefinition",
        body: rep.valueProjection!.body,
        location: rep.valueProjection!.location,
      },
      __synthesizedFromPosrep: true,
    };
    return synth;
  });
  // Return the input UNTOUCHED (===) when nothing changed and no error, so identity-keyed callers
  // ("did this library transform?") don't get a false positive from a same-content clone.
  if (!changed && errors.length === 0) return { ast, errors };
  return { ast: { ...ast, statements: rewritten }, errors };
}

/**
 * The shared AGE pre-pipeline: the emit-boundary retirement scan of authored `definition is age
 * today` (via `isRetiredAgeTodayDefinition` on the ORIGINAL ast) + `lowerStandaloneAgePosreps`. Run
 * by EVERY emit lane (`emitCQLFromAST`, the imports/case-feature lane, the FHIR closure) BEFORE
 * `lowerLocalCodes`, so the standalone target is usable everywhere and the retirement fires on every
 * path (none runs the Validator). Returns the (possibly transformed) ast + all errors. Behavior on
 * the ast identity: it returns the input `===` when nothing transformed and no retirement fired, so
 * a caller's `didLower` (computed against THIS output) stays accurate.
 */
export function preLowerAge(ast: CRL): { ast: CRL; errors: CRLError[] } {
  const retirementErrors: CRLError[] = [];
  for (const stmt of ast.statements) {
    if (stmt.type === "Concept" && isRetiredAgeTodayDefinition(stmt)) {
      const def = stmt.definition;
      const loc = def && def.type === "DefinitionIsDefinition" ? def.body.location : stmt.location;
      retirementErrors.push(mkError("emit-age-definition-retired", ageRetirementMessage(stmt.name), loc));
    }
  }
  const standalone = lowerStandaloneAgePosreps(ast);
  return { ast: standalone.ast, errors: [...retirementErrors, ...standalone.errors] };
}

/**
 * Build a synthetic Terminology node: one codesystem (URN) + one code line.
 *
 * The Terminology is named after the concept (`name`) — this drives the code
 * identifier and the retrieve ref, unchanged. The `domainName` is set on the
 * `TerminologySystem` line as its SHARED codesystem DECLARATION name (slice 4b);
 * every synthetic terminology in the library passes the SAME `domainName`, so
 * the emitter emits that one codesystem decl once and references it from every
 * code line.
 */
function buildSyntheticTerminology(
  name: string,
  codeValue: string,
  domainName: string,
  urn: string,
  loc: Location,
): Terminology {
  const systemLine: TerminologyBodyLine = {
    type: "TerminologySystem",
    system: urn,
    name: domainName,
    location: loc,
  };
  const codeLine: TerminologyBodyLine = {
    type: "TerminologyCode",
    code: codeValue,
    location: loc,
  };
  return {
    type: "Terminology",
    name,
    body: [systemLine, codeLine],
    location: loc,
  };
}

function mkError(kind: string, message: string, loc: Location): CRLError {
  return {
    type: "Validation",
    kind,
    line: loc.start.line,
    column: loc.start.column,
    message,
  };
}

/**
 * The concept NAMES that lower into the shared local codesystem for `ast` — i.e. the exact FHIR
 * case-feature `action.input` domain (`lowerLocalCodes().localCodes`). This is the ONE eligibility
 * authority the emitter and the Medical-Validation concept-shape model (disc 189) share, so the MV
 * panes' leaf questions cannot drift from what the emitted PlanDefinition asks under `$apply`.
 *
 * FAIL-CLOSED: a library whose lowering has ANY hard error emits NO case-features at all — the emitter's
 * `caseFeatureGateOpen` (`fhir-emitter/closureOrchestrator.ts`) requires `errors.length === 0`. Since
 * `lowerLocalCodes` can push a valid concept to `localCodes` BEFORE a later concept errors (e.g. a
 * duplicate code value), returning the partial pre-error set would over-claim leaves the emitter never
 * emits. So on any error this returns ∅. The internal-invariant `throw` (which never fires on valid
 * input) is likewise caught → ∅, so running this over a non-emittable policy during VALIDATION cannot
 * crash the cockpit build. Membership is independent of `opts` (they only shape the emitted URL/name),
 * so the bare call suffices.
 *
 * KNOWN EDGE (opts): membership is opts-independent EXCEPT one pathological collision. `lowerLocalCodes`
 * derives the synthetic local-codesystem DECL NAME from `opts.localDomainId ?? ast.library.name` and hard-errors
 * if it collides with a top-level identifier. A library that literally declares an identifier named
 * "<LibraryName> Local Codes" would error here (→ ∅) while the real emit — which passes the POLICY-ID
 * `localDomainId` — may not collide and DOES emit. That under-claims (never mis-claims) and requires absurd
 * naming, so it is accepted; a precise fix would thread the emit's `localDomainId` in. The broad `catch` is
 * deliberate — this runs during VALIDATION and must degrade (∅) rather than crash the cockpit build.
 */
export function leafEligibleConcepts(ast: CRL): Set<string> {
  try {
    const lowered = lowerLocalCodes(ast);
    if (lowered.errors.length > 0) return new Set();
    return new Set(lowered.localCodes.map((lc) => lc.concept));
  } catch {
    return new Set();
  }
}
