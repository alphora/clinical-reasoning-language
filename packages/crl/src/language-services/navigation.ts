// Headless navigation logic (#132 step 3c). VS-Code-free: each compute* function takes a
// filePath (+ position / source / workspaceRoots / newName) and a ProjectIndex, and returns
// Ls* DTOs — the extension's navigation providers convert via toVscode. Logic ported verbatim
// from the providers; only result construction changed (vscode types → Ls*). filePath is
// canonicalized internally (idempotent) so callers can pass a raw fsPath.
import type {
  LsLocation,
  LsDocumentSymbol,
  LsWorkspaceSymbol,
  LsDocumentLink,
  LsTextEdit,
  LsPrepareRenameResult,
  LsSymbolKind,
  LsPosition,
} from "./contracts";
import { findDeclarationAtPosition } from "./findDeclaration";
import { canonicalize } from "./paths";
import type { IndexedDeclaration, IndexedLibrary, ProjectIndex } from "./projectIndex";

function declToLocation(d: IndexedDeclaration): LsLocation {
  return { filePath: d.filePath, range: d.nameRange };
}

function libToLocation(l: IndexedLibrary): LsLocation {
  return { filePath: l.filePath, range: l.nameRange };
}

function symbolKindFor(kind: IndexedDeclaration["kind"]): LsSymbolKind {
  switch (kind) {
    case "concept":
      return "variable";
    case "terminology":
      return "constant";
    case "decision":
      return "function";
    case "activity":
      return "class";
    case "parameter":
      return "property";
  }
}

function declToSymbol(d: IndexedDeclaration): LsDocumentSymbol {
  return {
    name: d.name,
    detail: d.kind,
    kind: symbolKindFor(d.kind),
    range: d.bodyRange,
    selectionRange: d.nameRange,
  };
}

/** Go-to-definition: declaration self, library, resolved reference name, or qualifier. */
export function computeDefinition(
  filePath: string,
  position: LsPosition,
  index: ProjectIndex,
): LsLocation | null {
  filePath = canonicalize(filePath);
  const res = findDeclarationAtPosition(filePath, position, index);
  if (!res) return null;

  switch (res.kind) {
    case "declaration":
      return declToLocation(res.decl);
    case "library":
      return libToLocation(res.lib);
    case "reference-name": {
      const decl = index.findDeclarationByLibAndName(
        filePath,
        res.ref.targetLibrary,
        res.ref.targetName,
        res.ref.targetKind,
      );
      return decl ? declToLocation(decl) : null;
    }
    case "reference-qualifier": {
      const libs = index.getLibraries(filePath);
      const target = libs.find((l) => l.libraryName === res.ref.targetLibrary);
      return target ? libToLocation(target) : null;
    }
  }
}

/** Find-all-references for the symbol under the cursor (declaration optionally first). */
export function computeReferences(
  filePath: string,
  position: LsPosition,
  includeDeclaration: boolean,
  index: ProjectIndex,
): LsLocation[] {
  filePath = canonicalize(filePath);
  const res = findDeclarationAtPosition(filePath, position, index);
  if (!res) return [];

  let targetLib: string;
  let targetName: string;
  let targetKind: IndexedDeclaration["kind"];
  let declLocation: LsLocation | null = null;
  if (res.kind === "declaration") {
    targetLib = res.decl.libraryName;
    targetName = res.decl.name;
    targetKind = res.decl.kind;
    declLocation = declToLocation(res.decl);
  } else if (res.kind === "reference-name" || res.kind === "reference-qualifier") {
    targetLib = res.ref.targetLibrary;
    targetName = res.ref.targetName;
    targetKind = res.ref.targetKind;
    const decl = index.findDeclarationByLibAndName(filePath, targetLib, targetName, res.ref.targetKind);
    if (decl) declLocation = declToLocation(decl);
  } else {
    return [];
  }

  const refs = index.findRefsTo(filePath, targetLib, targetName, targetKind);
  const out: LsLocation[] = refs.map((r) => ({ filePath: r.filePath, range: r.nameRange }));
  if (includeDeclaration && declLocation) out.unshift(declLocation);
  return out;
}

/** Outline: library Namespace parents with declaration children; orphan decls flat. */
export function computeDocumentSymbols(filePath: string, index: ProjectIndex): LsDocumentSymbol[] {
  filePath = canonicalize(filePath);
  const decls = index.getDeclarations(filePath).filter((d) => d.filePath === filePath);
  const libs = index.getLibraries(filePath).filter((l) => l.filePath === filePath);

  const declsByLib = new Map<string, IndexedDeclaration[]>();
  for (const d of decls) {
    let arr = declsByLib.get(d.libraryName);
    if (!arr) {
      arr = [];
      declsByLib.set(d.libraryName, arr);
    }
    arr.push(d);
  }

  const out: LsDocumentSymbol[] = [];
  for (const lib of libs) {
    const children = declsByLib.get(lib.libraryName) ?? [];
    declsByLib.delete(lib.libraryName);
    out.push({
      name: lib.libraryName,
      detail: `library (${children.length})`,
      kind: "namespace",
      range: lib.range,
      selectionRange: lib.nameRange,
      children: children.map(declToSymbol),
    });
  }
  // Orphan decls (no matching library entry) surface flat so they're not dropped.
  for (const orphans of declsByLib.values()) {
    for (const d of orphans) out.push(declToSymbol(d));
  }
  return out;
}

