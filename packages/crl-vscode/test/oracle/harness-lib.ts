// Golden-oracle harness library (#132 step 3): a fake TextDocument + a serializer that
// turns vscode-stub objects into stable, readable plain JSON for golden comparison.
import {
  Position,
  Range,
  Uri,
  MarkdownString,
  SnippetString,
  Hover,
  CompletionItem,
  Location,
  Diagnostic,
  DocumentSymbol,
  SymbolInformation,
  DocumentLink,
  WorkspaceEdit,
} from "./vscode-stub";

/** Minimal TextDocument matching the methods the providers use. `lineAt` strips the EOL
 *  exactly like vscode (so CRLF fixtures behave identically — a flagged drift vector). */
export function makeDoc(source: string, fsPath: string) {
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));
  return {
    getText: () => source,
    lineAt: (line: number) => ({ text: lines[line] ?? "" }),
    uri: Uri.file(fsPath),
    fileName: fsPath,
  };
}

/** Deep-convert vscode-stub instances to plain, stable shapes for golden JSON. */
export function toPlain(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Position) return { line: v.line, character: v.character };
  if (v instanceof Range) return { start: toPlain(v.start), end: toPlain(v.end) };
  if (v instanceof Uri) return { fsPath: v.fsPath };
  if (v instanceof MarkdownString) return { markdown: v.value };
  if (v instanceof SnippetString) return { snippet: v.value };
  if (v instanceof Hover) return { kind: "hover", contents: toPlain(v.contents), range: toPlain(v.range) };
  if (v instanceof CompletionItem)
    return {
      kind: "completion",
      label: v.label,
      itemKind: v.kind ?? null,
      insertText: toPlain(v.insertText),
      sortText: v.sortText ?? null,
      detail: v.detail ?? null,
      documentation: toPlain(v.documentation),
      range: toPlain(v.range),
    };
  if (v instanceof Location) return { kind: "location", uri: toPlain(v.uri), range: toPlain(v.range) };
  if (v instanceof Diagnostic)
    return {
      kind: "diagnostic",
      range: toPlain(v.range),
      message: v.message,
      severity: v.severity,
      source: v.source ?? null,
      code: v.code ?? null,
    };
  if (v instanceof DocumentSymbol)
    return {
      kind: "documentSymbol",
      name: v.name,
      detail: v.detail,
      symbolKind: v.kind,
      range: toPlain(v.range),
      selectionRange: toPlain(v.selectionRange),
      children: v.children.map(toPlain),
    };
  if (v instanceof SymbolInformation)
    return {
      kind: "symbolInformation",
      name: v.name,
      symbolKind: v.kind,
      containerName: v.containerName,
      location: toPlain(v.location),
    };
  if (v instanceof DocumentLink)
    return { kind: "documentLink", range: toPlain(v.range), target: toPlain(v.target), tooltip: v.tooltip ?? null };
  if (v instanceof WorkspaceEdit)
    return { kind: "workspaceEdit", edits: v.edits.map((e) => ({ uri: toPlain(e.uri), range: toPlain(e.range), newText: e.newText })) };
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  // Plain object (e.g. a Promise-resolved value already unwrapped, or {range,placeholder}).
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = toPlain((v as Record<string, unknown>)[k]);
    return out;
  }
  return String(v);
}

/** Resolve a possibly-Promise/Thenable ProviderResult to its value (providers are sync here, but be safe). */
export async function resolveResult<T>(r: T | Promise<T> | null | undefined): Promise<T | null> {
  return (await Promise.resolve(r)) ?? null;
}
