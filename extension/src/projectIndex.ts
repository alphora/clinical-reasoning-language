import * as fs from "node:fs";
import * as path from "node:path";

import {
  findProjectRoot,
  resolveImports,
  type ResolvedGraph,
  type RegistryEntry,
} from "@smile-digital-health/crl";

/**
 * Project-wide indexed view of a single .crl file: which library it
 * belongs to, what kind of declaration it is, where it lives.
 */
export interface IndexedDeclaration {
  /** The quoted name as written, without surrounding quotes. */
  name: string;
  kind: "concept" | "terminology" | "decision" | "activity";
  /** The library this declaration belongs to. */
  libraryName: string;
  /** Absolute path of the .crl file containing the declaration. */
  filePath: string;
  /** 0-based line of the declaration header. */
  line: number;
  /** Range of the name token inside the header (for goto / rename). */
  nameRange: ZeroBasedRange;
  /** Full statement range (for DocumentSymbol body range). */
  bodyRange: ZeroBasedRange;
  origin: "local" | "package" | "root";
  /** Concept-only: declared `type is X.` */
  type?: string;
  /** Concept-only: declared `valuetype is X.` */
  valuetype?: string;
  /** First body bullet text for hover preview. */
  bodyPreview?: string;
}

/**
 * Library declaration (`library "X".`) entry for goto-library navigation
 * and DocumentLinkProvider include targets.
 */
export interface IndexedLibrary {
  libraryName: string;
  filePath: string;
  origin: "local" | "package" | "root";
  /** Range of the library statement (the whole `library "X".` line). */
  range: ZeroBasedRange;
  /** Range of the library name token (between the quotes). */
  nameRange: ZeroBasedRange;
}

/**
 * A reference SITE — somewhere a concept/terminology/decision/activity
 * name is used. Resolved to its target via the scope rules (bare ref
 * resolves in owning library; qualified ref via lookupKnownLibrary).
 */
export interface IndexedReference {
  targetLibrary: string;
  targetName: string;
  targetKind: "concept" | "terminology" | "decision" | "activity";
  filePath: string;
  /** Range of the name segment (inside the quotes). */
  nameRange: ZeroBasedRange;
  /** Range of the qualifier segment (`"Lib"`); null for bare refs. */
  qualifierRange: ZeroBasedRange | null;
  qualified: boolean;
}

/**
 * Zero-based, inclusive-start, exclusive-end range. Matches the shape
 * VS Code's `Range` consumes; converted by the providers at the boundary.
 */
export interface ZeroBasedRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

interface CachedProject {
  projectRoot: string;
  graph: ResolvedGraph;
  declarations: IndexedDeclaration[];
  libraries: IndexedLibrary[];
  references: IndexedReference[];
  /** `${libName}::${name}` → IndexedReference[] for O(1) findRefsTo. */
  refsByTarget: Map<string, IndexedReference[]>;
  /** Set of file paths the validator touched on the last validate pass. */
  knownFilePaths: Set<string>;
}

/**
 * Singleton index for the extension's multi-file scope.
 *
 *   - maintains an overlay map of in-memory editor text
 *   - finds project roots with a CRL-project guard
 *   - caches the `ResolvedGraph` per project root
 *   - enumerates IndexedDeclarations + IndexedLibraries + IndexedReferences
 *     from the parsed ASTs
 *
 * Cache invalidation: manual via `invalidate(projectRoot)` /
 * `invalidateAll()`; extension diagnostics also invalidate on every
 * overlay set/clear (cheap correctness over perf).
 */
export class ProjectIndex {
  private readonly overlays = new Map<string, string>();
  private readonly cache = new Map<string, CachedProject>();

  setOverlay(absPath: string, text: string): void {
    const canonical = canonicalize(absPath);
    this.overlays.set(canonical, text);
    this.cache.clear();
  }

  clearOverlay(absPath: string): void {
    const canonical = canonicalize(absPath);
    if (this.overlays.delete(canonical)) {
      this.cache.clear();
    }
  }

  getOverlays(): ReadonlyMap<string, string> {
    return this.overlays;
  }

  getProjectRoot(filePath: string): string | null {
    const root = findProjectRoot(path.resolve(filePath));
    if (root === null) return null;
    if (isCrlProject(root)) return root;
    return null;
  }

