// CRL symbol source for the CEL language services (#4 fix). The .cel services need the COVERED library's
// (and sibling/package libraries') concepts/decisions/activities — and they must resolve them the way the
// rest of the .cel ecosystem does: via `resolveCelImports`, NOT the CRL ProjectIndex. The ProjectIndex
// gates on `isCrlProject` (a package.json `crl.libraries` or ≥2 root .crl) and seeds from the workspace
// folder, so for a .cel whose covered .crl lives in a non-CRL-project location (e.g. a test fixture) it
// returns the WRONG project's declarations (or none) — while `resolveCelImports(celPath)` resolves the
// .cel's actual covered closure (the same path render_scenario + the CEL validator use).
//
// `celSymbolsIndex(graph)` adapts a ResolvedCelGraph to the small slice of ProjectIndex the CEL services
// call (getAllProjectDeclarations / getAllProjectLibraries) — so the compute fns are unchanged.
import type { CRL, Decision, Location } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type { RegistryEntry } from "../imports/types";
import { collectDecisionArms } from "../ast/decisionArms";
import type { ZeroBasedRange } from "./contracts";
import { toZeroBasedRange } from "./contracts";
import type { IndexedDeclaration, IndexedLibrary, ProjectIndex } from "./projectIndex";

/** The exact slice of ProjectIndex the CEL services consume — so a resolved-graph-backed source is a drop-in. */
export type CelSymbolSource = Pick<ProjectIndex, "getAllProjectDeclarations" | "getAllProjectLibraries">;

const KIND: Record<string, IndexedDeclaration["kind"] | undefined> = {
  Concept: "concept",
  Decision: "decision",
  Activity: "activity",
  Terminology: "terminology",
  Parameter: "parameter",
};

/** Collapse a range to a zero-width point at its start. Declaration ranges from the AST span the whole
 *  statement (multi-line for concepts/decisions); go-to-definition should land the cursor on the decl, not
 *  select its entire body. The PRECISE name-token range (which the .crl ProjectIndex derives from source via
 *  findNameRangeInHeader) is deferred — celSymbolsIndex has only the AST, not the .crl source text. */
const collapseToStart = (r: ZeroBasedRange): ZeroBasedRange => ({
  startLine: r.startLine,
  startCol: r.startCol,
  endLine: r.startLine,
  endCol: r.startCol,
});

/** Build a CelSymbolSource from a resolved CEL graph: the covered library + every registry library, with
 *  decision arms + concept types. `bodyRange` is the full statement span; `nameRange` is collapsed to the
 *  statement start (the go-to target). */
export function celSymbolsIndex(graph: ResolvedCelGraph): CelSymbolSource {
  const decls: IndexedDeclaration[] = [];
  const libs: IndexedLibrary[] = [];
  const seenFiles = new Set<string>();
  const seenLibs = new Set<string>();

  const add = (entry: RegistryEntry): void => {
    if (!entry.name || seenFiles.has(entry.filePath)) return;
    seenFiles.add(entry.filePath);
    addLibrary(entry, libs, seenLibs);
    for (const s of entry.ast.statements) {
      const kind = KIND[s.type];
      const loc = (s as { location?: Location }).location;
      if (!kind || !s.name || !loc) continue;
      const range = toZeroBasedRange(loc);
      const d: IndexedDeclaration = {
        name: s.name,
        kind,
        libraryName: entry.name,
        filePath: entry.filePath,
        line: range.startLine,
        nameRange: collapseToStart(range),
        bodyRange: range,
        origin: entry.origin,
      };
      if (kind === "decision") d.arms = [...collectDecisionArms(s as unknown as Decision)].sort();
      if (kind === "concept") {
        const t = (s as { conceptType?: string }).conceptType;
        if (t) d.type = t;
      }
      decls.push(d);
    }
  };

  if (graph.coversTarget) add(graph.coversTarget);
  if (graph.crlRegistry) {
    // Local shadows package: a .cel ref "Foo"."X" (and `covers "Foo"`) resolves "Foo" LOCAL-first
    // (resolver: byNameLocal ?? byNamePackage), then looks ONLY in that library — so exposing a package
    // "Foo"'s members under the same libraryName would let the services offer/navigate symbols the
    // validator rejects. Skip package libraries shadowed by a same-name local.
    const localNames = new Set<string>();
    for (const e of graph.crlRegistry.byNameLocal.values()) if (e.name) localNames.add(e.name);
    for (const e of graph.crlRegistry.byNameLocal.values()) add(e);
    for (const e of graph.crlRegistry.byNamePackage.values()) {
      if (e.name && localNames.has(e.name)) continue;
      add(e);
    }
  }

  return { getAllProjectDeclarations: () => decls, getAllProjectLibraries: () => libs };
}

function addLibrary(entry: RegistryEntry, libs: IndexedLibrary[], seenLibs: Set<string>): void {
  if (!entry.name || seenLibs.has(entry.name)) return;
  const ll = (entry.ast as CRL).library?.location;
  if (!ll) return;
  seenLibs.add(entry.name);
  const range = toZeroBasedRange(ll);
  libs.push({ libraryName: entry.name, filePath: entry.filePath, origin: entry.origin, range, nameRange: collapseToStart(range) });
}
