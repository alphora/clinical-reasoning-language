// Correspondence cockpit SHELL (thin vscode) — three-pane viewer C2a (#156).
// Wires the pure cores to VS Code: a CRL activity-bar navigator (TreeView) + three webview panes (Source rendered;
// CRL/CEL placeholders that participate in the reveal protocol). Holds the full ViewerModel; feeds the engine a COMPACT
// CockpitIndex; routes the engine's SEMANTIC reveal effects through the PaneRevealCoordinator → each pane's webview.
// The pure logic lives in correspondenceEngine / paneRevealCoordinator / sourcePaneHtml (all unit-tested);
// this file is the untested integration per the established split. Design: .vibe-tools/discussions/118-c2a-source-spine.md.
import { randomBytes } from "node:crypto";
import { basename, isAbsolute, relative, sep } from "node:path";

import {
  buildCockpitModel,
  type CorrespondenceModel,
  type CrlDecisionStructure,
  type CrlStructureNode,
} from "@smile-digital-health/crl";
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";
import * as vscode from "vscode";

import {
  initialState,
  navigatorItems,
  reduce,
  type Action,
  type CockpitIndex,
  type CrlNavItem,
  type Effect,
  type NavigatorItem,
  type Pane,
  type Selection,
  type State,
} from "./correspondenceEngine";
import { renderCrlPane } from "./crlPaneHtml";
import { buildCrlRevealMaps, rowNodeKeysForUnit, unitsForRow, type CrlRevealMaps } from "./crlRevealMaps";
import { CANONICAL_PANE_ORDER, normalizePaneOrder } from "./paneOrder";
import { PaneRevealCoordinator, type SemanticTarget } from "./paneRevealCoordinator";
import { discoverProvenance, findPolicySrc } from "./provenanceFindings";
import { buildViewerModel, type ViewerModel } from "./provenanceViewer";
import { renderSourcePane, type OverlaySpan, type UnitSpan } from "./sourcePaneHtml";

const PANES: Pane[] = ["source", "crl", "cel"];
// Column slots by position (explicit, not ViewColumn arithmetic). A pane's column = its index among the OPEN panes in
// the user's paneOrder (so hiding a pane never leaves a column gap).
const ORDERED_COLUMNS = [vscode.ViewColumn.One, vscode.ViewColumn.Two, vscode.ViewColumn.Three];
const PANE_TITLE: Record<Pane, string> = { source: "Source", crl: "CRL", cel: "CEL" };
// Perf gate (disc 118): the measured full-render floor. Over → fall back to a navigation-only placeholder, don't freeze.
const MAX_SOURCE_CHARS = 200_000;
const MAX_SOURCE_MARKS = 2000;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

interface PaneView {
  panel: vscode.WebviewPanel;
  gen: number;
  /** the indexVersion the current render was posted at — the authoritative freshness key (NOT trusted from the webview). */
  indexVersion: number;
  acked: boolean;
  /** Source: keyed by unitId. CRL: keyed by row nodeKey. Value is the row/segment element(s) to highlight. */
  anchors: Record<string, { scrollTo: string; segmentIds: string[] }>;
  /** Per-pane click payload: source spans carry {unitId,range}; CRL rows carry {nodeKey}. */
  reveals: Record<string, { unitId: string; range: ZeroBasedRange } | { nodeKey: string }>;
  disposables: vscode.Disposable[];
}

/** CRL nav list — pre-order flatten of the structure (roots + when/otherwise/action); the crl-primary cycle/selectable
 *  set + a SUPERSET of every row a source unit can map to. Description = the owning decision (flat labels duplicate). */
function toCrlNav(structure: CrlDecisionStructure[]): CrlNavItem[] {
  const out: CrlNavItem[] = [];
  const walk = (nodes: CrlStructureNode[]): void => {
    for (const n of nodes) {
      out.push({ nodeKey: n.nodeKey, label: n.label, description: n.decision });
      walk(n.children);
    }
  };
  for (const d of structure) {
    out.push({ nodeKey: d.nodeKey, label: `decision "${d.decision}"` });
    walk(d.children);
  }
  return out;
}

