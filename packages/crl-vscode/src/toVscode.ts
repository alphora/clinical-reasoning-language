// Ls* → vscode converters (#132 step 3). The single seam where headless language-service
// results (plain-data Ls* DTOs from `@smile-digital-health/crl/language-services`) become
// vscode types. Each service's adapter calls compute*() then converts here.
import * as vscode from "vscode";
import type {
  LsHover,
  LsCompletionItem,
  LsCompletionKind,
  ZeroBasedRange,
} from "@smile-digital-health/crl/language-services";

/** ZeroBasedRange → vscode.Range. Columns are UTF-16 code units == vscode character offsets. */
export function toVscodeRange(r: ZeroBasedRange): vscode.Range {
  return new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol);
}

/** LsHover → vscode.Hover. Uses appendMarkdown (not the value constructor) to match the
 *  providers' original MarkdownString construction byte-for-byte. */
export function toVscodeHover(h: LsHover): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(h.markdown);
  return h.range ? new vscode.Hover(md, toVscodeRange(h.range)) : new vscode.Hover(md);
}

const COMPLETION_KIND: Record<LsCompletionKind, vscode.CompletionItemKind> = {
  class: vscode.CompletionItemKind.Class,
  method: vscode.CompletionItemKind.Method,
  property: vscode.CompletionItemKind.Property,
  reference: vscode.CompletionItemKind.Reference,
  snippet: vscode.CompletionItemKind.Snippet,
  typeParameter: vscode.CompletionItemKind.TypeParameter,
  variable: vscode.CompletionItemKind.Variable,
};

/** LsCompletionItem → vscode.CompletionItem. insertText becomes a SnippetString when the
 *  format is "snippet"; documentation uses appendMarkdown (matching the providers). Unset
 *  optional fields are left unset so behavior matches the originals byte-for-byte. */
export function toVscodeCompletionItem(ls: LsCompletionItem): vscode.CompletionItem {
  const item = new vscode.CompletionItem(ls.label, COMPLETION_KIND[ls.kind]);
  if (ls.insertText !== undefined) {
    item.insertText =
      ls.insertTextFormat === "snippet" ? new vscode.SnippetString(ls.insertText) : ls.insertText;
  }
  if (ls.detail !== undefined) item.detail = ls.detail;
  if (ls.documentation !== undefined) {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(ls.documentation);
    item.documentation = md;
  }
  if (ls.sortText !== undefined) item.sortText = ls.sortText;
  if (ls.range !== undefined) item.range = toVscodeRange(ls.range);
  return item;
}
