import * as vscode from "vscode";
import {
  compileNarrativeMatcher,
  isDefinitionIsBody,
  CONCEPT_TYPES,
  CONCEPT_VALUETYPES,
  type Pattern,
} from "./catalog";
import { scanDeclarations, declarationsByName, type Declaration } from "./concepts";
import type { IndexedDeclaration, ProjectIndex } from "./projectIndex";

const CONCEPT_TYPE_SET: ReadonlySet<string> = new Set(CONCEPT_TYPES);
const CONCEPT_VALUETYPE_SET: ReadonlySet<string> = new Set(CONCEPT_VALUETYPES);

interface CompiledPattern {
  pattern: Pattern;
  matcher: RegExp;
}

/**
 * Hover provider over a narrative pattern in a `- definition is ` body. Walks the
 * catalog at hover time and finds the longest match containing the cursor.
 */
export class NarrativeHoverProvider implements vscode.HoverProvider {
  private readonly compiled: CompiledPattern[];

  constructor(patterns: Pattern[]) {
    this.compiled = patterns.map((p) => ({ pattern: p, matcher: compileNarrativeMatcher(p.narrative) }));
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    if (!isDefinitionIsBody(document.lineAt(position.line).text)) return null;
    const line = document.lineAt(position.line).text;
    const cursorCol = position.character;

    let best: { pattern: Pattern; start: number; end: number } | null = null;
    for (const { pattern, matcher } of this.compiled) {
      const m = matcher.exec(line);
      if (!m) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (cursorCol < start || cursorCol > end) continue;
      const length = end - start;
      if (!best || length > best.end - best.start) best = { pattern, start, end };
    }
    if (!best) return null;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${best.pattern.canonical}** — *${best.pattern.category || "pattern"}*\n\n`);
    md.appendMarkdown(`Narrative: \`${best.pattern.narrative}\`\n\n`);
    md.appendMarkdown(`Signature: \`${best.pattern.signature}\`\n\n`);
    md.appendMarkdown(`CQL: \`${best.pattern.cqlFunction}\``);
    return new vscode.Hover(md, new vscode.Range(position.line, best.start, position.line, best.end));
  }
}

/**
 * Hover provider over a `type is <T>.` or `valuetype is <V>.` token. Shows
 * the kind (resource type / value type) so authors can recall what a less-
 * familiar FHIR resource is meant to be.
 */
export class TypeValuetypeHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    // Match `- type is X.` or `- valuetype is X.` and find the token under the cursor.
    const typeMatch = /^(\s*-\s*type\s+is\s+)([A-Za-z][A-Za-z0-9]*)(\s*\.\s*)?$/.exec(line);
    if (typeMatch) {
      const tokenStart = typeMatch[1].length;
      const tokenEnd = tokenStart + typeMatch[2].length;
      if (position.character >= tokenStart && position.character <= tokenEnd) {
        const name = typeMatch[2];
        const isValid = CONCEPT_TYPE_SET.has(name);
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${name}** — FHIR resource type\n\n`);
        if (!isValid) {
          md.appendMarkdown(`⚠ Not in the recognized type set. Valid: ${[...CONCEPT_TYPES].join(", ")}.`);
        } else {
          md.appendMarkdown(`Used in \`- type is ${name}.\` to declare the concept's FHIR resource type.`);
        }
        return new vscode.Hover(md, new vscode.Range(position.line, tokenStart, position.line, tokenEnd));
      }
    }
    const vtMatch = /^(\s*-\s*valuetype\s+is\s+)([A-Za-z][A-Za-z0-9]*)(\s*\.\s*)?$/.exec(line);
    if (vtMatch) {
      const tokenStart = vtMatch[1].length;
      const tokenEnd = tokenStart + vtMatch[2].length;
      if (position.character >= tokenStart && position.character <= tokenEnd) {
        const name = vtMatch[2];
        const isValid = CONCEPT_VALUETYPE_SET.has(name);
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${name}** — FHIR value type\n\n`);
        if (!isValid) {
          md.appendMarkdown(`⚠ Not in the recognized valuetype set. Valid: ${[...CONCEPT_VALUETYPES].join(", ")}.`);
        } else {
          md.appendMarkdown(`Used in \`- valuetype is ${name}.\` to declare the concept's value-bearing type.`);
        }
        return new vscode.Hover(md, new vscode.Range(position.line, tokenStart, position.line, tokenEnd));
      }
    }
    return null;
  }
}

/**
 * Hover over a quoted concept reference shows where the reference resolves to
 * (declaration kind, line number, type/valuetype, body preview). Looks up
 * the reference in the document's declared concept/terminology list.
 */
export class ConceptRefHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: ProjectIndex) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const span = quotedSpanAt(line, position.character);
    if (!span) return null;
    const name = span.text;

    // Detect qualified ref: if the hovered span is the SECOND quoted segment
    // of `"Lib"."<here>"`, look up by libraryName + name in the project
    // index. Otherwise (bare ref or first segment), use either the project
    // index (multi-file) or the file-local scan (orphan file).
    const prefixBeforeSpan = line.slice(0, span.start);
    const qualifierMatch = /"([^"]+)"\s*\.\s*$/.exec(prefixBeforeSpan);

    const indexed = this.index.getDeclarations(document.uri.fsPath);
    if (indexed.length > 0) {
      const decl = qualifierMatch
        ? indexed.find((d) => d.libraryName === qualifierMatch[1] && d.name === name)
        : indexed.find((d) => d.name === name);
      if (!decl) return null;
      return new vscode.Hover(
        formatIndexedHover(decl),
        new vscode.Range(position.line, span.start, position.line, span.end),
      );
    }

    // Orphan-file fallback.
    const decls = scanDeclarations(document.getText());
    const byName = declarationsByName(decls);
    const decl = byName.get(name);
    if (!decl) return null;
    return new vscode.Hover(formatLocalHover(decl), new vscode.Range(position.line, span.start, position.line, span.end));
  }
}

function formatIndexedHover(decl: IndexedDeclaration): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${decl.name}** — ${decl.kind}\n\n`);
  md.appendMarkdown(`Library: \`${decl.libraryName}\`\n\n`);
  if (decl.type) md.appendMarkdown(`Type: \`${decl.type}\`\n\n`);
  if (decl.valuetype) md.appendMarkdown(`Valuetype: \`${decl.valuetype}\`\n\n`);
  if (decl.bodyPreview) md.appendMarkdown(`Body: \`${decl.bodyPreview}\`\n\n`);
  md.appendMarkdown(`Declared at \`${decl.filePath}\`:${decl.line + 1}.`);
  return md;
}

function formatLocalHover(decl: Declaration): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${decl.name}** — ${decl.kind}\n\n`);
  if (decl.type) md.appendMarkdown(`Type: \`${decl.type}\`\n\n`);
  if (decl.valuetype) md.appendMarkdown(`Valuetype: \`${decl.valuetype}\`\n\n`);
  if (decl.bodyPreview) md.appendMarkdown(`Body: \`${decl.bodyPreview}\`\n\n`);
  md.appendMarkdown(`Declared at line ${decl.line + 1}.`);
  return md;
}

/** Return the span (start+end+inner text) of the quoted string under `col`, if any. */
export function quotedSpanAt(
  line: string,
  col: number
): { start: number; end: number; text: string } | null {
  // Find every quoted span on the line; pick the one containing `col`.
  // Doesn't handle escaped quotes specially — CRL names don't contain them.
  const re = /"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (col >= start && col <= end) {
      return { start, end, text: m[1] };
    }
  }
  return null;
}
