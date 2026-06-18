import * as vscode from "vscode";

import { findDeclarationAtPosition } from "./findDeclaration";
import {
  canonicalize,
  type IndexedDeclaration,
  type IndexedLibrary,
  type ProjectIndex,
  type ZeroBasedRange,
} from "./projectIndex";

/**
 * v2.1.0 Chunk C — LSP navigation providers, all backed by the
 * AST-driven ProjectIndex.
 *
 * Six providers in this module:
 *   - DefinitionProvider     (F12 / Ctrl+Click)
 *   - ReferenceProvider      (Shift+F12)
 *   - DocumentSymbolProvider (outline view)
 *   - WorkspaceSymbolProvider (Ctrl+T)
 *   - RenameProvider         (F2 — declarations only; library rename
 *                             deferred to v2.2)
 *   - DocumentLinkProvider   (include "Lib" → that library's file)
 */

function toRange(r: ZeroBasedRange): vscode.Range {
  return new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol);
}

function declToLocation(d: IndexedDeclaration): vscode.Location {
  return new vscode.Location(vscode.Uri.file(d.filePath), toRange(d.nameRange));
}

function libToLocation(l: IndexedLibrary): vscode.Location {
  return new vscode.Location(vscode.Uri.file(l.filePath), toRange(l.nameRange));
}

function symbolKindFor(kind: IndexedDeclaration["kind"]): vscode.SymbolKind {
  switch (kind) {
    case "concept": return vscode.SymbolKind.Variable;
    case "terminology": return vscode.SymbolKind.Constant;
    case "decision": return vscode.SymbolKind.Function;
    case "activity": return vscode.SymbolKind.Class;
    case "parameter": return vscode.SymbolKind.Property;
  }
}

// ============================================================================
// DefinitionProvider
// ============================================================================

export class CrlDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    const filePath = canonicalize(document.uri.fsPath);
    const res = findDeclarationAtPosition(
      filePath,
      { line: position.line, character: position.character },
      this.index,
    );
    if (!res) return null;

    switch (res.kind) {
      case "declaration":
        // Already on the declaration — return its own location (lets
        // F12 act as a peek-at-self).
        return declToLocation(res.decl);
      case "library":
        return libToLocation(res.lib);
      case "reference-name": {
        const decl = this.index.findDeclarationByLibAndName(
          filePath,
          res.ref.targetLibrary,
          res.ref.targetName,
          res.ref.targetKind,
        );
        return decl ? declToLocation(decl) : null;
      }
      case "reference-qualifier": {
        // Cursor on `"Lib"` segment of `"Lib"."X"` → jump to the
        // library's declaration in its source file.
        const libs = this.index.getLibraries(filePath);
        const target = libs.find((l) => l.libraryName === res.ref.targetLibrary);
        return target ? libToLocation(target) : null;
      }
    }
  }
}

// ============================================================================
// ReferenceProvider
// ============================================================================

export class CrlReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.ProviderResult<vscode.Location[]> {
    const filePath = canonicalize(document.uri.fsPath);
    const res = findDeclarationAtPosition(
      filePath,
      { line: position.line, character: position.character },
      this.index,
    );
    if (!res) return [];

    let targetLib: string;
    let targetName: string;
    let targetKind: IndexedDeclaration["kind"];
    let declLocation: vscode.Location | null = null;
    if (res.kind === "declaration") {
      targetLib = res.decl.libraryName;
      targetName = res.decl.name;
      targetKind = res.decl.kind;
      declLocation = declToLocation(res.decl);
    } else if (res.kind === "reference-name" || res.kind === "reference-qualifier") {
      targetLib = res.ref.targetLibrary;
      targetName = res.ref.targetName;
      targetKind = res.ref.targetKind;
      const decl = this.index.findDeclarationByLibAndName(filePath, targetLib, targetName, res.ref.targetKind);
      if (decl) declLocation = declToLocation(decl);
    } else {
      return [];
    }

    const refs = this.index.findRefsTo(filePath, targetLib, targetName, targetKind);
    const out: vscode.Location[] = refs.map(
      (r) => new vscode.Location(vscode.Uri.file(r.filePath), toRange(r.nameRange)),
    );
    if (context.includeDeclaration && declLocation) {
      out.unshift(declLocation);
    }
    return out;
  }
}

// ============================================================================
// DocumentSymbolProvider
// ============================================================================

export class CrlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const filePath = canonicalize(document.uri.fsPath);
    const decls = this.index.getDeclarations(filePath).filter((d) => d.filePath === filePath);
    const libs = this.index.getLibraries(filePath).filter((l) => l.filePath === filePath);

    const declsByLib = new Map<string, IndexedDeclaration[]>();
    for (const d of decls) {
      let arr = declsByLib.get(d.libraryName);
      if (!arr) {
        arr = [];
        declsByLib.set(d.libraryName, arr);
      }
      arr.push(d);
    }

    const out: vscode.DocumentSymbol[] = [];
    for (const lib of libs) {
      const children = declsByLib.get(lib.libraryName) ?? [];
      declsByLib.delete(lib.libraryName);
      const parent = new vscode.DocumentSymbol(
        lib.libraryName,
        `library (${children.length})`,
        vscode.SymbolKind.Namespace,
        toRange(lib.range),
        toRange(lib.nameRange),
      );
      parent.children = children.map(declToSymbol);
      out.push(parent);
    }
    // Orphan decls (no matching library entry) surface flat so they're not dropped.
    for (const orphans of declsByLib.values()) {
      for (const d of orphans) out.push(declToSymbol(d));
    }
    return out;
  }
}