  getGraph(filePath: string): ResolvedGraph | null {
    const projectRoot = this.getProjectRoot(filePath);
    if (projectRoot === null) return null;
    const cached = this.cache.get(projectRoot);
    if (cached) return cached.graph;
    return this.refresh(filePath, projectRoot).graph;
  }

  getDeclarations(filePath: string): IndexedDeclaration[] {
    const cached = this.getCached(filePath);
    return cached?.declarations ?? [];
  }

  getLibraries(filePath: string): IndexedLibrary[] {
    const cached = this.getCached(filePath);
    return cached?.libraries ?? [];
  }

  getReferences(filePath: string): IndexedReference[] {
    const cached = this.getCached(filePath);
    return cached?.references ?? [];
  }

  findDeclarationByLibAndName(
    filePath: string,
    libraryName: string,
    name: string,
    kind?: IndexedDeclaration["kind"],
  ): IndexedDeclaration | null {
    const decls = this.getDeclarations(filePath);
    for (const d of decls) {
      if (d.libraryName !== libraryName) continue;
      if (d.name !== name) continue;
      if (kind !== undefined && d.kind !== kind) continue;
      return d;
    }
    return null;
  }

  /** O(1) lookup via internal map. */
  findRefsTo(filePath: string, libraryName: string, name: string): IndexedReference[] {
    const cached = this.getCached(filePath);
    if (!cached) return [];
    return cached.refsByTarget.get(refKey(libraryName, name)) ?? [];
  }

  /**
   * Enumerate declarations across every CRL project reachable from the
   * given workspace folders. Used by `WorkspaceSymbolProvider`.
   */
  getAllProjectDeclarations(workspaceFolders: readonly string[]): IndexedDeclaration[] {
    const seen = new Set<string>();
    const out: IndexedDeclaration[] = [];
    for (const folder of workspaceFolders) {
      const seeds = findCrlSeed(folder);
      if (!seeds) continue;
      const root = this.getProjectRoot(seeds);
      if (root === null || seen.has(root)) continue;
      seen.add(root);
      out.push(...this.getDeclarations(seeds));
    }
    return out;
  }

  invalidate(projectRoot: string): void {
    this.cache.delete(projectRoot);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  private getCached(filePath: string): CachedProject | null {
    const projectRoot = this.getProjectRoot(filePath);
    if (projectRoot === null) return null;
    const cached = this.cache.get(projectRoot);
    if (cached) return cached;
    return this.refresh(filePath, projectRoot);
  }

  private refresh(filePath: string, projectRoot: string): CachedProject {
    const graph = resolveImports(path.resolve(filePath), { overlays: this.overlays });
    const declarations = enumerateDeclarations(graph, this.overlays);
    const libraries = enumerateLibraries(graph, this.overlays);
    const references = enumerateReferences(graph, this.overlays);
    const refsByTarget = new Map<string, IndexedReference[]>();
    for (const r of references) {
      const k = refKey(r.targetLibrary, r.targetName);
      let arr = refsByTarget.get(k);
      if (!arr) {
        arr = [];
        refsByTarget.set(k, arr);
      }
      arr.push(r);
    }
    const knownFilePaths = new Set<string>();
    for (const e of graph.resolvedLibraries) knownFilePaths.add(e.filePath);
    for (const e of graph.localLibraries) knownFilePaths.add(e.filePath);
    const cached: CachedProject = {
      projectRoot,
      graph,
      declarations,
      libraries,
      references,
      refsByTarget,
      knownFilePaths,
    };
    this.cache.set(projectRoot, cached);
    return cached;
  }
}

function refKey(libraryName: string, name: string): string {
  return `${libraryName}::${name}`;
}

function isCrlProject(projectRoot: string): boolean {
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { crl?: { libraries?: unknown } };
    if (pkg.crl && Array.isArray(pkg.crl.libraries)) return true;
  } catch {
    // Missing or malformed package.json — fall through to (b).
  }
  let count = 0;
  try {
    countCrlFiles(projectRoot, (n) => {
      count = n;
      return n >= 2;
    });
  } catch {
    return false;
  }
  return count >= 2;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build"]);

function countCrlFiles(dir: string, tick: (count: number) => boolean): void {
  let count = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".crl")) {
        count++;
        if (tick(count)) return;
      }
    }
  }
  tick(count);
}

