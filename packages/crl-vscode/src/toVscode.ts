// Ls* → vscode converters (#132 step 3). The single seam where headless language-service
// results (plain-data Ls* DTOs from `@smile-digital-health/crl/language-services`) become
// vscode types. Each service's adapter calls compute*() then converts here.
import * as vscode from "vscode";
import type { LsHover, ZeroBasedRange } from "@smile-digital-health/crl/language-services";

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
