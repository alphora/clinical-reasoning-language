import * as vscode from "vscode";
import {
  buildSnippetBody,
  isDefinitionIsBody,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  type Pattern,
} from "./catalog";
import { scanDeclarations, type Declaration } from "./concepts";

// Document selector: match `.crl` files. The repo's setup associates `.crl`
// with the `markdown` language ID, so we select on language + scheme + a
// glob pattern matching files ending in `.crl`. This avoids polluting plain
// markdown files with CRL completions.
export const CRL_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: "markdown", scheme: "file", pattern: "**/*.crl" },
];

function isInDefinitionIsBody(document: vscode.TextDocument, position: vscode.Position): boolean {
  const line = document.lineAt(position.line).text;
  return isDefinitionIsBody(line.slice(0, position.character));
}

function buildNarrativeItem(pattern: Pattern): vscode.CompletionItem {
  const item = new vscode.CompletionItem(pattern.narrative, vscode.CompletionItemKind.Snippet);
  item.insertText = new vscode.SnippetString(buildSnippetBody(pattern.narrative));
  item.detail = pattern.signature;
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${pattern.canonical}** — *${pattern.category || "pattern"}*\n\n`);
  md.appendMarkdown(`Narrative: \`${pattern.narrative}\`\n\n`);
  md.appendMarkdown(`Signature: \`${pattern.signature}\`\n\n`);
  md.appendMarkdown(`CQL: \`${pattern.cqlFunction}\``);
  item.documentation = md;
  const leadWordMatch = /^([A-Za-z][A-Za-z\- ]*?)(?:\s+<|$)/.exec(pattern.narrative);
  item.sortText = (leadWordMatch?.[1] ?? pattern.canonical).toLowerCase();
  return item;
}

/**
 * Narrative-pattern completion inside `- definition is ` bodies. See
 * NarrativeCompletionProvider in the README.
 */
export class NarrativeCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly patterns: Pattern[]) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    if (!isInDefinitionIsBody(document, position)) return [];
    return this.patterns.map(buildNarrativeItem);
  }
}

/**
 * Completion for `- type is <X>.` lines. Fires after `- type is ` and
 * suggests every FHIR resource type CRL recognizes. The enum is sourced from
 * `CONCEPT_TYPES` in catalog.ts which mirrors the grammar's lexer rule.
 */
export class TypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!/^\s*-\s*type\s+is\s+\S*$/i.test(prefix)) return [];
    return CONCEPT_TYPES.map((t) => {
      const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.TypeParameter);
      item.detail = `FHIR resource type — \`type is ${t}.\``;
      return item;
    });
  }
}

/**
 * Completion for `- valuetype is <X>.` lines. Fires after `- valuetype is `
 * and suggests every FHIR primitive / structured type CRL recognizes.
 */
export class ValuetypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!/^\s*-\s*valuetype\s+is\s+\S*$/i.test(prefix)) return [];
    return CONCEPT_VALUETYPES.map((vt) => {
      const item = new vscode.CompletionItem(vt, vscode.CompletionItemKind.TypeParameter);
      item.detail = `FHIR value type — \`valuetype is ${vt}.\``;
      return item;
    });
  }
}

/**
 * Completion for quoted concept references. Fires when the user is inside a
 * quoted string at most positions in a CRL document; suggests every concept
 * and terminology declared in the file (in source order).
 *
 * Suppressed when the cursor is on a header line (`concept "X":` — the user
 * is naming a NEW declaration, not referencing an existing one).
 */
export class ConceptRefCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character);
    if (!isInsideOpenQuote(prefix)) return [];
    // Suppress on declaration headers (`concept "X":` / `terminology "X":`).
    if (/^\s*(concept|terminology)\s+"[^"]*$/.test(prefix)) return [];

    const decls = scanDeclarations(document.getText());
    return decls.map((d) => buildConceptRefItem(d));
  }
}

/**
 * Heuristic: return true if the cursor is inside an open double-quoted string
 * on this line. Counts unescaped `"` to the left of the cursor; odd count
 * means we're inside a quote.
 */
function isInsideOpenQuote(prefix: string): boolean {
  let count = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === "\\" && prefix[i + 1] === '"') {
      i++;
      continue;
    }
    if (prefix[i] === '"') count++;
  }
  return count % 2 === 1;
}

function buildConceptRefItem(decl: Declaration): vscode.CompletionItem {
  const kindLabel = decl.kind === "terminology" ? "Reference" : "Variable";
  const item = new vscode.CompletionItem(
    decl.name,
    decl.kind === "terminology" ? vscode.CompletionItemKind.Reference : vscode.CompletionItemKind.Variable
  );
  item.detail = formatDeclarationDetail(decl);
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${decl.name}** — ${kindLabel.toLowerCase()}\n\n`);
  if (decl.type) md.appendMarkdown(`Type: \`${decl.type}\`\n\n`);
  if (decl.valuetype) md.appendMarkdown(`Valuetype: \`${decl.valuetype}\`\n\n`);
  if (decl.bodyPreview) md.appendMarkdown(`Body: \`${decl.bodyPreview}\``);
  item.documentation = md;
  return item;
}

function formatDeclarationDetail(decl: Declaration): string {
  if (decl.kind === "terminology") return "terminology";
  const parts: string[] = ["concept"];
  if (decl.type) parts.push(decl.type);
  if (decl.valuetype) parts.push(`+ ${decl.valuetype}`);
  return parts.join(" ");
}
