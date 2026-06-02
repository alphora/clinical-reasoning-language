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
import { emitCQLFromAST } from "../emitter/emitCQL";
import type { CRLError } from "../types/errors";

import { resolveImports } from "./index";
import { buildLibraryScopes, lookupKnownLibrary } from "./scopes";
import { ImportDiagnostic, RegistryEntry, ResolvedGraph } from "./types";

/**
 * Per-CRL emit (v2.1.0): one CQL file per CRL library.
 *
 * Each library in the emit closure produces its own `<libraryName>.cql` with
 * its own `library X` header, native `include FHIRHelpers`/`include CRLPatterns`
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

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]|\.\./;

/**
 * Derive a filesystem-safe filename for an emitted library. Library names
 * can plausibly include characters that are invalid on Windows (`<`, `>`,
 * `:`, `"`, `/`, `\`, `|`, `?`, `*`) or that would enable path traversal
 * (`..`). Spaces are preserved because the CQL translator expects the
 * on-disk filename to match the `include "Lib Name"` declaration verbatim.
 *
 * Throws when the name can't be safely represented.
 */
function safeOutputFilename(libraryName: string): string {
  if (UNSAFE_FILENAME_CHARS.test(libraryName)) {
    throw new Error(
      `Cannot derive a safe output filename for library "${libraryName}" — name contains characters that are unsafe for the filesystem (one of: \\ / : * ? " < > | ..)`,
    );
  }
  return `${libraryName}.cql`;
}

/**
 * Walk every concept-body ref slot. Visitor receives each `ReferenceName`.
 * Used by `collectCrossLibraryRefs` and by emit closure expansion.
 *
 * Slots covered (matches what `ReferenceResolver` walks in v2.1.0):
 *   - `CodedFromDefinition.terminologyName`
 *   - `DefinedAsBareRef.ref`
 *   - `DefinedAsComposition` → `CompositionRef.ref` (recursive)
 *   - `DefinitionIsDefinition` → narrative `NConceptRef` + nested
 *     `ArgValue` `NConceptRef` (recursive)
 */
function visitConceptRefs(concept: Concept, visit: (ref: ReferenceName) => void): void {
  switch (concept.definition.type) {
    case "CodedFromDefinition":
      visit(concept.definition.terminologyName);
      return;
    case "DefinedAsDefinition": {
      const body = concept.definition.body;
      if (body.type === "DefinedAsBareRef") {
        visit(body.ref);
      } else if (body.type === "DefinedAsComposition") {
        visitComposition((body as DefinedAsComposition).expression, visit);
      }
      return;
    }
    case "DefinitionIsDefinition":
      visitNarrative(concept.definition.body, visit);
      return;
  }
}

function visitComposition(expr: CompositionExpression, visit: (ref: ReferenceName) => void): void {
  switch (expr.type) {
    case "SemOrExpression":
    case "SemAndExpression":
      for (const t of expr.terms) visitComposition(t, visit);
      return;
    case "SemNotExpression":
      visitComposition(expr.expression, visit);
      return;
    case "CompositionGroup":
      visitComposition(expr.expression, visit);
      return;
    case "CompositionRef":
      visit(expr.ref);
      return;
  }
}

function visitNarrative(clause: NarrativeClause, visit: (ref: ReferenceName) => void): void {
  for (const el of clause.elements) visitNarrativeElement(el, visit);
}

function visitNarrativeElement(el: NarrativeElement, visit: (ref: ReferenceName) => void): void {
  switch (el.type) {
    case "NConceptRef":
      visit(el.value);
      return;
    case "NDisjunction":
      for (const av of el.disjuncts) visitArgValue(av, visit);
      return;
    case "NConjunction":
      for (const av of el.conjuncts) visitArgValue(av, visit);
      return;
    // NWord, Quantity — not refs
  }
}

