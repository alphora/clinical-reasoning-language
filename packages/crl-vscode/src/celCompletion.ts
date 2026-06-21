// CEL completion adapter (#4 slice 1). Thin wrapper over the headless `computeCelCompletion`: parse the
// buffer (buildCEL) → the file-local-fact + covered-library context, then dispatch on the line prefix +
// the cached CRL ProjectIndex. Registered on the `crl-cel` selector (triggers `"` for quote slots and
// `.` for qualified `defined by "Lib"."…"`). Mirrors the CRL completion adapters.
import * as vscode from "vscode";
import {
  computeCelCompletion,
  celDocContextFromSource,
  CONCEPT_TYPES,
  type ProjectIndex,
} from "@smile-digital-health/crl/language-services";
import { celSymbolSource } from "./celSymbolSource";
import { toVscodeCompletionItem } from "./toVscode";

export const CEL_DOCUMENT_SELECTOR: vscode.DocumentSelector = [{ language: "crl-cel", scheme: "file" }];

export class CelCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    // TOLERANT source-regex context, NOT buildCEL: when the user has just typed the trigger quote the
    // buffer is mid-edit (unterminated string) and buildCEL would fail, dropping facts/coveredLib exactly
    // when completion fires. celDocContextFromSource regex-scans `fact "X":` + `covers "X"` regardless.
    const doc = celDocContextFromSource(document.getText());
    const symbols = celSymbolSource(document, this.index); // CRL symbols via the .cel's covered closure
    return computeCelCompletion(linePrefix, doc, symbols, [], [...CONCEPT_TYPES]).map(toVscodeCompletionItem);
  }
}
