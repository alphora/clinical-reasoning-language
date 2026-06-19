import * as vscode from "vscode";

import { validateCRL, validateCRLImports } from "@smile-digital-health/crl";
import { computeDiagnostics, type ProjectIndex } from "@smile-digital-health/crl/language-services";

import { toVscodeDiagnostic } from "./toVscode";

/**
 * Live diagnostics: validate every `.crl` document on open, edit (debounced), and save; surface
 * lexer/parser/AST-builder/semantic-validator errors as VS Code Diagnostics.
 *
 * The PRODUCTION (orphan vs project decision, validation, crash-sentinel, diagnostic mapping)
 * lives in core `computeDiagnostics` (#132 step 3d). This file is the adapter: it owns the
 * DiagnosticCollection LIFECYCLE (events, debounce, overlays, per-project URI-set diff) and the
 * vscode conversion. `produceDiagnostics` is the pure seam that returns the per-URI diagnostics;
 * `applyProduction` mutates the collection + tracking sets.
 */
export function registerDiagnostics(
  context: vscode.ExtensionContext,
  index: ProjectIndex,
): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection("crl");
  context.subscriptions.push(collection);

  // For each projectRoot, the URIs we set diagnostics on last time (for stale-clear diffing).
  const projectUriSets = new Map<string, Set<string>>();
  // For orphan single-file validation, track only the document URI.
  const orphanUriSet = new Set<string>();

  const debounce = new Map<string, NodeJS.Timeout>();
  const SCHEDULE_MS = 250;

  function scheduleValidate(document: vscode.TextDocument): void {
    if (!isCrlFile(document)) return;
    index.setOverlay(document.uri.fsPath, document.getText());
    const key = document.uri.toString();
    const existing = debounce.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      debounce.delete(key);
      applyProduction(produceDiagnostics(document, index), document, collection, projectUriSets, orphanUriSet);
    }, SCHEDULE_MS);
    debounce.set(key, timer);
  }

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
      index.clearOverlay(doc.uri.fsPath);
      const t = debounce.get(doc.uri.toString());
      if (t) {
        clearTimeout(t);
        debounce.delete(doc.uri.toString());
      }
      // Orphan-file diagnostics belong to the open buffer; clear on close. Project diagnostics
      // may apply to closed siblings too — DON'T clear them just because the user closed one file.
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

/** Production result: mode + the per-URI vscode diagnostics, ready for the collection. Pure seam
 *  (no collection mutation) so the golden oracle can capture it. Discriminated so the project
 *  branch sees a non-null projectRoot without casts. Exported for the oracle. */
type DiagEntry = { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] };
export type DiagnosticsProduction =
  | { mode: "orphan"; projectRoot: null; entries: DiagEntry[] }
  | { mode: "project"; projectRoot: string; entries: DiagEntry[] }
  | { mode: "project-crash"; projectRoot: null; entries: DiagEntry[] };

export function produceDiagnostics(
  document: vscode.TextDocument,
  index: ProjectIndex,
): DiagnosticsProduction {
  // Push the current buffer into the overlay so validateCRLImports sees unsaved edits. This is
  // redundant with scheduleValidate/the event handlers in the extension, but it is LOAD-BEARING
  // for the golden oracle (which calls produceDiagnostics directly, without the adapter) — don't
  // remove it.
  index.setOverlay(document.uri.fsPath, document.getText());
  const result = computeDiagnostics(document.uri.fsPath, document.getText(), index, {
    validateCRL,
    validateCRLImports,
  });

  if (result.mode === "orphan") {
    return {
      mode: "orphan",
      projectRoot: null,
      entries: [{ uri: document.uri, diagnostics: result.diagnostics.map(toVscodeDiagnostic) }],
    };
  }
  if (result.mode === "project-crash") {
    return {
      mode: "project-crash",
      projectRoot: null,
      entries: [{ uri: document.uri, diagnostics: result.diagnostics.map(toVscodeDiagnostic) }],
    };
  }

  // Project: bucket by filePath → Uri.file → toString (preserves the legacy uri.toString() keying).
  const byUri = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();
  for (const d of result.diagnostics) {
    const uri = vscode.Uri.file(d.filePath);
    const key = uri.toString();
    let entry = byUri.get(key);
    if (!entry) {
      entry = { uri, diagnostics: [] };
      byUri.set(key, entry);
    }
    entry.diagnostics.push(toVscodeDiagnostic(d));
  }
  return { mode: "project", projectRoot: result.projectRoot, entries: [...byUri.values()] };
}

function applyProduction(
  p: DiagnosticsProduction,
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  projectUriSets: Map<string, Set<string>>,
  orphanUriSet: Set<string>,
): void {
  if (p.mode === "orphan") {
    collection.set(document.uri, p.entries[0]?.diagnostics ?? []);
    orphanUriSet.add(document.uri.toString());
    return;
  }
  if (p.mode === "project-crash") {
    // Set on the doc; intentionally does NOT update projectUriSets (preserved legacy quirk: a
    // crash leaves the previous pass's sibling diagnostics on screen until a clean pass).
    collection.set(document.uri, p.entries[0]?.diagnostics ?? []);
    return;
  }

  // Project: per-project URI-set diff — clear URIs set last pass but absent this pass.
  const next = new Set(p.entries.map((e) => e.uri.toString()));
  const prev = projectUriSets.get(p.projectRoot) ?? new Set<string>();
  for (const oldUri of prev) {
    if (!next.has(oldUri)) collection.delete(vscode.Uri.parse(oldUri));
  }
  for (const e of p.entries) {
    collection.set(e.uri, e.diagnostics);
  }
  projectUriSets.set(p.projectRoot, next);
}