function toIndex(model: ViewerModel, structure: CrlDecisionStructure[], version: number): CockpitIndex {
  return {
    version,
    anchorFilePath: model.anchor.filePath,
    steps: model.steps,
    sourceCycleIds: model.steps.filter((s) => s.source.length > 0).map((s) => s.unitId),
    crlNav: toCrlNav(structure),
  };
}

export function registerCorrespondenceCockpit(context: vscode.ExtensionContext): void {
  // NOTE: crl.active is owned + gated (on workspace .crl/.cel content) by registerProvenancePanel — do NOT set it here.
  // An unconditional setContext at activation would surface both the provenance view and this navigator in EVERY window.

  let state: State = initialState();
  const coord = new PaneRevealCoordinator();
  let model: ViewerModel | undefined;
  let correspondence: CorrespondenceModel | undefined;
  let crlStructure: CrlDecisionStructure[] = [];
  let crlMaps: CrlRevealMaps | undefined;
  let indexVersion = 0;
  let currentCel: string | undefined;
  /** last span-click locus (trusted, from the renderer) — open-raw uses it when it still matches the selection. */
  let lastClicked: { unitId: string; range: ZeroBasedRange } | undefined;
  const views = new Map<Pane, PaneView>();
  let paneOrder: Pane[] = [...CANONICAL_PANE_ORDER]; // user layout (crl.correspondence.paneOrder), normalized
  let watcher: vscode.FileSystemWatcher | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let orderDebounce: ReturnType<typeof setTimeout> | undefined;

  /** The column a pane opens in = its index among the OPEN panes in paneOrder (panels already created PLUS the one being
   *  opened) — gap-free when a pane is hidden. Uses `views` (the same runtime signal applyPaneOrder uses) so creation-time
   *  and live-reorder columns stay in lockstep — keep both predicates `views`-based. */
  const columnFor = (paneToOpen: Pane): vscode.ViewColumn => {
    const open = paneOrder.filter((p) => views.has(p) || p === paneToOpen);
    return ORDERED_COLUMNS[Math.max(0, open.indexOf(paneToOpen))] ?? vscode.ViewColumn.One;
  };

  /** Reassert the full pane layout from paneOrder by revealing each OPEN panel at its slot (ascending column). */
  const applyPaneOrder = (): void => {
    const open = paneOrder.filter((p) => views.has(p));
    open.forEach((pane, i) => views.get(pane)?.panel.reveal(ORDERED_COLUMNS[i] ?? vscode.ViewColumn.One, true));
  };

  // ── navigator TreeView (adapter over the headless navigatorItems model) ──
  const onNav = new vscode.EventEmitter<NavigatorItem | undefined>();
  const navProvider: vscode.TreeDataProvider<NavigatorItem> = {
    onDidChangeTreeData: onNav.event,
    getChildren: () => navigatorItems(state),
    // reveal() requires getParent (flat list → all roots) + a stable TreeItem.id, so reflecting a pane-driven selection
    // back to the navigator matches the rendered item across refreshes (navigatorItems returns fresh objects each call).
    getParent: () => undefined,
    getTreeItem: (it) => {
      const t = new vscode.TreeItem(it.label, vscode.TreeItemCollapsibleState.None);
      t.id = it.id;
      if (it.description) t.description = it.description;
      // A TreeItem command fires only on USER click/enter — programmatic reveal() does not invoke it, so no round-trip guard is needed.
      t.command = { command: "crl.cockpit.selectItem", title: "Select", arguments: [it.selection] };
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
      if (target) postReveal(e.pane, target);
    }
  }

  /** Post a highlight for a set of anchor keys (source anchors keyed by unitId; CRL anchors by nodeKey). Accumulates
   *  segmentIds across all keys + scrolls to the first found — so a target spanning N units/rows highlights them all. */
  function highlightRows(v: PaneView, anchorKeys: string[]): void {
    const segmentIds: string[] = [];
    let scrollTo: string | undefined;
    for (const k of anchorKeys) {
      const a = v.anchors[k];
      if (!a) continue;
      if (!scrollTo) scrollTo = a.scrollTo;
      for (const id of a.segmentIds) if (!segmentIds.includes(id)) segmentIds.push(id);
    }
    // No anchor for this selection in this pane → CLEAR its prior highlight rather than leave it stale.
    void v.panel.webview.postMessage(
      scrollTo ? { type: "highlight", gen: v.gen, scrollTo, segmentIds } : { type: "clearHighlight" },
    );
  }

  /** Resolve a SEMANTIC reveal target to a pane's anchor keys (the 2×2 of target.kind × pane), then highlight. */
  function postReveal(pane: Pane, target: SemanticTarget): void {
    const v = views.get(pane);
    if (!v) return;
    if (target.kind === "unit") {
      if (pane === "source") highlightRows(v, [target.id]); // source anchors keyed by unitId
      else if (pane === "crl" && crlMaps) highlightRows(v, rowNodeKeysForUnit(target.id, crlMaps)); // unit → its CRL rows
    } else if (target.kind === "crlNode") {
      if (pane === "crl") highlightRows(v, [target.id]); // CRL anchors keyed by nodeKey
      else if (pane === "source" && crlMaps) highlightRows(v, unitsForRow(target.id, crlMaps)); // crl node → its source units
    }
    // cel: placeholder — no-op (C2c)
  }

  function clearAllHighlights(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearHighlight" });
  }

  function updateNavMessage(): void {
    const empty = navigatorItems(state).length === 0;
    navView.message = empty
      ? state.primary === "crl"
        ? "No CRL decisions in this policy."
        : "No source-linked units in this policy."
      : undefined;
  }

  function reflectSelectionToTree(): void {
    const sel = state.selection;
    // only reflect when the selection is in the CURRENT primary's space (the navigator shows that space)
    if (!sel || sel.primary !== state.primary) return;
    const id = sel.primary === "source" ? sel.unitId : sel.primary === "crl" ? sel.nodeKey : undefined;
    if (id === undefined) return;
    const item = navigatorItems(state).find((i) => i.id === id);
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
    } else if (pane === "crl") {
      const r = renderCrlPane(crlStructure, { revealPrefix: `g${gen}_` });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    } else {
      // CEL pane — placeholder until C2c. (Capability is set per-pane at ensurePane; CEL stays "placeholder".)
      const html = `<p class="placeholder">CEL pane — coming in C2c.</p>`;
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
      void v.panel.webview.postMessage({ type: "render", html: `<p class="placeholder">${escapeHtml(message)}</p>`, gen, indexVersion });
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
      if (target) postReveal(pane, target);
    } else if (msg.type === "reveal" && typeof msg.key === "string") {
      const hit = v.reveals[msg.key]; // trusted: looked up by opaque key, not a path/range from the webview
      if (!hit) return;
      // A click sets the selection in the CURRENT primary's space (mapping cross-pane as needed).
      if ("unitId" in hit) {
        if (state.primary === "crl") {
          onSourceClickCrlPrimary(hit.unitId); // map the source span → its CRL node(s)
        } else {
          // Source span click, source-primary → select that source unit (records the clicked locus for open-raw).
          lastClicked = { unitId: hit.unitId, range: hit.range };
          dispatch({ type: "select", selection: { primary: "source", unitId: hit.unitId } });
        }
      } else {
        if (state.primary === "crl") {
          dispatch({ type: "select", selection: { primary: "crl", nodeKey: hit.nodeKey } }); // CRL row click, crl-primary
        } else {
          onCrlClick(hit.nodeKey); // source-primary → map the CRL row → its source unit(s)
        }
      }
    }
  }

  /** Async-safe pick-then-select: filters a stale pick after a rebuild. */
  function pickThenSelect<T>(items: (vscode.QuickPickItem & { value: T })[], placeHolder: string, toSel: (v: T) => Selection): void {
    const ver = indexVersion;
    void vscode.window.showQuickPick(items, { placeHolder }).then((pick) => {
      if (pick && indexVersion === ver) dispatch({ type: "select", selection: toSel(pick.value) });
    });
  }

  /** Source-primary CRL-row click → its candidate source-bearing units (branch-scoped) → select (1) / quick-pick (>1) / no-op (0). */
  function onCrlClick(nodeKey: string): void {
    if (!crlMaps) return;
    const candidates = unitsForRow(nodeKey, crlMaps);
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      dispatch({ type: "select", selection: { primary: "source", unitId: candidates[0] } });
      return;
    }
    pickThenSelect(
      candidates.map((id) => ({ label: correspondence?.units.find((u) => u.id === id)?.label ?? id, description: id, value: id })),
      "This CRL node maps to multiple source units",
      (id) => ({ primary: "source", unitId: id }),
    );
  }

  /** CRL-primary source-span click → its candidate CRL rows (branch-scoped) → select the crl node (1) / quick-pick (>1) / no-op (0). */
  function onSourceClickCrlPrimary(unitId: string): void {
    if (!crlMaps) return;
    const rows = rowNodeKeysForUnit(unitId, crlMaps);
    if (rows.length === 0) return;
    if (rows.length === 1) {
      dispatch({ type: "select", selection: { primary: "crl", nodeKey: rows[0] } });
      return;
    }
    const navByKey = new Map((state.index?.crlNav ?? []).map((n) => [n.nodeKey, n]));
    pickThenSelect(
      rows.map((nk) => ({ label: navByKey.get(nk)?.label ?? nk, description: navByKey.get(nk)?.description, value: nk })),
      "This source span maps to multiple CRL nodes",
      (nk) => ({ primary: "crl", nodeKey: nk }),
    );
  }

  function ensurePane(pane: Pane): PaneView {
    let v = views.get(pane);
    if (v) return v;
    const panel = vscode.window.createWebviewPanel(
      `crlCockpit.${pane}`,
      PANE_TITLE[pane],
      { viewColumn: columnFor(pane), preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = shellHtml();
    coord.setPaneCapability(pane, pane === "cel" ? "placeholder" : "renderable"); // CEL renderable in C2c
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
      const cm = buildCockpitModel(d.artifactPath, currentCel, d.anchorPath); // resolve ONCE → correspondence + structure
      correspondence = cm.correspondence;
      crlStructure = cm.crlStructure;
      model = buildViewerModel(cm.correspondence);
    } catch (e) {
      resetToEmpty(`Failed to build provenance: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    indexVersion += 1;
    lastClicked = undefined;
    crlMaps = buildCrlRevealMaps(correspondence, crlStructure);
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, crlStructure, indexVersion) });
    updateNavMessage();
    for (const pane of PANES) renderPane(pane);
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    correspondence = undefined;
    crlStructure = [];
    crlMaps = undefined;
    lastClicked = undefined;
    indexVersion += 1;
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: { version: indexVersion, anchorFilePath: "", steps: [], sourceCycleIds: [], crlNav: [] } });
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
    // Apply the persisted default primary BEFORE the first rebuild's navigator render (else it flips visibly).
    const pref = vscode.workspace.getConfiguration("crl.correspondence", ed.document.uri).get<string>("primary");
    if (pref === "crl" || pref === "source") state = reduce(state, { type: "setPrimary", primary: pref }).state;
    // paneOrder is window-scoped (User settings = global/cross-project; Workspace settings = per-project) — read with the
    // .cel resource URI so a workspace/folder override is honored; open panes in that order.
    paneOrder = normalizePaneOrder(
      vscode.workspace.getConfiguration("crl.correspondence", ed.document.uri).get("paneOrder"),
    );
    for (const pane of paneOrder) if (state.paneVisibility[pane]) ensurePane(pane);
    setupWatcher();
    rebuild();
  });

  const togglePrimaryCmd = vscode.commands.registerCommand("crl.cockpit.togglePrimary", () => {
    if (!currentCel || !model) return; // not shown yet → don't flip + persist a default before the cockpit exists
    const next: Pane = state.primary === "crl" ? "source" : "crl";
    for (const pane of PANES) coord.clearPending(pane); // drop reveals queued under the old primary
    dispatch({ type: "setPrimary", primary: next }); // clears selection + refreshes the navigator
    clearAllHighlights(); // setPrimary emits no reveals → drop the now-orphaned highlights
    updateNavMessage();
    void vscode.workspace
      .getConfiguration("crl.correspondence", vscode.Uri.file(currentCel))
      .update("primary", next) // most-specific writable scope (workspace if open, else global)
      .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist primary: ${e instanceof Error ? e.message : e}`));
  });

  const selectItemCmd = vscode.commands.registerCommand("crl.cockpit.selectItem", (selection: Selection) => {
    lastClicked = undefined; // navigator click → no specific span; open-raw falls back to the unit's earliest range
    dispatch({ type: "select", selection });
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

  // Rebuild on a save of the active .cel or a policy .crl (the rendered CRL pane reflects the resolved graph; re-resolve
  // picks up logic edits even before the artifact is re-emitted). The FileSystemWatcher above covers artifact/anchor regen.
  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!currentCel) return;
    const p = doc.uri.fsPath;
    const src = findPolicySrc(currentCel);
    const under = (f: string): boolean => {
      if (!src) return false;
      const r = relative(src, f);
      return r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
    };
    if (p === currentCel || (p.toLowerCase().endsWith(".crl") && under(p))) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(rebuild, 150);
    }
  });

  // Live pane reorder on a paneOrder setting change (debounced — settings.json edits fire per keystroke-settle). Gated on
  // affectsConfiguration + currentCel. (application scope: an edit in another window may only take effect on reload — fine.)
  const onConfig = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!currentCel || !e.affectsConfiguration("crl.correspondence.paneOrder")) return;
    if (orderDebounce) clearTimeout(orderDebounce);
    orderDebounce = setTimeout(() => {
      const uri = currentCel ? vscode.Uri.file(currentCel) : undefined;
      paneOrder = normalizePaneOrder(vscode.workspace.getConfiguration("crl.correspondence", uri).get("paneOrder"));
      applyPaneOrder();
    }, 150);
  });

  navView.message = "Open a .cel and run “CRL: Show Cockpit”.";
  context.subscriptions.push(
    navView,
    showCmd,
    togglePrimaryCmd,
    selectItemCmd,
    nextCmd,
    prevCmd,
    openRawCmd,
    onSave,
    onConfig,
    {
      dispose: () => {
        watcher?.dispose();
        if (debounce) clearTimeout(debounce); // a pending rebuild/reorder must not fire on disposed panels
        if (orderDebounce) clearTimeout(orderDebounce);
      },
    },
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
[data-reveal]{cursor:pointer}.placeholder{opacity:.6;font-style:italic}
.crl-node{display:block;padding:1px 4px;border-radius:2px}
.crl-decision{font-weight:bold;margin-top:4px}
.crl-node.when{color:var(--vscode-symbolIcon-keywordForeground,#c586c0)}
.crl-node.otherwise{opacity:.75;font-style:italic}
.crl-node.action{color:var(--vscode-symbolIcon-functionForeground,#dcdcaa)}
.crl-node.use-decision{text-decoration:underline}`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${style}</style></head><body><div id="root"></div>` +
    `<script nonce="${nonce}">` +
    `const v=acquireVsCodeApi();const root=document.getElementById('root');let gen=-1;` +
    `window.addEventListener('message',(e)=>{const m=e.data;` +
    `if(m.type==='render'){gen=m.gen;root.innerHTML=m.html;v.postMessage({type:'ready',gen:m.gen,indexVersion:m.indexVersion});}` +
    `else if(m.type==='clearHighlight'){for(const el of root.querySelectorAll('.current'))el.classList.remove('current');}` +
    `else if(m.type==='highlight'){if(m.gen!==gen)return;` + // drop a reveal aimed at a superseded render
    `for(const el of root.querySelectorAll('.current'))el.classList.remove('current');` +
    `for(const id of m.segmentIds){const el=document.getElementById(id);if(el)el.classList.add('current');}` +
    `const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}});` +
    `root.addEventListener('click',(e)=>{const t=e.target.closest&&e.target.closest('[data-reveal]');` +
    `if(t)v.postMessage({type:'reveal',key:t.getAttribute('data-reveal')});});` +
    `</script></body></html>`
  );
}
