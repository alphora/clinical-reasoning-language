// Thin vscode adapters over the headless navigation logic (#132 step 3c). All resolution +
// result-shaping lives in @smile-digital-health/crl/language-services (computeDefinition /
// computeReferences / computeDocumentSymbols / computeWorkspaceSymbols / computePrepareRename /
// computeRename / computeDocumentLinks); these classes feed in the document's fsPath (+ position
// / source / workspace roots / newName) and convert the Ls* results via toVscode. The core fns
// canonicalize fsPath internally, so the adapters pass it raw.
//
// Six providers: Definition (F12), References (Shift+F12), DocumentSymbol (outline),
// WorkspaceSymbol (Ctrl+T), Rename (F2 — declarations + references; library rename deferred),
// DocumentLink (include "Lib" → that library's file).
import * as vscode from "vscode";
import {
  computeDefinition,
  computeReferences,
  computeDocumentSymbols,
  computeWorkspaceSymbols,
  computePrepareRename,
  computeRename,
  computeDocumentLinks,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import {
  toVscodeRange,
  toVscodeLocation,
  toVscodeDocumentSymbol,
  toVscodeSymbolInformation,
  toVscodeDocumentLink,
  toWorkspaceEdit,
} from "./toVscode";

export class CrlDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    const loc = computeDefinition(document.uri.fsPath, position, this.index);
    return loc ? toVscodeLocation(loc) : null;
  }
}

export class CrlReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.ProviderResult<vscode.Location[]> {
    return computeReferences(document.uri.fsPath, position, context.includeDeclaration, this.index).map(
      toVscodeLocation,
    );
  }
}

export class CrlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    return computeDocumentSymbols(document.uri.fsPath, this.index).map(toVscodeDocumentSymbol);
  }
}

export class CrlWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideWorkspaceSymbols(query: string): vscode.ProviderResult<vscode.SymbolInformation[]> {
    const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    return computeWorkspaceSymbols(query, roots, this.index).map(toVscodeSymbolInformation);
  }
}

export class CrlRenameProvider implements vscode.RenameProvider {
  constructor(private readonly index: ProjectIndex) {}

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    try {
      const res = computePrepareRename(document.uri.fsPath, position, this.index);
      return { range: toVscodeRange(res.range), placeholder: res.placeholder };
    } catch (e) {
      return Promise.reject(e);
    }
  }

  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    try {
      const edits = computeRename(document.uri.fsPath, position, newName, this.index);
      return edits ? toWorkspaceEdit(edits) : null;
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

export class CrlDocumentLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly index: ProjectIndex) {}

  provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
    return computeDocumentLinks(document.uri.fsPath, document.getText(), this.index).map(toVscodeDocumentLink);
  }
}
