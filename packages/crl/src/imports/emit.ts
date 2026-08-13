import type {
  CRL,
  Concept,
  CompositionExpression,
  DefinedAsComposition,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
} from "../ast/types";
import { getRefLibrary, isQualifiedRef } from "../ast/types";
import { emitCQLFromAST, infoForParameterStatement } from "../cql-emitter/emitCQL";
import type { AstParameterInfo } from "../cql-emitter/emitCQL";
import {
  emitPartitioned,
  isLayerSplittable,
  classifyStatementLayer,
  layerLibraryNamesFor,
  interfaceConceptNames,
  FULL_PARTITION,
} from "../cql-emitter/layeredEmit";
import type { Partition } from "../cql-emitter/layeredEmit";
import { loadCatalogLibraries } from "../cql-emitter/catalog/loadCatalog";
import {
  lowerLocalCodes,
  localCodeSystemUrl,
  astHasConceptLocalCode,
  preLowerAge,
} from "../cql-emitter/lowerLocalCodes";
import { readCanonicalBase, readPolicyId } from "../fhir-emitter/metadata";
import { localDomainIdFor, pascalCaseNameForId } from "../fhir-emitter/slug";
import type { CRLError } from "../types/errors";

import { resolveImports } from "./index";
import { buildLibraryScopes, lookupKnownLibrary } from "./scopes";
import { ImportDiagnostic, RegistryEntry, ResolvedGraph } from "./types";

/**
 * Per-CRL emit (v2.1.0): one CQL file per CRL library.
 *
 * Each library in the emit closure produces its own `<libraryName>.cql` with
 * its own `library X` header, native `include FHIRHelpers`/`include CRLCommon`
 * lines, AND native CQL `include OtherLib` for every CRL library it
 * qualified-refs. Cross-library refs `"Lib"."X"` in CRL emit as CQL's native
 * `Lib."X"`. No more flat-inlining; same-name across libraries is now benign
 * because each library lives in its own CQL namespace.
 *
 * Emit closure rules:
 *   - Always include the include-walked closure from root (`graph.resolvedLibraries`).
 *   - ADDITIONALLY include any local-origin sibling library (`graph.localLibraries`)
 *     transitively referenced via qualified refs from any already-included
 *     library. Under v2.1.0 lock 026, locals auto-resolve without an explicit
 *     `include`, so they belong in the emit closure even when not walked.
 *   - Packages NOT in `graph.resolvedLibraries` (i.e., qualified-referenced
 *     without an `include`) are NOT emitted — `external-library-not-included`
 *     would have fired during validate.
 */

export interface PerLibraryEmit {
  libraryName: string;
  filePath: string;
  // Sanitized filename suitable for use in `--out-dir`. Currently just the
  // raw library name with `.cql` appended; safety enforced by
  // `safeOutputFilename`.
  outputFilename: string;
  cql: string;
  // Slice 4c — the A→E manifest the FHIR follow-up consumes. `sourceLibraryName`
  // is the ORIGINAL CRL `library "<name>"` this CQL entry was emitted from (the
  // same value for every entry produced by one split source); `role` distinguishes
  // the root/concepts/layer entries of a split from a plain per-CRL emit; `includes`
  // is the CQL library names this entry `include`s (its `collectLayerIncludes`
  // result, empty for the per-CRL path). The FHIR orchestrator (NOT this lane)
  // reads these to materialize the matching FHIR resources.
  sourceLibraryName: string;
  // R2-mechanism — the manifest role the FHIR orchestrator routes on:
  //   - `root`     : the per-CRL (`none`) emit OR the partial-split Root (keeps
  //                  the source name).
  //   - `concepts` : the terminology-owning entry (partial Concepts sibling OR
  //                  full-split LocalConcepts/RecordConcepts — owns the
  //                  CodeSystem/author-ValueSet depends-on edges).
  //   - `layer`    : a full-split source/inference layer (LocalSource /
  //                  RecordSource / Inferred) that consumes lower layers.
  //   - `interface`: the synthesized `<policyId>-Interface` re-export library
  //                  (decision/action-guard surface). The FHIR lane rewires
  //                  decision/activity/recommendation `library[]` onto it and
  //                  re-keys the `decision-root-library-missing` guard to this
  //                  role — that wiring is the FHIR half; here we just expose it.
  role: "root" | "concepts" | "layer" | "interface";
  // #186 — the RAW source-typed partition value this entry was emitted under
  // (`LocalConcepts` / `RecordConcepts` / `LocalSource` / `RecordSource` /
  // `Inferred` / `Interface`), or `undefined` for the per-CRL/`none` Root (no
  // layer). The FHIR lane derives the layered Library identity `S` DIRECTLY from
  // `layerLibraryName(policyId, layer)` off this field — it does NOT parse `S`
  // back out of the CQL `libraryName` string (that string-strip broke once S went
  // hyphen-free). `layer` and `libraryName` (= S) are produced together by the
  // CQL split, so they cannot drift.
  layer?: string;
  // The CQL library names this entry `include`s — its `collectLayerIncludes` result
  // (empty for the per-CRL path). #227 — these are the RAW source-ref names; the emit
  // RENDERS them through the `libraryRenames` map (raw→`S`) into the `.cql` text, so a
  // foreign name-keeping-root include reads as `include <S>` while this field keeps the
  // raw name. The only functional consumer, the FHIR lane's `siblingCanonicals`, is
  // PER-SOURCE: within-source split siblings carry already-final layer names (`S`, keys
  // match) and cross-source/foreign includes were never resolved into depends-on — so
  // keeping raw here is correct; the field is a dependency ledger, not the emitted text.
  includes: string[];
  // #227 — `true` ONLY for the three shared catalog libraries (CRLCommon /
  // CaseFeatureCommon / FHIRHelpers), which are fixed emitter assets (no source `.crl`,
  // `filePath: ""`) appended to every closure. The FHIR-lane Inv 6 identity invariant
  // enrolls every REAL policy Library but must EXEMPT these (their id/name/header
  // already agree and they are not manifest-identity-controlled). An explicit flag —
  // NOT the `libraryName === sourceLibraryName` accident, which also matches any policy
  // root whose raw name is already a PascalCase fixpoint (e.g. `library "Sib"`).
  isSharedCatalog?: boolean;
  // #198 C1 — the per-source DISAMBIGUATED local-domain base (`<policyId>-<librarySlug>`)
  // when this entry's source is a cross-lib `code is` SIBLING, else `undefined` (the
  // PRIMARY seed, a non-`code is` sibling, or a metadata-less caller). This is the
  // EXPLICIT identity the FHIR lane threads onto a `none` sibling's base Library
  // (`id`/`url`/`name` + every reference to it), instead of INFERRING `undefined`
  // from `libraryName === sourceLibraryName` and falling back to the bare policy id —
  // which left a `none` sibling's base Library at the bare `<policyId>` while its
  // CodeSystem was already disambiguated (an inconsistent, latently-colliding pair).
  // For a SPLIT sibling the disambiguation already lives in `libraryName` (the CQL
  // split plan bakes the disambiguated base into every layer name), so the FHIR lane
  // reads it there; this field is what makes the `none`/name-keeping-root path
  // self-describing rather than needing a re-derivation from `libraryName`.
  localDomainId?: string;
}

