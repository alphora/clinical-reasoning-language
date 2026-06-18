import * as vscode from "vscode";

import { validateCRL, validateCRLImports, type ValidationError } from "@smile-digital-health/crl";

import { mapImportDiagnostic } from "./diagnosticMap";
import type { ProjectIndex } from "@smile-digital-health/crl/language-services";

/**
 * Live diagnostics: validate every `.crl` document on open, edit (debounced),
 * and save; surface lexer / parser / AST-builder / semantic-validator errors
 * as VS Code Diagnostics with squiggles.
 *
 * Multi-file flow (v2.1.0 Chunk B):
 *   - If the file is part of a CRL project (`projectIndex.getProjectRoot`
 *     returns non-null), call `validateCRLImports(filePath, { soft: true,
 *     overlays })`. The overlay map lets the resolver consume in-memory
 *     editor text for unsaved files. Diagnostics may surface on sibling
 *     URIs that aren't open in the editor.
 *   - Otherwise (orphan file, no project root) fall back to `validateCRL`
 *     on the in-memory text.
 *
 * Per-project URI tracking ensures stale sibling diagnostics get cleared
 * on revalidate without blanket `collection.clear()` (which would stomp
 * unrelated projects).
 */
export function registerDiagnostics(
  context: vscode.ExtensionContext,
  index: ProjectIndex,
): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection("crl");
  context.subscriptions.push(collection);

  // For each projectRoot, the set of URIs we set diagnostics on last time.
  // On revalidate, we compute the diff and clear URIs no longer mentioned.
  const projectUriSets = new Map<string, Set<string>>();
  // For orphan single-file validation, track only the document URI.
  const orphanUriSet = new Set<string>();

  const debounce = new Map<string, NodeJS.Timeout>();
  const SCHEDULE_MS = 250;

  function scheduleValidate(document: vscode.TextDocument): void {
    if (!isCrlFile(document)) return;
    // Push the current text into the overlay so resolveImports sees it.
    index.setOverlay(document.uri.fsPath, document.getText());
    const key = document.uri.toString();
    const existing = debounce.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      debounce.delete(key);
      validateAndReport(document, collection, index, projectUriSets, orphanUriSet);
    }, SCHEDULE_MS);
    debounce.set(key, timer);
  }

  // Validate already-open editors at activation time.
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document) scheduleValidate(editor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (!isCrlFile(doc)) return;
      index.setOverlay(doc.uri.fsPath, doc.getText());
      scheduleValidate(doc);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!isCrlFile(e.document)) return;
      index.setOverlay(e.document.uri.fsPath, e.document.getText());
      scheduleValidate(e.document);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!isCrlFile(doc)) return;
      index.setOverlay(doc.uri.fsPath, doc.getText());
      scheduleValidate(doc);
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (!isCrlFile(doc)) return;
      // Drop the overlay so subsequent reads see on-disk content.
      index.clearOverlay(doc.uri.fsPath);
      const t = debounce.get(doc.uri.toString());
      if (t) {
        clearTimeout(t);
        debounce.delete(doc.uri.toString());
      }
      // Orphan-file diagnostics belong to the open buffer; clear on close.
      // Project diagnostics may apply to closed siblings too — DON'T clear
      // them just because the user closed one file.
      if (orphanUriSet.has(doc.uri.toString())) {
        collection.delete(doc.uri);
        orphanUriSet.delete(doc.uri.toString());
      }
    }),
  );

  return collection;
}

function isCrlFile(document: vscode.TextDocument): boolean {
  return /\.crl$/i.test(document.fileName);
}

function validateAndReport(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  index: ProjectIndex,
  projectUriSets: Map<string, Set<string>>,
  orphanUriSet: Set<string>,
): void {
  const projectRoot = index.getProjectRoot(document.uri.fsPath);

  if (projectRoot === null) {
    // Orphan-file path: legacy single-file validate.
    validateSingleFile(document, collection, orphanUriSet);
    return;
  }

  validateProject(document, collection, index, projectRoot, projectUriSets);
}