/**
 * Find any .crl file under `folder` to seed project-root discovery.
 * Returns the first match (BFS) or null.
 */
function findCrlSeed(folder: string): string | null {
  const stack = [folder];
  while (stack.length > 0) {
    const cur = stack.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".crl")) return full;
    }
  }
  return null;
}

function enumerateDeclarations(
  graph: ResolvedGraph,
  overlays: ReadonlyMap<string, string>,
): IndexedDeclaration[] {
  const out: IndexedDeclaration[] = [];
  const seen = new Set<string>();
  const collect = (entries: RegistryEntry[]): void => {
    for (const entry of entries) {
      if (seen.has(entry.filePath)) continue;
      seen.add(entry.filePath);
      if (entry.name === null || entry.name === "") continue;
      const source = sourceFor(entry.filePath, overlays);
      for (const stmt of entry.ast.statements) {
        if (!stmt.name) continue;
        const stmtLocation = (stmt as { location?: { start: { line: number; column: number }; end: { line: number; column: number } } }).location;
        if (!stmtLocation) continue;
        const headerLine = Math.max(0, stmtLocation.start.line - 1);
        const nameRange = findNameRangeInHeader(source, headerLine, stmt.name);
        const bodyRange = locToRange(stmtLocation);
        const base = {
          name: stmt.name,
          libraryName: entry.name,
          filePath: entry.filePath,
          line: headerLine,
          nameRange: nameRange ?? collapseToHeader(headerLine),
          bodyRange,
          origin: entry.origin,
        } as const;
        switch (stmt.type) {
          case "Concept": {
            const c = stmt as { conceptType?: string; valueTypes?: string[]; definition?: unknown };
            out.push({
              ...base,
              kind: "concept",
              ...(c.conceptType ? { type: c.conceptType } : {}),
              ...(c.valueTypes?.[0] ? { valuetype: c.valueTypes[0] } : {}),
              bodyPreview: describeConceptBody(c.definition),
            });
            break;
          }
          case "Terminology":
            out.push({ ...base, kind: "terminology" });
            break;
          case "Decision":
            out.push({ ...base, kind: "decision" });
            break;
          case "Activity":
            out.push({ ...base, kind: "activity" });
            break;
        }
      }
    }
  };
  collect(graph.resolvedLibraries);
  collect(graph.localLibraries);
  return out;
}

function enumerateLibraries(
  graph: ResolvedGraph,
  overlays: ReadonlyMap<string, string>,
): IndexedLibrary[] {
  const out: IndexedLibrary[] = [];
  const seen = new Set<string>();
  const collect = (entries: RegistryEntry[]): void => {
    for (const entry of entries) {
      if (seen.has(entry.filePath)) continue;
      seen.add(entry.filePath);
      if (entry.name === null || entry.name === "") continue;
      const libDecl = entry.ast.library;
      if (!libDecl?.location) continue;
      const source = sourceFor(entry.filePath, overlays);
      const range = locToRange(libDecl.location);
      const headerLine = range.startLine;
      const nameRange = findNameRangeInHeader(source, headerLine, entry.name) ?? range;
      out.push({
        libraryName: entry.name,
        filePath: entry.filePath,
        origin: entry.origin,
        range,
        nameRange,
      });
    }
  };
  collect(graph.resolvedLibraries);
  collect(graph.localLibraries);
  return out;
}

/**
 * Walk every concept/decision/activity body ref slot and emit one
 * IndexedReference per ref site. Mirrors `ReferenceResolver`'s coverage
 * (concept body + when/recommend/use + activity-with).
 */
function enumerateReferences(
  graph: ResolvedGraph,
  overlays: ReadonlyMap<string, string>,
): IndexedReference[] {
  const out: IndexedReference[] = [];
  const seen = new Set<string>();
  const collect = (entries: RegistryEntry[]): void => {
    for (const entry of entries) {
      if (seen.has(entry.filePath)) continue;
      seen.add(entry.filePath);
      if (entry.name === null) continue;
      const source = sourceFor(entry.filePath, overlays);
      const owningLib = entry.name;
      for (const stmt of entry.ast.statements) {
        walkStatementRefs(stmt, owningLib, entry.filePath, source, out);
      }
    }
  };
  collect(graph.resolvedLibraries);
  collect(graph.localLibraries);
  return out;
}

