import * as vscode from "vscode";
import {
  buildSnippetBody,
  isDefinitionIsBody,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  type Pattern,
} from "./catalog";
import { scanDeclarations, type Declaration } from "./concepts";
import {
  detectExpectedKind,
  detectQualifiedRefQualifier,
  isInsideOpenQuote,
  type ExpectedRefKind,
} from "./contextDetect";
import type { ProjectIndex } from "./projectIndex";

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
 * Narrative-pattern completion inside `- definition is ` bodies.
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
 * Completion for `- type is <X>.` lines.
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
 * Completion for `- value type is <X>.` lines.
 */
export class ValuetypeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!/^\s*-\s*value type\s+is\s+\S*$/i.test(prefix)) return [];
    return CONCEPT_VALUETYPES.map((vt) => {
      const item = new vscode.CompletionItem(vt, vscode.CompletionItemKind.TypeParameter);
      item.detail = `FHIR value type — \`value type is ${vt}.\``;
      return item;
    });
  }
}

/**
 * Completion for quoted concept/terminology/decision/activity references.
 *
 * Filters by:
 *   - The expected kind at the cursor position (from `detectExpectedKind`).
 *     E.g. `coded from "` only suggests terminologies (closes #54).
 *   - The qualifier when editing the SECOND segment of a qualified ref
 *     `"Lib"."<here>"`: only declarations from `Lib`.
 *
 * Pulls declarations from `ProjectIndex` (project-wide, parser-backed)
 * when available; falls back to file-local `scanDeclarations` for orphan
 * files without a project root.
 *
 * Suppressed on declaration headers (`concept "X":` etc. — the user is
 * naming a NEW declaration, not referencing one).
 */
export class ConceptRefCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const prefix = line.slice(0, position.character);
    if (!isInsideOpenQuote(prefix)) return [];
    if (/^\s*(concept|terminology|decision|activity|parameter)\s+"[^"]*$/.test(prefix)) return [];

    const expectedKind = detectExpectedKind(prefix);
    const qualifier = detectQualifiedRefQualifier(prefix);

    const decls = this.getDeclarations(document);
    return decls
      .filter((d) => matchesKind(d, expectedKind))
      .filter((d) => matchesQualifier(d, qualifier))
      .map((d) => buildRefItem(d));
  }

  private getDeclarations(document: vscode.TextDocument): RefSuggestion[] {
    const indexed = this.index.getDeclarations(document.uri.fsPath);
    if (indexed.length > 0) {
      return indexed.map((d) => ({
        name: d.name,
        kind: d.kind,
        libraryName: d.libraryName,
        type: d.type,
        valuetype: d.valuetype,
        bodyPreview: d.bodyPreview,
      }));
    }
    const local: Declaration[] = scanDeclarations(document.getText());
    return local.map((d) => ({
      name: d.name,
      kind: d.kind,
      libraryName: undefined,
      type: d.type,
      valuetype: d.valuetype,
      bodyPreview: d.bodyPreview,
    }));
  }
}

interface RefSuggestion {
  name: string;
  kind: "concept" | "terminology" | "decision" | "activity" | "parameter";
  libraryName: string | undefined;
  type?: string;
  valuetype?: string;
  bodyPreview?: string;
}

function matchesKind(d: RefSuggestion, expected: ExpectedRefKind): boolean {
  if (expected === "any") return true;
  // v2.2 issue #59: only NARRATIVE slots accept concept-or-parameter.
  // "concept" stays strict — `defined as` / composition / `when` get
  // concept-only completion, matching the validator's slot table.
  if (expected === "narrative") return d.kind === "concept" || d.kind === "parameter";
  return d.kind === expected;
}

function matchesQualifier(d: RefSuggestion, qualifier: string | null): boolean {
  if (qualifier === null) return true;
  return d.libraryName === qualifier;
}

function buildRefItem(d: RefSuggestion): vscode.CompletionItem {
  const item = new vscode.CompletionItem(d.name, completionKindFor(d.kind));
  item.detail = formatDeclarationDetail(d);
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${d.name}** — ${d.kind}\n\n`);
  if (d.libraryName) md.appendMarkdown(`Library: \`${d.libraryName}\`\n\n`);
  if (d.type) md.appendMarkdown(`Type: \`${d.type}\`\n\n`);
  if (d.valuetype) md.appendMarkdown(`Valuetype: \`${d.valuetype}\`\n\n`);
  if (d.bodyPreview) md.appendMarkdown(`Body: \`${d.bodyPreview}\``);
  item.documentation = md;
  return item;
}

function completionKindFor(kind: "concept" | "terminology" | "decision" | "activity" | "parameter"): vscode.CompletionItemKind {
  switch (kind) {
    case "concept": return vscode.CompletionItemKind.Variable;
    case "terminology": return vscode.CompletionItemKind.Reference;
    case "decision": return vscode.CompletionItemKind.Method;
    case "activity": return vscode.CompletionItemKind.Class;
    case "parameter": return vscode.CompletionItemKind.Property;
  }
}

function formatDeclarationDetail(d: RefSuggestion): string {
  if (d.kind === "terminology") return d.libraryName ? `terminology — ${d.libraryName}` : "terminology";
  if (d.kind === "decision") return d.libraryName ? `decision — ${d.libraryName}` : "decision";
  if (d.kind === "activity") return d.libraryName ? `activity — ${d.libraryName}` : "activity";
  if (d.kind === "parameter") {
    const parts: string[] = ["parameter"];
    if (d.type) parts.push(d.type);
    if (d.libraryName) parts.push(`— ${d.libraryName}`);
    return parts.join(" ");
  }
  const parts: string[] = ["concept"];
  if (d.type) parts.push(d.type);
  if (d.valuetype) parts.push(`+ ${d.valuetype}`);
  if (d.libraryName) parts.push(`— ${d.libraryName}`);
  return parts.join(" ");
}
