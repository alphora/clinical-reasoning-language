// Correspondence cockpit SHELL (thin vscode) — three-pane viewer C2a (#156).
// Wires the pure cores to VS Code: a CRL activity-bar navigator (TreeView) + three webview panes (Source rendered;
// CRL/CEL placeholders that participate in the reveal protocol). Holds the full ViewerModel; feeds the engine a COMPACT
// CockpitIndex; routes the engine's SEMANTIC reveal effects through the PaneRevealCoordinator → each pane's webview.
// The pure logic lives in correspondenceEngine / paneRevealCoordinator / sourcePaneHtml (all unit-tested);
// this file is the untested integration per the established split. Design: .vibe-tools/discussions/118-c2a-source-spine.md.
import { randomBytes } from "node:crypto";
import { basename } from "node:path";

import { buildCorrespondenceModel } from "@smile-digital-health/crl";
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";
import * as vscode from "vscode";

import {
  initialState,
  navigatorItems,
  reduce,
  type Action,
  type CockpitIndex,
  type Effect,
  type NavigatorItem,
  type Pane,
  type State,
} from "./correspondenceEngine";
import { PaneRevealCoordinator } from "./paneRevealCoordinator";
import { discoverProvenance, findPolicySrc } from "./provenanceFindings";
import { buildViewerModel, type ViewerModel } from "./provenanceViewer";
import { renderSourcePane, type OverlaySpan, type UnitSpan } from "./sourcePaneHtml";

const PANES: Pane[] = ["source", "crl", "cel"];
const COLUMN: Record<Pane, vscode.ViewColumn> = {
  source: vscode.ViewColumn.One,
  crl: vscode.ViewColumn.Two,
  cel: vscode.ViewColumn.Three,
};
const PANE_TITLE: Record<Pane, string> = { source: "Source", crl: "CRL", cel: "CEL" };
// Perf gate (disc 118): the measured full-render floor. Over → fall back to a navigation-only placeholder, don't freeze.
const MAX_SOURCE_CHARS = 200_000;
const MAX_SOURCE_MARKS = 2000;

interface PaneView {
  panel: vscode.WebviewPanel;
  gen: number;
  /** the indexVersion the current render was posted at — the authoritative freshness key (NOT trusted from the webview). */
  indexVersion: number;
  acked: boolean;
  anchors: Record<string, { scrollTo: string; segmentIds: string[] }>;
  reveals: Record<string, { unitId: string; range: ZeroBasedRange }>;
  disposables: vscode.Disposable[];
}

function toIndex(model: ViewerModel, version: number): CockpitIndex {
  return {
    version,
    anchorFilePath: model.anchor.filePath,
    steps: model.steps,
    sourceCycleIds: model.steps.filter((s) => s.source.length > 0).map((s) => s.unitId),
  };
}

