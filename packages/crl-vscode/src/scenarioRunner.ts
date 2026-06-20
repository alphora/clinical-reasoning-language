// Scenario-runner webview (roadmap item #3) — the read-only, live real-time viewer. Command
// `crl.runScenario` opens a webview for the active .cel; the host runs the headless `renderScenario`
// IN-PROCESS, renders it via the pure `renderScenarioHtml`, and posts the HTML to a hermetic webview
// (strict CSP + nonce'd inline script; no external resources). It re-runs on save of the .cel or any
// .crl (debounced), and resolves click-to-source SAFELY: the webview sends back only an opaque key,
// which the host looks up in the `reveals` map from the last render (never a path/range from the webview).
import { basename } from "node:path";
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { resolveCelImports, renderScenario } from "@smile-digital-health/crl";
import { renderScenarioHtml, renderErrorHtml, SCENARIO_STYLE, type RenderedScenario } from "./renderScenarioHtml";
import { isRelevantSave } from "./scenarioWatch";

export function registerScenarioRunner(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  let currentCel: string | undefined;
  let reveals: RenderedScenario["reveals"] = {};
  let panelDisposables: vscode.Disposable[] = [];
  let gen = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function renderAndPost(celPath: string): void {
    const myGen = ++gen;
    let rendered: RenderedScenario;
    try {
      // Namespace reveal keys per render: a click on stale DOM (after `reveals` is replaced) becomes
      // an unknown key and is ignored, rather than mis-resolving to a same-positioned node.
      rendered = renderScenarioHtml(renderScenario(resolveCelImports(celPath)), { revealPrefix: `${myGen}:` });
    } catch (e) {
      rendered = renderErrorHtml(`Failed to run ${basename(celPath)}`, [e instanceof Error ? e.message : String(e)]);
    }
    // Drop a stale render: the panel was closed, or a newer render/retarget superseded this one.
    if (!panel || myGen !== gen || currentCel !== celPath) return;
    reveals = rendered.reveals;
    void panel.webview.postMessage({ type: "render", html: rendered.html });
  }

  function revealSource(key: string): void {
    const src = reveals[key];
    if (!src) return; // unknown key — ignore (never trust a path/range from the webview)
    try {
      const r = src.range;
      const selection = new vscode.Range(r.startLine, r.startCol, r.endLine, r.endCol);
      void vscode.window
        .showTextDocument(vscode.Uri.file(src.filePath), { selection, viewColumn: vscode.ViewColumn.One })
        .then(undefined, () => {
          /* opening can fail (deleted file); ignore */
        });
    } catch {
      /* malformed range / Uri — ignore */
    }
  }

  const runCmd = vscode.commands.registerCommand("crl.runScenario", () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage("CRL Scenario Runner: open a saved .cel scenario file first.");
      return;
    }
    const p = ed.document.uri.fsPath;
    if (!p.toLowerCase().endsWith(".cel")) {
      void vscode.window.showInformationMessage(
        p.toLowerCase().endsWith(".crl")
          ? "CRL Scenario Runner: open the .cel that covers this .crl, then run it."
          : "CRL Scenario Runner: run this on a .cel scenario file.",
      );
      return;
    }
    currentCel = p;

    if (!panel) {
      panel = vscode.window.createWebviewPanel("crlScenarioRunner", "Scenario Runner", vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      panel.webview.html = getShellHtml();
      panelDisposables.push(
        panel.webview.onDidReceiveMessage((msg: { type?: string; key?: string }) => {
          if (msg?.type === "reveal" && typeof msg.key === "string") revealSource(msg.key);
        }),
      );
      panel.onDidDispose(
        () => {
          for (const d of panelDisposables) d.dispose();
          panelDisposables = [];
          if (debounce) {
            clearTimeout(debounce);
            debounce = undefined;
          }
          panel = undefined;
          currentCel = undefined;
          reveals = {};
        },
        null,
        context.subscriptions,
      );
    }
    panel.title = `Scenario: ${basename(currentCel)}`;
    panel.reveal(vscode.ViewColumn.Beside);
    renderAndPost(currentCel);
  });

  // Registered ONCE; reads the closure state and no-ops when no panel is open.
  const saveWatch = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!panel || !currentCel || !isRelevantSave(doc.uri.fsPath, currentCel)) return;
    const celAtSchedule = currentCel; // don't render a different target if it's retargeted within the debounce
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = undefined;
      if (panel && currentCel === celAtSchedule) renderAndPost(celAtSchedule);
    }, 150);
  });

  context.subscriptions.push(runCmd, saveWatch);
}

/** Hermetic shell: strict CSP, a nonce'd inline script that swaps #root's HTML on a `render` message and
 *  event-delegates `[data-reveal]` clicks back to the host. No external/localResource URIs. */
function getShellHtml(): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${SCENARIO_STYLE}</style>` +
    `<title>Scenario Runner</title></head><body>` +
    `<div id="root">Running…</div>` +
    `<script nonce="${nonce}">` +
    `const vscode = acquireVsCodeApi();` +
    `const root = document.getElementById('root');` +
    `window.addEventListener('message', (e) => { const m = e.data; if (m && m.type === 'render') root.innerHTML = m.html; });` +
    `root.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-reveal]'); if (t) vscode.postMessage({ type: 'reveal', key: t.getAttribute('data-reveal') }); });` +
    `</script></body></html>`
  );
}