// #186/#201 — a shared, activities-only library (only `activity` blocks; no
// decision/concept/terminology) emits an EMPTY CQL file (header + includes +
// `context Patient`, zero defines) plus a hollow FHIR Library. When the closure has a
// GRAPH-ROOT decision library (see `willSuppress`), the CQL lane SUPPRESSES the empty
// CQL and records this binding (consumer = the graph-root decision) so the FHIR lane
// can (a) skip the hollow Library and (b) rebind the library's ActivityDefinitions /
// recommendation PlanDefinitions onto the consumer's Interface. The CQL lane is the
// SINGLE decision-maker (it never happens in the FHIR lane, whose closure is a strict
// superset and could disagree — see closureOrchestrator contract at :970). The FHIR
// lane CONSUMES this, it does not recompute.
export interface SuppressedActivityBinding {
  suppressedLibraryName: string;
  consumerLibraryName: string;
}

export interface EmitImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  // One emit per library in the per-CRL closure. Each entry is a complete
  // CQL library file. Empty on failure.
  cqlByLibrary: PerLibraryEmit[];
  // #186 follow-up — activities-only libraries whose empty CQL was suppressed,
  // each paired with the decision library its ADs/recommendation-PDs rebind to.
  suppressedActivityBindings?: SuppressedActivityBinding[];
  errors?: CRLError[];
}

/**
 * #186 follow-up — a library is "activities-only" iff every statement is an
 * `activity` (and there is at least one). Such a library produces NO CQL defines,
 * so its emitted `.cql` is a bare header shell. The predicate is deliberately
 * strict: ANY non-Activity statement (Decision / Concept / Terminology / Parameter
 * / …) disqualifies it — so a library that declares its OWN `terminology` (whose
 * ValueSets would be orphaned by suppression) never qualifies. Note this does NOT
 * exclude an activity carrying a terminology-bound `with` (that lives INSIDE an
 * Activity statement): such a library still qualifies, but the rebind onto the
 * consumer Interface is fail-closed by the `emit-activity-terminology-interface-
 * unsupported` guard (activity.ts) because the FHIR lane passes the CONSUMER's
 * interface-scope. Pure AST predicate → identical in both lanes, no closure drift.
 */
export function isActivitiesOnlyLibrary(ast: CRL): boolean {
  const stmts = ast.statements;
  return stmts.length > 0 && stmts.every((s) => s.type === "Activity");
}

// safeOutputFilename factored to ./safeOutputFilename so the CRL→FHIR-def
// emit lane (#73) can derive matching <libraryName>.cql filenames for
// Library.content[0].attachment.url.
import { safeOutputFilename } from "./safeOutputFilename";
// Ref-walking + closure expansion factored to ./computeEmitClosure so the
// CRL→FHIR-def lane can compute its own strict-superset closure (Todo 4 of #73).
import { collectCqlIncludeRefs, computeCqlEmitClosure, usedDecisionLibraries } from "./computeEmitClosure";
import type { LibraryScope } from "./scopes";

function collectCrossLibraryRefs(entry: RegistryEntry): Set<string> {
  // The referrer's CQL `include`s ONLY its CQL-level cross-lib refs (source includes + concept refs) — NOT
  // decision/activity refs, which resolve at the FHIR level and would otherwise emit a DANGLING `include` when the
  // target auto-splits (its source-name CQL library dissolves into layers). Closure MEMBERSHIP (which libs emit
  // CQL) uses the wider `collectCqlEmitRefs`; per-library `include`s use this narrow one. 2nd arg unused here.
  return collectCqlIncludeRefs(entry, undefined as unknown as LibraryScope);
}

/**
 * v2.2 Todo 3 (issue #59) — build per-library AST parameter index for
 * cross-library qualified-ref resolution in the emitter. Mirrors the
 * Emitter's own `indexNames` second pass: concept-first shadow rule (a
 * parameter is omitted from this map when a same-named concept exists in
 * the same library).
 *
 * Returned shape: outer Map keyed by library NAME (the qualifier string used
 * in `arg.library`); inner Map keyed by parameter name → info.
 */
function buildAstParameterIndex(emitClosure: RegistryEntry[]): Map<string, Map<string, AstParameterInfo>> {
  const out = new Map<string, Map<string, AstParameterInfo>>();
  for (const entry of emitClosure) {
    if (!entry.name) continue;
    const conceptNames = new Set<string>();
    for (const stmt of entry.ast.statements) {
      if (stmt.type === "Concept" && stmt.name) conceptNames.add(stmt.name);
    }
    const map = new Map<string, AstParameterInfo>();
    for (const stmt of entry.ast.statements) {
      if (stmt.type !== "Parameter" || !stmt.name) continue;
      if (conceptNames.has(stmt.name)) continue;
      map.set(stmt.name, infoForParameterStatement(stmt));
    }
    if (map.size > 0) out.set(entry.name, map);
  }
  return out;
}

/**
 * The ONE shared split-plan classifier consumed by BOTH the preflights (collision
 * registration) AND the emit loop, so split-vs-no-split is decided in exactly one
 * place (no gate-in-two-places drift).
 *
 * R2-mechanism — the split kinds:
 *   - `full`      : a layer-splittable multi-layer library (NO Decision) → FULL
 *                   source-typed split. `emittedLibraryNames` =
 *                   `layerLibraryNamesFor(ast, policyId)`.
 *   - `interface` : a DECISION-bearing library WITH concept-level `code is`
 *                   (`hasDecision && localCodesCount > 0`, AND not
 *                   layer-splittable) → FULL source-typed split PLUS a
 *                   synthesized `<policyId>-Interface` library (the decision/
 *                   action-guard re-export surface). This REPLACES the pre-R2
 *                   `partial` (Concepts/Root) path for the deliverable.
 *                   `emittedLibraryNames` = the source-typed layer names + the
 *                   Interface name (when interface concepts exist). The Decision
 *                   gate (F1) is load-bearing: the FULL partition drops Activity/
 *                   Parameter statements, so a NON-decision local-code library
 *                   must route to `none`, not `interface`.
 *   - `none`      : neither — a decision-bearing library with NO local code
 *                   (cms), OR a non-decision local-code library (Activity/
 *                   Parameter present) → the unchanged per-CRL path, which
 *                   preserves ALL statements. `emittedLibraryNames` = `[lib]`.
 *
 * `policyId` is the EMITTED-name base (package.json `name`, threaded R1); the
 * emitted layer/interface names are `<policyId>-<PascalLayer>`. `lib` (the source
 * CRL library name) stays the self-ref identity inside the partition. When the
 * policy id is absent (direct callers), the caller passes `lib` as the policyId.
 *
 * `localCodesCount` is the count of concept-level `code is` codes the library
 * lowered (from `lowerLocalCodes`), threaded by the caller from the SAME lowered
 * AST that is emitted — so the plan can't drift from the emit.
 *
 * NOTE — the pre-R2 `partial` split kind / `PARTIAL_PARTITION` is GONE (deleted
 * in F1, no caller produced it under R2; no-legacy stance). The pre-R2 critical
 * invariant ("a decision-bearing library is NEVER `full`") still holds: a
 * decision-bearing library is `interface` or `none`, never `full` — `full` is
 * reached only via `isLayerSplittable`, which is false the moment it sees a
 * Decision. The D5 throw below guards a FUTURE `isLayerSplittable` regression.
 */
