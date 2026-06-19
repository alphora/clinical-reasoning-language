// Minimal runtime `vscode` stub for the #132 step-3 GOLDEN ORACLE. esbuild aliases
// `vscode` → this module so the real providers run headlessly under Node, letting us
// snapshot their CURRENT output to golden JSON BEFORE the extraction (the only way to
// prove the split is behavior-preserving — the providers have no existing tests).
//
// Only the RUNTIME surface the 5 services touch is implemented; type-only usages
// (TextDocument, *Provider, ProviderResult) are erased by esbuild and need nothing here.

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    if (a instanceof Position && b instanceof Position) {
      this.start = a;
      this.end = b;
    } else {
      this.start = new Position(a as number, b as number);
      this.end = new Position(c as number, d as number);
    }
  }
}

export class Uri {
  private constructor(public readonly fsPath: string, public readonly scheme = "file") {}
  static file(p: string): Uri {
    return new Uri(p);
  }
  get path(): string {
    return this.fsPath;
  }
  toString(): string {
    return `file://${this.fsPath}`;
  }
}

export class MarkdownString {
  value: string;
  constructor(value = "") {
    this.value = value;
  }
  appendMarkdown(md: string): MarkdownString {
    this.value += md;
    return this;
  }
}

export class Hover {
  constructor(
    public readonly contents: MarkdownString | MarkdownString[],
    public readonly range?: Range,
  ) {}
}

export const CompletionItemKind = {
  Class: 6,
  Method: 1,
  Property: 9,
  Reference: 17,
  Snippet: 14,
  TypeParameter: 24,
  Variable: 5,
} as const;

export class SnippetString {
  constructor(public readonly value: string) {}
}

export class CompletionItem {
  insertText?: string | SnippetString;
  sortText?: string;
  detail?: string;
  documentation?: string | MarkdownString;
  range?: Range;
  constructor(public label: string, public kind?: number) {}
}

export class Location {
  constructor(public readonly uri: Uri, public readonly range: Range) {}
}

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const;

export class Diagnostic {
  source?: string;
  code?: string;
  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: number = DiagnosticSeverity.Error,
  ) {}
}

export const SymbolKind = {
  Namespace: 2,
  Class: 4,
  Constant: 13,
  Function: 11,
  Property: 6,
  Variable: 12,
} as const;

export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public readonly name: string,
    public readonly detail: string,
    public readonly kind: number,
    public readonly range: Range,
    public readonly selectionRange: Range,
  ) {}
}

export class SymbolInformation {
  constructor(
    public readonly name: string,
    public readonly kind: number,
    public readonly containerName: string,
    public readonly location: Location,
  ) {}
}

export class DocumentLink {
  tooltip?: string;
  constructor(public readonly range: Range, public readonly target?: Uri) {}
}

export class WorkspaceEdit {
  // Ordered list of replacements, preserving insertion order per the providers.
  readonly edits: { uri: Uri; range: Range; newText: string }[] = [];
  replace(uri: Uri, range: Range, newText: string): void {
    this.edits.push({ uri, range, newText });
  }
}

// Namespaces — the providers read workspace.workspaceFolders (navigation/workspaceSymbols).
// The harness sets these per fixture; registration-only members (window/languages) are stubs.
export const workspace: { workspaceFolders?: { uri: Uri }[] } = { workspaceFolders: undefined };
export const window = {};
export const languages = {};
