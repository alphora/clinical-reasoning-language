// Plain-data language-service contracts (#132 step 2). vscode-free, 0-based,
// filePath-identified; the extension adapters map these to/from vscode types.
// Public API on `@smile-digital-health/crl/language-services`.
//
// Documented decisions (discussion 088):
// - Document identity = absolute filePath. A future virtual-doc host (Coral) may add an
//   opaque documentId; filePath is the step-2 contract.
// - Ranges use ZeroBasedRange (0-based; its startCol/endCol == LSP `character`).
// - SYNC: contracts + host are synchronous (the codebase + the Node/extension consumers
//   are sync). A browser-hosted editor would need an async host variant — a deliberate
//   future breaking change, not retrofitted speculatively now.
// - Deferred (no current producer; add when one needs them): Diagnostic.relatedInformation
//   / tags (cycle + registry-duplicate diagnostics are the likely first consumer);
//   multi-part Hover (providers concatenate parts with "\n\n").
// - Service entry-point convention: language services are PURE functions taking parsed
//   inputs (source text, a 0-based position, filePath, a ProjectIndex, optionally a
//   LanguageServiceHost) and returning these `Ls*` DTOs — never vscode types.

/**
 * Zero-based, inclusive-start, exclusive-end range — the canonical range for all
 * language-service contracts (startCol/endCol == LSP `character`). Defined here so the
 * contracts are self-contained; projectIndex + the providers import it from this module.
 */
export interface ZeroBasedRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type LsSeverity = "error" | "warning" | "information" | "hint";

export type LsCompletionKind =
  | "class"
  | "method"
  | "property"
  | "reference"
  | "snippet"
  | "typeParameter"
  | "variable";

export type LsInsertTextFormat = "plainText" | "snippet";

export type LsSymbolKind =
  | "namespace"
  | "class"
  | "constant"
  | "function"
  | "property"
  | "variable";

export interface LsCompletionItem {
  label: string;
  kind: LsCompletionKind;
  /** Inserted text; a snippet template when insertTextFormat === "snippet". */
  insertText?: string;
  /** Default "plainText". Replaces the vscode SnippetString-vs-string slot. */
  insertTextFormat?: LsInsertTextFormat;
  detail?: string;
  /** Markdown documentation. */
  documentation?: string;
  /** Overrides label-based ordering (e.g. narrative lead-word sort). */
  sortText?: string;
  range?: ZeroBasedRange;
}

export interface LsHover {
  /** Single markdown block; multi-part content is concatenated with "\n\n". */
  markdown: string;
  range?: ZeroBasedRange;
}

export interface LsDiagnostic {
  filePath: string;
  range: ZeroBasedRange;
  severity: LsSeverity;
  message: string;
  /** Stable diagnostic code (e.g. the validator error `kind`). */
  code?: string;
  /** Producer tag, e.g. "crl". */
  source?: string;
}

/** A definition or reference target. */
export interface LsLocation {
  filePath: string;
  range: ZeroBasedRange;
}

export interface LsDocumentLink {
  range: ZeroBasedRange;
  /** Absolute filePath the link opens (the VS Code adapter wraps it in a file URI). */
  target: string;
  tooltip?: string;
}

/** A single text edit; a rename result is `LsTextEdit[]` (regroup by filePath in the adapter). */
export interface LsTextEdit {
  filePath: string;
  range: ZeroBasedRange;
  newText: string;
}

/** Result of a prepare-rename probe (the target range + the current name to pre-fill). */
export interface LsPrepareRenameResult {
  range: ZeroBasedRange;
  placeholder: string;
}
// Rename convention: a successful rename returns LsTextEdit[]; unsupported targets,
// invalid names, and name collisions are signaled by THROWING an Error with a
// user-facing message (the VS Code adapter surfaces it as a rejected ProviderResult).

export interface LsDocumentSymbol {
  name: string;
  detail?: string;
  kind: LsSymbolKind;
  range: ZeroBasedRange;
  selectionRange: ZeroBasedRange;
  children?: LsDocumentSymbol[];
}

export interface LsWorkspaceSymbol {
  name: string;
  kind: LsSymbolKind;
  containerName?: string;
  location: LsLocation;
}
