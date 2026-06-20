// CEL diagnostics adapter (#4 slice 4). Owns the `crl-cel` DiagnosticCollection lifecycle: validate every
// open .cel on activation, on open, on edit (debounced), and on save. CROSS-FILE: a .crl edit/save changes a
// covered .cel's validity, so it refreshes the shared overlay (so validateCELFile sees the unsaved .crl) and
// re-validates every open .cel. Shares the ProjectIndex's overlay map with the CRL diagnostics adapter.
import * as vscode from "vscode";
import { validateCELFile } from "@smile-digital-health/crl";
import { computeCelDiagnostics, type ProjectIndex } from "@smile-digital-health/crl/language-services";
import { toVscodeDiagnostic } from "./toVscode";

const isCel = (doc: vscode.TextDocument): boolean =>
  doc.uri.scheme === "file" && doc.uri.fsPath.toLowerCase().endsWith(".cel");
const isCrl = (doc: vscode.TextDocument): boolean =>
  doc.uri.scheme === "file" && doc.uri.fsPath.toLowerCase().endsWith(".crl");

export function registerCelDiagnostics(context: vscode.ExtensionContext, index: ProjectIndex): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection("crl-cel");
  const debounce = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;

  const validate = (doc: vscode.TextDocument): void => {
    if (disposed) return;
    try {
      const diags = computeCelDiagnostics(doc.uri.fsPath, doc.getText(), index.getOverlays(), validateCELFile);
      collection.set(doc.uri, diags.map(toVscodeDiagnostic));
    } catch (e) {
      // resolveCelImports does fs reads + parsing — guard so a throw doesn't crash the host or leave stale
      // squiggles; surface a sentinel (mirrors the CRL adapter's crash production).
      const msg = e instanceof Error ? e.message : String(e);
      collection.set(doc.uri, [
        new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), `CEL diagnostics failed: ${msg}`, vscode.DiagnosticSeverity.Information),
      ]);
    }
  };
  const schedule = (doc: vscode.TextDocument, ms = 250): void => {
    if (disposed) return;
    const key = doc.uri.toString();
    const t = debounce.get(key);
    if (t) clearTimeout(t);
    debounce.set(
      key,
      setTimeout(() => {
        debounce.delete(key);
        validate(doc);
      }, ms),
    );
  };
  const revalidateOpenCel = (): void => {
    for (const d of vscode.workspace.textDocuments) if (isCel(d)) schedule(d);
  };

  // Activation: seed overlays for already-open DIRTY .crl (incl. not-visible — the CRL adapter only seeds
  // visible editors), so the first .cel validation sees unsaved .crl content; then validate open .cel.
  for (const d of vscode.workspace.textDocuments) if (isCrl(d) && d.isDirty) index.setOverlay(d.uri.fsPath, d.getText());
  for (const d of vscode.workspace.textDocuments) if (isCel(d)) validate(d);

  context.subscriptions.push(
    collection,
    new vscode.Disposable(() => {
      disposed = true;
      for (const t of debounce.values()) clearTimeout(t);
      debounce.clear();
    }),
    vscode.workspace.onDidOpenTextDocument((d) => {
      if (isCel(d)) validate(d);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isCel(e.document)) schedule(e.document);
      else if (isCrl(e.document)) {
        index.setOverlay(e.document.uri.fsPath, e.document.getText()); // keep the .crl overlay current
        revalidateOpenCel(); // cross-file: a covered .crl changed
      }
    }),
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (isCel(d)) validate(d);
      else if (isCrl(d)) {
        index.setOverlay(d.uri.fsPath, d.getText());
        revalidateOpenCel();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((d) => {
      if (isCel(d)) {
        const key = d.uri.toString();
        const t = debounce.get(key);
        if (t) {
          clearTimeout(t);
          debounce.delete(key);
        }
        collection.delete(d.uri);
      } else if (isCrl(d)) {
        index.clearOverlay(d.uri.fsPath); // discard unsaved .crl edits → re-validate against saved content
        revalidateOpenCel();
      }
    }),
  );
  // v1 limitation (symmetric with the CRL diagnostics adapter): a .crl DELETED/renamed on disk OUTSIDE the
  // editor fires no document event, so open .cel diagnostics can go stale until the next edit. A project-wide
  // FileSystemWatcher is the fix; deferred (it belongs on both adapters).
  return collection;
}