function walkStatementRefs(
  stmt: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  const s = stmt as { type?: string };
  switch (s.type) {
    case "Concept": {
      const c = stmt as { definition?: unknown };
      walkConceptBody(c.definition, owningLib, filePath, source, out);
      return;
    }
    case "Decision": {
      const d = stmt as { body?: { statements?: unknown[] } };
      for (const wb of d.body?.statements ?? []) {
        walkWhenBlock(wb, owningLib, filePath, source, out);
      }
      return;
    }
    case "Activity": {
      const a = stmt as { body?: { withClause?: { terminologyReference?: unknown; location?: Loc } } };
      const wc = a.body?.withClause;
      if (wc && wc.terminologyReference !== undefined && wc.location) {
        addRef(wc.terminologyReference, "terminology", owningLib, filePath, source, wc.location, out);
      }
      return;
    }
  }
}

type Loc = { start: { line: number; column: number }; end: { line: number; column: number } };

function walkConceptBody(
  def: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  if (!def || typeof def !== "object") return;
  const d = def as { type?: string; location?: Loc };
  switch (d.type) {
    case "CodedFromDefinition": {
      const cf = def as { terminologyName: unknown; location: Loc };
      addRef(cf.terminologyName, "terminology", owningLib, filePath, source, cf.location, out);
      return;
    }
    case "DefinedAsDefinition": {
      const da = def as { body?: unknown };
      walkDefinedAsBody(da.body, owningLib, filePath, source, out);
      return;
    }
    case "DefinitionIsDefinition": {
      const di = def as { body?: { elements?: unknown[] } };
      for (const el of di.body?.elements ?? []) {
        walkNarrativeElement(el, owningLib, filePath, source, out);
      }
      return;
    }
  }
}

function walkDefinedAsBody(
  body: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  if (!body || typeof body !== "object") return;
  const b = body as { type?: string; ref?: unknown; expression?: unknown; location?: Loc };
  if (b.type === "DefinedAsBareRef" && b.location) {
    addRef(b.ref, "concept", owningLib, filePath, source, b.location, out);
  } else if (b.type === "DefinedAsComposition") {
    walkComposition(b.expression, owningLib, filePath, source, out);
  }
}

function walkComposition(
  expr: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  if (!expr || typeof expr !== "object") return;
  const e = expr as { type?: string; terms?: unknown[]; expression?: unknown; ref?: unknown; location?: Loc };
  switch (e.type) {
    case "SemOrExpression":
    case "SemAndExpression":
      for (const t of e.terms ?? []) walkComposition(t, owningLib, filePath, source, out);
      return;
    case "SemNotExpression":
    case "CompositionGroup":
      walkComposition(e.expression, owningLib, filePath, source, out);
      return;
    case "CompositionRef":
      if (e.location) addRef(e.ref, "concept", owningLib, filePath, source, e.location, out);
      return;
  }
}

function walkNarrativeElement(
  el: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  if (!el || typeof el !== "object") return;
  const e = el as { type?: string; value?: unknown; disjuncts?: unknown[]; conjuncts?: unknown[]; location?: Loc };
  switch (e.type) {
    case "NConceptRef":
      if (e.location) addRef(e.value, "concept", owningLib, filePath, source, e.location, out);
      return;
    case "NDisjunction":
      for (const av of e.disjuncts ?? []) walkNarrativeElement(av, owningLib, filePath, source, out);
      return;
    case "NConjunction":
      for (const av of e.conjuncts ?? []) walkNarrativeElement(av, owningLib, filePath, source, out);
      return;
  }
}

