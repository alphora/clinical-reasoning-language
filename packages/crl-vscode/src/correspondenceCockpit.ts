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
  type RenderScenarioResult,
} from "@smile-digital-health/crl";
import type { ZeroBasedRange } from "@smile-digital-health/crl/language-services";
import * as vscode from "vscode";

import {
  initialState,
  navigatorItems,
  reduce,
  type Action,
  type CelNavItem,
  type CockpitIndex,
  type CrlNavItem,
  type Effect,
  type NavigatorItem,
  type Pane,
  type Selection,
  type State,
} from "./correspondenceEngine";
import { renderCelPane } from "./celPaneHtml";
import { renderCrlPane } from "./crlPaneHtml";
import {
  buildCrlRevealMaps,
  caseIdsForNode,
  caseIdsForUnit,
  rowNodeKeysForUnit,
  rowsForConcept,
  unitsForCase,
  unitsForConcept,
  unitsForRow,
  type CrlRevealMaps,
} from "./crlRevealMaps";
import { CANONICAL_PANE_ORDER, normalizePaneOrder } from "./paneOrder";
import { isFactHit, type RevealHit, type WebviewHit } from "./webviewHit";
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
  /** Source: keyed by unitId. CRL: keyed by row nodeKey. CEL: case blocks by caseId, fact peeks by `fact:` key. */
  anchors: Record<string, { scrollTo: string; segmentIds: string[] }>;
  /** Per-pane click payload (a WebviewHit): source spans → {unitId,range}; CRL rows → {nodeKey}; CEL cases → {caseId};
   *  CEL facts → {conceptKey,factAnchorKey} (a peek, NOT an engine selection — routed before mapHitToPrimary). */
  reveals: Record<string, WebviewHit>;
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

/** CEL nav list — one item per scenario case that HAS a frozen caseId (the join key); un-frozen cases render in the pane
 *  but aren't navigable/reveal targets. Label = case name, description = pass/fail/error. */
function toCelNav(scenarios: RenderScenarioResult, caseIdByName: Record<string, string>): CelNavItem[] {
  const out: CelNavItem[] = [];
  for (const sc of scenarios.scenarios) {
    const caseId = caseIdByName[sc.case.name];
    if (caseId !== undefined) out.push({ caseId, label: sc.case.name, description: sc.status });
  }
  return out;
}

