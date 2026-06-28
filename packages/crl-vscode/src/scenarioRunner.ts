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

/** Read the SHARED All/Blocking failed-criteria mode (#173 T3b) — the SAME `crl.cockpit.failedCriteriaMode` the
 *  cockpit (T3a) uses, so the two surfaces stay in sync. Default Blocking. Resource-scoped on the active .cel. */
function readFailedCriteriaMode(celPath: string | undefined): "blocking" | "all" {
  const uri = celPath ? vscode.Uri.file(celPath) : undefined;
  const raw = vscode.workspace.getConfiguration("crl.cockpit", uri).get<string>("failedCriteriaMode");
  return raw === "all" ? "all" : "blocking";
}

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
    // #173 T3b: FOLD the failed-criteria mode INTO the render message so the webview sets the body class in the SAME
    // handler that swaps #root — atomic, no paint-flash of the wrong mode (disc 160 Claude-9). Both mode-sets are
    // already stamped server-side as data attributes; the body class just reveals the active one.
    void panel.webview.postMessage({ type: "render", html: rendered.html, fcMode: readFailedCriteriaMode(celPath) });
  }

  /** Persist a failed-criteria mode change from the toolbar — WRITES the shared config ONLY (the onDidChangeConfiguration
   *  handler is the single path that posts the new mode DOWN, so a manual settings edit behaves identically). Skips the
   *  write when unchanged so a redundant click doesn't round-trip through config + re-drive the other surface (disc 160). */
  function persistFailedCriteriaMode(next: "blocking" | "all"): void {
    if (!currentCel || next === readFailedCriteriaMode(currentCel)) return;
    // Target-less update = most-specific writable scope (Workspace if open, else Global) — IDENTICAL to the cockpit's
    // write (same window/workspace → same target), so the shared-config sync event fires for both surfaces.
    void vscode.workspace
      .getConfiguration("crl.cockpit", vscode.Uri.file(currentCel))
      .update("failedCriteriaMode", next)
      .then(undefined, (e) =>
        console.warn(`[crl.scenarioRunner] could not persist failedCriteriaMode: ${e instanceof Error ? e.message : e}`),
      );
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
        panel.webview.onDidReceiveMessage((msg: { type?: string; key?: string; mode?: string }) => {
          if (msg?.type === "reveal" && typeof msg.key === "string") revealSource(msg.key);
          // #173 T3b: the toolbar All/Blocking toggle. WRITE the shared config ONLY — the onDidChangeConfiguration
          // handler is the single path that posts the new mode back DOWN (strict write/read separation → no loop).
          else if (msg?.type === "fcMode" && (msg.mode === "blocking" || msg.mode === "all")) persistFailedCriteriaMode(msg.mode);
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

  // #173 T3b: the shared failed-criteria mode changed (from THIS toolbar's persist, the cockpit's toggle, or a manual
  // settings edit) — post the new mode DOWN so the webview flips the body class WITHOUT a re-render. Guarded on `panel`
  // (the config is window-scoped + shared with the cockpit, so this fires even when the scenario panel was never opened;
  // mirror saveWatch's `!panel` no-op). NO config WRITE here → no feedback loop with persistFailedCriteriaMode.
  const fcModeWatch = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!panel || !currentCel || !e.affectsConfiguration("crl.cockpit.failedCriteriaMode")) return;
    void panel.webview.postMessage({ type: "fcMode", mode: readFailedCriteriaMode(currentCel) });
  });

  context.subscriptions.push(runCmd, saveWatch, fcModeWatch);
}

/** Hermetic shell: strict CSP, a nonce'd inline script that swaps #root's HTML on a `render` message and
 *  event-delegates `[data-reveal]` clicks back to the host. No external/localResource URIs.
 *  #173 T3b: a persistent #fcToolbar (the All/Blocking failed-criteria toggle) sits ABOVE #root so it survives the
 *  innerHTML swap; the body class `fc-mode-blocking`/`fc-mode-all` (set from the render/fcMode message) reveals the
 *  matching server-stamped data-fc-* highlights CLIENT-SIDE — no host round-trip per toggle. */
function getShellHtml(): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${nonce}';`;
  const toolbar =
    `<div id="fcToolbar">` +
    `<span class="fc-label">Failed criteria:</span>` +
    `<button class="fc-btn" data-fc-mode="blocking">Blocking</button>` +
    `<button class="fc-btn" data-fc-mode="all">All</button>` +
    `<span class="fc-legend"><span class="fc-swatch-blk">▦</span> blocker &nbsp;<span class="fc-swatch-div">▦</span> diverted</span>` +
    `</div>`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${SCENARIO_STYLE}</style>` +
    `<title>Scenario Runner</title></head><body class="fc-mode-blocking">` +
    toolbar +
    `<div id="root">Running…</div>` +
    `<script nonce="${nonce}">` +
    `const vscode = acquireVsCodeApi();` +
    `const root = document.getElementById('root');` +
    `const tb = document.getElementById('fcToolbar');` +
    // Apply a mode: set the body class (reveals the matching highlights) + the active toolbar button. Idempotent.
    `const setMode = (mode) => { if (mode !== 'all' && mode !== 'blocking') return;` +
    `document.body.classList.remove('fc-mode-all','fc-mode-blocking'); document.body.classList.add('fc-mode-' + mode);` +
    `for (const b of tb.querySelectorAll('.fc-btn')) b.classList.toggle('fc-active', b.getAttribute('data-fc-mode') === mode); };` +
    `setMode('blocking');` +
    `window.addEventListener('message', (e) => { const m = e.data; if (!m) return;` +
    // The render message carries the current mode → swap #root AND set the mode atomically (no flash).
    `if (m.type === 'render') { root.innerHTML = m.html; if (m.fcMode) setMode(m.fcMode); }` +
    `else if (m.type === 'fcMode') setMode(m.mode); });` +
    `root.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-reveal]'); if (t) vscode.postMessage({ type: 'reveal', key: t.getAttribute('data-reveal') }); });` +
    // Toolbar clicks → ask the host to persist the mode (the host posts the new mode back DOWN via config change).
    `tb.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-fc-mode]'); if (b) vscode.postMessage({ type: 'fcMode', mode: b.getAttribute('data-fc-mode') }); });` +
    `</script></body></html>`
  );
}