function walkWhenBlock(
  wb: unknown,
  owningLib: string,
  filePath: string,
  source: string,
  out: IndexedReference[],
): void {
  if (!wb || typeof wb !== "object") return;
  const w = wb as {
    type?: string;
    conceptName?: unknown;
    body?: unknown;
    statements?: unknown[];
    action?: { type?: string; activityName?: unknown; decisionName?: unknown; location?: Loc };
    location?: Loc;
  };
  if (w.type === "WhenBlock" && w.location) {
    addRef(w.conceptName, "concept", owningLib, filePath, source, w.location, out);
    walkWhenBlock(w.body, owningLib, filePath, source, out);
    return;
  }
  if (w.type === "BlockBody") {
    for (const st of w.statements ?? []) walkWhenBlock(st, owningLib, filePath, source, out);
    return;
  }
  if (w.type === "ActionStatement") {
    const action = w.action;
    if (!action || !action.location) return;
    if (action.type === "RecommendActivity") {
      addRef(action.activityName, "activity", owningLib, filePath, source, action.location, out);
    } else if (action.type === "UseDecision") {
      addRef(action.decisionName, "decision", owningLib, filePath, source, action.location, out);
    }
  }
}

/**
 * Emit an IndexedReference for a single ref site.
 *
 * `parentLoc` is the AST location of the node CONTAINING the ref.
 * Required because bare refs are plain strings without their own
 * location field — we get the location from the wrapping
 * `NConceptRef`/`CompositionRef`/`WhenBlock`/`ActionStatement`/etc.
 * Qualified refs carry their own location too; we prefer that when
 * available.
 *
 * Round-1 code-review C1 fix: previously dropped bare refs because the
 * old signature expected a `.location` on the ref itself.
 */
function addRef(
  ref: unknown,
  targetKind: IndexedReference["targetKind"],
  owningLib: string,
  filePath: string,
  source: string,
  parentLoc: Loc,
  out: IndexedReference[],
): void {
  if (!ref) return;
  let targetLibrary: string;
  let targetName: string;
  let qualified: boolean;
  let location: Loc = parentLoc;
  if (typeof ref === "string") {
    targetLibrary = owningLib;
    targetName = ref;
    qualified = false;
  } else if (typeof ref === "object" && (ref as { type?: string }).type === "QualifiedReference") {
    const q = ref as { libraryName: string; name: string; location?: Loc };
    targetLibrary = q.libraryName;
    targetName = q.name;
    qualified = true;
    if (q.location) location = q.location;
  } else {
    return;
  }
  if (!targetName) return;
  const ranges = findRefRangesInSource(source, location, targetName, qualified);
  if (!ranges) return;
  out.push({
    targetLibrary,
    targetName,
    targetKind,
    filePath,
    nameRange: ranges.nameRange,
    qualifierRange: ranges.qualifierRange,
    qualified,
  });
}

/**
 * Given the source text and a parent-node location (covering either a
 * bare `"Name"` or a qualified `"Lib"."Name"`), locate the name segment
 * (inside the LAST quoted pair) and, for qualified refs, the qualifier
 * segment (inside the FIRST quoted pair).
 *
 * Ranges returned are zero-based, exclusive-end, and target the INSIDE
 * of the quotes (so rename edits don't have to touch the `"` chars).
 */
