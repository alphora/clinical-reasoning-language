// Thin vscode adapters over the headless completion logic (#132 step 3b). All slot-
// detection, filtering, and item-building lives in @smile-digital-health/crl/language-services
// (computeNarrativeCompletion / computeTypeCompletion / computeValuetypeCompletion /
// computeParamTypeCompletion / computeConceptRefCompletion); these classes feed in the line
// prefix (+ source/position/index) and convert each LsCompletionItem via toVscodeCompletionItem.
import * as vscode from "vscode";
import {
  computeNarrativeCompletion,
  computeTypeCompletion,
  computeValuetypeCompletion,
  computeParamTypeCompletion,
  computeConceptRefCompletion,
  type Pattern,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import { toVscodeCompletionItem } from "./toVscode";

// Document selector: match `.crl` files. The repo's setup associates `.crl`
// with the `markdown` language ID, so we select on language + scheme. This
// avoids polluting plain markdown files with CRL completions.
export const CRL_DOCUMENT_SELECTOR: vscode.DocumentSelector = [{ language: "crl", scheme: "file" }];

/** Narrative-pattern completion inside `- definition is ` bodies. */
export class NarrativeCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly patterns: Pattern[]) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    return computeNarrativeCompletion(prefix, this.patterns).map(toVscodeCompletionItem);
  }
}

/** Completion for `- type is <X>.` lines. */
export class TypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    return computeTypeCompletion(prefix).map(toVscodeCompletionItem);
  }
}

/** Completion for `- value type is <X>.` lines. */
export class ValuetypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    return computeValuetypeCompletion(prefix).map(toVscodeCompletionItem);
  }
}

/** Completion for `- param type is <X>.` lines (issue #59). */
export class ParamTypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    return computeParamTypeCompletion(prefix).map(toVscodeCompletionItem);
  }
}

/** Completion for quoted concept/terminology/decision/activity/parameter references. */
export class ConceptRefCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    return computeConceptRefCompletion(
      document.getText(),
      document.uri.fsPath,
      document.lineAt(position.line).text,
      position,
      this.index,
    ).map(toVscodeCompletionItem);
  }
}
