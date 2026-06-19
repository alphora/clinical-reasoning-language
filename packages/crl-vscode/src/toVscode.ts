// Ls* → vscode converters (#132 step 3). The single seam where headless language-service
// results (plain-data Ls* DTOs from `@smile-digital-health/crl/language-services`) become
// vscode types. Each service's adapter calls compute*() then converts here.
import * as vscode from "vscode";
import type {
  LsHover,
  LsCompletionItem,
  LsCompletionKind,
  LsLocation,
  LsDocumentSymbol,
  LsWorkspaceSymbol,
  LsDocumentLink,
  LsTextEdit,
  LsSymbolKind,
  LsDiagnostic,
  LsSeverity,
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

const SYMBOL_KIND: Record<LsSymbolKind, vscode.SymbolKind> = {
  namespace: vscode.SymbolKind.Namespace,
  class: vscode.SymbolKind.Class,
  constant: vscode.SymbolKind.Constant,
  function: vscode.SymbolKind.Function,
  property: vscode.SymbolKind.Property,
  variable: vscode.SymbolKind.Variable,
};

export function toVscodeLocation(l: LsLocation): vscode.Location {
  return new vscode.Location(vscode.Uri.file(l.filePath), toVscodeRange(l.range));
}

export function toVscodeDocumentSymbol(s: LsDocumentSymbol): vscode.DocumentSymbol {
  const sym = new vscode.DocumentSymbol(
    s.name,
    s.detail ?? "",
    SYMBOL_KIND[s.kind],
    toVscodeRange(s.range),
    toVscodeRange(s.selectionRange),
  );
  if (s.children) sym.children = s.children.map(toVscodeDocumentSymbol);
  return sym;
}

export function toVscodeSymbolInformation(s: LsWorkspaceSymbol): vscode.SymbolInformation {
  return new vscode.SymbolInformation(
    s.name,
    SYMBOL_KIND[s.kind],
    s.containerName ?? "",
    toVscodeLocation(s.location),
  );
}

export function toVscodeDocumentLink(l: LsDocumentLink): vscode.DocumentLink {
  const link = new vscode.DocumentLink(toVscodeRange(l.range), vscode.Uri.file(l.target));
  if (l.tooltip !== undefined) link.tooltip = l.tooltip;
  return link;
}

/** LsTextEdit[] → a single WorkspaceEdit (replace ops in array order). */
export function toWorkspaceEdit(edits: LsTextEdit[]): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  for (const e of edits) edit.replace(vscode.Uri.file(e.filePath), toVscodeRange(e.range), e.newText);
  return edit;
}

const DIAGNOSTIC_SEVERITY: Record<LsSeverity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/** LsDiagnostic → vscode.Diagnostic (source + code set post-construction, matching the providers). */
export function toVscodeDiagnostic(d: LsDiagnostic): vscode.Diagnostic {
  const diag = new vscode.Diagnostic(toVscodeRange(d.range), d.message, DIAGNOSTIC_SEVERITY[d.severity]);
  if (d.source !== undefined) diag.source = d.source;
  if (d.code !== undefined) diag.code = d.code;
  return diag;
}