function findRefRangesInSource(
  source: string,
  location: Loc,
  targetName: string,
  qualified: boolean,
): { nameRange: ZeroBasedRange; qualifierRange: ZeroBasedRange | null } | null {
  // Get the substring covered by location.
  const lines = source.split(/\r?\n/);
  const startLine = location.start.line - 1;
  const endLine = location.end.line - 1;
  if (startLine < 0 || endLine >= lines.length) return null;
  if (startLine !== endLine) {
    // Multi-line refs: anchor at the start of the location range.
    return {
      nameRange: { startLine, startCol: location.start.column, endLine: startLine, endCol: location.start.column + 1 },
      qualifierRange: null,
    };
  }
  const line = lines[startLine];
  const startCol = location.start.column;
  const endCol = location.end.column;
  const segment = line.slice(startCol, endCol);
  // Prefer an exact match on `"<targetName>"` (handles parent locations
  // that cover MORE than the ref — e.g. when-clause locations including
  // the keyword + concept ref). Last-occurrence wins so qualified refs
  // pick the trailing name segment.
  const exactNeedle = `"${targetName}"`;
  const exactIdx = segment.lastIndexOf(exactNeedle);
  if (exactIdx >= 0) {
    const nameStart = startCol + exactIdx + 1;
    const nameRange: ZeroBasedRange = {
      startLine,
      startCol: nameStart,
      endLine: startLine,
      endCol: nameStart + targetName.length,
    };
    let qualifierRange: ZeroBasedRange | null = null;
    if (qualified) {
      const before = segment.slice(0, exactIdx);
      const m = /"([^"]+)"\s*\.\s*$/.exec(before);
      if (m) {
        const qualName = m[1];
        const qualOpenInBefore = before.lastIndexOf(`"${qualName}"`);
        if (qualOpenInBefore >= 0) {
          const qualStart = startCol + qualOpenInBefore + 1;
          qualifierRange = {
            startLine,
            startCol: qualStart,
            endLine: startLine,
            endCol: qualStart + qualName.length,
          };
        }
      }
    }
    return { nameRange, qualifierRange };
  }
  // Fallback: find all quoted spans and pick the LAST as the name.
  const spans: { start: number; end: number }[] = [];
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] !== '"') continue;
    const close = segment.indexOf('"', i + 1);
    if (close < 0) break;
    spans.push({ start: i + 1, end: close });
    i = close;
  }
  if (spans.length === 0) return null;
  const nameSpan = spans[spans.length - 1];
  const nameRange: ZeroBasedRange = {
    startLine,
    startCol: startCol + nameSpan.start,
    endLine: startLine,
    endCol: startCol + nameSpan.end,
  };
  let qualifierRange: ZeroBasedRange | null = null;
  if (qualified && spans.length >= 2) {
    const qualSpan = spans[spans.length - 2];
    qualifierRange = {
      startLine,
      startCol: startCol + qualSpan.start,
      endLine: startLine,
      endCol: startCol + qualSpan.end,
    };
  }
  return { nameRange, qualifierRange };
}

/**
 * Find the range of a quoted name token on a header line — e.g. the
 * `BMI` inside `concept "BMI":`. Used for goto / rename name targeting.
 */
function findNameRangeInHeader(source: string, headerLine: number, name: string): ZeroBasedRange | null {
  const lines = source.split(/\r?\n/);
  if (headerLine < 0 || headerLine >= lines.length) return null;
  const line = lines[headerLine];
  const needle = `"${name}"`;
  const idx = line.indexOf(needle);
  if (idx < 0) return null;
  return {
    startLine: headerLine,
    startCol: idx + 1, // skip opening quote
    endLine: headerLine,
    endCol: idx + 1 + name.length,
  };
}

function collapseToHeader(headerLine: number): ZeroBasedRange {
  return { startLine: headerLine, startCol: 0, endLine: headerLine, endCol: 0 };
}

function locToRange(loc: { start: { line: number; column: number }; end: { line: number; column: number } }): ZeroBasedRange {
  return {
    startLine: Math.max(0, loc.start.line - 1),
    startCol: Math.max(0, loc.start.column),
    endLine: Math.max(0, loc.end.line - 1),
    endCol: Math.max(0, loc.end.column),
  };
}

function describeConceptBody(def: unknown): string | undefined {
  if (!def || typeof def !== "object") return undefined;
  const d = def as { type?: string };
  switch (d.type) {
    case "CodedFromDefinition":
      return "coded from ...";
    case "DefinedAsDefinition":
      return "defined as ...";
    case "DefinitionIsDefinition":
      return "definition is ...";
    default:
      return undefined;
  }
}

function sourceFor(filePath: string, overlays: ReadonlyMap<string, string>): string {
  const ov = overlays.get(canonicalize(filePath));
  if (ov !== undefined) return ov;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Drive-letter-canonical absolute path. Must be used at every boundary
 * where `document.uri.fsPath` (lowercase drive on Windows) is compared
 * against an `IndexedDeclaration.filePath` (uppercase drive — set by
 * the package's `canonicalizeFsPath`). Without this, every "is this
 * decl in the current file?" filter strips its entire input on
 * Windows.
 */
export function canonicalize(absPath: string): string {
  const resolved = path.resolve(absPath);
  if (process.platform === "win32" && /^[a-z]:/.test(resolved)) {
    return resolved.charAt(0).toUpperCase() + resolved.slice(1);
  }
  return resolved;
}