function toIndex(
  model: ViewerModel,
  structure: CrlDecisionStructure[],
  celNav: CelNavItem[],
  version: number,
): CockpitIndex {
  return {
    version,
    anchorFilePath: model.anchor.filePath,
    steps: model.steps,
    sourceCycleIds: model.steps.filter((s) => s.source.length > 0).map((s) => s.unitId),
    crlNav: toCrlNav(structure),
    celNav,
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
  let scenarios: RenderScenarioResult | undefined;
  let caseIdByName: Record<string, string> = {};
  /** Concept keys that have ≥1 source-bearing unit OR ≥1 CRL row — the gate for a fact being a clickable peek anchor
   *  (recomputed from crlMaps each rebuild; read at CEL render time, mirroring caseIdByName). */
  let revealableConceptKeys: ReadonlySet<string> = new Set();
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

  /** Case → the CRL rows of all its units (branch-scoped per unit; a case legitimately spans branches). */
  function rowsForCase(caseId: string): string[] {
    if (!crlMaps) return [];
    const rows: string[] = [];
    for (const u of unitsForCase(caseId, crlMaps))
      for (const r of rowNodeKeysForUnit(u, crlMaps)) if (!rows.includes(r)) rows.push(r);
    return rows;
  }

  /** Resolve a SEMANTIC reveal target to a pane's anchor keys (3×3 of target.kind × pane), then highlight.
   *  Anchor keys per pane: source by unitId, crl by nodeKey, cel by caseId. Cross-resolutions go via the unit maps. */
  function postReveal(pane: Pane, target: SemanticTarget): void {
    const v = views.get(pane);
    if (!v || !crlMaps) return;
    const m = crlMaps;
    if (target.kind === "unit") {
      if (pane === "source") highlightRows(v, [target.id]);
      else if (pane === "crl") highlightRows(v, rowNodeKeysForUnit(target.id, m)); // unit → its CRL rows (branch-scoped)
      else highlightRows(v, caseIdsForUnit(target.id, m)); // unit → its CEL cases
    } else if (target.kind === "crlNode") {
      if (pane === "crl") highlightRows(v, [target.id]);
      else if (pane === "source") highlightRows(v, unitsForRow(target.id, m)); // crl node → its source units
      else highlightRows(v, caseIdsForNode(target.id, m)); // crl node → its CEL cases
    } else {
      // celCase
      if (pane === "cel") highlightRows(v, [target.id]);
      else if (pane === "source") highlightRows(v, unitsForCase(target.id, m).filter((u) => m.sourceBearingUnits.has(u)));
      else highlightRows(v, rowsForCase(target.id)); // case → its CRL rows
    }
  }

  function clearAllHighlights(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearHighlight" });
  }

  /** Fact peek (C2c-2): a transient cross-pane highlight of a CEL fact's CONCEPT — shell-side, NO engine selection (so
   *  it never perturbs the navigator/coord/selection). Clears all panes FIRST so the peek is self-consistent; the next
   *  engine reveal (selection / next / prev / primary-switch) touches every visible pane (highlightRows clears-on-empty)
   *  and so wipes the peek. Posts directly to the webview (bypassing the coordinator, like clearAllHighlights) — safe
   *  because a click only fires from an acked DOM and the shell drops a highlight whose gen ≠ the rendered gen; the
   *  segmentIds are read LIVE from crlMaps/v.anchors, not a stale snapshot. A *clickable* fact's concept is in
   *  revealableConceptKeys ⇒ at least one of the source/crl arms is non-empty, so a peek is never a blank clear. */
  function peekConcept(hit: { conceptKey: string; factAnchorKey: string }): void {
    clearAllHighlights(); // clear first → even a no-maps peek wipes any stale highlight
    if (!crlMaps) return;
    const src = views.get("source");
    const crl = views.get("crl");
    const cel = views.get("cel");
    if (src) highlightRows(src, unitsForConcept(hit.conceptKey, crlMaps)); // concept → source-bearing units
    if (crl) highlightRows(crl, rowsForConcept(hit.conceptKey, crlMaps)); // concept → CRL rows that reference it
    if (cel) highlightRows(cel, [hit.factAnchorKey]); // self-highlight the clicked fact span
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
    const id = sel.primary === "source" ? sel.unitId : sel.primary === "crl" ? sel.nodeKey : sel.caseId;
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
      // CEL pane — condensed scenario cases (C2c-1).
      const r = scenarios
        ? renderCelPane(scenarios, caseIdByName, { revealPrefix: `g${gen}_`, revealableConceptKeys })
        : { html: '<p class="placeholder">No CEL.</p>', anchors: {}, reveals: {} };
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
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
      // A fact peek is transient + shell-only — divert it BEFORE the engine-selection path (no lastClicked, no dispatch)
      // AND before the !crlMaps guard, so a peek always clears prior highlights even if maps are momentarily absent.
      if (isFactHit(hit)) {
        peekConcept(hit);
        return;
      }
      if (!crlMaps) return;
      // Otherwise the click sets the selection in the CURRENT primary's space (mapping cross-pane as needed).
      const p = state.primary;
      // record the open-raw locus only for a source-span click while source-primary
      lastClicked = "unitId" in hit && p === "source" ? { unitId: hit.unitId, range: hit.range } : undefined;
      selectInPrimary(mapHitToPrimary(hit, p, crlMaps), p);
    }
  }

  /** Map a webview click hit → the candidate ids in the CURRENT primary's space (the 3×3 click matrix; cross arms via maps).
   *  NOTE: keep the cross-arm maps here in lockstep with postReveal's 3×3 (same helpers, different direction). */
  function mapHitToPrimary(hit: RevealHit, primary: Pane, m: CrlRevealMaps): string[] {
    if ("unitId" in hit)
      return primary === "source" ? [hit.unitId] : primary === "crl" ? rowNodeKeysForUnit(hit.unitId, m) : caseIdsForUnit(hit.unitId, m);
    if ("nodeKey" in hit)
      return primary === "crl" ? [hit.nodeKey] : primary === "source" ? unitsForRow(hit.nodeKey, m) : caseIdsForNode(hit.nodeKey, m);
    return primary === "cel"
      ? [hit.caseId]
      : primary === "source"
        ? unitsForCase(hit.caseId, m).filter((u) => m.sourceBearingUnits.has(u))
        : rowsForCase(hit.caseId);
  }

  const selOf = (primary: Pane, id: string): Selection =>
    primary === "source" ? { primary: "source", unitId: id } : primary === "crl" ? { primary: "crl", nodeKey: id } : { primary: "cel", caseId: id };

  function labelInPrimary(id: string, primary: Pane): { label: string; description?: string } {
    if (primary === "source") return { label: correspondence?.units.find((u) => u.id === id)?.label ?? id, description: id };
    if (primary === "crl") {
      const n = state.index?.crlNav.find((x) => x.nodeKey === id);
      return { label: n?.label ?? id, description: n?.description };
    }
    const n = state.index?.celNav.find((x) => x.caseId === id);
    return { label: n?.label ?? id, description: n?.description };
  }

  /** Async-safe pick-then-select: drops a stale pick after a rebuild OR a primary switch (the engine select-guard is the
   *  backstop, but guarding here avoids dispatching a known-stale selection). */
  function pickThenSelect<T>(items: (vscode.QuickPickItem & { value: T })[], placeHolder: string, toSel: (v: T) => Selection): void {
    const ver = indexVersion;
    const pri = state.primary;
    void vscode.window.showQuickPick(items, { placeHolder }).then((pick) => {
      if (pick && indexVersion === ver && state.primary === pri) dispatch({ type: "select", selection: toSel(pick.value) });
    });
  }

  /** Select the mapped target in `primary`: 1 → select; >1 → quick-pick; 0 → no-op. */
  function selectInPrimary(ids: string[], primary: Pane): void {
    if (ids.length === 0) return;
    if (ids.length === 1) {
      dispatch({ type: "select", selection: selOf(primary, ids[0]) });
      return;
    }
    pickThenSelect(
      ids.map((id) => ({ ...labelInPrimary(id, primary), value: id })),
      `Maps to multiple ${PANE_TITLE[primary]} targets`,
      (id) => selOf(primary, id),
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
    coord.setPaneCapability(pane, "renderable"); // all three panes render (CEL lit up in C2c-1)
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
      const cm = buildCockpitModel(d.artifactPath, currentCel, d.anchorPath); // resolve ONCE → corr + structure + scenarios
      correspondence = cm.correspondence;
      crlStructure = cm.crlStructure;
      scenarios = cm.scenarios;
      caseIdByName = cm.caseIdByName;
      if (cm.caseNameCollisions.length)
        console.warn(
          `[crl.cockpit] CEL has cases sharing a name (${cm.caseNameCollisions.join(", ")}) — those cases render but aren't cross-pane reveal targets; give each a distinct name.`,
        );
      model = buildViewerModel(cm.correspondence);
    } catch (e) {
      resetToEmpty(`Failed to build provenance: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    indexVersion += 1;
    lastClicked = undefined;
    crlMaps = buildCrlRevealMaps(correspondence, crlStructure);
    // A concept key is fact-clickable iff it has ≥1 source-bearing unit OR ≥1 CRL row (the two map key spaces are
    // independent — has-unit and has-row are separate quadrants). The fact-side kind guard (definedBy.kind==="concept")
    // is applied in renderCelPane; this set just drops concepts with no correspondence to reveal.
    const m = crlMaps;
    revealableConceptKeys = new Set<string>([
      ...[...m.keyToUnitIds].filter(([, units]) => units.some((u) => m.sourceBearingUnits.has(u))).map(([k]) => k),
      ...m.keyToRowNodeKeys.keys(),
    ]);
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, crlStructure, toCelNav(scenarios, caseIdByName), indexVersion) });
    updateNavMessage();
    for (const pane of PANES) renderPane(pane);
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    correspondence = undefined;
    crlStructure = [];
    crlMaps = undefined;
    scenarios = undefined;
    caseIdByName = {};
    revealableConceptKeys = new Set();
    lastClicked = undefined;
    indexVersion += 1;
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: { version: indexVersion, anchorFilePath: "", steps: [], sourceCycleIds: [], crlNav: [], celNav: [] } });
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
    if (pref === "crl" || pref === "source" || pref === "cel") state = reduce(state, { type: "setPrimary", primary: pref }).state;
    // paneOrder is window-scoped (User settings = global/cross-project; Workspace settings = per-project) — read with the
    // .cel resource URI so a workspace/folder override is honored; open panes in that order.
    paneOrder = normalizePaneOrder(
      vscode.workspace.getConfiguration("crl.correspondence", ed.document.uri).get("paneOrder"),
    );
    for (const pane of paneOrder) if (state.paneVisibility[pane]) ensurePane(pane);
    setupWatcher();
    rebuild();
  });

  function applyPrimary(next: Pane): void {
    for (const pane of PANES) coord.clearPending(pane); // drop reveals queued under the old primary
    dispatch({ type: "setPrimary", primary: next }); // clears selection + refreshes the navigator
    clearAllHighlights(); // setPrimary emits no reveals → drop the now-orphaned highlights
    updateNavMessage();
    if (currentCel)
      void vscode.workspace
        .getConfiguration("crl.correspondence", vscode.Uri.file(currentCel))
        .update("primary", next) // most-specific writable scope (workspace if open, else global)
        .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist primary: ${e instanceof Error ? e.message : e}`));
  }

  const setPrimaryCmd = vscode.commands.registerCommand("crl.cockpit.setPrimary", () => {
    if (!currentCel || !model) return; // not shown yet → don't switch + persist before the cockpit exists
    const items: (vscode.QuickPickItem & { value: Pane })[] = PANES.map((p) => ({
      label: `${PANE_TITLE[p]}${p === state.primary ? "  •" : ""}`,
      description: p === "source" ? "source units" : p === "crl" ? "CRL decision nodes" : "CEL cases",
      value: p,
    }));
    void vscode.window.showQuickPick(items, { placeHolder: "Navigator primary pane" }).then((pick) => {
      if (pick && pick.value !== state.primary) applyPrimary(pick.value);
    });
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
    setPrimaryCmd,
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
.crl-node.use-decision{text-decoration:underline}
.cel-case{display:block;padding:3px 4px;border-radius:2px;border-left:3px solid transparent}
.cel-case.cel-pass{border-left-color:var(--vscode-testing-iconPassed,#73c991)}
.cel-case.cel-fail{border-left-color:var(--vscode-testing-iconFailed,#f14c4c)}
.cel-case.cel-error{border-left-color:var(--vscode-testing-iconErrored,#e2b33e)}
.cel-name{font-weight:bold}.cel-subject{opacity:.7}
.cel-facts,.cel-produced{opacity:.8;padding-left:14px;font-size:.95em}
.cel-fact{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
.cel-fact:hover{color:var(--vscode-textLink-activeForeground)}`;
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
