import * as vscode from "vscode";
import { buildSnippetBody, isLogicIsBody, type Pattern } from "./catalog";

/**
 * Completion provider for CRL narrative-pattern templates inside `logic is`
 * bodies (and, secondarily, anywhere a narrative phrase could be authored).
 *
 * Behavior:
 *   - Activates inside a `logic is` line (cursor is after `- logic is `,
 *     with or without intervening text).
 *   - Suggests each catalog pattern's narrative form as a snippet, with
 *     `<placeholder>` slots converted to tab-stops the author can fill in.
 *   - Each suggestion shows the canonical signature in the detail field and
 *     the CQL function reference in the documentation field.
 *
 * Catalog patterns are loaded at activation; if more patterns are added to
 * the catalog the extension must be rebuilt + reloaded to pick them up.
 */

function isInLogicIsBody(document: vscode.TextDocument, position: vscode.Position): boolean {
  const line = document.lineAt(position.line).text;
  return isLogicIsBody(line.slice(0, position.character));
}

function buildCompletionItem(pattern: Pattern): vscode.CompletionItem {
  const item = new vscode.CompletionItem(pattern.narrative, vscode.CompletionItemKind.Snippet);
  item.insertText = new vscode.SnippetString(buildSnippetBody(pattern.narrative));
  item.detail = pattern.signature;
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${pattern.canonical}** — *${pattern.category || "pattern"}*\n\n`);
  md.appendMarkdown(`Narrative: \`${pattern.narrative}\`\n\n`);
  md.appendMarkdown(`Signature: \`${pattern.signature}\`\n\n`);
  md.appendMarkdown(`CQL: \`${pattern.cqlFunction}\``);
  item.documentation = md;
  // Sort by the leading literal word of the narrative when no placeholder
  // leads, so `during` / `performed` / `has` cluster naturally. Sort by
  // canonical name otherwise.
  const leadWordMatch = /^([A-Za-z][A-Za-z\- ]*?)(?:\s+<|$)/.exec(pattern.narrative);
  item.sortText = (leadWordMatch?.[1] ?? pattern.canonical).toLowerCase();
  return item;
}

export class NarrativeCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly patterns: Pattern[]) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!isInLogicIsBody(document, position)) return [];
    return this.patterns.map(buildCompletionItem);
  }
}

// Document selector: match `.crl` files. The repo's setup associates `.crl`
// with the `markdown` language ID, so we select on language + scheme + a
// glob pattern matching files ending in `.crl`. This avoids polluting plain
// markdown files with CRL completions.
export const CRL_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "markdown", scheme: "file", pattern: "**/*.crl" },
];