export type SplitKind = "full" | "interface" | "none";

export interface SplitPlan {
  kind: SplitKind;
  emittedLibraryNames: string[];
  partition?: Partition;
  /** The EMITTED-name base for the partition (policy id, or `lib` fallback). */
  policyId?: string;
}

export function computeSplitPlan(
  ast: CRL,
  lib: string,
  policyId: string,
  localCodesCount: number,
): SplitPlan {
  if (isLayerSplittable(ast)) {
    // D5 — UNREACHABLE: `isLayerSplittable` returns false at the first Decision
    // (its `classifyStatementLayer` is null for a Decision → the splittability
    // loop bails), so reaching this branch with a Decision present is impossible
    // by construction. Truly-unreachable invariant-throw guarding a FUTURE
    // `isLayerSplittable` refactor; not a structured emit error (no input hits it).
    if (ast.statements.some((s) => s.type === "Decision")) {
      throw new Error(
        `internal invariant violated: library "${lib}" is both isLayerSplittable ` +
          `and decision-bearing — a decision-bearing library must never take the ` +
          `FULL split.`,
      );
    }
    return {
      kind: "full",
      emittedLibraryNames: layerLibraryNamesFor(ast, policyId),
      partition: FULL_PARTITION,
      policyId,
    };
  }
  // R2 — a DECISION-bearing library WITH concept-level `code is` takes the FULL
  // source-typed split PLUS the synthesized Interface library. The interface
  // concepts are the decision `when`/action-guard surface; when present they add
  // the `<policyId>-Interface` library to the emitted-name set.
  //
  // F1 (impl-review) — the `interface` kind requires BOTH a Decision AND local
  // code (and, by reaching here, NOT layer-splittable). The FULL source-typed
  // split partition's `classify` returns null for Activity / Parameter
  // statements, so `emitPartitioned` would SILENTLY DROP them. A non-decision
  // local-code, non-splittable library (e.g. a `code is` concept alongside an
  // Activity or Parameter) therefore MUST stay on the per-CRL (`none`) path,
  // which preserves ALL statements as one library. Only a decision-bearing
  // library is safe to fan into source-typed layers + Interface, because its
  // decision surface IS the thing the Interface re-exports — and the per-CRL
  // path is the fallback that keeps every statement.
  const hasDecision = ast.statements.some((s) => s.type === "Decision");
  // #189 IMPL 3 (panel R1 Fable #1 + R2 gpt56 #1) — the `interface` split fans concepts into
  // source-typed layers via `classifyStatementLayer`; a CONCEPT that classifies NULL is assigned to NO
  // layer, so `buildLayerAst` SILENTLY DROPS it (no error, both lanes success, the concept missing).
  // `isLayerSplittable` already enforces "any null-classify statement ⇒ keep the whole library on the
  // per-CRL path" for the FULL split (and `classifyStatementLayer`'s own contract says so, layeredEmit),
  // but the `interface` branch never mirrored that invariant. Express it directly: if any CONCEPT
  // classifies null — a `ReductionDefinition` (validate-only this slice; the charter's Adequate-Step-
  // Therapy `count … at least 2` is exactly this decision + local-code + reduction shape), a still-
  // `code`-bearing `source representation` concept, or a definition-less concept — fall to `none`, where
  // the per-CRL emitter preserves every statement (and `emitConceptBody` fails a reduction loud with
  // `emit-reduction-not-active`). Decision/Activity/Parameter are null-classify too but are HANDLED by
  // the interface structure (the decision surface IS what the Interface re-exports), so only CONCEPT
  // statements gate here. At the flip, reductions classify + emit, narrowing this guard.
  const hasUnclassifiableConcept = ast.statements.some(
    (s) => s.type === "Concept" && classifyStatementLayer(s) === null,
  );
  if (hasDecision && localCodesCount > 0 && !hasUnclassifiableConcept) {
    const interfaceConcepts = interfaceConceptNames(ast);
    return {
      kind: "interface",
      emittedLibraryNames: layerLibraryNamesFor(ast, policyId, interfaceConcepts),
      partition: FULL_PARTITION,
      policyId,
    };
  }
  // `none` — the unchanged per-CRL path. Carry the policyId so callers don't lean
  // on `plan.policyId!` being load-bearing-by-kind (F7 cleanup).
  return { kind: "none", emittedLibraryNames: [lib], policyId };
}

