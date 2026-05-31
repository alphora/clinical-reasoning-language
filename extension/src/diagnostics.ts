import * as vscode from "vscode";
import { validateCRL } from "@smile-digital-health/crl";

/**
 * Live diagnostics: validate every `.crl` document on open, edit (debounced),
 * and save; surface lexer / parser / AST-builder / semantic-validator errors
 * as VS Code Diagnostics with squiggles.
 *
 * Mode is fixed to **soft** at present: unresolved references become
 * warnings (yellow squiggles) so partial / in-progress documents don't
 * spray red. Hard mode is still available via the MCP `validate_crl` tool
 * with `soft: false` for explicit checks.
 *
 * Updates are debounced per-document so rapid typing doesn't re-validate on
 * every keystroke.
 */
export function registerDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection("crl");
  context.subscriptions.push(collection);

  const debounce = new Map<string, NodeJS.Timeout>();
  const SCHEDULE_MS = 250;

  function scheduleValidate(document: vscode.TextDocument): void {
    if (!isCrlFile(document)) return;
    const key = document.uri.toString();
    const existing = debounce.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      debounce.delete(key);
      validateAndReport(document, collection);
    }, SCHEDULE_MS);
    debounce.set(key, timer);
  }

  // Validate already-open editors at activation time.
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document) scheduleValidate(editor.document);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleValidate),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleValidate(e.document)),
    vscode.workspace.onDidSaveTextDocument(scheduleValidate),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
      const t = debounce.get(doc.uri.toString());
      if (t) {
        clearTimeout(t);
        debounce.delete(doc.uri.toString());
      }
    })
  );

  return collection;
}

function isCrlFile(document: vscode.TextDocument): boolean {
  return /\.crl$/i.test(document.fileName);
}

function validateAndReport(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  let result: ReturnType<typeof validateCRL>;
  try {
    result = validateCRL(document.getText(), { soft: true });
  } catch (e) {
    // A validator crash shouldn't kill the extension — surface as a single
    // information diagnostic at line 0.
    const range = new vscode.Range(0, 0, 0, 0);
    const msg = e instanceof Error ? e.message : String(e);
    collection.set(document.uri, [
      new vscode.Diagnostic(range, `CRL validator crashed: ${msg}`, vscode.DiagnosticSeverity.Information),
    ]);
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
}

interface CRLErrorEnvelope {
  type: string;
  message: string;
  line?: number;
  column?: number;
}

function toDiagnostic(err: CRLErrorEnvelope, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
  // CRL line numbers are 1-based; VS Code wants 0-based. Column is 0-based on both.
  const line = Math.max(0, (err.line ?? 1) - 1);
  const column = Math.max(0, err.column ?? 0);
  // We don't know the exact end of the offending span; use a single-character
  // squiggle anchored at the reported position. The hover shows the message.
  const range = new vscode.Range(line, column, line, column + 1);
  const diagnostic = new vscode.Diagnostic(range, err.message, severity);
  diagnostic.source = "crl";
  diagnostic.code = err.type;
  return diagnostic;
}
