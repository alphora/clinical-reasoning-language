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
  FULL_PARTITION,
  PARTIAL_PARTITION,
} from "../cql-emitter/layeredEmit";
import type { Partition } from "../cql-emitter/layeredEmit";
import { lowerLocalCodes, localCodeSystemUrl } from "../cql-emitter/lowerLocalCodes";
import { readCanonicalBase } from "../fhir-emitter/metadata";
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
  role: "root" | "concepts" | "layer";
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
 * Slice 4c — the ONE shared split-plan classifier consumed by BOTH the
 * preflights (collision registration) AND the emit loop, so split-vs-no-split is
 * decided in exactly one place (no gate-in-two-places drift).
 *
 *   - `full`    : a layer-splittable multi-layer library (NO Decision — see the
 *                 invariant below) → FULL 3-way split. `emittedLibraryNames` =
 *                 `layerLibraryNamesFor(...)`.
 *   - `partial` : NOT layer-splittable (e.g. decision-bearing) but carries
 *                 concept-level `code is` (`localCodesCount > 0`) → 2-way
 *                 Concepts/Root split. `emittedLibraryNames` = `[lib, "<lib>
 *                 Concepts"]`.
 *   - `none`    : neither → the unchanged per-CRL path. `emittedLibraryNames` =
 *                 `[lib]`.
 *
 * `localCodesCount` is the count of concept-level `code is` codes the library
 * lowered (from `lowerLocalCodes`), threaded by the caller from the SAME lowered
 * AST that is emitted — so the plan can't drift from the emit.
 *
 * INVARIANT (slice 4c [critical]): a decision-bearing library is NEVER `full`.
 * `isLayerSplittable` returns false the moment it hits a Decision (its
 * `classifyStatementLayer === null` → return false), so `full` implies
 * NO-Decision. This is load-bearing: the partial Root keeps the SOURCE library
 * name `<lib>`, and that contract is only safe because `full` (which renames
 * EVERYTHING to `<lib> <layer>`) can never fire on a decision-bearing library.
 */
export type SplitKind = "full" | "partial" | "none";

export interface SplitPlan {
  kind: SplitKind;
  emittedLibraryNames: string[];
  partition?: Partition;
}

