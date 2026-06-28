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
  type CrlConceptNode,
  type CrlDecisionStructure,
  type CrlStructureNode,
  type RenderScenarioResult,
  type ScenarioViewModel,
} from "@smile-digital-health/crl";
import type { LsLocation, ZeroBasedRange } from "@smile-digital-health/crl/language-services";
import {
  allUnsatisfiedCriteria,
  failedCriterionFrontier,
  type FailedCriterionNode,
} from "@smile-digital-health/crl/provenance";
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
  type PrimaryPane,
  type Selection,
  type State,
} from "./correspondenceEngine";
import { renderCelPane, reverseCelAnchors } from "./celPaneHtml";
import { CORR_STYLE } from "./corrKey";
import {
  buildRuntimeRefIndex,
  resolveFailedCriteria,
  type ResolvedCriterion,
} from "./failedCriterionPeek";
import { failedCriterionLabel } from "./failedCriterionLabel";
import { renderCrlPane } from "./crlPaneHtml";
import { FLOW_STYLE, renderFlowPane } from "./flowPaneHtml";
import {
  buildCrlRevealMaps,
  caseIdsForNode,
  caseIdsForUnit,
  conceptCrlAnchors,
  conceptKeysForNode,
  conceptKeysForUnit,
  conceptNodesForRow,
  crlAnchorsForUnits,
  rowNodeKeysForConcept,
  rowNodeKeysForUnit,
  unitNumbersForCase,
  unitNumbersForRow,
  unitsForCase,
  unitsForConcept,
  unitsForConceptNode,
  unitsForRow,
  type CrlRevealMaps,
} from "./crlRevealMaps";
import { CANONICAL_PANE_ORDER, normalizePaneOrder } from "./paneOrder";
import { isConceptHit, isFactHit, type RevealHit, type WebviewHit } from "./webviewHit";
import { PaneRevealCoordinator, type SemanticTarget } from "./paneRevealCoordinator";
import { discoverProvenance, findPolicySrc, PANEL_VALIDATION_MODE } from "./provenanceFindings";
import { buildViewerModel, type ViewerModel } from "./provenanceViewer";
import { renderSourcePane, type OverlaySpan, type UnitSpan } from "./sourcePaneHtml";

const PANES: Pane[] = ["source", "crl", "cel", "tree"]; // all panes (render/clearPending/reveal fan-out); tree is opt-in
// The panes the navigator can WALK (primary/cycle/config-primary). tree is render+reveal+peek-only, never a primary —
// so it is absent here. Used to build the setPrimary quickpick + guard config-primary against a stray "tree".
const PRIMARY_PANES: PrimaryPane[] = ["source", "crl", "cel"];
// Column slots by position (explicit, not ViewColumn arithmetic). A pane's column = its index among the OPEN panes in
// the user's paneOrder (so hiding a pane never leaves a column gap). Four slots so the opt-in tree pane gets a column.
const ORDERED_COLUMNS = [vscode.ViewColumn.One, vscode.ViewColumn.Two, vscode.ViewColumn.Three, vscode.ViewColumn.Four];
const PANE_TITLE: Record<Pane, string> = { source: "Source", crl: "CRL", cel: "CEL", tree: "Tree" };
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
 *  but aren't navigable/reveal targets. Label = case name, description = pass/fail/error. FIX 1 (disc 160): an
 *  AMBIGUOUS-name case (name in duplicateScenarioNames) is EXCLUDED — navigating it would mis-select the frozen
 *  same-name case's caseId, the same mis-attribution the pane block guards against. */
