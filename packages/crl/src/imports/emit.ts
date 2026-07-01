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
  layerLibraryNamesFor,
  librariesReferencedBy,
  interfaceConceptNames,
  FULL_PARTITION,
} from "../cql-emitter/layeredEmit";
import type { Partition } from "../cql-emitter/layeredEmit";
import { loadCatalogLibraries } from "../cql-emitter/catalog/loadCatalog";
import { lowerLocalCodes, localCodeSystemUrl } from "../cql-emitter/lowerLocalCodes";
import { readCanonicalBase, readPolicyId } from "../fhir-emitter/metadata";
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
  includes: string[];
}

export interface EmitImportsResult {
  success: boolean;
  graph: ResolvedGraph;
  importDiagnostics: ImportDiagnostic[];
  // One emit per library in the per-CRL closure. Each entry is a complete
  // CQL library file. Empty on failure.
  cqlByLibrary: PerLibraryEmit[];
  errors?: CRLError[];
}

// safeOutputFilename factored to ./safeOutputFilename so the CRL→FHIR-def
// emit lane (#73) can derive matching <libraryName>.cql filenames for
// Library.content[0].attachment.url.
import { safeOutputFilename } from "./safeOutputFilename";
// Ref-walking + closure expansion factored to ./computeEmitClosure so the
// CRL→FHIR-def lane can compute its own strict-superset closure (Todo 4 of #73).
import { collectCqlEmitRefs, computeCqlEmitClosure } from "./computeEmitClosure";
import type { LibraryScope } from "./scopes";