export function computeSplitPlan(
  ast: CRL,
  lib: string,
  localCodesCount: number,
): SplitPlan {
  if (isLayerSplittable(ast)) {
    // D5 — UNREACHABLE: `isLayerSplittable` returns false at the first Decision
    // (its `classifyStatementLayer` is null for a Decision → the splittability
    // loop bails), so reaching this branch with a Decision present is impossible
    // by construction. This is NOT a structured emit error (it can't fire on any
    // real input); it is an impossible-assert that guards a FUTURE refactor of
    // `isLayerSplittable` from silently violating the partial-Root-keeps-source-
    // name contract. We keep the throw (rather than a structured CRLError) BECAUSE
    // it is truly unreachable — over-engineering a soft-error channel for a
    // branch no input can hit would be the wrong shape. The MCP path has no
    // try/catch here, but that is fine: this throw cannot fire on valid emit input.
    if (ast.statements.some((s) => s.type === "Decision")) {
      throw new Error(
        `internal invariant violated: library "${lib}" is both isLayerSplittable ` +
          `and decision-bearing — a decision-bearing library must never take the ` +
          `FULL split (its Root keeps the source name "${lib}", which the full ` +
          `split would rename away).`,
      );
    }
    return {
      kind: "full",
      emittedLibraryNames: layerLibraryNamesFor(ast, lib),
      partition: FULL_PARTITION,
    };
  }
  if (localCodesCount > 0) {
    return {
      kind: "partial",
      emittedLibraryNames: [lib, `${lib} Concepts`],
      partition: PARTIAL_PARTITION,
    };
  }
  return { kind: "none", emittedLibraryNames: [lib] };
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
  if (graph.projectRoot) {
    canonicalBase = readCanonicalBase(graph.projectRoot);
  }
  // Track libraries that actually synthesized a local codesystem (lowered at
  // least one `code is` concept), keyed by the deterministic codesystem URL — so
  // the cross-library collision preflight below can fire when two DISTINCT
  // library names slug to the SAME local codesystem URL. The collision is on the
  // slug, so it is scheme-independent (URN vs canonicalBase both collide).
  const localUrnToLibraries = new Map<string, Set<string>>();
  // Slice 4c — the count of concept-level `code is` codes each library lowered,
  // keyed by emitted library name. Threaded into `computeSplitPlan` so the split
  // decision (partial vs none) is made from the SAME lowered representation that
  // is emitted. (`lowered.localCodes` is populated from the exact synthesis loop
  // that builds the synthetic terminologies — one source of truth.)
  const localCodesCountByName = new Map<string, number>();
  const emitClosure = rawEmitClosure.map((entry) => {
    const lowered = lowerLocalCodes(entry.ast, { canonicalBase });
    if (lowered.errors.length > 0) lowerErrors.push(...lowered.errors);
    const didLower = lowered.ast !== entry.ast;
    if (didLower && entry.name) {
      const urn = localCodeSystemUrl(canonicalBase, entry.ast.library.name);
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
  // Cross-library local-codesystem URN collision. Two distinct libraries in the
  // emit closure whose names slug to the same local URN would unintentionally
  // share a local code domain (CQL code identity is system+code), so a local
  // code in one could collide with one in the other. Fail loudly rather than
  // emit a silently-shared codesystem.
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
              `Libraries ${names.map((n) => `"${n}"`).join(" and ")} both synthesize the ` +
              `local codesystem "${urn}" from their \`code is\` concepts — their names ` +
              `slug to the same local domain, so their local codes would share a ` +
              `codesystem and could collide. Rename one library so the local ` +
              `codesystem URNs are distinct.`,
          },
        ],
      };
    }
  }

  // v2.2 Todo 3 (issue #59) — index every emitted library's AST parameters
  // once so per-library emit can resolve qualified context-parameter refs.
  const crossLibraryParameters = buildAstParameterIndex(emitClosure);

  // Slice 2 (layeredEmit) — the set of library NAMES that will be auto-split
  // into layer libraries. A FULL-split library's ORIGINAL name no longer exists
  // as an emitted CQL library, so any OTHER library that qualified-refs it would
  // dangle. Cross-library referrer-rewriting (rewrite `"X"."Y"` to the layer
  // Y landed in) is the DEFERRED routing slice; here we detect the situation
  // and fail loudly rather than emit broken CQL.
  //
  // Slice 4c — PARTIAL-split libraries are deliberately NOT added here: the
  // partial Root KEEPS the source name `<lib>` (its whole point — PlanDef/
  // ActivityDef `library[]` refs slug from the source name), so a foreign ref to
  // `"<lib>"."X"` still resolves to the Root library. (KNOWN LIMITATION: a
  // foreign ref into the MOVED terminology — `"<lib>"."<aTerminology>"` — would
  // now dangle, since terminologies relocated to `<lib> Concepts`. That edge is
  // out of deliverable scope; do NOT break valid root refs to guard it.)
  const splitLibraryNames = new Set<string>();
  for (const entry of emitClosure) {
    if (entry.name && isLayerSplittable(entry.ast)) splitLibraryNames.add(entry.name);
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
                  `multi-layer library that emit auto-splits into layer libraries ` +
                  `("${ref} Concepts" / "${ref} Asserted" / "${ref} Inferred"). ` +
                  `Cross-library references into an auto-split library are not yet ` +
                  `supported (referrer re-qualification is a later slice). Reference ` +
                  `the specific layer library directly, or keep "${ref}" single-layer.`,
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
      // Slice 4c — register the FULL emitted-name set for this entry via the
      // shared split-plan. A `partial` entry now registers BOTH `<lib>` AND
      // `<lib> Concepts` (previously only `<lib>` was registered for non-
      // splittable entries, letting a real sibling `<lib> Concepts` clobber the
      // generated one silently). `full` registers the layer names; `none`
      // registers just `<lib>` — same as before for those kinds.
      const plan = computeSplitPlan(entry.ast, entry.name, localCodesCountFor(entry.name));
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

    // Slice 4c — ONE shared split-plan drives BOTH the preflight (above) and
    // this emit loop. `full` (a multi-layer, all-classifiable library) emits the
    // 3-way FULL split; `partial` (a NON-splittable library — e.g. decision-
    // bearing — carrying concept-level `code is`) emits the 2-way Concepts/Root
    // split (Root keeps the source name `<lib>`); `none` takes the unchanged
    // per-CRL path. The cms22/cms69 goldens (each source `.crl` is single-layer)
    // and the FULL-split goldens stay byte-identical.
    const plan = computeSplitPlan(entry.ast, entry.name, localCodesCountFor(entry.name));
    if (plan.kind !== "none") {
      const partitioned = emitPartitioned(entry.ast, entry.name, plan.partition!, {
        crossLibraryParameters,
        canonicalBase,
      });
      if (!partitioned.success) {
        return {
          success: false,
          graph,
          importDiagnostics: graph.diagnostics,
          cqlByLibrary: [],
          errors: partitioned.entries.flatMap((e) => e.result.errors ?? []),
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
        // Manifest role (D1) — the entry that OWNS the terminology declarations
        // (the Concepts-classified layer, partition value "Concepts") is ALWAYS
        // `role:"concepts"`, under BOTH the partial AND the full split. The FHIR
        // dep-routing assigns the CodeSystem/author-ValueSet depends-on edges to
        // the `role:"concepts"` entry; before D1 the full-split Concepts LAYER was
        // marked `"layer"`, so under full split the local CodeSystem was orphaned
        // (zero inbound depends-on) — a regression vs the pre-4c single Library.
        // Routing it onto the Concepts entry restores the pre-4c edge.
        //
        // The partition VALUE (`part.layer`) is `"Concepts"` for the Concepts
        // entry in BOTH FULL_PARTITION and PARTIAL_PARTITION, so it is the one
        // source of truth here. Under `partial` the entry whose emitted name ===
        // the source `<lib>` is the Root (partition value "Root"); under `full`
        // the Asserted/Inferred entries stay `"layer"`.
        const role: PerLibraryEmit["role"] =
          part.layer === "Concepts"
            ? "concepts"
            : plan.kind === "partial" && part.libraryName === entry.name
              ? "root"
              : "layer";
        cqlByLibrary.push({
          libraryName: part.libraryName,
          filePath: entry.filePath,
          outputFilename: partFilename,
          cql: part.result.result ?? "",
          sourceLibraryName: entry.name,
          role,
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

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cqlByLibrary,
  };
}