function declToSymbol(d: IndexedDeclaration): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    d.name,
    d.kind,
    symbolKindFor(d.kind),
    toRange(d.bodyRange),
    toRange(d.nameRange),
  );
}

// ============================================================================
// WorkspaceSymbolProvider
// ============================================================================

export class CrlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideWorkspaceSymbols(
    query: string,
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    if (folders.length === 0) return [];
    const decls = this.index.getAllProjectDeclarations(folders);
    const q = query.toLowerCase();
    const filtered = q
      ? decls.filter((d) => d.name.toLowerCase().includes(q))
      : decls;
    return filtered.map(
      (d) =>
        new vscode.SymbolInformation(
          d.name,
          symbolKindFor(d.kind),
          d.libraryName,
          new vscode.Location(vscode.Uri.file(d.filePath), toRange(d.nameRange)),
        ),
    );
  }
}

// ============================================================================
// RenameProvider (declarations only — library rename deferred to v2.2)
// ============================================================================

export class CrlRenameProvider implements vscode.RenameProvider {
  constructor(private readonly index: ProjectIndex) {}

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    const filePath = canonicalize(document.uri.fsPath);
    const res = findDeclarationAtPosition(
      filePath,
      { line: position.line, character: position.character },
      this.index,
    );
    if (!res) return Promise.reject(new Error("No symbol at cursor to rename."));
    if (res.kind === "library") {
      return Promise.reject(new Error("Library rename is not supported in v2.1.0 (defers to v2.2)."));
    }
    if (res.kind === "reference-qualifier") {
      return Promise.reject(new Error("Cannot rename the library qualifier — rename the library declaration instead (unsupported in v2.1.0)."));
    }
    if (res.kind === "declaration") {
      return { range: toRange(res.decl.nameRange), placeholder: res.decl.name };
    }
    // reference-name: allow rename — affects the declaration + all refs.
    return { range: toRange(res.ref.nameRange), placeholder: res.ref.targetName };
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    const filePath = canonicalize(document.uri.fsPath);
    const res = findDeclarationAtPosition(
      filePath,
      { line: position.line, character: position.character },
      this.index,
    );
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
      return Promise.reject(new Error(`Invalid name: must not contain double quotes.`));
    }

    // Collision check: CRL uniqueness is per-(library, kind) per
    // NameUniquenessValidator semantics. Same name across kinds in the
    // same library is legal (`concept "X"` + `terminology "X"` coexist).
    const allDecls = this.index.getDeclarations(filePath);
    const collision = allDecls.find(
      (d) => d.libraryName === targetLib && d.name === newName && d.kind === targetKind,
    );
    if (collision) {
      return Promise.reject(
        new Error(`Name "${newName}" already exists as a ${collision.kind} in library "${targetLib}".`),
      );
    }

    const edit = new vscode.WorkspaceEdit();

    // Replace the declaration's name token.
    const decl = this.index.findDeclarationByLibAndName(filePath, targetLib, targetName, targetKind);
    if (decl) {
      edit.replace(vscode.Uri.file(decl.filePath), toRange(decl.nameRange), newName);
    }

    // Replace every reference site's name token. The keying-by-kind in
    // findRefsTo means the post-filter for targetKind is no longer
    // needed — refs only return entries matching the requested kind.
    for (const ref of this.index.findRefsTo(filePath, targetLib, targetName, targetKind)) {
      edit.replace(vscode.Uri.file(ref.filePath), toRange(ref.nameRange), newName);
    }

    return edit;
  }
}

// ============================================================================
// DocumentLinkProvider
// ============================================================================

export class CrlDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDocumentLinks(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const filePath = canonicalize(document.uri.fsPath);
    const graph = this.index.getGraph(filePath);
    if (!graph) return [];

    // Find this file's entry in the graph.
    const entry = [...graph.resolvedLibraries, ...graph.localLibraries].find(
      (e) => e.filePath === filePath,
    );
    if (!entry) return [];

    const libraries = this.index.getLibraries(filePath);
    const byName = new Map<string, IndexedLibrary>();
    for (const l of libraries) byName.set(l.libraryName, l);

    const out: vscode.DocumentLink[] = [];
    for (const inc of entry.ast.includes) {
      const target = byName.get(inc.name);
      if (!target) continue;
      // Use the include name's location range. Include.location covers the
      // whole statement; we narrow to the quoted name on the same line.
      const incLine = Math.max(0, (inc.location?.start.line ?? 1) - 1);
      const lineText = document.lineAt(incLine).text;
      const needle = `"${inc.name}"`;
      const idx = lineText.indexOf(needle);
      if (idx < 0) continue;
      const range = new vscode.Range(incLine, idx, incLine, idx + needle.length);
      const link = new vscode.DocumentLink(range, vscode.Uri.file(target.filePath));
      link.tooltip = `Open library "${target.libraryName}"`;
      out.push(link);
    }
    return out;
  }
}