/** Workspace symbol search. workspaceRoots is injected (no vscode.workspace read in core). */
export function computeWorkspaceSymbols(
  query: string,
  workspaceRoots: string[],
  index: ProjectIndex,
): LsWorkspaceSymbol[] {
  if (workspaceRoots.length === 0) return [];
  const decls = index.getAllProjectDeclarations(workspaceRoots);
  const q = query.toLowerCase();
  const filtered = q ? decls.filter((d) => d.name.toLowerCase().includes(q)) : decls;
  return filtered.map((d) => ({
    name: d.name,
    kind: symbolKindFor(d.kind),
    containerName: d.libraryName,
    location: { filePath: d.filePath, range: d.nameRange },
  }));
}

/** Rename probe. Returns the target range + placeholder, or THROWS for unsupported/no-symbol. */
export function computePrepareRename(
  filePath: string,
  position: LsPosition,
  index: ProjectIndex,
): LsPrepareRenameResult {
  filePath = canonicalize(filePath);
  const res = findDeclarationAtPosition(filePath, position, index);
  if (!res) throw new Error("No symbol at cursor to rename.");
  if (res.kind === "library") {
    throw new Error("Library rename is not supported in v2.1.0 (defers to v2.2).");
  }
  if (res.kind === "reference-qualifier") {
    throw new Error(
      "Cannot rename the library qualifier — rename the library declaration instead (unsupported in v2.1.0).",
    );
  }
  if (res.kind === "declaration") {
    return { range: res.decl.nameRange, placeholder: res.decl.name };
  }
  // reference-name: allow rename — affects the declaration + all refs.
  return { range: res.ref.nameRange, placeholder: res.ref.targetName };
}

/**
 * Rename edits. Returns null for a no-op / no symbol / unsupported-kind target; THROWS for an
 * invalid name or a collision; otherwise the declaration edit FIRST then every ref-site edit
 * in findRefsTo order.
 */
export function computeRename(
  filePath: string,
  position: LsPosition,
  newName: string,
  index: ProjectIndex,
): LsTextEdit[] | null {
  filePath = canonicalize(filePath);
  const res = findDeclarationAtPosition(filePath, position, index);
  if (!res) return null;

  let targetLib: string;
  let targetName: string;
  let targetKind: IndexedDeclaration["kind"];
  if (res.kind === "declaration") {
    targetLib = res.decl.libraryName;
    targetName = res.decl.name;
    targetKind = res.decl.kind;
  } else if (res.kind === "reference-name") {
    targetLib = res.ref.targetLibrary;
    targetName = res.ref.targetName;
    targetKind = res.ref.targetKind;
  } else {
    return null;
  }

  if (newName === targetName) return null;
  if (!/^[^"]+$/.test(newName)) {
    throw new Error(`Invalid name: must not contain double quotes.`);
  }

  // Collision check: CRL uniqueness is per-(library, kind) per NameUniquenessValidator.
  const allDecls = index.getDeclarations(filePath);
  const collision = allDecls.find(
    (d) => d.libraryName === targetLib && d.name === newName && d.kind === targetKind,
  );
  if (collision) {
    throw new Error(`Name "${newName}" already exists as a ${collision.kind} in library "${targetLib}".`);
  }

  const edits: LsTextEdit[] = [];
  const decl = index.findDeclarationByLibAndName(filePath, targetLib, targetName, targetKind);
  if (decl) edits.push({ filePath: decl.filePath, range: decl.nameRange, newText: newName });
  for (const ref of index.findRefsTo(filePath, targetLib, targetName, targetKind)) {
    edits.push({ filePath: ref.filePath, range: ref.nameRange, newText: newName });
  }
  return edits;
}

/** Include "Lib" → that library's file. `source` is injected for the include-name line lookup. */
export function computeDocumentLinks(
  filePath: string,
  source: string,
  index: ProjectIndex,
): LsDocumentLink[] {
  filePath = canonicalize(filePath);
  const graph = index.getGraph(filePath);
  if (!graph) return [];

  const entry = [...graph.resolvedLibraries, ...graph.localLibraries].find((e) => e.filePath === filePath);
  if (!entry) return [];

  const libraries = index.getLibraries(filePath);
  const byName = new Map<string, IndexedLibrary>();
  for (const l of libraries) byName.set(l.libraryName, l);

  // Reproduce document.lineAt(line).text — EOL-stripped, "" for out-of-range.
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));

  const out: LsDocumentLink[] = [];
  for (const inc of entry.ast.includes) {
    const target = byName.get(inc.name);
    if (!target) continue;
    const incLine = Math.max(0, (inc.location?.start.line ?? 1) - 1);
    const lineText = lines[incLine] ?? "";
    const needle = `"${inc.name}"`;
    const idx = lineText.indexOf(needle);
    if (idx < 0) continue;
    out.push({
      range: { startLine: incLine, startCol: idx, endLine: incLine, endCol: idx + needle.length },
      target: target.filePath,
      tooltip: `Open library "${target.libraryName}"`,
    });
  }
  return out;
}
