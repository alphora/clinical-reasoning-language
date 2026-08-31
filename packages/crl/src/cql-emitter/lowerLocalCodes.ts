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

import { assumedShapePreMigration } from "../grammar/conceptShapes";
import type {
  AgeComputeFn,
  AgeRecencyOp,
  CRL,
  Concept,
  CodedFromDefinition,
  DefinedAsDefinition,
  DefinitionIsDefinition,
  Reduction,
  ReductionConceptRef,
  Statement,
  Terminology,
  TerminologyBodyLine,
  Location,
} from "../ast/types";
import { EMIT_REDUCTION_NOT_ACTIVE_KIND, getRefName } from "../ast/types";
import type { ReferenceName } from "../ast/types";
import { conceptRefsOfDefinition } from "../ast/conceptDependencies";
import { matchNarrative } from "../template-match/matcher";
import { patternReturnShape } from "../template-match/patternCatalog";
import {
  deriveEffectiveRepresentations,
  type EffectiveRepresentationDescriptor,
  type OwningLibraryMetadata,
} from "../emit/effectiveRepresentation";
import { caseFeatureUrlFromPolicyId, localCodeSystemSlug, localCodeSystemUrl } from "../fhir-emitter/slug";
import { resolveProducerCandidates } from "../emit/producerCandidate";
import type { ProducerCandidateSpec } from "../emit/producerCandidate";
import { isAgeTodayPrefix } from "../template-match/agePredicate";
import {
  resolveRecencyValueConcept,
  isMemberExistenceInterface,
} from "../template-match/recencyValueConcept";
import {
  ageRetirementMessage,
  isRetiredAgeTodayDefinition,
  resolveAgeConcept,
  resolveRecencyProjection,
  type AgeProjectionArgs,
} from "../template-match/recencyProjectionOverride";
import type { CRLError } from "../types/errors";
import { isPureQuestionConcept } from "../template-match/recencyValueConcept";

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
   * The project's `crl.canonicalBase`. The synthetic local codesystem's URL is
   * published under it (`<base>/CodeSystem/<slug>-local`). **#271 — REQUIRED when
   * the library has local `code is` concepts:** absent/empty is a hard
   * `missing-canonical-url-base` error (no URN fallback), mirroring the FHIR lane so
   * the CQL and FHIR local-codesystem identities stay byte-equal.
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
  /**
   * ⭐ #189 — the POLICY ID (`metadata.name`), used to compose a PRODUCER stage's constructed candidate
   * `meta.profile` — the case-feature StructureDefinition url — through the shared `slug.ts` authority the
   * FHIR lane also calls. Distinct from `localDomainId`, which is `localDomainIdFor(...)` output and
   * diverges for sibling libraries.
   *
   * ⚠ Absent for direct/test callers. A concept that actually NEEDS it (one with a producer stage) then
   * REFUSES with a structured error rather than stamping an `unnamed` canonical that silently disagrees
   * with the FHIR lane. Concepts without a producer are unaffected.
   */
  policyId?: string;
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

  // #271 — a library with local `code is` concepts requires `crl.canonicalBase`. The
  // synthetic local CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`, and
  // the CQL and FHIR lanes MUST derive it from the SAME base; the absent/empty case was
  // previously swallowed → a `urn:crl:codesystem:<domain>-local` fallback that silently
  // diverged the CQL lane from the FHIR lane (which hard-fails). Match the FHIR lane:
  // hard error, no URN fallback.
  //
  // PRECEDENCE (deliberate): this reports BEFORE the per-concept structural diagnostics
  // (empty/mixed/missing-type/duplicate) in the loop below — MIRRORING the FHIR lane,
  // whose `normalizePackageMetadata` returns on the missing base before its per-field
  // checks (`fhir-emitter/metadata.ts:169-177`). Fixing the base can reveal a structural
  // defect on the next run; the two lanes stay consistent.
  //
  // FORWARD-COMPAT (deliberate over-approximation): the fast-path predicate above
  // (`isLowerableConcept` = "has a `code`") is broader than "will synthesize a local
  // terminology" — a `code is` + non-age `source representation` concept is PRESERVED
  // (skip 3b) and emits no CodeSystem TODAY, yet still requires the base here. That shape
  // lowers under the concept-model direction and will then need the base; requiring it now
  // keeps the CQL/FHIR local identity base-derived rather than sometimes-urn. (If this
  // false-positive ever bites a real CQL-only, sourced-only library, narrow by raising the
  // error lazily at first actual synthesis — compute `urn` inside the loop.)
  //
  // ⚠ The early return hands back the INPUT `ast` BY IDENTITY. `imports/emit.ts` relies on
  // that (its `didLower` check keeps the guarded `localCodeSystemUrl` at :481 unreached).
  // A future "clone the ast on this error path" edit would arm that throw — keep identity.
  const canonicalBase = opts.canonicalBase?.trim().replace(/\/+$/, "") ?? "";
  if (!canonicalBase) {
    errors.push({
      type: "Validation",
      kind: "missing-canonical-url-base",
      message:
        "package.json `crl.canonicalBase` is required for a library with local `code is` concepts — the synthetic local CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`, and the CQL and FHIR lanes MUST derive it from the same base. " +
        'Add e.g. `"crl": { "canonicalBase": "http://example.org/crl/myproject" }` to your project root\'s package.json.',
    });
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
    } else if (stmt.type === "Criterion" && stmt.name) {
      // #236 — a criterion emits `define "X"`, a top-level CQL identifier, so the synthetic
      // `<Lib> Local Codes` codesystem name must be checked against it too (disc 420, both arms).
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

  // #189 Piece 1 (disc 506) — the names of RECENCY-VALUE concepts in this library, pre-scanned so the
  // `code is` + `defined as exists` union path can tell a MEMBER-EXISTENCE fold (its referent is a recency-value
  // both-rep → the interface emits a TOTAL member-existence boolean) from the deferred truth-set union. A pre-pass
  // because concept order is arbitrary (a value concept may be declared AFTER the interface that references it).
  const recencyValueNames = new Set<string>();
  // ⭐⭐ #189 — the recency-value concepts that also run a PRODUCER stage. A member-existence fold over one of
  // these is REFUSED below; see the refusal for why it cannot merely be classified.
  const producerBearingNames = new Set<string>();
  for (const stmt of ast.statements) {
    if (stmt.type === "Concept") {
      const rv = resolveRecencyValueConcept(stmt);
      if (rv.kind === "recency-value") {
        recencyValueNames.add(stmt.name);
        if (rv.producerStages.length > 0) producerBearingNames.add(stmt.name);
      }
    }
  }

  const loweredConcepts: Concept[] = [];
  // Both-representation INFERRED twins (`code is` + `defined as`): the inference
  // half of a split, appended to the statement list AFTER the rewrite. Each keeps
  // the original `defined as` and carries `__bothRepFoldInLocalPrimitives` so the emit
  // unions in the direct LocalPrimitives retrieve. Keyed in declaration order.
  const bothRepInferredTwins: Concept[] = [];
  // #189 Slice A2 — the RECORDS TWINS of `code is` + `exists this` concepts. A concept "X" with a
  // local `code is` AND `definition is exists this` lowers to TWO statements: this RecordSet
  // retrieve twin "X Records" (the concept's own records, over its local code, NATURAL resource) +
  // the retargeted reduction concept "X" (`exists "X Records"`, pushed to `loweredConcepts`). The
  // twins are APPENDED to the statement list (they share no name with an existing statement).
  const recordsTwins: Concept[] = [];
  // #189 Piece 1 (disc 506) — the synthetic ExternalPrimitives SOURCE concepts (`"<X> Source"`) of a both-rep
  // RECENCY-VALUE split. Each is a `coded from` retrieve over the source terminology (`[ServiceRequest: "Covered
  // Devices"]`), appended to the statement list (a new name, no in-place replacement). Sibling of `recordsTwins`.
  const externalSourceTwins: Concept[] = [];
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
  const urn = localCodeSystemUrl(canonicalBase, opts.localDomainId ?? ast.library.name);

  // ⭐ #189 — the AUTHORED concepts by name, for producer-operand resolution. Built from the INPUT ast, so it
  // is the author's library view, not a half-lowered one: an operand is resolved against what the author
  // declared (its `shape is` / `type is`), never against a twin this pass happens to have synthesized first.
  const conceptsByName = new Map<string, Concept>();
  for (const st of ast.statements) {
    if ((st as { type?: string }).type === "Concept") {
      const cc = st as Concept;
      if (cc.name) conceptsByName.set(cc.name, cc);
    }
  }

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
    // ⭐ #189 null/pause — classify the PURE QUESTION off the AUTHORED statement, HERE, before anything
    // rebinds `c`. The (AGE) block below strips a consumed Patient-age posrep (`c = { ...c, representations:
    // [] }`), which leaves a concept that LOOKS like a bare `code is` boolean — so classifying later reads an
    // age recency merge, a TWO-ARM determination, as a one-arm question. MEASURED: that mis-marking was
    // already latent on every age recency twin's LocalPrimitives half before step 2b (harmless only because
    // an `source-impl` role short-circuits every consumer of the marker); 2b made it live by giving a
    // question an Inferences twin, and nine `lowerLocalCodes` recency tests failed at once.
    const isPureQuestion = isPureQuestionConcept(stmt);
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
    // ⭐⭐ #189 — HOISTED ABOVE THE `ReductionDefinition` GUARD, and that hoist is the fix.
    //
    // `resolveRecencyValueConcept` now asks the SHARED `resolveConceptPipeline` whether the concept's program
    // ENDS IN A SELECTION, so it admits both goal spellings — a bare `most recent this` (a
    // `ReductionDefinition`) and `<producer>, then most recent this` (a `DefinitionIsDefinition`). While this
    // block sat INSIDE the reduction guard below, the pipeline spelling could never reach it and fell through
    // to the generic `emit-mixed-code-and-definition`, which is what stopped every producer-bearing goal
    // concept from emitting at all.

    // #189 Piece 1 (disc 506) — the both-rep RECENCY-VALUE 3-OUTPUT split. Intercepted HERE, BEFORE the
    // single-rep reduction gate below (which rejects a `source representation` 3-way). The shape is classified by
    // the SHARED `resolveRecencyValueConcept` (mirrors `resolveAgeConcept`), so the lowering gate,
    // `classifyBooleanTotality`, and the descriptor deriver cannot drift. Synthesizes THREE outputs — a same-name
    // LocalPrimitives records retrieve, a synthetic ExternalPrimitives `"<X> Source"` retrieve, and the Inferences
    // `Scalar<value-type>` recency merge (the PUBLIC determination). REFACTOR:grounded — re-derived from the
    // charter §3 value/interface convention + the layered-emit classification invariants (`classifyStatementLayer`
    // `retrieveResourceType` set⟺LocalPrimitives / undefined⟺ExternalPrimitives; `requalifyDefinition` ThisRecords
    // throw; `buildNameLayerMaps` Inferences-wins for same-name).
    const rv = resolveRecencyValueConcept(c);
    if (rv.kind === "recency-value") {
      const localResource = c.conceptType ?? "Observation"; // implicit-standard local Observation (charter §3)
      // Dedup / collision — the THIRD copy of the (5)-(7)+(A2) mirror (DRY note above; keep lock-step).
      const priorForCode = codeValueToConcept.get(codeValue);
      if (priorForCode !== undefined) {
        errors.push(
          mkError(
            "emit-duplicate-local-code",
            `Local code \`${codeValue}\` is declared by both "${priorForCode}" and "${c.name}". Each ` +
              `local source code must be unique within the library.`,
            loc,
          ),
        );
        continue;
      }
      if (seenSyntheticNames.has(c.name)) {
        errors.push(
          mkError(
            "emit-duplicate-local-concept",
            `Two local-coded concepts named "${c.name}" would each synthesize a terminology of that name, ` +
              `colliding in the emitted CQL. Concept names must be unique within the library.`,
            loc,
          ),
        );
        continue;
      }
      if (existingTerminologyNames.has(c.name)) {
        errors.push(
          mkError(
            "emit-local-code-terminology-collision",
            `Lowering local-coded concept "${c.name}" would synthesize a terminology of the same name, but a ` +
              `terminology "${c.name}" already exists in this library. Rename one so the synthesized local code ` +
              `does not collide.`,
            loc,
          ),
        );
        continue;
      }
      // The synthetic EXTERNAL source concept `"<X> Source"` emits its own top-level `define` — guard its name
      // against every existing top-level identifier + earlier twin (mirror the records-twin (A2) guard).
      const sourceName = `${c.name} Source`;
      if (topLevelIdentifierNames.has(sourceName)) {
        errors.push(
          mkError(
            "emit-records-twin-name-collision",
            `Lowering both-rep recency-value concept "${c.name}" synthesizes an external source concept ` +
              `"${sourceName}", but a top-level identifier of that name already exists in library ` +
              `"${ast.library.name}". Rename "${c.name}" (or the conflicting declaration) so the synthesized ` +
              `"${sourceName}" is unique.`,
            loc,
          ),
        );
        continue;
      }

      // Derive BOTH arms' descriptors from the ORIGINAL authored concept (ONE source of truth — the tested
      // `deriveEffectiveRepresentations`), carried on the merge twin for the marker-driven emit. A both-rep
      // recency-value concept resolves to exactly `[local-exact, source]`; anything else is a compiler/shape
      // defect — fail loud (never a silent under-resolved merge). Run BEFORE any dedup-state mutation.
      const owningMeta: OwningLibraryMetadata = {
        libraryName: ast.library.name,
        canonicalBase,
        localDomainId: opts.localDomainId ?? ast.library.name,
      };
      const outcome = deriveEffectiveRepresentations(c, owningMeta);
      const localDesc =
        outcome.status === "derived"
          ? outcome.descriptors.find((d) => d.arm === "local-exact")
          : undefined;
      const sourceDesc =
        outcome.status === "derived"
          ? outcome.descriptors.find((d) => d.arm === "source")
          : undefined;
      if (
        outcome.status !== "derived" ||
        outcome.descriptors.length !== 2 ||
        localDesc === undefined ||
        sourceDesc === undefined
      ) {
        const detail =
          outcome.status === "derived"
            ? `${outcome.descriptors.length} descriptor(s), not a [local-exact, source] pair`
            : outcome.status === "error"
              ? `${outcome.error.kind}: ${outcome.error.detail}`
              : outcome.status;
        errors.push(
          mkError(
            "emit-most-recent-derivation",
            `Concept "${c.name}": the both-rep recency-value merge did not resolve to a [local-exact, source] ` +
              `descriptor pair (${detail}).`,
            loc,
          ),
        );
        continue;
      }

      // COMMIT dedup state (all guards passed) + register the FHIR local code (drives the CodeSystem / SD).
      codeValueToConcept.set(codeValue, c.name);
      seenSyntheticNames.add(c.name);
      topLevelIdentifierNames.add(sourceName);
      localCodes.push({ concept: c.name, code: codeValue, conceptType: localResource });

      // The synthetic LOCAL terminology (the local codesystem entry the LP retrieve's `coded from` bare-refs).
      const localTerminology = buildSyntheticTerminology(c.name, codeValue, localCodesystemName, urn, loc);
      syntheticTerminologies.push(localTerminology);

      // (a) LP twin — SAME-NAME local records retrieve `[<localResource>: "X"]` (LocalPrimitives). Mirrors the
      //     both-rep `lowered` concept below; role `source-impl` (its determination is the Inferences merge).
      const localCodedFrom: CodedFromDefinition = {
        type: "CodedFromDefinition",
        terminologyName: c.name,
        retrieveResourceType: localResource, // SET → LocalPrimitives (classifyStatementLayer)
        location: loc,
      };
      // F7 co-invariant: synthetic TerminologySystem.name (LocalConcepts) ⟺ retrieveResourceType (LocalPrimitives).
      const localHasDomainName = localTerminology.body.some(
        (line) => line.type === "TerminologySystem" && line.name !== undefined,
      );
      if (!localHasDomainName || localCodedFrom.retrieveResourceType === undefined) {
        throw new Error(
          `internal invariant violated: recency-value LP twin "${c.name}" has a desynced source-family ` +
            `discriminator (LocalConcepts ⟺ LocalPrimitives) — both must be set together.`,
        );
      }
      const lpTwin: Concept = {
        ...c,
        representations: [],
        definition: localCodedFrom,
        __loweringRole: "source-impl",
      };
      delete lpTwin.code;
      loweredConcepts.push(lpTwin);

      // (b) EP source concept `"<X> Source"` — a hand-authored-style external `coded from` retrieve over the
      //     SOURCE terminology (`[ServiceRequest: "Covered Devices"]`). `retrieveResourceType: undefined` →
      //     ExternalPrimitives; `conceptType` (from the posrep's `type is`) drives the retrieve resource. Publishes
      //     RECORDS (RecordSet, no scalar value — the merge selects newest from it, the fold `exists` over it).
      const sourceCodedFrom: CodedFromDefinition = {
        type: "CodedFromDefinition",
        terminologyName: rv.sourceRep.terminologyName!, // the resolver guarantees `coded from`
        retrieveResourceType: undefined, // UNDEFINED → ExternalPrimitives (classifyStatementLayer)
        location: loc,
      };
      const epSource: Concept = {
        ...c,
        name: sourceName,
        shape: "RecordSet",
        valueTypes: [],
        representations: [],
        conceptType: rv.sourceRep.conceptType, // the source resource (ServiceRequest)
        definition: sourceCodedFrom,
        __loweringRole: "source-impl",
      };
      delete epSource.code;
      delete epSource.meta; // a compiler-internal retrieve — do NOT republish the author's meta/evidence
      delete epSource.evidence;
      externalSourceTwins.push(epSource);

      // (c) Inferences MERGE twin — SAME-NAME public determination. The emit is MARKER-DRIVEN
      //     (`__bothRepMerge === "recency-value"`), so the retargeted `most recent <self>` reduction body is
      //     NEVER rendered; it exists only to (i) classify Inferences and (ii) survive `requalifyDefinition`
      //     WITHOUT the `ThisRecords` throw (the bare self-name ref is harmless — unrendered). Carries the
      //     descriptors + the `__bothRepFoldInLocalPrimitives` self-fold include marker.
      const mergeReduction: Reduction = {
        kind: "mostRecent",
        target: { type: "ReductionConceptRef", ref: c.name, location: loc } as ReductionConceptRef,
      };
      // ⭐⭐ #189 — THE PRODUCER STAGES, RESOLVED HERE AND CARRIED ON THE TWIN.
      //
      // ⚠ THE AUTHORED PIPELINE DOES NOT SURVIVE THIS LOWERING. The twin below replaces `c.definition` with a
      // synthetic `most recent <self>` reduction (it exists only to classify Inferences and to survive
      // `requalifyDefinition`), so a `<producer>, then most recent this` concept arrives at the emitter with
      // NO trace of its producer. An emitter that iterated the definition would find nothing and union the
      // two retrieve arms alone — which is exactly the silent-drop this slice exists to make impossible.
      // (Panel round 1, gpt-5.6 arm: the plan's render-time iteration was over a list that is not there.)
      //
      // So resolution happens WHERE THE FACTS ARE — lowering has the whole-library view an operand lookup
      // needs — and the twin carries the finished specs. `resolveProducerCandidates` refuses (typed, with an
      // author-facing message) for every shape it does not cover, so a partial spec can never reach emit.
      let producerSpecs: readonly ProducerCandidateSpec[] = [];
      if (rv.producerStages.length > 0) {
        const resolved = resolveProducerCandidates({
          concept: c,
          producerStages: rv.producerStages,
          siblingsByName: conceptsByName,
          code: { system: urn, code: codeValue },
          owningLibraryName: ast.library.name,
          // ⚠ COMPOSED BY THE SHARED AUTHORITY (`fhir-emitter/slug.ts`), which the FHIR lane's
          // `caseFeatureCanonicalUrl` now delegates to. The constructed candidate's `meta.profile` and the
          // emitted case-feature StructureDefinition url are ONE composition, so they cannot drift.
          profile: opts.policyId
            ? caseFeatureUrlFromPolicyId(canonicalBase, opts.policyId, c.name)
            : "",
        });
        if (resolved.kind === "refused") {
          errors.push(mkError(resolved.refusal.kind, resolved.refusal.message, c.definition?.location ?? loc));
          continue;
        }
        producerSpecs = resolved.specs;
      }

      const mergeTwin: Concept = {
        ...c,
        representations: [],
        definition: { type: "ReductionDefinition", reduction: mergeReduction, location: loc },
        __bothRepMerge: "recency-value",
        __bothRepFoldInLocalPrimitives: c.name, // LP self-fold include (collectLayerIncludes)
        // ⭐ #189 — WHAT THIS MERGE PUBLISHES, from the ONE resolver, set in lock-step with the descriptors.
        // `Scalar` → the newest record's value; `Record` → the newest record over the union of the arms.
        __recencyMergePublishes: rv.publishes,
        __recencyValueDescriptors: { local: localDesc, source: sourceDesc },
        // ⭐ #189 — THE SPACE, LISTED rather than derived, on the SAME channel the record-union twin uses
        // (design P2-D3). Both twins now describe their space as a term list and both render it through ONE
        // function, so "what is in this concept's space" has a single reader. Listing it is also what makes
        // `local ∪ n posreps ∪ n constructed candidates` expressible without touching the emitter again.
        __recordUnionTerms: [
          { kind: "local-primitives" as const, define: c.name },
          { kind: "external-primitives" as const, define: sourceName },
          ...producerSpecs.map((spec) => ({ kind: "constructed" as const, stageIndex: spec.stageIndex })),
        ],
        __recencyProducerSpecs: producerSpecs,
        __loweringRole: "public-determination",
      };
      delete mergeTwin.code;
      bothRepInferredTwins.push(mergeTwin);
      continue;
    }

    // `ageShape.kind === "standalone"` cannot occur for a code-bearing concept (recency requires the
    // local `code is`); `resolveAgeConcept` never returns it here.

    // (2-pre) `code is` + a `definition is` REDUCTION (#189). Caught HERE, BEFORE the generic mixed
    //   check below. Slice A2 ACTIVATES the ONE emittable form — `exists this` with NO `source
    //   representation` — by lowering it to a RECORDS TWIN + a retargeted named `exists`. Every OTHER
    //   reduction form (count / most recent, and `exists` over an already-NAMED ref) and the 3-way
    //   `code is` + reduction + `source representation` stay validate-only: the KE gets the dedicated
    //   `emit-reduction-not-active` sentinel (naming the reduction) rather than the generic
    //   `emit-mixed-code-and-definition`. Each remaining form activates in its owning slice.
    if (c.definition?.type === "ReductionDefinition") {
      const red = c.definition.reduction;


      // Slice A2 activated `exists this`; B1 added `count this at least N`; B2a a Scalar boolean `most
      // recent this` value read; B2b a `shape is Record` `most recent this` record select. All reduce THIS
      // concept's OWN records (a records twin), so they share ONE lowering — only the retargeted reduction
      // node (and its emit rendering) differ. Still validate-only: a NON-boolean Scalar `most recent this`
      // value read (Slice C), any `<reduction>` over an already-NAMED ref coupled with a local `code is`, a
      // representation-bearing reduction, and the `code is` + reduction + `source representation` 3-way —
      // the dedicated `emit-reduction-not-active` sentinel.
      const isThisReduction = red.target.type === "ThisRecords" && c.representations.length === 0;
      const emittable =
        isThisReduction && (red.kind === "exists" || red.kind === "count" || red.kind === "mostRecent");
      if (!emittable) {
        errors.push(
          mkError(
            EMIT_REDUCTION_NOT_ACTIVE_KIND,
            `Concept "${c.name}" carries a local \`code is\` and a \`definition is\` reduction that ` +
              `is not yet emittable. \`exists this\`, \`count this at least N\`, a Scalar boolean ` +
              `\`most recent this\` (value read on a value-bearing resource), and a \`shape is Record\` ` +
              `\`most recent this\` (select the newest record) with no \`source representation\` lower ` +
              `today (#189 Slice A/B1/B2a/B2b); a NON-boolean Scalar \`most recent this\` value read, ` +
              `any \`<reduction>\` over a named ref WHEN coupled with this local \`code is\` (the ` +
              `no-\`code is\` named \`exists "Y"\` IS active — Slice A), and a \`code is\` + reduction + ` +
              `\`source representation\` 3-way are accepted by the grammar for validate-only migration ` +
              `but CANNOT yet be emitted — each activates in its slice.`,
            c.definition.location,
          ),
        );
        continue;
      }

      // `count … at least N` with N < 1 is trivially true (every set has at least N<1 members) — an
      // author error at emit (matrix §2), mirroring the validator's `count-threshold-trivial` warning.
      if (red.kind === "count" && red.atLeast < 1) {
        errors.push(
          mkError(
            "emit-count-threshold-trivial",
            `Concept "${c.name}": \`count this at least ${red.atLeast}\` is trivially true (every set ` +
              `has at least ${red.atLeast} members). Use \`at least 1\` for a presence threshold (or ` +
              `\`definition is exists this\`), or a threshold ≥ 1.`,
            c.definition.location,
          ),
        );
        continue;
      }

      // The reduction phrase for kind-aware diagnostics below.
      const reductionPhrase =
        red.kind === "count" ? "count this" : red.kind === "mostRecent" ? "most recent this" : "exists this";

      // COHERENCE (charter: never emit a value shape the concept's declaration contradicts).
      if (red.kind !== "mostRecent") {
        // `exists`/`count` publish a SCALAR BOOLEAN (presence / threshold is true-or-false), so the
        // concept must declare exactly `shape is Scalar` + a single `value type is boolean`. This MATCHES
        // the totality classifier (`booleanTotality.ts` rejects a Scalar with ≠1 value type) and §2's
        // `Scalar × boolean` cell; absent/multiple/non-boolean is incoherent (an absent one is itself an
        // A.10 validator error). emitCQL runs no validator, so enforce it here rather than manufacture —
        // or arm a Slice-C proof failure by emitting a cell the classifier rejects (emit ⊄ classifier).
        if (assumedShapePreMigration(c.shape) !== "Scalar" || c.valueTypes.length !== 1 || c.valueTypes[0] !== "boolean") {
          const vtClause =
            c.valueTypes.length === 1
              ? ` and \`value type is ${c.valueTypes[0]}\``
              : c.valueTypes.length > 1
                ? ` and ${c.valueTypes.length} value types (needs exactly one \`boolean\`)`
                : " and no `value type`";
          errors.push(
            mkError(
              "emit-reduction-shape-incoherent",
              `Concept "${c.name}": \`definition is ${reductionPhrase}\` ` +
                `publishes a Scalar boolean (presence/threshold is true-or-false), but the concept ` +
                `declares \`shape is ${c.shape}\`${vtClause}. Declare \`- shape is Scalar.\` with ` +
                `\`value type is boolean\`.`,
              c.definition.location,
            ),
          );
          continue;
        }
      } else {
        // `most recent this` — TWO active cells, discriminated by the concept's declared shape:
        //  · `shape is Scalar` (#189 Slice B2a) READS the newest record's value element. Scoped to a single
        //    `value type is boolean`: the per-type FHIR value conversion (Quantity, CodeableConcept, …) is not
        //    yet built, so a NON-boolean value read would round-trip-break on the DTR lane (disc 433). A
        //    value-bearing NON-boolean read defers to Slice C (below, after the deriver).
        //  · `shape is Record` (#189 Slice B2b) SELECTS the newest record (any registry resource, NO value
        //    read). It reads no value, so it must NOT declare a `value type` (the record resource is `type
        //    is`); it reuses the B2a select-newest spine with no value filter/read.
        // `shape is RecordSet` is incoherent: a set publishes its records, not a reduced/selected value.
        if (assumedShapePreMigration(c.shape) === "RecordSet") {
          errors.push(
            mkError(
              "emit-reduction-shape-incoherent",
              `Concept "${c.name}": \`definition is most recent this\` on \`shape is RecordSet\` is ` +
                `incoherent — a RecordSet publishes its records, not a reduced value. Declare ` +
                `\`- shape is Scalar.\` (read a value) or \`- shape is Record.\` (select the newest record).`,
              c.definition.location,
            ),
          );
          continue;
        }
        if (assumedShapePreMigration(c.shape) !== "Record") {
          // Scalar (B2a value read) → exactly one `value type` (the datum it reads). A `shape is Record`
          // select (B2b) gets NO value-type check: per the design of record, a Record's `value type` is
          // OPTIONAL and, when present, names the record's DATUM — which a bare record select never reads, so
          // it is metadata the emit ignores. The validator is clean on `shape is Record` + `value type` +
          // `most recent this` (`representationShapeValidator` only errors >1 value types;
          // `useSiteType.test.ts` proves it valid), so rejecting it here would hard-fail validator-clean
          // content at emit — the exact validate/emit split the flip must avoid (crl-emit B2b panel #1, both
          // arms; design `docs/emit-consistency-189-design.md` §1 + reduction table).
          if (c.valueTypes.length !== 1) {
            errors.push(
              mkError(
                "emit-reduction-shape-incoherent",
                `Concept "${c.name}": \`definition is most recent this\` needs exactly one \`value type\` ` +
                  `(the datum it reads); the concept declares ${c.valueTypes.length}.`,
                c.definition.location,
              ),
            );
            continue;
          }
        }
        // The boolean-vs-non-boolean split (Scalar only) is deferred to AFTER the deriver runs (below): the
        // deriver's valueless check must fire FIRST so a valueless resource always gets the "author `exists
        // this`" prompt, NOT a Slice-C defer it will never satisfy (crl-emit B2a impl Claude #1 — e.g.
        // Condition + `value type is Quantity`, which is PERMANENTLY invalid, not merely deferred).
      }

      // ---- Slice A2/B1 lowering: `code is` + `exists this`/`count this` → records twin + retargeted
      //      named reduction. ----
      // DRY NOTE (crl-emit R1 probe 3): checks (4)–(7) below MIRROR the plain `code is` path's
      // (4)–(7) and share the same dedup state (`codeValueToConcept`, `seenSyntheticNames`,
      // `existingTerminologyNames`). Keep the two copies in lock-step — a fix to one must land in the
      // other (a shared-helper extraction is the intended cleanup once a third caller appears).
      // (4) Missing `type is`: the records-twin retrieve needs an explicit FHIR resource (NOT
      //     defaulted to Observation — the records are the concept's OWN natural resource, §4.3).
      if (c.conceptType === undefined) {
        errors.push(
          mkError(
            "emit-local-code-missing-type",
            `Concept "${c.name}" has a local \`code is\` + \`${reductionPhrase}\` but no \`type is\`. Its ` +
              `records twin needs an explicit FHIR resource type for the retrieve (it is NOT ` +
              `defaulted to Observation).`,
            loc,
          ),
        );
        continue;
      }
      // (5) Duplicate local code VALUE across valid concepts (same dedup domain as the plain path).
      const priorForCode = codeValueToConcept.get(codeValue);
      if (priorForCode !== undefined) {
        errors.push(
          mkError(
            "emit-duplicate-local-code",
            `Local code \`${codeValue}\` is declared by both "${priorForCode}" and "${c.name}". ` +
              `Each local source code must be unique within the library.`,
            loc,
          ),
        );
        continue;
      }
      // (6) Duplicate synthetic-terminology NAME (the twin's terminology is named after "X", exactly
      //     as the plain path). Two same-named `code is` concepts would collide in the emitter maps.
      if (seenSyntheticNames.has(c.name)) {
        errors.push(
          mkError(
            "emit-duplicate-local-concept",
            `Two local-coded concepts named "${c.name}" would each synthesize a terminology of that ` +
              `name, colliding in the emitted CQL. Concept names must be unique within the library.`,
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
            `Lowering local-coded concept "${c.name}" would synthesize a terminology of the same ` +
              `name, but a terminology "${c.name}" already exists in this library. Rename one so the ` +
              `synthesized local code does not collide.`,
            loc,
          ),
        );
        continue;
      }
      // (A2) The synthesized records-twin name "<X> Records" must not collide with any existing
      //      top-level identifier (a concept/parameter/criterion/terminology/codesystem decl) OR a
      //      previously synthesized twin — it emits its own `define "<X> Records"`, so a collision
      //      would produce a duplicate top-level CQL identifier. Diagnose rather than clobber.
      const recordsTwinName = recordsTwinDefineName(c.name);
      if (topLevelIdentifierNames.has(recordsTwinName)) {
        errors.push(
          mkError(
            "emit-records-twin-name-collision",
            `Lowering \`code is\` + \`${reductionPhrase}\` concept "${c.name}" synthesizes a records-twin ` +
              `concept "${recordsTwinName}", but a top-level identifier of that name already exists ` +
              `in library "${ast.library.name}". Rename "${c.name}" (or the conflicting declaration) ` +
              `so the synthesized "${recordsTwinName}" is unique.`,
            loc,
          ),
        );
        continue;
      }

      // #189 Slice B2a — for a `most recent this` VALUE READ, resolve the effective-representation
      // descriptor (resource value-bearing check, recency sort, value element) via the ONE source of
      // truth `deriveEffectiveRepresentations`, on the ORIGINAL concept. Run AFTER the (4)–(7)+(A2) twin
      // checks (Claude #6: so a missing `type is` already hard-errored on the twin rule, NOT the
      // deriver's `?? "Observation"` default). A derivation error (valueless resource / unmodeled /
      // not-admitted / unsupported) → the mapped hard error (one taxonomy) + `continue` (before any
      // dedup-state mutation, so a rejected concept leaves no partial state).
      let mostRecentDescriptor: EffectiveRepresentationDescriptor | undefined;
      if (red.kind === "mostRecent") {
        const owningMeta: OwningLibraryMetadata = {
          libraryName: ast.library.name,
          canonicalBase,
          localDomainId: opts.localDomainId ?? ast.library.name,
        };
        const outcome = deriveEffectiveRepresentations(c, owningMeta);
        if (outcome.status === "error") {
          const e = outcome.error;
          // Reuse the T3a error taxonomy (one taxonomy — disc 433); the emit branch OWNS the "author
          // `exists this`" migration prompt on the valueless cell (the deriver's message does not carry
          // it — Claude #5). `value-read-valueless` = a scalar value read on a resource with no value.
          const message =
            e.kind === "value-read-valueless"
              ? `Concept "${c.name}": \`most recent this\` reads a value, but ${e.detail} Existence is ` +
                `forced on a valueless resource — author \`definition is exists this\` instead.`
              : `Concept "${c.name}": \`most recent this\` — ${e.detail}`;
          errors.push(mkError(e.kind, message, loc));
          continue;
        }
        if (
          outcome.status !== "derived" ||
          outcome.descriptors.length !== 1 ||
          (outcome.deferredArms?.length ?? 0) > 0
        ) {
          // A single-rep `code is` `most recent this` MUST resolve to exactly one local-exact descriptor
          // and no deferred (source) arms (gpt56 #1); anything else is a multi-rep (deferred #257) or a
          // compiler/shape defect — fail loud rather than emit an under-resolved read.
          const detail =
            outcome.status === "derived"
              ? `${outcome.descriptors.length} descriptors${(outcome.deferredArms?.length ?? 0) > 0 ? " + deferred source arm(s)" : ""}`
              : outcome.status;
          errors.push(
            mkError(
              "emit-most-recent-derivation",
              `Concept "${c.name}": \`most recent this\` did not resolve to a single local representation ` +
                `(${detail}). A multi-representation \`most recent this\` is deferred to #257.`,
              loc,
            ),
          );
          continue;
        }
        const desc = outcome.descriptors[0];
        // The arm is always local-exact for a `code is` `most recent this` (a source-only concept
        // deferred/errored above; the single-descriptor invariant already rejected deferred source arms).
        // Guard it ONCE, shape-agnostically, then branch the DATUM contract on the concept's declared shape.
        if (desc.arm !== "local-exact") {
          errors.push(
            mkError(
              "emit-most-recent-derivation",
              `Concept "${c.name}": \`most recent this\` resolved to a non-local-exact descriptor (arm ` +
                `"${desc.arm}"), which a single-representation local \`code is\` cannot produce.`,
              loc,
            ),
          );
          continue;
        }
        if (assumedShapePreMigration(c.shape) === "Record") {
          // B2b — a RECORD SELECT reads no value: the descriptor MUST carry NO datum (valueElement /
          // datumValueType undefined) and a recency sort, over ANY registry resource (the deriver already
          // fail-closed `unsupported-resource` for a non-registry / Period-recency resource, e.g. Encounter).
          // No Observation pin, no boolean check — a Record select works on every registry row. A
          // datum-bearing or recency-less descriptor here is a deriver/shape defect.
          if (
            desc.valueElement !== undefined ||
            desc.datumValueType !== undefined ||
            desc.recency === undefined
          ) {
            errors.push(
              mkError(
                "emit-most-recent-derivation",
                `Concept "${c.name}": a \`shape is Record\` \`most recent this\` resolved to a datum-bearing ` +
                  `or recency-less descriptor (resource "${desc.resourceType}", value element ` +
                  `"${desc.valueElement ?? "(none)"}", datum "${desc.datumValueType ?? "(none)"}"). A record ` +
                  `select reads no value — this is a compiler invariant that the deriver upholds.`,
                loc,
              ),
            );
            continue;
          }
        } else {
          // B2a (Scalar) — a value-bearing DERIVED descriptor (a valueless resource errored above with the
          // exists-this prompt). Explicitly Observation-only (the SOLE value-bearing registry row; the
          // case-feature round-trip contract was justified on that — disc 433); pin `resourceType ===
          // "Observation"` EXPLICITLY rather than relying on the registry staying single-value-bearing — a
          // future value-bearing row would otherwise silently widen B2a (gpt56 impl #6a). An unexpected
          // descriptor SHAPE here is a compiler defect; a valid NON-boolean value read is a DEFERRAL.
          if (
            desc.resourceType !== "Observation" ||
            desc.valueElement === undefined ||
            desc.datumValueType === undefined
          ) {
            errors.push(
              mkError(
                "emit-most-recent-derivation",
                `Concept "${c.name}": \`most recent this\` resolved to a descriptor outside the Slice-B2a ` +
                  `Observation value-read cell (resource "${desc.resourceType}", value element ` +
                  `"${desc.valueElement ?? "(none)"}", datum "${desc.datumValueType ?? "(none)"}"). ` +
                  `A non-Observation value-bearing read widens at Slice C.`,
                loc,
              ),
            );
            continue;
          }
          if (desc.datumValueType !== "boolean") {
            // A NON-boolean value read on a value-bearing resource (the deriver already errored a valueless
            // one with the exists-this prompt — Claude #1). Deferred to Slice C: the per-type FHIR value
            // conversion (Quantity→ToQuantity, CodeableConcept, …) is not yet built.
            errors.push(
              mkError(
                EMIT_REDUCTION_NOT_ACTIVE_KIND,
                `Concept "${c.name}": a NON-boolean \`most recent this\` value read (\`value type is ` +
                  `${desc.datumValueType}\`) is not yet emittable — the per-type FHIR value conversion is ` +
                  `deferred (Slice C).`,
                c.definition.location,
              ),
            );
            continue;
          }
        }
        mostRecentDescriptor = desc;
      }

      codeValueToConcept.set(codeValue, c.name);
      seenSyntheticNames.add(c.name);
      topLevelIdentifierNames.add(recordsTwinName); // guard later twins / concepts against this twin

      // Surface the lowered local code under the AUTHORED concept identity "X" (NOT the synthetic twin
      // "X Records"). `localCodes.concept` drives the FHIR CodeSystem `display`, the SD
      // `patternCodeableConcept`, and leaf-eligibility — the PUBLIC clinical identity — exactly as the
      // plain `code is` path uses `c.name`. The code VALUE is what the CQL `code "X Code"` line and the
      // twin's retrieve both reference, so CQL and the FHIR CodeSystem stay consistent on the code
      // while the compiler-internal twin name never becomes FHIR/provenance identity (crl-emit R1 #1b).
      // `conceptType` is the natural resource (checked non-undefined at (4)).
      localCodes.push({ concept: c.name, code: codeValue, conceptType: c.conceptType });

      // Synthetic terminology named after "X" (NOT the twin): `detectCollisions` sees it collide with
      // the retargeted reduction concept "X" and suffixes the emitted code to "X Code"; the twin's
      // `CodedFromDefinition.terminologyName = "X"` then resolves via `terminologyEmitName` →
      // `[<resource>: "X Code"]`. Reuses the shared local-domain codesystem decl name + urn.
      const twinTerminology = buildSyntheticTerminology(c.name, codeValue, localCodesystemName, urn, loc);
      syntheticTerminologies.push(twinTerminology);

      // The RECORDS TWIN "X Records": a `shape is RecordSet` retrieve over the local code, at the
      // concept's NATURAL resource (§4.3 — NOT forced Observation; that force is only for the
      // boolean-determination LocalPrimitives retrieve of a plain `code is`). `retrieveResourceType` is
      // set explicitly (= the natural resource) so the F7 LocalConcepts⟺LocalPrimitives discriminator
      // stays in sync for the layered path (Slice C). `shape: "RecordSet"` is what `emitConceptBody`'s
      // Slice-A gate keys on to emit `exists ("X Records")`.
      const twinCodedFrom: CodedFromDefinition = {
        type: "CodedFromDefinition",
        terminologyName: c.name,
        retrieveResourceType: c.conceptType,
        location: loc,
      };

      // R2 CO-INVARIANT ASSERT (F7) — hoisted from the plain-path site (crl-emit R1 probe 4): the twin's
      // two LocalConcepts⟺LocalPrimitives discriminators (synthetic `TerminologySystem.name` and
      // `retrieveResourceType`) MUST be set together, or the Slice-C layered split would emit a
      // cross-family include. True by construction here, but the assert exists to catch a future edit.
      const twinHasDomainName = twinTerminology.body.some(
        (line) => line.type === "TerminologySystem" && line.name !== undefined,
      );
      if (!twinHasDomainName || twinCodedFrom.retrieveResourceType === undefined) {
        throw new Error(
          `internal invariant violated: records twin "${recordsTwinName}" has a desynced source-family ` +
            `discriminator — synthetic TerminologySystem.name ${twinHasDomainName ? "set" : "UNSET"}, ` +
            `CodedFromDefinition.retrieveResourceType ` +
            `${twinCodedFrom.retrieveResourceType === undefined ? "UNSET" : "set"}. Both must be set ` +
            `together (LocalConcepts ⟺ LocalPrimitives) or the layered split would emit a cross-family include.`,
        );
      }
      const recordsTwin: Concept = {
        ...c,
        name: recordsTwinName,
        shape: "RecordSet",
        // The twin publishes the concept's own RECORDS, not the scalar boolean — carry NO scalar value
        // type (do NOT inherit the parent's `value type is boolean`; a RecordSet's value type would
        // describe the record datum, which a bare existence retrieve does not project — crl-emit R1 #4).
        valueTypes: [],
        definition: twinCodedFrom,
        representations: [],
        // #189 Slice C 2a — a compiler-internal RecordSet retrieve, not a boolean determination; the ledger
        // enrollment manufactures `not-applicable` for it (never inheriting an authored obligation).
        __loweringRole: "records-impl",
      };
      delete recordsTwin.code;
      // The twin is a compiler-internal retrieve, not an authored concept — do NOT republish the
      // author's `meta is` / evidence on it (those stay on the public determination "X").
      delete recordsTwin.meta;
      delete recordsTwin.evidence;
      recordsTwins.push(recordsTwin);

      // The retargeted reduction concept "X": keep it a `ReductionDefinition` but point the reduction at
      // the NAMED twin instead of `this`, PRESERVING its kind + `count` threshold. `emitConceptBody` emits
      // `exists ("X Records")` / `Count("X Records") >= N` / the `most recent` select-newest read.
      // (#189 Slice C: a `ReductionDefinition` now CLASSIFIES into the Inferences layer — `classifyStatementLayer`
      // — so a decision-bearing reduction library routes `interface` and the reduction re-exports through the
      // Interface. The earlier "stays unclassifiable → routes none" invariant was retired at the flip.)
      // `code` cleared. A `most recent this` also carries the resolved `__effectiveDescriptor` so
      // `emitConceptBody` renders the recency sort + value read from ONE source of truth (Slice B2a).
      const retargetedTarget: ReductionConceptRef = {
        type: "ReductionConceptRef",
        ref: recordsTwinName,
        location: loc,
      };
      const retargetedReductionNode: Reduction =
        red.kind === "count"
          ? { kind: "count", atLeast: red.atLeast, target: retargetedTarget }
          : red.kind === "mostRecent"
            ? { kind: "mostRecent", target: retargetedTarget }
            : { kind: "exists", target: retargetedTarget };
      const retargetedReduction: Concept = {
        ...c,
        definition: {
          type: "ReductionDefinition",
          reduction: retargetedReductionNode,
          location: c.definition.location,
        },
        ...(mostRecentDescriptor !== undefined ? { __effectiveDescriptor: mostRecentDescriptor } : {}),
        // #189 Slice C 2a — the emitted PUBLIC determination (the reduction re-export); the ledger
        // enrollment inherits its AUTHORED obligation (classified on the pre-lowering `c`). NOTE this
        // concept ALSO carries `__effectiveDescriptor` for a `most recent this` — the role tag (not
        // marker presence) is what routes obligation source (disc 439 crit #1).
        __loweringRole: "public-determination",
      };
      delete retargetedReduction.code;
      loweredConcepts.push(retargetedReduction);
      continue;
    }

    // ⭐ (2-REDUCTION) #189 — `code is` + `definition is <selection> "<Named>"`, NO `source representation`.
    //
    // `Greatest Weight` — `code is greatest-weight` + `definition is highest "Weight Records"`,
    // `shape is Record`. Two arms: the local answer slot and the derivation. The operator stated the
    // semantics with a worked example (2026-08-29): the reduction reduces `this` ∪ the named set —
    //
    //     highest collection: 5 "weight records" ∪ 3 `greatest-weight` records
    //     WR=2, WR=5, g-w=6 ←, WR=4, g-w=1, g-w=1, WR=5, WR=6 ←  ⇒  6
    //
    // ⭐ THE UNION IS THE POINT. Without it the derivation reads `weight`-coded records while the assertion
    // carries `greatest-weight`, so the answer slot is written and NEVER READ —  the exact defect
    // `obesityTarget.test.ts` already records as measured ("an answer slot nothing reads").
    //
    // TWO OUTPUTS (no EP twin — there is no posrep here):
    //   (a) LP twin    — the same-name LOCAL records retrieve        (LocalPrimitives)
    //   (b) Inferences — the PUBLIC determination: the reduction, over `this` ∪ the named set
    //
    // ⚠ SHAPE-EXACT: a SELECTION pattern (instance-returning: MostRecent/Last/Earliest/First/Highest/Lowest)
    // over ONE named concept, `shape is Record`, no posrep, `type is` present. A selection COLLAPSES TO ONE,
    // which is what `shape is Record` publishes — so no trailing reduction is owed and none is invented.
    // Everything else falls through to the mixed error below and stays loud: a producer stage (a formula,
    // a threshold) does not select, so a `shape is Record` concept carrying one owes a following reduction;
    // a posrep makes it the 3-arm case; a non-Record shape declares something the stage does not produce.
    if (
      c.definition?.type === "DefinitionIsDefinition" &&
      (c.representations ?? []).length === 0 &&
      assumedShapePreMigration(c.shape) === "Record" &&
      c.conceptType !== undefined
    ) {
      const matched = matchNarrative(c.definition.body);
      const namedRefs = conceptRefsOfDefinition(c.definition);
      const isSelection =
        matched.known && patternReturnShape(matched.pattern) === "instance" && namedRefs.length === 1;
      if (isSelection) {
        const priorForCode = codeValueToConcept.get(codeValue);
        if (priorForCode !== undefined) {
          errors.push(
            mkError(
              "emit-duplicate-local-code",
              `Local code \`${codeValue}\` is declared by both "${priorForCode}" and "${c.name}". Each ` +
                `local source code must be unique within the library.`,
              loc,
            ),
          );
          continue;
        }
        if (seenSyntheticNames.has(c.name) || existingTerminologyNames.has(c.name)) {
          errors.push(
            mkError(
              "emit-local-code-terminology-collision",
              `Lowering "${c.name}" would synthesize a terminology of that name, but it is already taken ` +
                `in library "${ast.library.name}". Rename one so the synthesized local code does not collide.`,
              loc,
            ),
          );
          continue;
        }
        codeValueToConcept.set(codeValue, c.name);
        seenSyntheticNames.add(c.name);
        localCodes.push({ concept: c.name, code: codeValue, conceptType: c.conceptType });
        syntheticTerminologies.push(
          buildSyntheticTerminology(c.name, codeValue, localCodesystemName, urn, loc),
        );

        // (a) LP twin — the local records retrieve. `retrieveResourceType` SET ⟺ LocalPrimitives.
        const lpTwin: Concept = {
          ...c,
          representations: [],
          definition: {
            type: "CodedFromDefinition",
            terminologyName: c.name,
            retrieveResourceType: c.conceptType,
            location: loc,
          },
          __loweringRole: "source-impl",
        };
        delete lpTwin.code;
        loweredConcepts.push(lpTwin);

        // (b) Inferences twin — the PUBLIC determination. Keeps the AUTHORED narrative (so ref resolution,
        //     requalification and the catalog match all run normally); the marker tells the emit to union
        //     the LP records into the set being reduced.
        const reductionTwin: Concept = {
          ...c,
          representations: [],
          __reductionLocalUnion: c.name,
          __loweringRole: "public-determination",
        };
        delete reductionTwin.code;
        bothRepInferredTwins.push(reductionTwin);
        continue;
      }
    }

    // (2) MIXED `code` + top-level `definition`. BOTH-REPRESENTATION is SUPPORTED (the
    //     case-feature model): the concept SPLITS into a LocalPrimitives retrieve twin (the
    //     direct local code) + an Inferences twin. Supported both-rep flavors:
    //       - `code is` + `defined as`                 → UNION fold-in (historical).
    //       - `code is` + an age `source representation` → RECENCY merge (patient-age;
    //         handled by the (AGE) block above, which strips the posrep + synthesizes the
    //         definition).
    //     `code is` + `definition is age today` is RETIRED (the migration target is the
    //     age posrep) — the pre-lowering retirement scan owns that error, so it is skipped
    //     here rather than double-reported.
    //
    // ⚠ BUILD DEBT, NOT A SCOPE DECISION (charter §0a). `code is` + any other `definition is` hard-errors
    // below because the fold-in is UNBUILT for it, not because the shape is illegal — it is the canonical
    // production shape, and the `fixtures/obesity` target is built on it, so this error is what stops that
    // target emitting at all. Generalizing the `defined as` fold-in to cover `definition is` is the work.
    // The error stays LOUD meanwhile: emitting nothing beats silently dropping the local-code source side.
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
            `supported; \`code is\` + \`${c.definition.type}\` is NOT YET LOWERED — emit ` +
            `nothing rather than silently drop the local-code source side. This is unbuilt work, not an ` +
            `illegal form: do not re-author the concept to avoid it.`,
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
            `The \`code is\` + definition + \`source representation\` 3-way is NOT YET ` +
            `LOWERED — emit nothing rather than silently drop the local-code source side. ` +
            `This is unbuilt work, not an illegal form: do not re-author the concept to avoid it.`,
          loc,
        ),
      );
      continue;
    }

    // ⭐ (3b-UNION) #189 — `code is` + ONE simple `source representation`, NO definition, `shape is RecordSet`.
    //
    // The charter states the semantics outright (§3): *"a concept unions the records from all its
    // representations"*. MEASURED before building: NEITHER arm emitted — a posrep-bearing concept failed
    // `emit-representations-only-not-lowered` in BOTH the direct and the layered lane, WITH or WITHOUT a local
    // code (`tmp/nullprobe/analysis/posrepOnly-out.txt`, `layeredUnion-out.txt`). So this is not "merge two
    // working arms"; the SOURCE arm had no lowering at all.
    //
    // THREE OUTPUTS, mirroring the recency-value split above (keep them in lock-step):
    //   (a) LP twin      — the same-name LOCAL records retrieve            (LocalPrimitives)
    //   (b) EP source    — `"<X> Source"`, the external retrieve           (ExternalPrimitives)
    //   (c) Inferences   — the same-name PUBLIC determination: `( "X" sem-or "X Source" )` = the UNION
    //
    // `sem-or` IS union (charter §3 set algebra), so (c) invents no operation — it states the charter's rule
    // in the language's own terms, which is what keeps this out of §4.0's "emitter magic".
    //
    // ⚠ SHAPE-EXACT and narrow BY DESIGN. Anything off-shape falls through to the skip below and keeps its
    // loud error: >1 posrep, a posrep with a `value projection` (the age lane) or a `value element` /
    // type-crossing `value type` (the general #257 posrep), a non-RecordSet shape (which would owe a stated
    // reduction — charter §3 cardinality), or a missing `type is` on either side.
    const unionReps = c.representations ?? [];
    const unionRep = unionReps.length === 1 ? unionReps[0] : undefined;
    if (
      c.definition === undefined &&
      unionRep !== undefined &&
      assumedShapePreMigration(c.shape) === "RecordSet" &&
      c.conceptType !== undefined &&
      unionRep.conceptType !== undefined &&
      unionRep.terminologyName !== undefined &&
      unionRep.valueProjection === undefined &&
      unionRep.valueElement === undefined &&
      (unionRep.valueTypes.length === 0 ||
        (unionRep.valueTypes.length === c.valueTypes.length &&
          unionRep.valueTypes.every((v, i) => v === c.valueTypes[i])))
    ) {
      const localResource = c.conceptType;
      const sourceName = `${c.name} Source`;
      // Dedup / collision — the FOURTH copy of the (5)-(7) mirror. Keep in lock-step (DRY note above).
      const priorForCode = codeValueToConcept.get(codeValue);
      if (priorForCode !== undefined) {
        errors.push(
          mkError(
            "emit-duplicate-local-code",
            `Local code \`${codeValue}\` is declared by both "${priorForCode}" and "${c.name}". Each ` +
              `local source code must be unique within the library.`,
            loc,
          ),
        );
        continue;
      }
      if (seenSyntheticNames.has(c.name) || existingTerminologyNames.has(c.name)) {
        errors.push(
          mkError(
            "emit-local-code-terminology-collision",
            `Lowering both-rep union concept "${c.name}" would synthesize a terminology of the same name, ` +
              `but that name is already taken in library "${ast.library.name}". Rename one so the ` +
              `synthesized local code does not collide.`,
            loc,
          ),
        );
        continue;
      }
      if (topLevelIdentifierNames.has(sourceName)) {
        errors.push(
          mkError(
            "emit-records-twin-name-collision",
            `Lowering both-rep union concept "${c.name}" synthesizes an external source concept ` +
              `"${sourceName}", but a top-level identifier of that name already exists in library ` +
              `"${ast.library.name}". Rename "${c.name}" (or the conflicting declaration).`,
            loc,
          ),
        );
        continue;
      }

      codeValueToConcept.set(codeValue, c.name);
      seenSyntheticNames.add(c.name);
      topLevelIdentifierNames.add(sourceName);
      localCodes.push({ concept: c.name, code: codeValue, conceptType: localResource });
      syntheticTerminologies.push(
        buildSyntheticTerminology(c.name, codeValue, localCodesystemName, urn, loc),
      );

      // (a) LP twin — the LOCAL records retrieve. `retrieveResourceType` SET ⟺ LocalPrimitives.
      const lpTwin: Concept = {
        ...c,
        representations: [],
        definition: {
          type: "CodedFromDefinition",
          terminologyName: c.name,
          retrieveResourceType: localResource,
          location: loc,
        },
        __loweringRole: "source-impl",
      };
      delete lpTwin.code;
      loweredConcepts.push(lpTwin);

      // (b) EP source twin — the EXTERNAL retrieve. `retrieveResourceType` UNDEFINED ⟺ ExternalPrimitives.
      const epSource: Concept = {
        ...c,
        name: sourceName,
        shape: "RecordSet",
        valueTypes: [],
        representations: [],
        conceptType: unionRep.conceptType,
        definition: {
          type: "CodedFromDefinition",
          terminologyName: unionRep.terminologyName,
          retrieveResourceType: undefined,
          location: loc,
        },
        __loweringRole: "source-impl",
      };
      delete epSource.code;
      delete epSource.meta; // a compiler-internal retrieve — do NOT republish the author's meta/evidence
      delete epSource.evidence;
      externalSourceTwins.push(epSource);

      // (c) Inferences twin — the PUBLIC determination, and the only one the author's name resolves to.
      //
      // ⚠ MARKER-DRIVEN, not composition-driven. Routing this through `defined as ( "X" sem-or "X Source" )`
      // was tried and MEASURED: it lands in the TRUTH-SET lane and hard-errors
      // `emit-mixed-source-inference-unsupported`, because `.asTruths()` lifts LocalPrimitives records into a
      // BOOLEAN truth-set and an ExternalPrimitives record-list cannot join one. That lane is right for a
      // boolean determination and wrong for a record-valued one: a `RecordSet<Quantity>` has no truth-set.
      // The retargeted body below is therefore NEVER rendered (the `record-union` emit reads the marker); it
      // exists only to classify the twin as Inferences and to survive `requalifyDefinition`.
      const unionTwin: Concept = {
        ...c,
        representations: [],
        definition: {
          type: "DefinedAsDefinition",
          body: {
            type: "DefinedAsComposition",
            expression: {
              type: "SemOrExpression",
              terms: [
                { type: "CompositionRef", ref: c.name, location: loc },
                { type: "CompositionRef", ref: sourceName, location: loc },
              ],
              location: loc,
            },
            location: loc,
          },
          location: loc,
        } as DefinedAsDefinition,
        __bothRepMerge: "record-union",
        __bothRepFoldInLocalPrimitives: c.name,
        // #189 P2 — the space, LISTED rather than derived from the fold-in name. Today exactly the two
        // terms the derived form produced (byte-identical output, pinned by the goldens); the point is that
        // `local ∪ n posreps ∪ n constructed candidates` is now expressible without changing the emitter
        // again (design P2-D3).
        __recordUnionTerms: [
          { kind: "local-primitives", define: c.name },
          { kind: "external-primitives", define: sourceName },
        ],
        __loweringRole: "public-determination",
      };
      delete unionTwin.code;
      bothRepInferredTwins.push(unionTwin);
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
    // Retrieve resource is SHAPE-CONDITIONAL (the flip consults `shape`): a SCALAR
    // `code is` is a boolean/existence determination → force `[Observation: …]`
    // regardless of `type is` (that premise holds only for the scalar boolean). A
    // `shape is RecordSet | Record` concept is a RECORD PUBLISHER — it retrieves
    // its OWN records at the NATURAL resource (charter §3 / design §2 `(none)/RecordSet`
    // — resource from `type is`); forcing Observation there emits the wrong retrieve
    // and diverges from A2's `exists this` twin (which is natural). `conceptType` is
    // defined for a non-Scalar lowered concept (the (4) missing-type guard above), so
    // the `?? "Observation"` only backstops the F7 non-undefined invariant. The concept
    // keeps its `conceptType` (and the `localCodes` entry the author's source type) for
    // the Phase-2/3 inferred transform.
    const codedFrom: CodedFromDefinition = {
      type: "CodedFromDefinition",
      terminologyName: c.name,
      retrieveResourceType: assumedShapePreMigration(c.shape) === "Scalar" ? "Observation" : (c.conceptType ?? "Observation"),
      location: loc,
    };

    // R2 CO-INVARIANT ASSERT (F7) — the two synthetic-only discriminators
    // `classifyStatementLayer` keys on (LocalConcepts vs ExternalConcepts; LocalPrimitives
    // vs ExternalPrimitives) MUST be set TOGETHER for one lowered `code is` concept. The
    // synthetic Terminology's `TerminologySystem.name` marks LocalConcepts; the
    // synthetic `CodedFromDefinition.retrieveResourceType` marks LocalPrimitives. A
    // future edit that sets one without the other would silently desync the two
    // source families (a LocalConcepts code with a ExternalPrimitives retrieve, or the
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
          `together (LocalConcepts ⟺ LocalPrimitives) or the layered split would emit a cross-family include.`,
      );
    }

    // The LocalPrimitives retrieve twin (or, for a pure `code is` concept, THE
    // lowered concept). `definition` is replaced with the synthetic retrieve and
    // `code` cleared (idempotent). For a both-rep concept this is the direct
    // local-source half; its `defined as` lives on the Inferences twin below.
    // #189 Slice C 2a — the LocalPrimitives retrieve's lowering ROLE: for a both-representation split it is the
    // implementation HALF (`source-impl` → manufactured `not-applicable`; the determination is the Inferences
    // twin below); for a PURE `code is` concept it IS the sole public determination (`public-determination`
    // → inherits the authored obligation — a bare-scalar boolean's authored `rejected`, or a RecordSet's
    // `not-applicable`). Both share the authored name, so the ROLE is what disambiguates them at enrollment
    // (a name-keyed map alone cannot — disc 439 crit #2).
    const hasInferredTwin =
      bothRepDefinedAs !== undefined || (bothRepDefinitionIs !== undefined && bothRepRecency !== null);
    const lowered: Concept = {
      ...c,
      definition: codedFrom,
      __loweringRole: hasInferredTwin ? "source-impl" : "public-determination",
      // #189 null/pause — classify the PURE QUESTION here, where the AUTHORED shape is still visible. After
      // lowering, `definition` is the retrieve, so the predicate can no longer tell a pure question (nothing
      // can compute it → UNKNOWN until answered) from a derived determination (closed-world false). The
      // Interface re-export copies this marker and emits the three-state `answeredValue()` read.
      ...(isPureQuestion ? { __pureQuestion: true as const } : {}),
    };
    delete lowered.code;

    // ⭐⭐ #189 null/pause T5 step 2b — a PURE QUESTION splits into a RECORDS TWIN + a DETERMINATION, exactly
    // as `code is` + `definition is exists this` already does. The two differ only in the READ, which is the
    // whole semantic point:
    //
    //     `code is` + `exists this`  ->  define "X": exists ("X Records")            <- closed-world false
    //     a PURE QUESTION            ->  define "X": "X Records".answeredValue()     <- true / false / NULL
    //
    // WHY A SPLIT AT ALL. Before 2b a question emitted only the RETRIEVE under its own name, so a
    // `defined as` composition over it resolved its leaf to a `List<FHIR.Observation>` and could only be
    // lowered by the truth-set collapse this slice deletes — the collapse that makes an UNANSWERED question
    // read `false` and a decision DENY where it must PAUSE. A first-class determination define fixes that with
    // NO change to the composition renderer (`compositionLeafPolicy.concept` is `(qualified) => qualified`),
    // and the Interface facade re-exports the same define bare, so every consumer reads ONE definition of
    // "answered".
    //
    // ⚠ WHY THE RECORDS-TWIN MECHANISM AND NOT THE BOTH-REP SAME-NAME TWIN (measured, not assumed). The
    // both-rep split gives BOTH halves the authored name and relies on the layered split to separate them.
    // A question does not REQUIRE a decision (it is the canonical `when`-guard shape, but a library may declare
    // questions and no decision at all), so it routes the DIRECT (unlayered) path too —
    // where same-name halves collide into a duplicate `define "X"` and the emit is refused
    // (`emit-both-rep-requires-case-feature-lane`; MEASURED on a bare one-question library). Distinct names
    // work on BOTH paths with ONE mechanism.
    if (isPureQuestion) {
      const questionTwinName = recordsTwinDefineName(c.name);
      if (topLevelIdentifierNames.has(questionTwinName)) {
        errors.push(
          mkError(
            "emit-records-twin-name-collision",
            `Lowering the pure-question concept "${c.name}" synthesizes a records-twin concept ` +
              `"${questionTwinName}", but a top-level identifier of that name already exists in library ` +
              `"${ast.library.name}". Rename "${c.name}" (or the conflicting declaration) so the ` +
              `synthesized "${questionTwinName}" is unique.`,
            loc,
          ),
        );
        continue;
      }
      topLevelIdentifierNames.add(questionTwinName);
      // The RECORDS TWIN "X Records" — the answer records themselves. A question is `type is Observation` by
      // construction (`isPureQuestionConcept`), so the forced-Observation retrieve `codedFrom` already names
      // the natural resource. Carries NO scalar value type: it publishes RECORDS, and a RecordSet's value type
      // would describe a datum a bare retrieve does not project (mirrors the reduction records twin).
      const questionRecordsTwin: Concept = {
        ...lowered,
        name: questionTwinName,
        shape: "RecordSet",
        valueTypes: [],
        __loweringRole: "records-impl",
      };
      // The twin is a compiler-internal retrieve, not an authored concept — the author's `meta is` / evidence
      // and the question marker stay on the public determination "X".
      delete questionRecordsTwin.meta;
      delete questionRecordsTwin.evidence;
      delete questionRecordsTwin.__pureQuestion;
      recordsTwins.push(questionRecordsTwin);

      // The DETERMINATION "X" — a bare ref to the twin, RENDERED as the three-state read. The ref is real (it
      // is what the read applies to), so cross-layer/cross-library requalification comes for free from the
      // shared `DefinedAsBareRef` machinery; `__pureQuestionRead` changes only how it is rendered.
      const questionDetermination: Concept = {
        ...c,
        definition: {
          type: "DefinedAsDefinition",
          body: {
            type: "DefinedAsBareRef",
            ref: questionTwinName,
            location: loc,
          },
          location: loc,
        },
        __pureQuestion: true as const,
        __pureQuestionRead: true as const,
        __loweringRole: "public-determination",
      };
      delete questionDetermination.code;
      loweredConcepts.push(questionDetermination);
      continue;
    }

    loweredConcepts.push(lowered);

    // BOTH-REPRESENTATION: also synthesize the INFERRED twin carrying the original
    // definition, marked so the emit merges in the direct LocalPrimitives retrieve.
    // Same name as the LocalPrimitives twin — they land in different layer libraries;
    // `buildNameLayerMaps` resolves the name to Inferences (the public determination).
    //   - `defined as` twin → `__bothRepMerge: "union"` (asTruths() union inference).
    //   - age posrep twin → `__bothRepMerge: "recency"` (raw-Observation recency vs live
    //     computed age); the twin carries the threshold + comparator op + compute fn (`AgeAt`
    //     years / `AgeInMonths` months, #215/#257 T2) AND the stable `__recencyOverrideId` so the
    //     emit looks the override up (age is ONE caller). Its `definition` was SYNTHESIZED from the
    //     posrep projection, so it is
    //     flagged `__synthesizedFromPosrep` (the retirement guard must never fire on it).
    if (bothRepDefinedAs !== undefined) {
      // #189 Piece 1 (disc 506) — a `defined as exists ("V")` whose referent V is a both-rep RECENCY-VALUE concept
      // is a MEMBER-EXISTENCE interface fold (a TOTAL boolean: `<own newest> or exists(LP."V") or exists(EP."V
      // Source")`, emitted by `emitMemberExistenceFold`), NOT the deferred truth-set `asTruths() union`. It carries
      // NO `__bothRepMerge` marker — that marker forces the non-total truth-set classification at the totality
      // authorities (`emittedDischargeAndType` / `computeTotality` early-return on `__bothRepMerge !== undefined`),
      // whereas WITHOUT it those authorities reach their `defined as exists` arm and correctly classify it total
      // (composite-delegated). The fold DISPATCH keys on `__bothRepFoldInLocalPrimitives` (still set), and the
      // Interface façade re-exports it BARE. Every OTHER `code is` + `defined as` stays the deferred `"union"`.
      // disc 507 A/B — shape-EXACT on BOTH the referent AND the interface's own arm (unqualified ref, recency-value
      // referent, Scalar<boolean> Observation at the default value carrier), via the SHARED predicate every site uses.
      const isMemberExistenceFold = isMemberExistenceInterface(c, (name) => recencyValueNames.has(name));
      // ⭐⭐ #189 — REFUSE a member-existence fold over a PRODUCER-BEARING referent. MEASURED, and it is a
      // silent WRONG ANSWER, not a missing feature: the fold's arms read the LocalPrimitives / ExternalPrimitives
      // RETRIEVES directly (`exists(...)`), while a producer's candidate exists only in the merge. So
      // `define "Is Obese"` evaluated FALSE on data where `Obese` is a constructed `true`
      // (`tmp/NOTES-producer-wiring-executed.md`) — two defines in one library publishing contradictory
      // determinations, under `success: true`.
      //
      // ⚠ THIS SLICE IS WHAT MADE IT REACHABLE, so it is this slice's to close. Before producers lowered, such
      // a referent hard-failed and no CQL shipped; classifying it as recency-value now lets the interface emit.
      // Both panel arms called it a release blocker rather than backlog, and they were right — charter §0a,
      // legal-but-unbuilt fails LOUDLY.
      //
      // The symmetric precedent is the projection posrep: broadening the CLASSIFIER is safe only when an
      // independent downstream refusal covers the arm that was not built. The projection got one
      // (`deriveOneSourceArm`); this lane had none. This is it, and it retires when the fold reads the space.
      if (isMemberExistenceFold) {
        const referent = getRefName((c.definition as DefinedAsDefinition & { body: { ref: ReferenceName } }).body.ref);
        if (producerBearingNames.has(referent)) {
          errors.push(
            mkError(
              EMIT_REDUCTION_NOT_ACTIVE_KIND,
              `Concept "${c.name}" is a member-existence interface over "${referent}", which computes a ` +
                `candidate from a \`definition is\` PRODUCER stage. The interface's arms test the local and ` +
                `source RETRIEVES directly, but a computed candidate exists only in "${referent}"'s merge — so ` +
                `this interface would publish \`false\` while "${referent}" beside it publishes the computed ` +
                `value. Reading the merged space from an interface is NOT YET WIRED; emitting a determination ` +
                `that contradicts its own referent is worse than refusing. This is unbuilt work, not an ` +
                `illegal form: do not re-author the concept to avoid it.`,
              c.definition?.location ?? loc,
            ),
          );
          continue;
        }
      }
      const inferredTwin: Concept = {
        ...c,
        definition: bothRepDefinedAs,
        __bothRepFoldInLocalPrimitives: c.name,
        ...(isMemberExistenceFold ? {} : { __bothRepMerge: "union" as const }),
        // #189 Slice C 2a — the both-rep public determination; inherits the authored obligation.
        __loweringRole: "public-determination",
      };
      delete inferredTwin.code;
      bothRepInferredTwins.push(inferredTwin);
    } else if (bothRepDefinitionIs !== undefined && bothRepRecency !== null) {
      const inferredTwin: Concept = {
        ...c,
        definition: bothRepDefinitionIs,
        __bothRepFoldInLocalPrimitives: c.name,
        __bothRepMerge: "recency",
        __bothRepRecencyThreshold: bothRepRecency.threshold,
        __bothRepRecencyOp: bothRepRecency.op,
        __recencyComputeFn: bothRepRecency.computeFn,
        __recencyOverrideId: ageMerge!.overrideId,
        __synthesizedFromPosrep: true,
        // #189 Slice C 2a — the age recency public determination (patient-age carve-out).
        __loweringRole: "public-determination",
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
  // entry.ast`) don't get a false positive from a same-content clone. A records
  // twin is always paired with a retargeted concept in `loweredConcepts`, so
  // `loweredConcepts.length === 0` ⟹ `recordsTwins.length === 0`; the second
  // clause documents that invariant so a future edit can't add twins without a
  // matching lowered concept and slip past this identity guard.
  if (loweredConcepts.length === 0 && recordsTwins.length === 0) {
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
    // both-representation INFERRED twins APPENDED at the end (Inferences layer) —
    // they share a name with their LocalPrimitives twin already present in
    // `rewritten`, so they cannot be the in-place replacement and must be added
    // as additional statements. The emitter sections by kind/layer, so absolute
    // position is immaterial beyond stable intra-layer ordering.
    statements: [
      ...syntheticTerminologies,
      ...rewritten,
      ...recordsTwins,
      ...externalSourceTwins,
      ...bothRepInferredTwins,
    ],
  };

  return { ast: outAst, errors, localCodes };
}

/**
 * #257 (age slice) T1 — lower STANDALONE (1-representation) patient-age posreps: a concept with
 * a single age `source representation`, NO `code is` (no local override), and NO top-level
 * `definition`. This is the age determination WITHOUT a recency merge — there is no local twin, so
 * it simply becomes an Inferences `definition is` concept whose `definition` is SYNTHESIZED from the
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
      // #189 Slice C 2a — the standalone patient-age determination (age carve-out); inherits the authored
      // obligation classified on the raw posrep concept (a `requires-boundary` age).
      __loweringRole: "public-determination",
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
 * so this passes a PROBE base (below).
 *
 * #271 CARVE-OUT to the fail-closed guarantee above: `missing-canonical-url-base` is a REAL-emit hard
 * error (a base-less project's actual case-feature emit fails closed). Because membership is
 * base-independent, this function deliberately passes a probe base so eligibility still resolves — so a
 * base-less project shows leaf-eligible concepts in the cockpit while its emit would emit no
 * case-features. That is intentional (this is an eligibility/authoring view, not an emit gate), but it
 * means this set is NOT a promise that emit will succeed.
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
    // #271 — membership is canonicalBase-INDEPENDENT (a base only shapes the
    // synthetic local-codesystem URL, not which concepts are leaf-eligible). Pass
    // a probe base so the eligibility gate is computed even when the caller hasn't
    // resolved `crl.canonicalBase`; the URL it produces is never emitted here.
    const lowered = lowerLocalCodes(ast, { canonicalBase: "http://example.org/crl/leaf-eligibility-probe" });
    if (lowered.errors.length > 0) return new Set();
    return new Set(lowered.localCodes.map((lc) => lc.concept));
  } catch {
    return new Set();
  }
}

/**
 * The synthesized RECORDS-TWIN define name for a `code is` + reduction concept `X` — `"<X> Records"`
 * (#189 Slice A2). The records twin holds the concept's own natural-resource records (`[<R>: <local code>]`);
 * the retargeted reduction concept `"<X>"` reads it (`exists "<X> Records"`). SINGLE SOURCE OF TRUTH: this is the
 * lowering's twin-name rule (used at the twin synthesis above); the #189 2d case-feature lane reuses it so the
 * `cpg-featureExpression` target (`LocalPrimitives."<X> Records"`) byte-equals the emitted define — the featureExpression
 * points at the RECORDS define, NOT the ephemeral boolean `"<X>"` (charter §4; panel disc 481/482).
 */
export function recordsTwinDefineName(conceptName: string): string {
  return `${conceptName} Records`;
}