function visitArgValue(av: ArgValue, visit: (ref: ReferenceName) => void): void {
  switch (av.type) {
    case "NConceptRef":
      visit(av.value);
      return;
    case "NDisjunction":
      for (const inner of av.disjuncts) visitArgValue(inner, visit);
      return;
    case "NConjunction":
      for (const inner of av.conjuncts) visitArgValue(inner, visit);
      return;
    // Quantity — no ref
  }
}

/**
 * Collect the set of distinct cross-library library names this entry needs
 * in its emitted CQL header. Combines two sources:
 *
 *   1. Source-level `include "X".` statements — required for shell-root
 *      libraries that only re-export via includes (e.g. cms22-split's
 *      `library "CMS22"` shell with `include "CMS22 Interface"` and no
 *      concepts). Without this, the shell CQL would have no `include`
 *      lines and downstream consumers couldn't reach re-exported names.
 *   2. Qualified-ref qualifiers from concept body refs (CodedFrom +
 *      DefinedAsBareRef + CompositionRef + narrative NConceptRef).
 *
 * Excludes self-references (qualifier == entry's library name).
 */
function collectCrossLibraryRefs(entry: RegistryEntry): Set<string> {
  const refs = new Set<string>();
  const selfName = entry.name;
  const addIfCross = (lib: string | null): void => {
    if (lib === null || lib === "") return;
    if (lib === selfName) return;
    refs.add(lib);
  };
  // 1. Source-level includes (under v2.1.0 these are external-only in
  //    spirit per lock 026, but the resolver's local-fallback still allows
  //    legacy local includes; either way the emit needs the corresponding
  //    CQL include line so the library actually wires up).
  for (const inc of entry.ast.includes) {
    addIfCross(inc.name);
  }
  // 2. Qualified-ref qualifiers from concept bodies.
  const visit = (ref: ReferenceName): void => {
    if (!isQualifiedRef(ref)) return;
    addIfCross(getRefLibrary(ref));
  };
  for (const stmt of entry.ast.statements) {
    if (stmt.type === "Concept") {
      visitConceptRefs(stmt as Concept, visit);
    }
  }
  return refs;
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

  // Build scopes so cross-library ref resolution uses the v2.1.0 lookup
  // precedence (local-first for non-explicit-include refs from local/root
  // callers).
  const registry = graph.registry ?? { byNameLocal: new Map(), byNamePackage: new Map() };
  const scopes = buildLibraryScopes(graph.resolvedLibraries, graph.localLibraries, registry);

  // Compute the emit closure: start from resolvedLibraries; add any local
  // sibling that's transitively qualified-referenced from an already-
  // included library. Packages must already be in resolvedLibraries via
  // `include`, so they don't get added here.
  const emitClosure: RegistryEntry[] = [];
  const emitClosurePaths = new Set<string>();
  const visited = new Set<string>();
  const queue: RegistryEntry[] = [...graph.resolvedLibraries];
  for (const e of queue) {
    if (!emitClosurePaths.has(e.filePath)) {
      emitClosurePaths.add(e.filePath);
      emitClosure.push(e);
    }
  }
  while (queue.length > 0) {
    const entry = queue.shift()!;
    if (visited.has(entry.filePath)) continue;
    visited.add(entry.filePath);
    const scope = scopes.get(entry.filePath);
    if (!scope) continue;
    const crossLibs = collectCrossLibraryRefs(entry);
    for (const libName of crossLibs) {
      const target = lookupKnownLibrary(scope, libName);
      if (!target) continue; // unknown — external-library-not-included already fired
      if (target.origin === "package") continue; // packages stay outside the emit set
      if (emitClosurePaths.has(target.filePath)) continue;
      // Auto-resolved local sibling — pull into emit closure.
      const siblingEntry = graph.localLibraries.find((e) => e.filePath === target.filePath)
        ?? graph.resolvedLibraries.find((e) => e.filePath === target.filePath);
      if (!siblingEntry) continue;
      emitClosurePaths.add(siblingEntry.filePath);
      emitClosure.push(siblingEntry);
      queue.push(siblingEntry);
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
    });
  }

  return {
    success: true,
    graph,
    importDiagnostics: graph.diagnostics,
    cqlByLibrary,
  };
}