function toCelNav(
  scenarios: RenderScenarioResult,
  caseIdByName: Record<string, string>,
  duplicateScenarioNames: ReadonlySet<string>,
): CelNavItem[] {
  const out: CelNavItem[] = [];
  for (const sc of scenarios.scenarios) {
    if (duplicateScenarioNames.has(sc.case.name)) continue;
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
  let conceptLayer: CrlConceptNode[] = [];
  let crlMaps: CrlRevealMaps | undefined;
  let scenarios: RenderScenarioResult | undefined;
  let caseIdByName: Record<string, string> = {};
  // #173 T3 (disc 158/159) — failed-criterion peek state, all recomputed in rebuild():
  //  - `scenarioByCaseId`: the caseId → ScenarioViewModel reverse join (the shell holds scenarios keyed by NAME; the
  //    cel selection carries a caseId, so we invert through the frozen caseIdByName — never by raw name, so a collision
  //    can't mis-join).
  //  - `duplicateScenarioNames`: names shared by >1 case (frozen or unfrozen) — peek DISABLED for these (collision guard).
  //  - `runtimeRefIndex`: the runtime-ref → CRL-row-nodeKey join (a pure map off crlStructure; failedCriterionPeek.ts).
  //  - `fcGaps`: the CURRENT peek's ungroundable criteria (the "Open CRL source at criterion" fallback list), rendered
  //    as a banner in the tree pane; `fcGapDisabledMsg` is the collision/disabled status the tree banner shows instead.
  let scenarioByCaseId: Map<string, ScenarioViewModel> = new Map();
  let duplicateScenarioNames: ReadonlySet<string> = new Set();
  let runtimeRefIndex: Map<string, string> = new Map();
  let fcGaps: { label: string; source: LsLocation }[] = [];
  let fcGapDisabledMsg: string | undefined;
  // The All/Blocking toggle (default Blocking). Cached from `crl.cockpit.failedCriteriaMode`; the tree pane's
  // segmented control + a settings edit both route through `applyFailedCriteriaMode`.
  let failedCriteriaMode: "blocking" | "all" = "blocking";
  /** Concept keys that have ≥1 source-bearing unit OR ≥1 CRL row — the gate for a fact being a clickable peek anchor
   *  (recomputed from crlMaps each rebuild; read at CEL render time, mirroring caseIdByName). */
  let revealableConceptKeys: ReadonlySet<string> = new Set();
  /** REVERSE map (C2c-2b): concept key → CEL fact anchors of the CURRENT cel render. UNLIKE revealableConceptKeys above
   *  (rebuild-cadence, render-stable), this is RENDER-scoped: its values embed the render gen, so it's captured atomically
   *  with the cel pane's `v.anchors` in renderPane's cel branch — NEVER set in rebuild() / never cached across renders.
   *  A single shell global (not per-PaneView) is safe because there is exactly one CEL pane and every rebuild renders it;
   *  revisit if panes ever re-render independently. */
  let conceptToFactAnchors: Record<string, string[]> = {};
  // #163 at-rest correspondence key. `unitNumber` = unitId → its 1-based index in `model.steps` order (= the navigator
  // order; an ephemeral within-render index, re-numbered each rebuild). `rowKeyNumbers`/`caseKeyNumbers` = the per-element
  // number lists the CRL/CEL renderers stamp. `showKeys` gates the whole channel. All recomputed in rebuild + cached here
  // so the onConfig toggle can re-render WITHOUT a full rebuild.
  let unitNumber: Map<string, number> = new Map();
  let rowKeyNumbers: Record<string, number[]> = {};
  let caseKeyNumbers: Record<string, number[]> = {};
  let conceptKeyNumbers: Record<string, number[]> = {}; // #166 Slice 3a — at-rest key on concept rows
  let showKeys = true;
  let indexVersion = 0;
  let currentCel: string | undefined;
  /** last span-click locus (trusted, from the renderer) — open-raw uses it when it still matches the selection. */
  let lastClicked: { unitId: string; range: ZeroBasedRange } | undefined;
  const views = new Map<Pane, PaneView>();
  let paneOrder: Pane[] = [...CANONICAL_PANE_ORDER]; // user layout (crl.cockpit.paneOrder), normalized
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

  /** Reconcile OPEN panels to the (normalized) paneOrder, then place columns. Unlike applyPaneOrder (reorder-only), this
   *  OPENS a now-listed visible pane (rendering it immediately so it isn't blank) and DISPOSES an open pane dropped from
   *  the order — so toggling the opt-in tree pane in settings takes effect live, without re-running "Show Cockpit". Only
   *  the tree pane can ever be disposed here: normalizePaneOrder always re-adds the 3 canonical panes. */
  const reconcilePaneOrder = (): void => {
    for (const pane of [...views.keys()]) if (!paneOrder.includes(pane)) views.get(pane)?.panel.dispose(); // dispose dropped (tree only)
    let opened = false;
    for (const pane of paneOrder) {
      if (!state.paneVisibility[pane]) continue;
      const existed = views.has(pane);
      ensurePane(pane);
      if (!existed) {
        renderPane(pane); // a freshly-opened pane needs its content posted (rebuild won't run on a settings edit)
        opened = true;
      }
    }
    applyPaneOrder();
    // A pane opened mid-session holds no queued reveal (absent-pane effects were dropped in applyReveal) → re-drive the
    // current selection so the new pane highlights it on ack, instead of showing a blank/un-highlighted flowchart.
    if (opened && state.selection) dispatch({ type: "select", selection: state.selection });
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
      // #163 at-rest key: prefix the row with the unit number(s) it corresponds to (shell-side, so the pure engine
      // stays number-free). Source item = its own unit number; CRL/CEL item = the units its row/case maps to. id +
      // description are untouched (reveal-match by id / decision-status text unaffected).
      const navNums =
        it.selection.primary === "source"
          ? unitNumber.has(it.id)
            ? [unitNumber.get(it.id)!]
            : []
          : it.selection.primary === "crl"
            ? rowKeyNumbers[it.id] ?? []
            : caseKeyNumbers[it.id] ?? [];
      const label = showKeys && navNums.length ? `${navNums.join(",")} · ${it.label}` : it.label;
      const t = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
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
    // #173 T3: drive the failed-criterion overlay for the (now-settled) selection. MUST run AFTER applyReveal so the
    // selection's `.current` highlight is posted FIRST and the `.failed-criterion` overlay (a separate channel) lands
    // after it — the next selection's `.current`/clearHighlight then wipes the overlay, but this same-click reveal does
    // not (disc 159, the ordering invariant). The overlay is its own channel, so it coexists with `.current`.
    driveFailedCriteriaPeek();
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

  /** Case → the CRL rows of all its units, DIRECT + branch-scoped per unit (a case legitimately spans branches). Used by
   *  mapHitToPrimary (the SELECTION direction — stays direct so it round-trips, like the unit arm). The postReveal
   *  HIGHLIGHT direction uses crlAnchorsForUnits instead (containment + concept rows). NOTE: a case whose units cite ONLY
   *  containment-nested concepts (no direct row) maps to [] here → the CRL-primary case-click is an intentional no-op
   *  (selecting a containment-only container `when` would not round-trip back to the case — same reason the unit arm is direct). */
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
    // The TREE (flowchart) pane highlights in lockstep with the CRL pane: it anchors the SAME structure nodeKeys, so it
    // reuses the crl anchor-key sets verbatim. (The crl sets also include concept-row keys; the flow pane has no concept
    // anchors, so those simply no-op in highlightRows — the structure rows light up, which is the intent.)
    if (target.kind === "unit") {
      if (pane === "source") highlightRows(v, [target.id]);
      // #166 3b: unit → its driving decisions (direct + concept containment, scoped ONCE) THEN its applicable concept
      // rows (direct concepts). Decisions first so highlightRows scrolls to the decision tree (today's behavior).
      else if (pane === "crl" || pane === "tree") highlightRows(v, crlAnchorsForUnits([target.id], m));
      // CEL: the unit's artifact cases (block-level) + the fact spans referencing its concepts (C2c-2b reverse, facts first)
      else if (pane === "cel") highlightRows(v, reverseCelAnchors(conceptKeysForUnit(target.id, m), caseIdsForUnit(target.id, m), conceptToFactAnchors));
    } else if (target.kind === "crlNode") {
      // #166 3b: a decision row → itself THEN the concepts it surfaces (direct refKeys + their contained sub-concepts).
      if (pane === "crl" || pane === "tree") highlightRows(v, [target.id, ...conceptNodesForRow(target.id, m)]);
      else if (pane === "source") highlightRows(v, unitsForRow(target.id, m)); // crl node → its source units (direct)
      else if (pane === "cel") highlightRows(v, reverseCelAnchors(conceptKeysForNode(target.id, m), caseIdsForNode(target.id, m), conceptToFactAnchors));
    } else {
      // celCase
      if (pane === "cel") highlightRows(v, [target.id]);
      else if (pane === "source") highlightRows(v, unitsForCase(target.id, m).filter((u) => m.sourceBearingUnits.has(u)));
      // #166 3b-fix: case → its units' driving decisions (direct + containment) AND their applicable concept rows.
      else if (pane === "crl" || pane === "tree") highlightRows(v, crlAnchorsForUnits(unitsForCase(target.id, m), m));
    }
  }

  function clearAllHighlights(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearHighlight" });
  }

  /** Post the DISTINCT `.failed-criterion` overlay for a set of anchor keys in one pane (#173 T3, disc 158 §"Reveal
   *  model"). UNLIKE highlightRows (which posts `.current` + scrolls), this paints a SEPARATE channel that COEXISTS with
   *  the engine selection's `.current` highlight — so the failed-criteria peek never conflates with the at-rest
   *  selection. Empty anchorKeys → clear the channel (so a pass/empty frontier wipes a stale overlay). The MARK is
   *  gen-carried so the webview drops a mark aimed at a superseded render (mirrors highlightRows; disc 159 Claude-17);
   *  the CLEAR is global by design (removing a class is always safe — no gen needed; disc 160 FIX 6). */
  /** Resolve a set of anchor keys → the deduped segmentIds + the first scrollTo for THIS pane. */
  function segmentsFor(v: PaneView, anchorKeys: string[]): { segmentIds: string[]; scrollTo?: string } {
    const segmentIds: string[] = [];
    let scrollTo: string | undefined;
    for (const k of anchorKeys) {
      const a = v.anchors[k];
      if (!a) continue;
      if (!scrollTo) scrollTo = a.scrollTo;
      for (const id of a.segmentIds) if (!segmentIds.includes(id)) segmentIds.push(id);
    }
    return { segmentIds, scrollTo };
  }

  function markFailedCriteria(v: PaneView, blockerKeys: string[], preemptKeys: string[]): void {
    // #173 T3 FIX 3 (disc 160): TWO honesty channels in one message — a real blocker (unsatisfied-when / guarded-out)
    // paints `.failed-criterion` (red); a `preemption` row is the SATISFIED matched sibling that DIVERTED the run, so it
    // paints the DISTINCT `.failed-criterion-preempt` (amber "diverted"), never red — consistent with the run-tree.
    const blocker = segmentsFor(v, blockerKeys);
    const preempt = segmentsFor(v, preemptKeys);
    const scrollTo = blocker.scrollTo ?? preempt.scrollTo;
    void v.panel.webview.postMessage(
      scrollTo
        ? { type: "markFailedCriteria", gen: v.gen, scrollTo, blockerIds: blocker.segmentIds, preemptIds: preempt.segmentIds }
        : { type: "clearFailedCriteria" },
    );
  }

  /** Clear the failed-criterion overlay channel across every pane (independent of `.current`). */
  function clearAllFailedCriteria(): void {
    for (const v of views.values()) void v.panel.webview.postMessage({ type: "clearFailedCriteria" });
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
    const tree = views.get("tree");
    if (src) highlightRows(src, unitsForConcept(hit.conceptKey, crlMaps)); // concept → source-bearing units
    if (crl) highlightRows(crl, conceptCrlAnchors(hit.conceptKey, crlMaps)); // #166 3b: own row + driven decisions (direct + containment)
    if (tree) highlightRows(tree, conceptCrlAnchors(hit.conceptKey, crlMaps)); // T3: the flowchart decisions the concept gates
    if (cel) highlightRows(cel, [hit.factAnchorKey]); // self-highlight the clicked fact span
  }

  /** Concept-row peek (#166 Slice 3a): clicking a concept in the CRL pane → a transient highlight of its source units +
   *  the decisions it drives (direct + via containment) + the concept row itself. Shell-side, no engine selection (the
   *  concept is not a navigator item). Mirrors peekConcept; source arm uses the source-bearing units (only those anchor). */
  function peekConceptNode(conceptKey: string): void {
    clearAllHighlights();
    if (!crlMaps) return;
    const src = views.get("source");
    const crl = views.get("crl");
    const tree = views.get("tree");
    if (src) highlightRows(src, unitsForConcept(conceptKey, crlMaps)); // concept → source-bearing units (only those anchor)
    // crl: the concept's own row (self) + the decision rows it drives (direct + containment) — shared with the fact peek.
    if (crl) highlightRows(crl, conceptCrlAnchors(conceptKey, crlMaps));
    if (tree) highlightRows(tree, conceptCrlAnchors(conceptKey, crlMaps)); // T3: the flowchart decisions the concept gates
  }

  /** Build the tree-pane CHROME (the All/Blocking segmented toggle + the gap "Open CRL source" banner) as HTML posted
   *  to a `#fcChrome` region ABOVE the flowchart — so it never clobbers the SVG `#root` (disc 159 Claude-16). The toggle
   *  buttons carry `data-fc-mode`; each gap row carries `data-fc-gap` (its index into `fcGaps`). Both are handled by the
   *  shell webview script (distinct from the `[data-reveal]` path). */
  function buildTreeChromeHtml(): string {
    const btn = (mode: "blocking" | "all", label: string): string =>
      `<button class="fc-toggle-btn${failedCriteriaMode === mode ? " fc-active" : ""}" data-fc-mode="${mode}">${label}</button>`;
    const toggle =
      `<div class="fc-toggle" title="Which failed criteria to highlight for the selected case">` +
      `<span class="fc-toggle-label">Failed criteria:</span>${btn("blocking", "Blocking")}${btn("all", "All")}</div>`;
    let banner = "";
    if (fcGapDisabledMsg) {
      banner = `<div class="fc-gaps fc-gaps-disabled">${escapeHtml(fcGapDisabledMsg)}</div>`;
    } else if (fcGaps.length) {
      const rows = fcGaps
        .map(
          (g, i) =>
            `<div class="fc-gap-row" data-fc-gap="${i}" title="Exact CRL row couldn't be determined — opens the criterion's source">` +
            `⚠ ${escapeHtml(g.label)} <span class="fc-gap-open">Open CRL source</span></div>`,
        )
        .join("");
      banner =
        `<div class="fc-gaps"><div class="fc-gaps-head">Couldn't locate the CRL row for:</div>${rows}</div>`;
    }
    return toggle + banner;
  }

  /** Push the current tree-pane chrome (toggle + gap banner) to the tree webview, if open. Does NOT re-render the
   *  flowchart `#root` (so the failed-criterion overlay already painted on the SVG survives). */
  function renderTreeChrome(): void {
    const tree = views.get("tree");
    if (tree) void tree.panel.webview.postMessage({ type: "fcChrome", html: buildTreeChromeHtml() });
  }

  /**
   * Failed-criterion PEEK (#173 T3, disc 158 §"Reveal model" / §Gap / §"Case-name collision"; impl disc 159). UNLIKE
   * peekConcept (a transient, no-selection hover), this is SELECTION-COUPLED: it fires AFTER a cel-case engine selection
   * settles (driveFailedCriteriaPeek, post-dispatch) and paints the DISTINCT `.failed-criterion` channel that COEXISTS
   * with that selection's `.current` highlight. For each frozen, UNAMBIGUOUS, failing (Blocking) / any (All) case:
   *   - frontier/all (T2) → a SET of FailedCriterionNodes → re-root each runtime nodeId to its standalone CRL row
   *     (resolveFailedCriteria via runtimeNodePathRefs + runtimeRefIndex) → mark that row in crl + tree + (its units in) source.
   *   - an ungroundable criterion (gap) → NO faked source highlight; surfaced in `fcGaps` with an "Open CRL source"
   *     affordance using the node's OWN source (disc 158 §Gap). Never silently dropped.
   * Guards: an ambiguous name (duplicateScenarioNames) or a missing scenario → peek DISABLED with a status message;
   * `status==="error"` → out of scope (partial trace) → clear + leave diagnostics. Blocking is naturally EMPTY for a
   * pass (self-gating) → clears any stale overlay.
   */
  function peekFailedCriteria(caseId: string): void {
    clearAllFailedCriteria(); // distinct channel — does NOT touch the `.current` selection highlight
    fcGaps = [];
    fcGapDisabledMsg = undefined;

    const sv = scenarioByCaseId.get(caseId);
    if (!sv) {
      // No frozen/unambiguous scenario for this caseId (e.g. its name is in duplicateScenarioNames) — disable + explain.
      fcGapDisabledMsg = "Failed-criteria peek disabled: this case's name is shared by another case (give each a distinct name).";
      renderTreeChrome();
      return;
    }
    if (sv.status === "error") {
      // Partial trace, expected path undefined — out of scope (disc 158 §Trigger). Leave the case's diagnostics as-is.
      fcGapDisabledMsg = "Failed-criteria peek not available for an errored case (see diagnostics).";
      renderTreeChrome();
      return;
    }

    const criteria: FailedCriterionNode[] =
      failedCriteriaMode === "all" ? allUnsatisfiedCriteria(sv) : failedCriterionFrontier(sv);
    // Root = the TOP-LEVEL covered decision; runtimeNodePathRefs re-roots cross-lib `use decision` frames internally
    // (the criterion nodeId is the caller-INLINED deep id, so the criterion's OWN lib would mis-root — disc 159).
    const root = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "" };
    const resolved: ResolvedCriterion<FailedCriterionNode>[] = resolveFailedCriteria(
      criteria,
      root,
      sv.tree,
      runtimeRefIndex,
    );

    if (crlMaps) {
      const m = crlMaps;
      // Split grounded rows by reason (FIX 3): a `preemption` row is a SATISFIED diverting sibling → its own amber
      // channel; all other reasons are red blockers. (A nodeKey shared by a blocker + a preemption — structurally
      // unlikely — favors the blocker: a real failed criterion outranks the diversion marker.)
      const blockerKeys: string[] = [];
      const preemptKeys: string[] = [];
      for (const r of resolved) {
        if (!r.grounded) continue;
        const target = r.criterion.reason === "preemption" ? preemptKeys : blockerKeys;
        if (!target.includes(r.nodeKey) && !blockerKeys.includes(r.nodeKey)) target.push(r.nodeKey);
      }
      const unitsOf = (keys: string[]): string[] => {
        const units: string[] = [];
        for (const k of keys) for (const u of unitsForRow(k, m)) if (!units.includes(u)) units.push(u);
        return units;
      };
      const crl = views.get("crl");
      const tree = views.get("tree");
      const src = views.get("source");
      if (crl) markFailedCriteria(crl, blockerKeys, preemptKeys); // CRL pane: the standalone rows
      if (tree) markFailedCriteria(tree, blockerKeys, preemptKeys); // tree flowchart: same structure nodeKeys (FLOW_STYLE paints the rect)
      // Source: the grounded rows' source-bearing units, split into the two channels. A gap row gets NO source mark.
      if (src) markFailedCriteria(src, unitsOf(blockerKeys), unitsOf(preemptKeys));
    }

    // Gap list: the ungroundable criteria → the "Open CRL source at criterion" fallback (the node's own source).
    fcGaps = resolved
      .filter((r): r is { criterion: FailedCriterionNode; grounded: false } => !r.grounded)
      .map((r) => ({ label: failedCriterionLabel(r.criterion), source: r.criterion.source as LsLocation }));
    renderTreeChrome();
  }

  /** Drive the failed-criterion peek for the CURRENT selection IFF it is a cel case (post-dispatch hook). Selecting a
   *  non-cel target clears the overlay + the gap banner (the failed-criteria view is cel-case scoped). */
  function driveFailedCriteriaPeek(): void {
    const sel = state.selection;
    if (sel && sel.primary === "cel") {
      peekFailedCriteria(sel.caseId);
    } else {
      clearAllFailedCriteria();
      fcGaps = [];
      fcGapDisabledMsg = undefined;
      renderTreeChrome();
    }
  }

  function updateNavMessage(): void {
    const empty = navigatorItems(state).length === 0;
    navView.message = empty
      ? state.primary === "crl"
        ? "No CRL decisions in this policy."
        : state.primary === "cel"
          ? "No CEL cases in this policy."
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
      const r = renderSourcePane(model.anchor.text, units, overlays, { revealPrefix: `g${gen}_`, unitNumber, showKeys });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    } else if (pane === "crl") {
      const r = renderCrlPane(crlStructure, { revealPrefix: `g${gen}_`, rowKeyNumbers, showKeys, concepts: conceptLayer, conceptKeyNumbers });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    } else if (pane === "cel") {
      // CEL pane — condensed scenario cases (C2c-1).
      const r = scenarios
        ? renderCelPane(scenarios, caseIdByName, { revealPrefix: `g${gen}_`, revealableConceptKeys, caseKeyNumbers, showKeys, duplicateScenarioNames })
        : { html: '<p class="placeholder">No CEL.</p>', anchors: {}, reveals: {}, conceptToFactAnchors: {} };
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      conceptToFactAnchors = r.conceptToFactAnchors; // captured atomically with this render's anchors (gen-scoped keys)
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    } else {
      // tree — the graphical decision-tree flowchart (T2 renderer). Same structure + concept inputs as the CRL pane; its
      // reveal shapes are IDENTICAL ({nodeKey} | {conceptNodeKey}), so clicks route through the existing onWebviewMessage
      // path with no new hit kinds, and it highlights in lockstep with the CRL pane (postReveal's crl|tree arms).
      const r = renderFlowPane(crlStructure, { revealPrefix: `g${gen}_`, concepts: conceptLayer });
      v.anchors = r.anchors;
      v.reveals = r.reveals;
      void v.panel.webview.postMessage({ type: "render", html: r.html, gen, indexVersion });
    }
  }

  function renderEmpty(message: string): void {
    for (const [pane, v] of views) {
      const gen = coord.startRender(pane);
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
    msg: { type?: string; gen?: number; key?: string; mode?: string; idx?: number },
  ): void {
    const v = views.get(pane);
    if (!v) return;
    if (msg.type === "ready" && typeof msg.gen === "number") {
      if (msg.gen !== v.gen) return; // superseded render's ack
      v.acked = true;
      // Use the render's authoritative indexVersion (stored shell-side), NOT a value echoed by the untrusted webview.
      const target = coord.ready(pane, v.gen, v.indexVersion);
      if (target) postReveal(pane, target);
      // #173 T3: a fresh tree render starts with an empty #fcChrome — re-post the toggle + gap banner on ack so they
      // survive a re-render (rebuild / showKeys toggle). The failed-criterion OVERLAY itself re-applies via the normal
      // reveal-on-ack path is NOT automatic (it's selection-driven), so a tree opened mid-session re-drives the peek
      // through the `if (opened && state.selection) dispatch(...)` path in reconcilePaneOrder.
      if (pane === "tree") renderTreeChrome();
    } else if (msg.type === "fcMode" && (msg.mode === "blocking" || msg.mode === "all")) {
      applyFailedCriteriaMode(msg.mode); // the tree-pane segmented toggle
    } else if (msg.type === "fcOpenSource" && typeof msg.idx === "number") {
      openFailedCriterionSource(msg.idx); // a gap row's "Open CRL source"
    } else if (msg.type === "reveal" && typeof msg.key === "string") {
      const hit = v.reveals[msg.key]; // trusted: looked up by opaque key, not a path/range from the webview
      if (!hit) return;
      // A fact peek is transient + shell-only — divert it BEFORE the engine-selection path (no lastClicked, no dispatch)
      // AND before the !crlMaps guard, so a peek always clears prior highlights even if maps are momentarily absent.
      if (isFactHit(hit)) {
        peekConcept(hit);
        return;
      }
      // A CRL concept-row click is likewise a PEEK (#166 Slice 3a) — diverted before the engine-selection path so a
      // concept node is never routed through mapHitToPrimary as a DECISION.
      if (isConceptHit(hit)) {
        peekConceptNode(hit.conceptNodeKey);
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
   *  These produce an engine SELECTION, so they stay DIRECT — deliberately NOT in lockstep with postReveal's #166-3b
   *  containment ENRICHMENT. The unit→crl arm uses rowNodeKeysForUnit (direct), NOT rowNodeKeysForUnitWithConcepts: a
   *  selection must round-trip (the reverse crlNode→source arm is direct unitsForRow), and selecting a containment-only
   *  container `when` would clear the originally-clicked nested-only unit. Containment is a HIGHLIGHT concern (postReveal). */
  function mapHitToPrimary(hit: RevealHit, primary: PrimaryPane, m: CrlRevealMaps): string[] {
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

  const selOf = (primary: PrimaryPane, id: string): Selection =>
    primary === "source" ? { primary: "source", unitId: id } : primary === "crl" ? { primary: "crl", nodeKey: id } : { primary: "cel", caseId: id };

  function labelInPrimary(id: string, primary: PrimaryPane): { label: string; description?: string } {
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
  function selectInPrimary(ids: string[], primary: PrimaryPane): void {
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
    coord.setPaneCapability(pane, "renderable"); // all panes render + receive reveals (the tree flowchart lit up in T3)
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
      const cm = buildCockpitModel(d.artifactPath, currentCel, d.anchorPath, PANEL_VALIDATION_MODE); // resolve ONCE → corr + structure + scenarios
      correspondence = cm.correspondence;
      crlStructure = cm.crlStructure;
      conceptLayer = cm.conceptLayer;
      scenarios = cm.scenarios;
      caseIdByName = cm.caseIdByName;
      duplicateScenarioNames = cm.duplicateScenarioNames;
      // caseId → ScenarioViewModel, inverted through the FROZEN caseIdByName (never by raw name) so a name collision
      // can't mis-join a peek to the wrong case (#173 collision guard, disc 159 Claude-4).
      scenarioByCaseId = new Map();
      for (const sc of cm.scenarios.scenarios) {
        const caseId = cm.caseIdByName[sc.case.name];
        if (caseId !== undefined && !duplicateScenarioNames.has(sc.case.name)) scenarioByCaseId.set(caseId, sc);
      }
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
    // #173 T3: the runtime-ref → CRL-row-nodeKey join (pure, off crlStructure). A prior peek's gap list is stale now.
    runtimeRefIndex = buildRuntimeRefIndex(crlStructure);
    fcGaps = [];
    fcGapDisabledMsg = undefined;
    crlMaps = buildCrlRevealMaps(correspondence, crlStructure, conceptLayer);
    // A concept key is fact-clickable iff it has ≥1 source-bearing unit OR ≥1 CRL row (the two map key spaces are
    // independent — has-unit and has-row are separate quadrants). The fact-side kind guard (definedBy.kind==="concept")
    // is applied in renderCelPane; this set just drops concepts with no correspondence to reveal.
    const m = crlMaps;
    // A concept is fact-peek-clickable if a peek of it wouldn't be blank: it has a source-bearing unit OR a CRL row.
    // #166 3b adds the THIRD term (purely additive) — nested sub-concepts whose driving `when` is reachable only via
    // containment (∉ keyToRowNodeKeys directly), so a CEL fact `defined by` a nested concept becomes clickable too.
    revealableConceptKeys = new Set<string>([
      ...[...m.keyToUnitIds].filter(([, units]) => units.some((u) => m.sourceBearingUnits.has(u))).map(([k]) => k),
      ...m.keyToRowNodeKeys.keys(),
      ...[...m.conceptByKey.keys()].filter((k) => rowNodeKeysForConcept(k, m).length > 0),
    ]);
    // #163 at-rest key: number units by model.steps order (= nav order); precompute the CRL-row + CEL-case number lists
    // (branch-scoped for rows). Cached so the showKeys toggle re-renders without rebuilding. Only non-empty entries stored.
    unitNumber = new Map(model.steps.map((s, i) => [s.unitId, i + 1]));
    rowKeyNumbers = {};
    const numberRows = (nodes: CrlStructureNode[]): void => {
      for (const n of nodes) {
        const nums = unitNumbersForRow(n.nodeKey, m, unitNumber);
        if (nums.length) rowKeyNumbers[n.nodeKey] = nums;
        numberRows(n.children);
      }
    };
    for (const d of crlStructure) {
      const nums = unitNumbersForRow(d.nodeKey, m, unitNumber);
      if (nums.length) rowKeyNumbers[d.nodeKey] = nums;
      numberRows(d.children);
    }
    caseKeyNumbers = {};
    for (const caseId of Object.values(caseIdByName)) {
      const nums = unitNumbersForCase(caseId, m, unitNumber);
      if (nums.length) caseKeyNumbers[caseId] = nums;
    }
    // #166 Slice 3a: at-rest key on concept rows — a concept's citing units' numbers (raw; a concept isn't branch-bound).
    conceptKeyNumbers = {};
    for (const c of conceptLayer) {
      const nums = [...new Set(unitsForConceptNode(c.nodeKey, m).map((u) => unitNumber.get(u)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
      if (nums.length) conceptKeyNumbers[c.nodeKey] = nums;
    }
    for (const pane of PANES) coord.clearPending(pane);
    dispatch({ type: "setInputs", index: toIndex(model, crlStructure, toCelNav(scenarios, caseIdByName, duplicateScenarioNames), indexVersion) });
    updateNavMessage();
    for (const pane of PANES) renderPane(pane);
  }

  /** On a discovery/build failure, drop stale provenance so the panes never stay interactive with wrong data. */
  function resetToEmpty(message: string): void {
    model = undefined;
    correspondence = undefined;
    crlStructure = [];
    conceptLayer = [];
    crlMaps = undefined;
    scenarios = undefined;
    caseIdByName = {};
    scenarioByCaseId = new Map();
    duplicateScenarioNames = new Set();
    runtimeRefIndex = new Map();
    fcGaps = [];
    fcGapDisabledMsg = undefined;
    revealableConceptKeys = new Set();
    conceptToFactAnchors = {};
    unitNumber = new Map();
    rowKeyNumbers = {};
    caseKeyNumbers = {};
    conceptKeyNumbers = {};
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
    const pref = vscode.workspace.getConfiguration("crl.cockpit", ed.document.uri).get<string>("primary");
    if (pref === "crl" || pref === "source" || pref === "cel") state = reduce(state, { type: "setPrimary", primary: pref }).state;
    // paneOrder is window-scoped (User settings = global/cross-project; Workspace settings = per-project) — read with the
    // .cel resource URI so a workspace/folder override is honored; open panes in that order.
    paneOrder = normalizePaneOrder(
      vscode.workspace.getConfiguration("crl.cockpit", ed.document.uri).get("paneOrder"),
    );
    showKeys = vscode.workspace.getConfiguration("crl.cockpit", ed.document.uri).get<boolean>("showKeys") ?? true;
    // #173 T3: the persisted All/Blocking failed-criteria mode (default Blocking).
    const fcm = vscode.workspace.getConfiguration("crl.cockpit", ed.document.uri).get<string>("failedCriteriaMode");
    failedCriteriaMode = fcm === "all" ? "all" : "blocking";
    for (const pane of paneOrder) if (state.paneVisibility[pane]) ensurePane(pane);
    setupWatcher();
    rebuild();
  });

  function applyPrimary(next: PrimaryPane): void {
    for (const pane of PANES) coord.clearPending(pane); // drop reveals queued under the old primary
    dispatch({ type: "setPrimary", primary: next }); // clears selection + refreshes the navigator
    clearAllHighlights(); // setPrimary emits no reveals → drop the now-orphaned highlights
    updateNavMessage();
    if (currentCel)
      void vscode.workspace
        .getConfiguration("crl.cockpit", vscode.Uri.file(currentCel))
        .update("primary", next) // most-specific writable scope (workspace if open, else global)
        .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist primary: ${e instanceof Error ? e.message : e}`));
  }

  /** Apply a failed-criteria mode change (#173 T3): persist to config; the onDidChangeConfiguration branch is the SINGLE
   *  re-drive path (so a manual settings edit behaves identically to the segmented toggle). */
  function applyFailedCriteriaMode(next: "blocking" | "all"): void {
    if (next === failedCriteriaMode || !currentCel) {
      // no-op (or persisted but unchanged) — still refresh the toggle chrome so the active button reflects the click.
      renderTreeChrome();
      return;
    }
    // Target-less update = most-specific writable scope (Workspace if a workspace/folder is open, else Global) — the
    // SAME rule the existing `primary`/`showKeys` writes use, so the cockpit + scenarioRunner (same window, same
    // workspace state) resolve to the SAME target and the shared-sync onDidChangeConfiguration event fires consistently.
    void vscode.workspace
      .getConfiguration("crl.cockpit", vscode.Uri.file(currentCel))
      .update("failedCriteriaMode", next)
      .then(undefined, (e) =>
        console.warn(`[crl.cockpit] could not persist failedCriteriaMode: ${e instanceof Error ? e.message : e}`),
      );
  }

  /** Re-render the chrome + re-drive the peek for the current selection under the new mode (the live apply path). */
  function applyFailedCriteriaModeLive(next: "blocking" | "all"): void {
    failedCriteriaMode = next;
    driveFailedCriteriaPeek(); // recompute the overlay + gaps for the selected case in the new mode (renders chrome)
  }

  /** Open the .crl source for a gap criterion's own location (disc 158 §Gap — the honest fallback when the exact CRL row
   *  couldn't be re-rooted). Uses the VM node's own `source` (an LsLocation), opening the file directly — NOT a faked
   *  source-pane highlight (the cockpit source pane renders provenance units, not raw CRL spans). */
  function openFailedCriterionSource(idx: number): void {
    const gap = fcGaps[idx];
    if (!gap) return;
    const { filePath, range } = gap.source;
    void vscode.window.showTextDocument(vscode.Uri.file(filePath), {
      selection: new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol),
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  const setPrimaryCmd = vscode.commands.registerCommand("crl.cockpit.setPrimary", () => {
    if (!currentCel || !model) return; // not shown yet → don't switch + persist before the cockpit exists
    // Iterate PRIMARY_PANES (not PANES) — tree is not a navigable primary, so it must never appear as a setPrimary choice.
    const items: (vscode.QuickPickItem & { value: PrimaryPane })[] = PRIMARY_PANES.map((p) => ({
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

  /** Apply a showKeys change WITHOUT a rebuild: re-render the key-bearing panes (all three — source badge landed in
   *  #163-2) + refresh the navigator labels (the prefix is read in getTreeItem). The cached number maps are still valid
   *  (same model). Re-rendering swaps the pane DOM (dropping the selection's `.current`), so re-drive the current
   *  selection afterwards to restore its highlight (queues a reveal that lands when the re-rendered panes re-ack). */
  function applyShowKeys(next: boolean): void {
    showKeys = next;
    for (const pane of PANES) renderPane(pane);
    onNav.fire(undefined); // re-run getTreeItem → label prefixes appear/disappear
    if (state.selection) dispatch({ type: "select", selection: state.selection }); // restore highlights post-re-render
  }

  const toggleKeysCmd = vscode.commands.registerCommand("crl.cockpit.toggleKeys", () => {
    if (!currentCel) return;
    // Read the LIVE persisted value (not the cached render-state `showKeys`) and write its inverse, to the most-specific
    // writable scope (resource-aware like primary/paneOrder). The onConfig handler is the single re-render path (so a
    // manual settings.json edit behaves identically to the button).
    const cfg = vscode.workspace.getConfiguration("crl.cockpit", vscode.Uri.file(currentCel));
    const cur = cfg.get<boolean>("showKeys") ?? true;
    void cfg
      .update("showKeys", !cur)
      .then(undefined, (e) => console.warn(`[crl.cockpit] could not persist showKeys: ${e instanceof Error ? e.message : e}`));
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
    if (!currentCel) return;
    if (e.affectsConfiguration("crl.cockpit.paneOrder")) {
      if (orderDebounce) clearTimeout(orderDebounce);
      orderDebounce = setTimeout(() => {
        const uri = currentCel ? vscode.Uri.file(currentCel) : undefined;
        paneOrder = normalizePaneOrder(vscode.workspace.getConfiguration("crl.cockpit", uri).get("paneOrder"));
        reconcilePaneOrder(); // open/close opt-in panes (tree) + re-place columns — not just reorder the already-open set
      }, 150);
    }
    // showKeys (#163): re-render with the at-rest key channel on/off. Separate branch — a showKeys edit must re-render
    // even when paneOrder didn't change. Re-render only (no rebuild — the number maps are unchanged).
    if (e.affectsConfiguration("crl.cockpit.showKeys")) {
      const next = vscode.workspace.getConfiguration("crl.cockpit", vscode.Uri.file(currentCel)).get<boolean>("showKeys") ?? true;
      if (next !== showKeys) applyShowKeys(next);
    }
    // #173 T3: the All/Blocking failed-criteria toggle. The segmented control persists the config; THIS is the single
    // live re-drive path (so a settings.json edit re-peeks identically to the button). No rebuild — just recompute the
    // overlay/gaps for the current selection in the new mode.
    if (e.affectsConfiguration("crl.cockpit.failedCriteriaMode")) {
      const raw = vscode.workspace.getConfiguration("crl.cockpit", vscode.Uri.file(currentCel)).get<string>("failedCriteriaMode");
      const next = raw === "all" ? "all" : "blocking";
      if (next !== failedCriteriaMode) applyFailedCriteriaModeLive(next);
    }
  });

  navView.message = "Open a .cel and run “CRL: Show Cockpit”.";
  context.subscriptions.push(
    navView,
    showCmd,
    setPrimaryCmd,
    toggleKeysCmd,
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
.crl-row{display:flex;align-items:baseline;padding:1px 4px;border-radius:2px}
.crl-row:has(.crl-decision){margin-top:4px}
.crl-node{border-radius:2px}
.crl-decision{font-weight:bold}
.crl-node.when{color:var(--vscode-symbolIcon-keywordForeground,#c586c0)}
.crl-node.otherwise{opacity:.75;font-style:italic}
.crl-node.action{color:var(--vscode-symbolIcon-functionForeground,#dcdcaa)}
.crl-node.use-decision{text-decoration:underline}
.cel-case{display:block;padding:3px 4px;border-radius:2px;border-left:3px solid transparent}
.cel-case.cel-pass{border-left-color:var(--vscode-testing-iconPassed,#73c991)}
.cel-case.cel-fail{border-left-color:var(--vscode-testing-iconFailed,#f14c4c)}
.cel-case.cel-error{border-left-color:var(--vscode-testing-iconErrored,#e2b33e)}
.cel-name{font-weight:bold}.cel-subject{opacity:.7}
.cel-case.cel-ambiguous{opacity:.7;cursor:default}
.cel-ambiguous-marker{color:var(--vscode-charts-yellow,#d29922);font-size:.85em;font-style:italic}
.cel-facts,.cel-produced{opacity:.8;padding-left:14px;font-size:.95em}
.cel-fact{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
.cel-fact:hover{color:var(--vscode-textLink-activeForeground)}
.crl-concept-head{margin-top:10px;padding:2px 4px;font-weight:bold;text-transform:uppercase;font-size:.85em;opacity:.7;border-top:1px solid var(--vscode-panel-border,#454545)}
.crl-lib-head{padding:2px 4px;font-size:.85em;opacity:.6;font-style:italic}
.crl-concept-row{cursor:pointer}
.crl-concept-row:hover{background:var(--vscode-list-hoverBackground)}
.crl-layer{display:inline-block;font-size:.8em;padding:0 4px;margin-right:4px;border-radius:3px;font-weight:bold}
.crl-layer-asserted{background:var(--vscode-charts-blue,#3794ff);color:var(--vscode-editor-background,#1e1e1e)}
.crl-layer-inferred{background:var(--vscode-charts-purple,#c586c0);color:var(--vscode-editor-background,#1e1e1e)}
.crl-mark{display:inline-block;font-size:.75em;padding:0 3px;margin-right:3px;border-radius:3px;opacity:.85;border:1px solid var(--vscode-panel-border,#454545)}
.crl-concept-name{font-weight:bold}
.crl-concept-def{opacity:.7;font-size:.95em}
.failed-criterion{outline:2px dashed var(--vscode-editorError-foreground,#f14c4c);outline-offset:1px}
.failed-criterion-preempt{outline:2px dashed var(--vscode-charts-yellow,#d29922);outline-offset:1px}
.failed-criterion-preempt::after{content:" ◂ diverted here";color:var(--vscode-charts-yellow,#d29922);font-size:.85em;opacity:.9}
#fcChrome{white-space:normal}
#fcChrome:empty{display:none}
.fc-toggle{display:flex;align-items:center;gap:4px;padding:4px 2px 6px;font-size:.85em}
.fc-toggle-label{opacity:.7;margin-right:2px}
.fc-toggle-btn{font:inherit;cursor:pointer;padding:1px 8px;border:1px solid var(--vscode-panel-border,#454545);background:var(--vscode-editorWidget-background,#252526);color:var(--vscode-foreground)}
.fc-toggle-btn.fc-active{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);border-color:var(--vscode-button-background,#0e639c)}
.fc-gaps{margin:0 0 6px;padding:4px 6px;border-left:3px solid var(--vscode-editorError-foreground,#f14c4c);background:var(--vscode-inputValidation-warningBackground,rgba(255,170,80,.12));font-size:.85em}
.fc-gaps-disabled{opacity:.85;font-style:italic}
.fc-gaps-head{opacity:.8;margin-bottom:2px}
.fc-gap-row{cursor:pointer;padding:1px 2px}
.fc-gap-row:hover{background:var(--vscode-list-hoverBackground)}
.fc-gap-open{text-decoration:underline;opacity:.85;margin-left:4px}
${CORR_STYLE}${FLOW_STYLE}`;
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style nonce="${styleNonce}">${style}</style></head><body><div id="fcChrome"></div><div id="root"></div>` +
    `<script nonce="${nonce}">` +
    `const v=acquireVsCodeApi();const root=document.getElementById('root');const fcc=document.getElementById('fcChrome');let gen=-1;` +
    `const clrFC=()=>{for(const el of root.querySelectorAll('.failed-criterion,.failed-criterion-preempt')){el.classList.remove('failed-criterion');el.classList.remove('failed-criterion-preempt');}};` +
    `window.addEventListener('message',(e)=>{const m=e.data;` +
    `if(m.type==='render'){gen=m.gen;root.innerHTML=m.html;fcc.innerHTML='';v.postMessage({type:'ready',gen:m.gen,indexVersion:m.indexVersion});}` +
    // The at-rest selection channel (.current). Clearing/applying it ALSO wipes the failed-criterion overlay — so the
    // NEXT engine reveal (a new selection / clear) drops the overlay; the SAME selection's failed-criteria mark arrives
    // AFTER this message (a later post) and so survives (#173 overlay lifecycle, disc 159).
    `else if(m.type==='clearHighlight'){for(const el of root.querySelectorAll('.current'))el.classList.remove('current');clrFC();}` +
    `else if(m.type==='highlight'){if(m.gen!==gen)return;` + // drop a reveal aimed at a superseded render
    `for(const el of root.querySelectorAll('.current'))el.classList.remove('current');clrFC();` +
    `for(const id of m.segmentIds){const el=document.getElementById(id);if(el)el.classList.add('current');}` +
    `const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}` +
    // The DISTINCT failed-criterion overlay channel (.failed-criterion). Gen-guarded like .current; replaces the prior
    // overlay (clear-then-set). Does NOT touch .current — the two channels coexist.
    `else if(m.type==='clearFailedCriteria'){clrFC();}` +
    `else if(m.type==='markFailedCriteria'){if(m.gen!==gen)return;clrFC();` +
    // Two channels: blockerIds → red `.failed-criterion`; preemptIds → amber `.failed-criterion-preempt` (a satisfied
    // diverting sibling, honestly distinct from a real blocker — disc 160 FIX 3).
    `for(const id of (m.blockerIds||[])){const el=document.getElementById(id);if(el)el.classList.add('failed-criterion');}` +
    `for(const id of (m.preemptIds||[])){const el=document.getElementById(id);if(el)el.classList.add('failed-criterion-preempt');}` +
    `const t=document.getElementById(m.scrollTo);if(t)t.scrollIntoView({block:'center'});}` +
    // The tree-pane chrome (toggle + gap banner) — injected ABOVE #root so it never clobbers the flowchart.
    `else if(m.type==='fcChrome'){fcc.innerHTML=m.html;}});` +
    `root.addEventListener('click',(e)=>{const t=e.target.closest&&e.target.closest('[data-reveal]');` +
    `if(t)v.postMessage({type:'reveal',key:t.getAttribute('data-reveal')});});` +
    // Chrome clicks: the All/Blocking toggle (data-fc-mode) + a gap row's Open CRL source (data-fc-gap).
    `fcc.addEventListener('click',(e)=>{const mode=e.target.closest&&e.target.closest('[data-fc-mode]');` +
    `if(mode){v.postMessage({type:'fcMode',mode:mode.getAttribute('data-fc-mode')});return;}` +
    `const gap=e.target.closest&&e.target.closest('[data-fc-gap]');` +
    `if(gap)v.postMessage({type:'fcOpenSource',idx:Number(gap.getAttribute('data-fc-gap'))});});` +
    `</script></body></html>`
  );
}