function collectCrossLibraryRefs(entry: RegistryEntry): Set<string> {
  // 2nd arg unused by the CQL collector but required by the shared signature
  return collectCqlEmitRefs(entry, undefined as unknown as LibraryScope);
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
  if (hasDecision && localCodesCount > 0) {
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
  // Slice 4 — load the project's `crl.canonicalBase` (best-effort) so the
  // synthetic local codesystem's CQL `codesystem` URL is published under it,
  // byte-equal with the FHIR lane. CQL emit must NOT hard-fail on missing/broken
  // FHIR metadata (that's the FHIR lane's concern), so we use the lightweight
  // `readCanonicalBase` reader — it reads ONLY `crl.canonicalBase` and swallows
  // errors. (The full `readPackageMetadata` returns `metadata: null` for any
  // UNRELATED FHIR-metadata failure — e.g. a missing `version` — which would
  // silently drop a VALID canonicalBase and diverge from the FHIR lane.) When
  // absent/unreadable, canonicalBase stays undefined and the lowering falls back
  // to the URN.
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
  // Track libraries that actually synthesized a local codesystem (lowered at
  // least one `code is` concept), keyed by the deterministic codesystem URL — so
  // the per-policy collision preflight below can fire when 2+ libraries declare
  // `code is`. R1 — the URL keys on the POLICY ID (`localDomainId`/package.json
  // `name`), so EVERY `code is` library in the package maps to the SAME url; two
  // such libraries collide because they share the policy's single local domain
  // (not because their names slug alike). Scheme-independent (URN vs canonicalBase
  // both collide).
  const localUrnToLibraries = new Map<string, Set<string>>();
  // Slice 4c — the count of concept-level `code is` codes each library lowered,
  // keyed by emitted library name. Threaded into `computeSplitPlan` so the split
  // decision (partial vs none) is made from the SAME lowered representation that
  // is emitted. (`lowered.localCodes` is populated from the exact synthesis loop
  // that builds the synthetic terminologies — one source of truth.)
  const localCodesCountByName = new Map<string, number>();
  const emitClosure = rawEmitClosure.map((entry) => {
    const lowered = lowerLocalCodes(entry.ast, { canonicalBase, localDomainId });
    if (lowered.errors.length > 0) lowerErrors.push(...lowered.errors);
    const didLower = lowered.ast !== entry.ast;
    if (didLower && entry.name) {
      // R1 — the collision key is the policy-id-slugged local-domain url (the same
      // slug source the lowering uses), so the cross-library collision preflight
      // stays consistent with the emitted url.
      const urn = localCodeSystemUrl(canonicalBase, localDomainId ?? entry.ast.library.name);
      const set = localUrnToLibraries.get(urn) ?? new Set<string>();
      set.add(entry.name);
      localUrnToLibraries.set(urn, set);
    }
    if (entry.name) localCodesCountByName.set(entry.name, lowered.localCodes.length);
    return didLower ? { ...entry, ast: lowered.ast } : entry;
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
  // Per-policy local-domain collision. R1 — the local-domain URN keys on the
  // POLICY ID (`metadata.name`), so it is IDENTICAL for every library in the
  // package. Two distinct libraries that BOTH declare concept-level `code is`
  // therefore share the policy's single implicit local CodeSystem domain (CQL
  // code identity is system+code), so a local code in one could collide with one
  // in the other — and they would emit two FHIR CodeSystem resources sharing one
  // canonical url (invalid FHIR, per Inv-0 url-uniqueness). This guards the
  // unsupported "2+ `code is` libraries in one package" case. Fail loudly rather
  // than emit a silently-shared domain. (Renaming a library no longer changes a
  // policy-id-keyed URN, so the fix is to consolidate or split — see message.)
  for (const [urn, libs] of localUrnToLibraries) {
    if (libs.size > 1) {
      const names = [...libs].sort();
      return {
        success: false,
        graph,
        importDiagnostics: graph.diagnostics,
        cqlByLibrary: [],
        errors: [
          {
            type: "Validation",
            kind: "emit-local-codesystem-urn-collision",
            message:
              `Libraries ${names.map((n) => `"${n}"`).join(" and ")} both declare ` +
              `concept-level \`code is\`, which share this policy's single local ` +
              `CodeSystem domain '${urn}'. The per-policy local domain (keyed on the ` +
              `policy id, not the library name) supports concept-level \`code is\` in ` +
              `ONE library only — consolidate the local \`code is\` declarations into a ` +
              `single library, or split into separate packages (one policy id each).`,
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
      localDomainId ?? entry.name,
      localCodesCountFor(entry.name),
    );
    if (plan.kind === "full" || plan.kind === "interface") splitLibraryNames.add(entry.name);
  }
  if (splitLibraryNames.size > 0) {
    for (const entry of emitClosure) {
      if (!entry.name) continue;
      const refs = librariesReferencedBy(entry.ast, entry.name);
      for (const ref of refs) {
        if (splitLibraryNames.has(ref)) {
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
    for (const entry of emitClosure) {
      if (entry.name === null || entry.name === "") continue;
      // R2 — register the FULL emitted-name set for this entry via the shared
      // split-plan. `full`/`interface` register the source-typed layer names (+
      // the Interface name for `interface`); `none` registers just `<lib>`. The
      // emitted-name base is the policy id (`localDomainId`), falling back to the
      // source library name for metadata-less callers.
      const plan = computeSplitPlan(
        entry.ast,
        entry.name,
        localDomainId ?? entry.name,
        localCodesCountFor(entry.name),
      );
      const source =
        plan.kind === "none"
          ? `library "${entry.name}"`
          : `auto-split of library "${entry.name}"`;
      for (const emittedName of plan.emittedLibraryNames) {
        register(emittedName, source);
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
  for (const entry of emitClosure) {
    // Skip parse-error placeholders (`null` name or empty-string library
    // synthesized after a parse error). The parse-failure diagnostic is
    // the real signal; emitting a library without a name would produce
    // invalid CQL.
    if (entry.name === null || entry.name === "") continue;

    // R2 — ONE shared split-plan drives BOTH the preflight (above) and this emit
    // loop. `full` (decision-less, multi-layer) emits the source-typed split;
    // `interface` (decision-bearing WITH concept-level `code is`) emits the
    // source-typed split PLUS the synthesized `<policyId>-Interface` library;
    // `none` takes the unchanged per-CRL path. cms22/cms69 (each source `.crl` is
    // single-layer, no `code is`) stay `none` → byte-identical.
    const entryPolicyId = localDomainId ?? entry.name;
    const plan = computeSplitPlan(entry.ast, entry.name, entryPolicyId, localCodesCountFor(entry.name));
    if (plan.kind !== "none") {
      const partitioned = emitPartitioned(entry.ast, entry.name, plan.policyId!, plan.partition!, {
        crossLibraryParameters,
        canonicalBase,
        localDomainId,
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
    let outputFilename: string;
    try {
      outputFilename = safeOutputFilename(entry.name);
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
      canonicalBase,
      localDomainId,
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
      libraryName: entry.name,
      filePath: entry.filePath,
      outputFilename,
      cql: emit.result,
      // Slice 4c manifest — the per-CRL (`none`) path: this CQL IS the source
      // library (role "root"), and its `include`s are the discovered cross-
      // library refs. `crossLibs` are the native CQL `include OtherLib` deps.
      sourceLibraryName: entry.name,
      role: "root",
      includes: crossLibs,
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
    });
  }

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cqlByLibrary,
  };
}