export function registerCorrespondenceCockpit(context: vscode.ExtensionContext): void {
  // NOTE: crl.active is owned + gated (on workspace .crl/.cel content) by registerProvenancePanel — do NOT set it here.
  // An unconditional setContext at activation would surface both the provenance view and this navigator in EVERY window.

  let state: State = initialState();
  const coord = new PaneRevealCoordinator();
  let model: ViewerModel | undefined;
  let indexVersion = 0;
  let currentCel: string | undefined;
  /** last span-click locus (trusted, from the renderer) — open-raw uses it when it still matches the selection. */
  let lastClicked: { unitId: string; range: ZeroBasedRange } | undefined;
  const views = new Map<Pane, PaneView>();
  let watcher: vscode.FileSystemWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  // ── navigator TreeView (adapter over the headless navigatorItems model) ──
  const onNav = new vscode.EventEmitter<NavigatorItem | undefined>();
  const navProvider: vscode.TreeDataProvider<NavigatorItem> = {
    onDidChangeTreeData: onNav.event,
    getChildren: () => navigatorItems(state),
    getTreeItem: (it) => {
      const t = new vscode.TreeItem(it.label, vscode.TreeItemCollapsibleState.None);
      if (it.description) t.description = it.description;
      // A TreeItem command fires only on USER click/enter — programmatic reveal() does not invoke it, so no round-trip guard is needed.
      t.command = { command: "crl.cockpit.selectItem", title: "Select", arguments: [it.id] };
      return t;
    },
  };
  const navView = vscode.window.createTreeView<NavigatorItem>("crlCockpitNavigator", {
    treeDataProvider: navProvider,
  });

  // ── dispatch / effects ──
  function dispatch(action: Action): void {
    const { state: next, effects } = reduce(state, action);
    state = next;
    for (const e of effects) applyReveal(e);
    onNav.fire(undefined);
    reflectSelectionToTree();
  }

  function applyReveal(e: Effect): void {
    const v = views.get(e.pane);
    if (!v) return;
    coord.queueReveal(e.pane, e.target, indexVersion);
    // Steady-state flush ONLY when the pane's CURRENT render is acked AND is for the current index. During a rebuild
    // the global indexVersion has advanced past the still-acked old render, so this is skipped and the reveal waits for
    // the new render's ack (avoiding a flush against the about-to-be-replaced DOM that would also drop the new reveal).
    if (v.acked && v.indexVersion === indexVersion) {
      const target = coord.ready(e.pane, v.gen, v.indexVersion);
      if (target) postReveal(e.pane, target.id);
    }
  }

  function postReveal(pane: Pane, targetId: string): void {
    if (pane !== "source") return; // C2a: only the Source pane has anchors; crl/cel are placeholders
    const v = views.get(pane);
    const a = v?.anchors[targetId];
    if (!v || !a) return;
    void v.panel.webview.postMessage({ type: "highlight", gen: v.gen, scrollTo: a.scrollTo, segmentIds: a.segmentIds });
  }

  function reflectSelectionToTree(): void {
    const sel = state.selection;
    if (sel?.primary !== "source") return;
    const item = navigatorItems(state).find((i) => i.id === sel.unitId);
    if (item) void navView.reveal(item, { select: true, focus: false }).then(undefined, () => undefined);
  }

  // ── render a pane ──
  function renderPane(pane: Pane): void {
    const v = views.get(pane);
    if (!v || !model) return;
    const gen = coord.startRender(pane);
    v.gen = gen;
    v.indexVersion = indexVersion;
    v.acked = false;
    v.anchors = {};
    v.reveals = {};
    if (pane === "source") {
      const units: UnitSpan[] = model.steps.flatMap((s) =>
        s.source.map((loc) => ({ unitId: s.unitId, range: loc.range })),
      );
      const overlays: OverlaySpan[] = model.marks.source
        .filter((m) => m.kind === "uncovered" || m.kind === "ignored")
        .map((m) => ({ kind: m.kind as "uncovered" | "ignored", range: m.range }));
      const textLen = model.anchor.text.length;
      const markCount = units.length + overlays.length;
      if (textLen > MAX_SOURCE_CHARS || markCount > MAX_SOURCE_MARKS) {
        // Over the measured floor — STOP (per disc 118): post a navigation-only fallback rather than freeze the webview.
        console.warn(
          `[crl.cockpit] Source inline render skipped: ${textLen} chars, ${markCount} marks (> ${MAX_SOURCE_CHARS}/${MAX_SOURCE_MARKS}). Navigate + Open Raw still work.`,
        );
        const kb = Math.round(textLen / 1024);
        const html = `<p class="placeholder">Source is large (${kb} KB, ${markCount} marks) — inline render skipped. Use the navigator + “CRL: Open Raw Source at Locus”.</p>`;
        void v.panel.webview.postMessage({ type: "render", html, gen, indexVersion });
        return;
      }
      const r = renderSourcePane(model.anchor.text, units, overlays, { revealPrefix: `g${gen}_` });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    } else {
      // C2b/C2c TRAP: capability is set once at ensurePane(); when a pane becomes renderable it must be re-set there.
      const html = `<p class="placeholder">${PANE_TITLE[pane]} pane — coming in ${pane === "crl" ? "C2b" : "C2c"}.</p>`;
      void v.panel.webview.postMessage({ type: "render", html, gen, indexVersion });
    }
  }

  function renderEmpty(message: string): void {
    for (const v of views.values()) {
      const gen = coord.startRender(PANES.find((p) => views.get(p) === v)!);
      v.gen = gen;
      v.indexVersion = indexVersion;
      v.acked = false;
      v.anchors = {};
      v.reveals = {};
      void v.panel.webview.postMessage({ type: "render", html: `<p class="placeholder">${message}</p>`, gen, indexVersion });
    }
  }

  function onWebviewMessage(
    pane: Pane,
    msg: { type?: string; gen?: number; key?: string },
  ): void {
    const v = views.get(pane);
    if (!v) return;
    if (msg.type === "ready" && typeof msg.gen === "number") {
      if (msg.gen !== v.gen) return; // superseded render's ack
      v.acked = true;
      // Use the render's authoritative indexVersion (stored shell-side), NOT a value echoed by the untrusted webview.
      const target = coord.ready(pane, v.gen, v.indexVersion);
      if (target) postReveal(pane, target.id);
    } else if (msg.type === "reveal" && typeof msg.key === "string") {
      const hit = v.reveals[msg.key]; // trusted: looked up by opaque key, not a path/range from the webview
      if (hit) {
        lastClicked = { unitId: hit.unitId, range: hit.range };
        dispatch({ type: "select", selection: { primary: "source", unitId: hit.unitId } });
      }
    }
  }

  function ensurePane(pane: Pane): PaneView {
    let v = views.get(pane);
    if (v) return v;
    const panel = vscode.window.createWebviewPanel(
      `crlCockpit.${pane}`,
      PANE_TITLE[pane],
      { viewColumn: COLUMN[pane], preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = shellHtml();
    coord.setPaneCapability(pane, pane === "source" ? "renderable" : "placeholder");
    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((m) => onWebviewMessage(pane, m)),
    ];
    v = { panel, gen: 0, indexVersion: 0, acked: false, anchors: {}, reveals: {}, disposables };
    views.set(pane, v);
    panel.onDidDispose(() => {
      for (const d of disposables) d.dispose();
      coord.disposePane(pane);
      views.delete(pane);
    });
    return v;
  }

  // ── (re)build the model from the active .cel ──
  function rebuild(): void {
    if (!currentCel) return;
    const d = discoverProvenance(currentCel);
    if (!d.found) {
      resetToEmpty(`${basename(currentCel)}: ${d.reason}`);
      return;
    }
    try {
      model = buildViewerModel(buildCorrespondenceModel(d.artifactPath, currentCel, d.anchorPath));
    } catch (e) {
      resetToEmpty(`Failed to build provenance: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    indexVersion += 1;
    lastClicked = undefined;
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, indexVersion) });
    navView.message =
      state.index && state.index.sourceCycleIds.length === 0 ? "No source-linked units in this policy." : undefined;
    for (const pane of PANES) renderPane(pane);
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    lastClicked = undefined;
    indexVersion += 1;
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: { version: indexVersion, anchorFilePath: "", steps: [], sourceCycleIds: [] } });
    navView.message = message;
    renderEmpty(message);
  }

  function setupWatcher(): void {
    watcher?.dispose();
    watcher = undefined;
    if (!currentCel) return;
    const src = findPolicySrc(currentCel);
    const pat = src ? new vscode.RelativePattern(src, "{provenance/*.provenance.json,anchor-source/*.txt}") : undefined;
    if (!pat) return;
    watcher = vscode.workspace.createFileSystemWatcher(pat);
    const onFs = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    };
    watcher.onDidCreate(onFs);
    watcher.onDidChange(onFs);
    watcher.onDidDelete(onFs);
  }

  // ── commands ──
  const showCmd = vscode.commands.registerCommand("crl.cockpit.show", () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed || ed.document.uri.scheme !== "file" || !ed.document.uri.fsPath.toLowerCase().endsWith(".cel")) {
      void vscode.window.showInformationMessage("CRL Cockpit: open a .cel scenario file first.");
      return;
    }
    currentCel = ed.document.uri.fsPath;
    // Safe on-demand reveal (mirrors provenancePanel) — runs only when the user explicitly opens the cockpit on a .cel,
    // NOT unconditionally at activation. Ensures the navigator shows even if the gate's one-shot findFiles missed.
    void vscode.commands.executeCommand("setContext", "crl.active", true);
    for (const pane of PANES) if (state.paneVisibility[pane]) ensurePane(pane);
    setupWatcher();
    rebuild();
  });

  const selectItemCmd = vscode.commands.registerCommand("crl.cockpit.selectItem", (unitId: string) => {
    lastClicked = undefined; // navigator click → no specific span; open-raw falls back to the unit's earliest range
    dispatch({ type: "select", selection: { primary: "source", unitId } });
  });
  const nextCmd = vscode.commands.registerCommand("crl.cockpit.next", () => {
    lastClicked = undefined;
    dispatch({ type: "next" });
  });
  const prevCmd = vscode.commands.registerCommand("crl.cockpit.prev", () => {
    lastClicked = undefined;
    dispatch({ type: "prev" });
  });

  const openRawCmd = vscode.commands.registerCommand("crl.cockpit.openRaw", () => {
    // Open the anchor .txt at the clicked span's range when it still matches the selection, else the unit's earliest
    // source range. Locus is always from the trusted model / renderer, never a webview payload.
    if (!model || state.selection?.primary !== "source") {
      void vscode.window.showInformationMessage("CRL Cockpit: select a source unit first.");
      return;
    }
    const unitId = state.selection.unitId;
    const step = model.steps.find((s) => s.unitId === unitId);
    const range = lastClicked?.unitId === unitId ? lastClicked.range : step?.source[0]?.range;
    if (!range) {
      void vscode.window.showInformationMessage("CRL Cockpit: this unit has no source span.");
      return;
    }
    void vscode.window.showTextDocument(vscode.Uri.file(model.anchor.filePath), {
      selection: new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol),
      viewColumn: vscode.ViewColumn.Active,
    });
  });

  navView.message = "Open a .cel and run “CRL: Show Cockpit”.";
  context.subscriptions.push(
    navView,
    showCmd,
    selectItemCmd,
    nextCmd,
    prevCmd,
    openRawCmd,
    { dispose: () => watcher?.dispose() },
  );
}

/** Hermetic webview shell (strict CSP + nonce). Swaps #root on `render` + acks `ready`; `highlight` (gen-checked) toggles
 *  `.current` + scrolls; clicks on `[data-reveal]` post the opaque key back. No external resources. */
function shellHtml(): string {
  const nonce = randomBytes(16).toString("base64");
  const styleNonce = randomBytes(16).toString("base64");
  const csp = `default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${nonce}';`;
  const style = `body{font:13px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);white-space:pre-wrap;padding:8px}
.covered{background:var(--vscode-editor-findMatchHighlightBackground,rgba(100,170,255,.18))}
.uncovered{background:var(--vscode-diffEditor-removedTextBackground,rgba(255,170,80,.22))}
.ignored{opacity:.55}
.current{outline:2px solid var(--vscode-focusBorder,#3794ff);background:var(--vscode-editor-findMatchBackground,rgba(100,170,255,.4))}
[data-reveal]{cursor:pointer}.placeholder{opacity:.6;font-style:italic}`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${style}</style></head><body><div id="root"></div>` +
    `<script nonce="${nonce}">` +
    `const v=acquireVsCodeApi();const root=document.getElementById('root');let gen=-1;` +
    `window.addEventListener('message',(e)=>{const m=e.data;` +
    `if(m.type==='render'){gen=m.gen;root.innerHTML=m.html;v.postMessage({type:'ready',gen:m.gen,indexVersion:m.indexVersion});}` +
    `else if(m.type==='highlight'){if(m.gen!==gen)return;` + // drop a reveal aimed at a superseded render
    `for(const el of root.querySelectorAll('.current'))el.classList.remove('current');` +
    `for(const id of m.segmentIds){const el=document.getElementById(id);if(el)el.classList.add('current');}` +
    `const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}});` +
    `root.addEventListener('click',(e)=>{const t=e.target.closest&&e.target.closest('[data-reveal]');` +
    `if(t)v.postMessage({type:'reveal',key:t.getAttribute('data-reveal')});});` +
    `</script></body></html>`
  );
}
