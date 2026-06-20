// CEL navigation adapters (#4 slice 3): go-to-definition + file-local references on the `crl-cel` selector.
import * as vscode from "vscode";
import { buildCEL } from "@smile-digital-health/crl";
import {
  computeCelDefinition,
  computeCelReferences,
  celNavContext,
  celDocContextFromSource,
  type CelNavContext,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import { toVscodeLocation } from "./toVscode";

export class CelDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | null {
    const text = document.getText();
    // coveredLib tolerant (survives a mid-edit error elsewhere); fact decl ranges best-effort from a parse.
    const tol = celDocContextFromSource(text);
    const built = buildCEL(text);
    const factDecls = built.success && built.result ? celNavContext(built.result).factDecls : [];
    const ctx: CelNavContext = { coveredLib: tol.coveredLib, factDecls };
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const loc = computeCelDefinition(
      document.lineAt(position.line).text,
      { line: position.line, character: position.character },
      document.uri.fsPath,
      ctx,
      this.index,
      folders,
    );
    return loc ? toVscodeLocation(loc) : null;
  }
}

export class CelReferenceProvider implements vscode.ReferenceProvider {
  public provideReferences(document: vscode.TextDocument, position: vscode.Position): vscode.Location[] {
    return computeCelReferences(
      document.lineAt(position.line).text,
      { line: position.line, character: position.character },
      document.getText(),
      document.uri.fsPath,
    ).map(toVscodeLocation);
  }
}
