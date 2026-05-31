import * as vscode from "vscode";
import { compileNarrativeMatcher, isLogicIsBody, type Pattern } from "./catalog";

/**
 * Hover provider for narrative patterns in CRL `logic is` bodies. Walks the
 * catalog at hover time and finds the longest narrative template that
 * matches the hovered span, then shows the canonical signature + CQL
 * function reference.
 *
 * Matching strategy: build a regex per pattern by replacing `<placeholder>`
 * with a quoted-string capture (`"[^"]+"`); look for the longest match
 * whose span covers the hovered position.
 */

interface CompiledPattern {
  pattern: Pattern;
  /** A regex that matches a concrete instance of `pattern.narrative`. */
  matcher: RegExp;
}

function compilePattern(pattern: Pattern): CompiledPattern {
  return { pattern, matcher: compileNarrativeMatcher(pattern.narrative) };
}

function isInLogicIsBody(document: vscode.TextDocument, position: vscode.Position): boolean {
  return isLogicIsBody(document.lineAt(position.line).text);
}

export class NarrativeHoverProvider implements vscode.HoverProvider {
  private readonly compiled: CompiledPattern[];

  constructor(patterns: Pattern[]) {
    this.compiled = patterns.map(compilePattern);
  }

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Hover> {
    if (!isInLogicIsBody(document, position)) return null;
    const line = document.lineAt(position.line).text;
    const cursorCol = position.character;

    // Find the longest pattern match whose span contains the cursor.
    let best: { pattern: Pattern; start: number; end: number } | null = null;
    for (const { pattern, matcher } of this.compiled) {
      const m = matcher.exec(line);
      if (!m) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (cursorCol < start || cursorCol > end) continue;
      const length = end - start;
      if (!best || length > best.end - best.start) {
        best = { pattern, start, end };
      }
    }
    if (!best) return null;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${best.pattern.canonical}** — *${best.pattern.category || "pattern"}*\n\n`);
    md.appendMarkdown(`Narrative: \`${best.pattern.narrative}\`\n\n`);
    md.appendMarkdown(`Signature: \`${best.pattern.signature}\`\n\n`);
    md.appendMarkdown(`CQL: \`${best.pattern.cqlFunction}\``);
    const range = new vscode.Range(position.line, best.start, position.line, best.end);
    return new vscode.Hover(md, range);
  }
}