function validateSingleFile(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  orphanUriSet: Set<string>,
): void {
  let result: ReturnType<typeof validateCRL>;
  try {
    result = validateCRL(document.getText(), { soft: true });
  } catch (e) {
    const range = new vscode.Range(0, 0, 0, 0);
    const msg = e instanceof Error ? e.message : String(e);
    collection.set(document.uri, [
      new vscode.Diagnostic(range, `CRL validator crashed: ${msg}`, vscode.DiagnosticSeverity.Information),
    ]);
    orphanUriSet.add(document.uri.toString());
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  for (const err of result.errors ?? []) {
    diagnostics.push(toDiagnostic(err, vscode.DiagnosticSeverity.Error));
  }
  for (const warn of result.warnings ?? []) {
    diagnostics.push(toDiagnostic(warn, vscode.DiagnosticSeverity.Warning));
  }
  collection.set(document.uri, diagnostics);
  orphanUriSet.add(document.uri.toString());
}

function validateProject(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  index: ProjectIndex,
  projectRoot: string,
  projectUriSets: Map<string, Set<string>>,
): void {
  // The graph cache invalidates whenever an overlay changes, so this
  // pulls a fresh graph that reflects the latest editor buffers.
  index.invalidate(projectRoot);
  let result: ReturnType<typeof validateCRLImports>;
  try {
    result = validateCRLImports(document.uri.fsPath, {
      soft: true,
      overlays: index.getOverlays(),
    });
  } catch (e) {
    const range = new vscode.Range(0, 0, 0, 0);
    const msg = e instanceof Error ? e.message : String(e);
    collection.set(document.uri, [
      new vscode.Diagnostic(range, `CRL validator crashed: ${msg}`, vscode.DiagnosticSeverity.Information),
    ]);
    return;
  }

  // Bucket diagnostics by URI.
  const byUri = new Map<string, vscode.Diagnostic[]>();
  const push = (uri: vscode.Uri, diag: vscode.Diagnostic): void => {
    const key = uri.toString();
    let arr = byUri.get(key);
    if (!arr) {
      arr = [];
      byUri.set(key, arr);
    }
    arr.push(diag);
  };

  for (const ve of result.validationErrors) {
    push(uriFor(ve, document.uri), validationToDiagnostic(ve, vscode.DiagnosticSeverity.Error));
  }
  for (const vw of result.validationWarnings) {
    push(uriFor(vw, document.uri), validationToDiagnostic(vw, vscode.DiagnosticSeverity.Warning));
  }
  for (const id of result.importDiagnostics) {
    for (const m of mapImportDiagnostic(id)) {
      const d = new vscode.Diagnostic(m.range, m.message, m.severity);
      d.source = "crl";
      d.code = m.code;
      push(m.uri, d);
    }
  }

  // Per-project URI-set diff: clear URIs that were set last time but
  // aren't in this pass.
  const prev = projectUriSets.get(projectRoot) ?? new Set<string>();
  const next = new Set(byUri.keys());
  for (const oldUri of prev) {
    if (!next.has(oldUri)) {
      collection.delete(vscode.Uri.parse(oldUri));
    }
  }

  // Apply this pass's diagnostics.
  for (const [uriStr, diags] of byUri) {
    collection.set(vscode.Uri.parse(uriStr), diags);
  }

  projectUriSets.set(projectRoot, next);
}

function uriFor(e: ValidationError, fallback: vscode.Uri): vscode.Uri {
  if (e.filePath) return vscode.Uri.file(e.filePath);
  return fallback;
}

function validationToDiagnostic(e: ValidationError, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
  const sl = Math.max(0, (e.location?.start.line ?? 1) - 1);
  const sc = Math.max(0, e.location?.start.column ?? 0);
  const el = Math.max(0, (e.location?.end.line ?? sl + 1) - 1);
  const ec = Math.max(0, e.location?.end.column ?? sc + 1);
  const range = el < sl || (el === sl && ec <= sc)
    ? new vscode.Range(sl, sc, sl, sc + 1)
    : new vscode.Range(sl, sc, el, ec);
  const d = new vscode.Diagnostic(range, e.message, severity);
  d.source = "crl";
  d.code = e.kind;
  return d;
}

interface CRLErrorEnvelope {
  type: string;
  kind?: string;
  message: string;
  line?: number;
  column?: number;
}

function toDiagnostic(err: CRLErrorEnvelope, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
  const line = Math.max(0, (err.line ?? 1) - 1);
  const column = Math.max(0, err.column ?? 0);
  const range = new vscode.Range(line, column, line, column + 1);
  const diagnostic = new vscode.Diagnostic(range, err.message, severity);
  diagnostic.source = "crl";
  diagnostic.code = err.kind ?? err.type;
  return diagnostic;
}