export function emitCQLImports(rootPath: string): EmitImportsResult {
  const graph: ResolvedGraph = resolveImports(rootPath);

  if (graph.resolvedLibraries.length === 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      cqlByLibrary: [],
    };
  }

  const errorDiags = graph.diagnostics.filter((d) => d.severity === "error");
  if (errorDiags.length > 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      cqlByLibrary: [],
    };
  }

  // Compute the emit closure via the factored shared expander
  // (CRL→FHIR-def consumes a strict-superset variant). Scope-aware ref
  // resolution preserves v2.1.0 lookup precedence (local-first for non-
  // explicit-include refs).
  const rawEmitClosure = computeCqlEmitClosure(graph);

  // Slice 3 — lower concept-level `code is` local source codes BEFORE any
  // layer classification / split detection / collision preflight runs below.
  // `classifyStatementLayer` (layeredEmit.ts) rejects raw `code`-bearing
  // concepts, so a library would never be eligible for the layered split until
  // its codes are lowered. Lower ONCE here and thread the lowered AST through
  // EVERY decision (split detection, collision preflight, layered/per-library
  // emit) so split-vs-no-split is decided from the SAME representation that is
  // emitted — no plan-vs-code drift. The pass is pure (the registry AST is left
  // untouched); we build a new closure with each entry's `ast` replaced.
  // Direct `emitCQLFromAST` callers (CLI, tests) lower internally; this is the
  // imports-path counterpart so the layered classification sees lowered ASTs.
  const lowerErrors: CRLError[] = [];
  // Slice 4 — load the project's `crl.canonicalBase` so the synthetic local
  // codesystem's CQL `codesystem` URL is published under it, byte-equal with the
  // FHIR lane. CQL emit must NOT hard-fail on UNRELATED FHIR-metadata problems
  // (missing `version` etc. — the FHIR lane's concern), so we use the lightweight
  // `readCanonicalBase` reader — it reads ONLY `crl.canonicalBase` and swallows
  // unrelated read/parse errors. #271 — when `crl.canonicalBase` itself is
  // absent/empty AND the library has local `code is` concepts to lower,
  // `lowerLocalCodes` hard-errors with `missing-canonical-url-base` (no URN
  // fallback), mirroring the FHIR lane so the two local-codesystem identities stay
  // byte-equal.
  let canonicalBase: string | undefined;
  // R1 — also read the POLICY ID (`name`) so the synthetic local codesystem URL
  // slugs from the policy id, byte-equal with the FHIR lane's `CodeSystem.url`.
  // Like `readCanonicalBase`, this swallows unrelated FHIR-metadata errors (a
  // missing `version` etc. is the FHIR lane's concern). When absent, the lowering
  // falls back to the source library name (pre-R1) — but a FHIR-emitting project
  // always has a `name` (the FHIR lane hard-fails without it), so both lanes agree.
  let localDomainId: string | undefined;
  if (graph.projectRoot) {
    canonicalBase = readCanonicalBase(graph.projectRoot);
    localDomainId = readPolicyId(graph.projectRoot);
  }
  // #198 (Option B) — the per-entry local-domain / layered-identity base. The
  // PRIMARY (closure-seed) library keeps the bare policy id; a SIBLING library
  // (pulled into the closure via a cross-lib ref, i.e. NOT in the include-walked
  // seed `graph.resolvedLibraries`) that ALSO declares concept-level `code is` gets
  // a `-<librarySlug>` disambiguator so its local CodeSystem url AND its layered
  // Library identities `S` (both derived from this base) no longer collide with the
  // primary's. Only `code is` siblings are disambiguated: a non-`code is` sibling
  // synthesizes NO local CodeSystem, so it keeps the bare policy-id base and its
  // (unaffected) layer names stay byte-identical — no golden drift for existing
  // multi-library `coded from`/decision-only fixtures. `undefined` policyId (direct
  // single-file callers, no package.json) → no metadata, so no disambiguation is
  // needed (single library); fall back to the source library name downstream. The
  // FHIR lane (closureOrchestrator) computes the SAME base from the same
  // (policyId, libraryName, isPrimary, hasCodeIs) inputs, so every site agrees.
  const primarySeedPaths = new Set(graph.resolvedLibraries.map((e) => e.filePath));
  // Capture the `code is` predicate from the RAW (un-lowered) closure: `emitClosure`
  // below replaces each entry's `ast` with its LOWERED form, and lowering CLEARS
  // `Concept.code`, so `astHasConceptLocalCode` on a lowered ast reads false. Keying
  // the disambiguation off this stable per-path set keeps `domainIdFor` consistent
  // across the raw-map AND every later lowered-closure loop.
  const codeIsSeedPaths = new Set(
    rawEmitClosure.filter((e) => astHasConceptLocalCode(e.ast)).map((e) => e.filePath),
  );
  const domainIdFor = (entry: RegistryEntry): string | undefined => {
    if (localDomainId === undefined) return undefined;
    const isPrimarySeed = primarySeedPaths.has(entry.filePath);
    const disambiguate = !isPrimarySeed && codeIsSeedPaths.has(entry.filePath);
    return localDomainIdFor(localDomainId, entry.name ?? "", !disambiguate);
  };
  // #198 C1 — the disambiguated base ONLY when the entry is actually disambiguated (a
  // cross-lib `code is` sibling); `undefined` otherwise (primary seed, non-`code is`,
  // or metadata-less). `domainIdFor` returns the BARE policy id for a non-disambiguated
  // entry; this returns `undefined` there so the manifest field cleanly signals "no
  // disambiguation" and the FHIR lane keeps the byte-identical `policyIdBase` fallback.
  const disambiguatedBaseFor = (entry: RegistryEntry): string | undefined => {
    if (localDomainId === undefined) return undefined;
    const isPrimarySeed = primarySeedPaths.has(entry.filePath);
    const disambiguate = !isPrimarySeed && codeIsSeedPaths.has(entry.filePath);
    return disambiguate ? localDomainIdFor(localDomainId, entry.name ?? "", false) : undefined;
  };
  // Track libraries that actually synthesized a local codesystem (lowered at
  // least one `code is` concept), keyed by the deterministic codesystem URL — so
  // the per-policy collision preflight below can fire when 2+ libraries resolve to
  // ONE local-domain url. #198 (Option B) — the url keys on the PER-ENTRY
  // disambiguated base, so a primary + sibling map to DISTINCT urls and coexist. A
  // collision now means one of exactly TWO genuine cases, distinguished by
  // `localUrnDisambiguated`: (a) two SEED/primary `code is` libraries share the bare
  // `<policyId>-local` domain, or (b) two cross-lib SIBLINGS whose names slugify to
  // the same value share one `<policyId>-<slug>-local` domain. The collision set is
  // homogeneous (a seed url `<policyId>-local` can never equal a sibling url
  // `<policyId>-<slug>-local`), so one flag per url suffices. Scheme-independent (URN
  // vs canonicalBase both collide).
  const localUrnToLibraries = new Map<string, Set<string>>();
  // #198 — per colliding url, whether its contributing entries were DISAMBIGUATED
  // (cross-lib siblings, case b) vs bare seeds (case a) — selects the guard message.
  const localUrnDisambiguated = new Map<string, boolean>();
  // Slice 4c — the count of concept-level `code is` codes each library lowered,
  // keyed by emitted library name. Threaded into `computeSplitPlan` so the split
  // decision (partial vs none) is made from the SAME lowered representation that
  // is emitted. (`lowered.localCodes` is populated from the exact synthesis loop
  // that builds the synthetic terminologies — one source of truth.)
  const localCodesCountByName = new Map<string, number>();
  const emitClosure = rawEmitClosure.map((entry) => {
    // #198 — per-entry local domain (primary keeps the bare policy id; siblings
    // are disambiguated). Threaded into the lowering so the synthetic `codesystem
    // '<url>'` decl carries the disambiguated url for a sibling `code is` library.
    const entryLocalDomainId = domainIdFor(entry);
    // #257 (age slice) T1 — run the shared AGE pre-pipeline (retirement scan + standalone posrep
    // synthesis) BEFORE `lowerLocalCodes`, so a standalone Patient age posrep is classifiable in this
    // lane (rather than dropping to a null layer) and the retirement fires here too. `didLower` is
    // computed against the pre-transformed ast, so a standalone-only library (no `code is`) does not
    // spuriously register a local-domain for collision tracking.
    const preAge = preLowerAge(entry.ast);
    if (preAge.errors.length > 0) lowerErrors.push(...preAge.errors);
    const lowered = lowerLocalCodes(preAge.ast, { canonicalBase, localDomainId: entryLocalDomainId });
    if (lowered.errors.length > 0) lowerErrors.push(...lowered.errors);
    // `didLower` = did `lowerLocalCodes` synthesize a local codesystem (the `code is` lowering) —
    // computed against the pre-transformed ast, so a standalone-only library (no `code is`) does not
    // spuriously register a local-domain for collision tracking. `astChanged` = did EITHER pass
    // transform the ast (so the entry must carry the transformed ast — the standalone synthesis is
    // lost otherwise, since `lowerLocalCodes` fast-paths a no-`code is` library to `=== preAge.ast`).
    const didLower = lowered.ast !== preAge.ast;
    const astChanged = lowered.ast !== entry.ast;
    if (didLower && entry.name) {
      // #198 — the collision key is the PER-ENTRY policy-id-slugged local-domain url
      // (the same disambiguated slug source the lowering uses), so the cross-library
      // collision preflight stays consistent with the emitted url. Under Option B a
      // primary + sibling map to DISTINCT urls (no collision → allowed); the guard
      // now fires ONLY when two libraries share one base (two seed/primary `code is`
      // libraries), which Option B genuinely cannot disambiguate.
      const urn = localCodeSystemUrl(canonicalBase, entryLocalDomainId ?? entry.ast.library.name);
      const set = localUrnToLibraries.get(urn) ?? new Set<string>();
      set.add(entry.name);
      localUrnToLibraries.set(urn, set);
      // Record whether this entry's url is a DISAMBIGUATED sibling domain (case b) or
      // a bare seed domain (case a). Homogeneous per url, so a plain set is fine.
      localUrnDisambiguated.set(urn, disambiguatedBaseFor(entry) !== undefined);
    }
    if (entry.name) localCodesCountByName.set(entry.name, lowered.localCodes.length);
    return astChanged ? { ...entry, ast: lowered.ast } : entry;
  });
  // Helper: the lowered `code is` count for an entry (0 when none / unnamed).
  const localCodesCountFor = (name: string | null): number =>
    name ? localCodesCountByName.get(name) ?? 0 : 0;
  if (lowerErrors.length > 0) {
    return {
      success: false,
      graph,
      importDiagnostics: graph.diagnostics,
      cqlByLibrary: [],
      errors: lowerErrors,
    };
  }

  // #236 — the CQL-lane criterion-expansion overflow gate is RETIRED. A criterion no longer
  // inline-expands (materializes) into the interface surface — it emits ONE boolean define,
  // referenced by identifier, and `interfaceSurface` / the emit closure now collect its concept
  // dependencies LINEARLY via the criterion INDEX (never atom-capped). So there is no
  // "materialized tree exceeds the envelope" condition to fail on, and no silent omission the
  // gate needed to guard: a doubling-DAG criterion emits a small, valid, DAG-shaped library.

  // #186/#201 — the suppression consumer is the closure's GRAPH-ROOT decision library:
  // the decision-bearing library that is never a cross-library `use decision` TARGET
  // (zero incoming delegation edges). That is the entry policy's top-level decision (it
  // delegates OUT to sub-decisions, e.g. State-Mandates, but nothing delegates INTO it).
  // A suppressed activities-only determination library rebinds its ADs/recommendation-PDs
  // onto THIS root's Interface — regardless of how many sub-decisions recommend its
  // activities. This is the #201 fix: the shared "Medical Policy Determination" is
  // recommended by the main decision AND every delegated State-Mandates sub-decision, yet
  // belongs to the main policy's interface. Keying on the graph root (not the file-entry
  // library, and not a recommender count) also handles a facade/aggregator entry `.crl`
  // whose own library carries no decision. SAFETY: determination dynamicValues are
  // self-contained literals (a `with` is a backtick literal or a terminology ref — there
  // is NO grammar path for a dynamicValue to reference a sibling library's CQL define, and
  // a terminology `with` on an interface-scoped library fails closed at
  // `emit-activity-terminology-interface-unsupported`), so the root's Interface is always
  // a valid `library[]` scope. When there is not EXACTLY ONE graph root (none → no
  // decision / standalone activities-only entry; >1 → independent decision trees), no
  // activities-only library is suppressed (unchanged pre-#186 behavior). Computed BEFORE
  // the split-library + collision preflights so a suppressed library (which emits NO CQL)
  // is excluded from BOTH — a false dangling-include or name-collision for a file never
  // written would otherwise fail the emit.
  const decisionLibNames = new Set(
    emitClosure
      .filter((e) => e.name !== null && e.name !== "" && e.ast.statements.some((s) => s.type === "Decision"))
      .map((e) => e.name as string),
  );
  const usedDecisionLibNames = new Set<string>();
  for (const e of emitClosure) {
    if (e.name === null || e.name === "") continue;
    for (const used of usedDecisionLibraries(e.ast)) usedDecisionLibNames.add(used);
  }
  const graphRootDecisionLibs = [...decisionLibNames].filter((n) => !usedDecisionLibNames.has(n));
  const rootConsumer = graphRootDecisionLibs.length === 1 ? graphRootDecisionLibs[0] : undefined;
  const willSuppress = (entry: RegistryEntry): boolean =>
    isActivitiesOnlyLibrary(entry.ast) && rootConsumer !== undefined && entry.name !== rootConsumer;

  // Per-policy local-domain collision. #198 (Option B) — the local-domain url keys on
  // the PER-ENTRY disambiguated base (`domainIdFor`): the primary keeps the bare policy
  // id, each cross-lib SIBLING `code is` library gets `<policyId>-<librarySlug>`. So a
  // primary + sibling (or two DISTINCTLY-slugging siblings) map to DISTINCT urls and
  // coexist. A collision therefore means one of exactly TWO genuine cases, and each
  // gets a DIFFERENT, actionable message:
  //   (a) two SEED/PRIMARY `code is` libraries (both include-walked from the entry
  //       `.crl`) both keep the bare `<policyId>-local` domain — Option B can't
  //       disambiguate two seeds. Fix: consolidate, make one a cross-lib sibling, or
  //       split packages.
  //   (b) two cross-lib SIBLINGS whose names SLUGIFY to the same value collapse onto
  //       one `<policyId>-<slug>-local` domain — the disambiguator itself collided.
  //       Fix: rename one library so its slug differs.
  // Either way two FHIR CodeSystem resources would share one canonical url (invalid
  // FHIR, Inv-0), so fail loudly rather than emit a silently-shared domain.
  for (const [urn, libs] of localUrnToLibraries) {
    if (libs.size > 1) {
      const names = [...libs].sort();
      const quoted = names.map((n) => `"${n}"`).join(" and ");
      const isSiblingSlugCollision = localUrnDisambiguated.get(urn) === true;
      const message = isSiblingSlugCollision
        ? // (b) two disambiguated SIBLINGS whose slugs collide.
          `Libraries ${quoted} are both cross-library \`code is\` SIBLINGS whose names ` +
          `slugify to the same value, so their auto-disambiguated local CodeSystem domains ` +
          `both resolve to '${urn}'. The disambiguator is \`<policyId>-<slugify(libraryName)>\`, ` +
          `and these two library names produce an identical slug. Rename one library so its ` +
          `slug differs.`
        : // (a) two SEED/primary `code is` libraries sharing the bare policy domain.
          `Libraries ${quoted} both declare concept-level \`code is\` and are both SEED ` +
          `libraries (reached by include-walking from the entry \`.crl\`), so both keep the ` +
          `bare policy-id local CodeSystem domain '${urn}'. Two seed \`code is\` libraries ` +
          `cannot be auto-disambiguated (Option B disambiguates only a cross-library SIBLING). ` +
          `Consolidate the local \`code is\` declarations into a single library, reach one via a ` +
          `cross-library reference (e.g. \`use decision\` / \`recommend activity\`) instead of an ` +
          `\`include\` so it becomes a disambiguable sibling, or split into separate packages ` +
          `(one policy id each).`;
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: [
          {
            type: "Validation",
            kind: "emit-local-codesystem-urn-collision",
            message,
          },
        ],
      };
    }
  }

  // v2.2 Todo 3 (issue #59) — index every emitted library's AST parameters
  // once so per-library emit can resolve qualified context-parameter refs.
  const crossLibraryParameters = buildAstParameterIndex(emitClosure);

  // Slice 2 (layeredEmit) — the set of library NAMES that will be auto-split
  // into layer libraries. A split library's ORIGINAL name no longer exists
  // as an emitted CQL library, so any OTHER library that qualified-refs it would
  // dangle. Cross-library referrer-rewriting (rewrite `"X"."Y"` to the layer
  // Y landed in) is the DEFERRED routing slice; here we detect the situation
  // and fail loudly rather than emit broken CQL.
  //
  // F2 (impl-review) — register a source name whose emit makes the SOURCE-NAMED
  // library DISAPPEAR. Route through the shared `computeSplitPlan`: BOTH `full`
  // (layer-splittable, no decision) AND `interface` (decision-bearing + local
  // code) fan the source into policy-id-named layer libraries — the source name
  // `<lib>` is NO LONGER an emitted CQL library under either. A sibling that
  // qualified-refs `"<lib>"."X"` would then dangle, so both must be registered
  // here so the `emit-cross-library-ref-into-split-library` guard below fires.
  // (`none` keeps the source name, so it is NOT registered.) Pre-F2 only `full`
  // (via `isLayerSplittable`) was registered, leaving an interface-split source's
  // foreign referrers dangling silently.
  const splitLibraryNames = new Set<string>();
  for (const entry of emitClosure) {
    if (!entry.name) continue;
    const plan = computeSplitPlan(
      entry.ast,
      entry.name,
      // #198 — per-entry disambiguated policy-id base (primary unchanged; sibling
      // suffixed). `plan.kind` is policy-id-independent, but pass the per-entry base
      // so this preflight decides from the SAME identity the emit loop uses.
      domainIdFor(entry) ?? entry.name,
      localCodesCountFor(entry.name),
    );
    if (plan.kind === "full" || plan.kind === "interface") splitLibraryNames.add(entry.name);
  }
  if (splitLibraryNames.size > 0) {
    // The guard MUST fail-closed over the SAME ref set that becomes the referrer's CQL `include`s
    // (`collectCqlIncludeRefs` = source `include`s + concept-DEFINITION refs), NOT the narrower concept-definition-
    // only `librariesReferencedBy`. Otherwise an explicit `include "Shared"` (or, pre-(B), a representation ref)
    // into an auto-split local library emits a DANGLING `include Shared` that no `Shared.cql` satisfies while the
    // guard stays silent. SCOPE-AWARE: an `include`/ref name may resolve to a PACKAGE library (fine — it is emitted
    // under its own name, never split) OR to a LOCAL split source (dangles). Resolve each name against the
    // referrer's scope and fire ONLY when it resolves to a LOCAL library this emit auto-splits — never blanket-error
    // every name that merely string-matches a split source.
    const guardScopes = buildLibraryScopes(
      graph.resolvedLibraries,
      graph.localLibraries,
      graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() },
    );
    for (const entry of emitClosure) {
      if (!entry.name) continue;
      // A suppressed activities-only library emits NO CQL, so its `include`s cannot
      // dangle — exclude it from the split-library ref guard (a false positive for a
      // file never written), mirroring the collision-preflight + emit-loop skips.
      if (willSuppress(entry)) continue;
      const scope = guardScopes.get(entry.filePath);
      if (!scope) continue;
      const refs = collectCqlIncludeRefs(entry, scope);
      for (const ref of refs) {
        const target = lookupKnownLibrary(scope, ref);
        // Unknown (e.g. catalog FHIRHelpers/CRLCommon) or package-origin target → cannot dangle: skip.
        if (!target || target.origin === "package") continue;
        if (splitLibraryNames.has(target.libraryName)) {
          return {
            success: false,
            graph,
            importDiagnostics: graph.diagnostics,
            cqlByLibrary: [],
            errors: [
              {
                type: "Validation",
                kind: "emit-cross-library-ref-into-split-library",
                message:
                  `Library "${entry.name}" qualified-refs "${ref}", but "${ref}" is a ` +
                  `library that emit auto-splits into policy-id-named layer libraries ` +
                  `(its source name no longer exists as an emitted CQL library). ` +
                  `Cross-library references into an auto-split library are not yet ` +
                  `supported (referrer re-qualification is a later slice). Reference ` +
                  `the specific layer library directly, or keep "${ref}" single-layer ` +
                  `(no decision + no concept-level \`code is\`).`,
              },
            ],
          };
        }
      }
    }
  }


  // #227 — the render-only raw→`S` rename map for NAME-KEEPING-ROOT (`none`-path)
  // libraries, built HERE (the preflight sees every entry before the emit loop, so
  // a `none`→`none` cross-ref resolves forward). Keyed by the raw CRL library name,
  // valued at the unified identity `S = pascalCaseNameForId(name)` that the emit
  // loop stamps as the manifest `libraryName` and the CQL header. ONLY `none`
  // entries are enrolled — a layered entry's emitted identity is its per-layer name
  // (NOT `pascalCaseNameForId(name)`), so poisoning the map with it would mis-render
  // a `none`→layered ref; leaving it out renders that (untested, non-deliverable)
  // shape under the raw name, unchanged from pre-#227. Consumed only by the
  // `none`-path `emitCQLFromAST` call below.
  const libraryRenames = new Map<string, string>();

  // Slice 2 (layeredEmit) — generated-name collision preflight. The full set
  // of emitted CQL library names = every UNSPLIT entry's own name PLUS every
  // SPLIT entry's generated layer names (`<X> Concepts` / `<X> Asserted` /
  // `<X> Inferred`). If a generated layer name collides with another emitted
  // name (e.g. a multi-layer `library "X"` whose split yields `X Asserted`,
  // and a separate real `library "X Asserted"` elsewhere in the closure), we
  // would otherwise emit two libraries with the same id/filename and silently
  // clobber one. Detect it and fail loudly BEFORE emitting anything.
  {
    const emittedNamesSource = new Map<string, string>();
    const collisions: { name: string; a: string; b: string }[] = [];
    const register = (name: string, source: string): void => {
      const prior = emittedNamesSource.get(name);
      if (prior !== undefined) {
        collisions.push({ name, a: prior, b: source });
      } else {
        emittedNamesSource.set(name, source);
      }
    };
    // #227 — reserve the three SHARED catalog identities FIRST. #227 widens the raw-name
    // preimage of every emitted identifier (`library "CRL Common"` now transforms to `S =
    // "CRLCommon"`), so a `none` policy can newly clobber a catalog name from a raw name
    // that previously could not. Pre-registering them makes that fail LOUDLY here (the
    // catalog append later would otherwise silently skip the real asset by the
    // filename-idempotence guard, leaving policy `include CRLCommon` refs self-referential).
    for (const cat of loadCatalogLibraries()) {
      register(cat.libraryName, "shared catalog library");
    }
    for (const entry of emitClosure) {
      if (entry.name === null || entry.name === "") continue;
      // A suppressed activities-only library emits NO CQL — exclude it from the
      // emitted-name set so it can never trigger a collision for an unwritten file.
      if (willSuppress(entry)) continue;
      // R2 — register the FULL emitted-name set for this entry via the shared
      // split-plan. `full`/`interface` register the source-typed layer names (+
      // the Interface name for `interface`); `none` registers just `<lib>`. The
      // emitted-name base is the PER-ENTRY disambiguated policy id (#198:
      // `domainIdFor` — primary unchanged, sibling `<policyId>-<slug>`), falling back
      // to the source library name for metadata-less callers, so the collision
      // preflight registers the EXACT layer names the emit loop below produces (a
      // primary + sibling now register DISTINCT names rather than colliding).
      const plan = computeSplitPlan(
        entry.ast,
        entry.name,
        domainIdFor(entry) ?? entry.name,
        localCodesCountFor(entry.name),
      );
      const source =
        plan.kind === "none"
          ? `library "${entry.name}"`
          : `auto-split of library "${entry.name}"`;
      // #227 — a `none` library now emits its CQL header/file + FHIR identity under
      // `S = pascalCaseNameForId(<name>)`, not the raw name. Record the rename and
      // register `S` (not the raw) so two raw names that PascalCase to the SAME `S`
      // collide HERE (CQL lane), matching the FHIR-lane Library.id uniqueness check.
      // Layered `emittedLibraryNames` are already their final `S` — registered as-is.
      if (plan.kind === "none") {
        libraryRenames.set(entry.name, pascalCaseNameForId(entry.name));
      }
      for (const emittedName of plan.emittedLibraryNames) {
        register(plan.kind === "none" ? pascalCaseNameForId(emittedName) : emittedName, source);
      }
    }
    if (collisions.length > 0) {
      const c = collisions[0];
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: [
          {
            type: "Validation",
            kind: "layered-name-collision",
            message:
              `Emitted CQL library name "${c.name}" is produced by both ` +
              `${c.a} and ${c.b}. An auto-split layer library name collides ` +
              `with another emitted library, which would clobber one CQL file. ` +
              `Rename the conflicting library (or split it explicitly) so every ` +
              `emitted CQL library has a unique name.`,
          },
        ],
      };
    }
  }

  // Emit each library independently.
  const cqlByLibrary: PerLibraryEmit[] = [];
  const suppressedActivityBindings: SuppressedActivityBinding[] = [];
  for (const entry of emitClosure) {
    // Skip parse-error placeholders (`null` name or empty-string library
    // synthesized after a parse error). The parse-failure diagnostic is
    // the real signal; emitting a library without a name would produce
    // invalid CQL.
    if (entry.name === null || entry.name === "") continue;

    // #186/#201 — SUPPRESS an activities-only library's empty CQL, rebinding its
    // ADs/recommendation-PDs onto the ROOT decision library's Interface. Skip ALL emit
    // for it (no `.cql`, no manifest entry) and record the rebind so the FHIR lane
    // drops its hollow Library. This is the ONLY place the gate runs (same
    // `willSuppress` predicate the collision preflight above consults — never disagree).
    if (willSuppress(entry)) {
      suppressedActivityBindings.push({
        suppressedLibraryName: entry.name,
        // `willSuppress` is true ⇒ `rootConsumer` is a defined string.
        consumerLibraryName: rootConsumer as string,
      });
      continue;
    }

    // R2 — ONE shared split-plan drives BOTH the preflight (above) and this emit
    // loop. `full` (decision-less, multi-layer) emits the source-typed split;
    // `interface` (decision-bearing WITH concept-level `code is`) emits the
    // source-typed split PLUS the synthesized `<policyId>-Interface` library;
    // `none` takes the unchanged per-CRL path. cms22/cms69 (each source `.crl` is
    // single-layer, no `code is`) stay `none` → byte-identical.
    // #198 — the per-entry disambiguated policy-id base: the primary keeps the bare
    // policy id (byte-identical to pre-#198), a sibling `code is` library gets
    // `<policyId>-<slug>` so its layered library identities `S` + local CodeSystem
    // url no longer collide with the primary's.
    const entryLocalDomainId = domainIdFor(entry);
    // #198 C1 — the disambiguated base (or `undefined`) carried onto every manifest
    // entry this source produces, so the FHIR lane can identify a `none` sibling's
    // base Library explicitly.
    const entryDisambiguatedBase = disambiguatedBaseFor(entry);
    const entryPolicyId = entryLocalDomainId ?? entry.name;
    const plan = computeSplitPlan(entry.ast, entry.name, entryPolicyId, localCodesCountFor(entry.name));
    if (plan.kind !== "none") {
      const partitioned = emitPartitioned(entry.ast, entry.name, plan.policyId!, plan.partition!, {
        crossLibraryParameters,
        canonicalBase,
        localDomainId: entryLocalDomainId,
        // #227 — a layered library may FOREIGN-ref a name-keeping-root (`none`)
        // sibling; render that `include`/qualified-ref through `S` so it matches the
        // renamed target's header. Layered sibling names aren't in the map (identity).
        libraryRenames,
      });
      if (!partitioned.success) {
        return {
          success: false,
          graph,
          importDiagnostics: graph.diagnostics,
          cqlByLibrary: [],
          // F3 — include the synthesis-level `errors` (e.g.
          // `emit-decision-concept-not-source-typed`, raised before any layer
          // emits) alongside the per-entry emit errors.
          errors: [
            ...(partitioned.errors ?? []),
            ...partitioned.entries.flatMap((e) => e.result.errors ?? []),
          ],
        };
      }
      for (const part of partitioned.entries) {
        let partFilename: string;
        try {
          partFilename = safeOutputFilename(part.libraryName);
        } catch (e) {
          return {
            success: false,
            graph,
            importDiagnostics: graph.diagnostics,
            cqlByLibrary: [],
            errors: [{ type: "Exception", message: e instanceof Error ? e.message : String(e) }],
          };
        }
        // Manifest role (R2) — keyed off the source-typed partition VALUE
        // (`part.layer`), the one source of truth:
        //   - LocalConcepts / RecordConcepts → "concepts": OWNS the terminology
        //     declarations (the FHIR lane routes the CodeSystem / author-ValueSet
        //     depends-on edges onto this entry).
        //   - Interface → "interface": the synthesized re-export library (the
        //     FHIR lane rewires decision/activity `library[]` onto it).
        //   - LocalSource / RecordSource / Inferred → "layer": a consuming
        //     source/inference layer (depends-on its lower siblings via `includes`).
        const role: PerLibraryEmit["role"] =
          part.layer === "LocalConcepts" || part.layer === "RecordConcepts"
            ? "concepts"
            : part.layer === "Interface"
              ? "interface"
              : "layer";
        cqlByLibrary.push({
          libraryName: part.libraryName,
          filePath: entry.filePath,
          outputFilename: partFilename,
          cql: part.result.result ?? "",
          sourceLibraryName: entry.name,
          role,
          layer: part.layer,
          includes: part.crossLibraryIncludes,
          localDomainId: entryDisambiguatedBase,
        });
      }
      continue;
    }

    const crossLibs = Array.from(collectCrossLibraryRefs(entry)).sort();
    const synthetic: CRL = {
      type: "CRL",
      ...(entry.ast.header ? { header: entry.ast.header } : {}),
      library: entry.ast.library,
      // Drop the AST's `include` lines — under per-CRL emit the include set
      // is decided by qualified-ref discovery, not by source `include` lines
      // (which under 026 are package-only and may not cover every needed
      // cross-library ref).
      includes: [],
      statements: entry.ast.statements,
      location: entry.ast.location,
    };
    // #227 — the unified identity `S` for this name-keeping-root library. The CQL
    // header (rendered via `libraryRenames`), the emitted `.cql` filename, and the
    // manifest `libraryName` (→ FHIR Library.id/name/url-tail) ALL take `S`, so the
    // five identity surfaces agree and cqf can load the library source. The RAW
    // `entry.name` stays the `sourceLibraryName` (manifest keying) and the emit
    // `options.libraryName` (self-ref detection / lookup keys).
    const rootIdentity = pascalCaseNameForId(entry.name);
    let outputFilename: string;
    try {
      outputFilename = safeOutputFilename(rootIdentity);
    } catch (e) {
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: [{ type: "Exception", message: e instanceof Error ? e.message : String(e) }],
      };
    }
    const emit = emitCQLFromAST(synthetic, {
      libraryName: entry.name,
      crossLibraryIncludes: crossLibs,
      crossLibraryParameters,
      // #227 — render header/`include`/qualified-refs through `S` (comparisons stay
      // keyed on the raw `libraryName` above); consulted only on this `none` path.
      libraryRenames,
      canonicalBase,
      // #198 — per-entry local domain: a `none`/per-CRL sibling `code is` library
      // still gets its disambiguated `codesystem '<url>'` decl (primary unchanged).
      localDomainId: entryLocalDomainId,
    });
    if (!emit.success || !emit.result) {
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: emit.errors,
      };
    }
    cqlByLibrary.push({
      // #227 — the manifest identity is `S` (the FHIR lane reads this as the
      // Library.id/name/url-tail); the RAW `entry.name` is the `sourceLibraryName`
      // that keys the manifest and stays the source-of-truth for source grouping.
      libraryName: rootIdentity,
      filePath: entry.filePath,
      outputFilename,
      cql: emit.result,
      // Slice 4c manifest — the per-CRL (`none`) path: this CQL IS the source
      // library (role "root"), and its `include`s are the discovered cross-
      // library refs. `crossLibs` are the native CQL `include OtherLib` deps.
      sourceLibraryName: entry.name,
      role: "root",
      includes: crossLibs,
      localDomainId: entryDisambiguatedBase,
    });
  }

  // #187 — ALWAYS append the three SHARED catalog libraries so every policy's
  // `cql/` folder ships `CRLCommon.cql`, `CaseFeatureCommon.cql`, and
  // `FHIRHelpers.cql` (4.0.1). Two distinct consumers need them: human CQL
  // tooling resolves `include`s from the `.cql` SOURCE files in the folder (it
  // auto-provides NONE of the three), and the cqf engine resolves by FHIR
  // `Library.name` (auto-provides FHIRHelpers but NOT CRLCommon/CaseFeatureCommon
  // — those get FHIR Library resources in the FHIR lane). Their names are already
  // simple hyphen-free identifiers, so `outputFilename == "<name>.cql"` and
  // `libraryName == the CQL header == FHIR url-tail`.
  //
  // Role/routing: the catalog entries carry `sourceLibraryName` = their own
  // library name, which is NOT a source in the emit closure, so the FHIR
  // orchestrator (which iterates the closure and pulls
  // `manifestBySource.get(<source>)`) never mis-routes them as a policy layer.
  // The FHIR lane emits their Library resources (CRLCommon + CaseFeatureCommon)
  // independently. `role: "root"` + empty `includes` keeps the manifest
  // well-formed.
  //
  // Idempotence: skip a catalog library whose outputFilename a REAL emitted
  // library already occupies (e.g. an author library literally named
  // `CRLCommon`) — never clobber a policy library with a catalog copy.
  const existingFilenames = new Set(cqlByLibrary.map((e) => e.outputFilename));
  for (const cat of loadCatalogLibraries()) {
    if (existingFilenames.has(cat.outputFilename)) continue;
    existingFilenames.add(cat.outputFilename);
    cqlByLibrary.push({
      libraryName: cat.libraryName,
      // No source `.crl` file — the catalog CQL is a fixed emitter asset.
      filePath: "",
      outputFilename: cat.outputFilename,
      cql: cat.cql,
      sourceLibraryName: cat.libraryName,
      role: "root",
      includes: [],
      // #227 — mark the shared catalog assets so the FHIR-lane Inv 6 can exempt them
      // explicitly (not via the name-fixpoint accident).
      isSharedCatalog: true,
    });
  }

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cqlByLibrary,
    suppressedActivityBindings,
  };
}
