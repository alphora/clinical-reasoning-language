// Cockpit navigator ENGINE (vscode-free, unit-tested) — three-pane viewer C2a (#156).
// A pure reducer: (state, action) → { state, effects }. Holds a COMPACT index (steps/ids — NOT anchor.text/marks;
// the shell holds the full ViewerModel + feeds the renderers). Effects are SEMANTIC only (a pane + a referent to
// reveal) — never DOM/columns/keys; the shell/coordinator resolves a referent → DOM anchor at the pane's current gen.
// Design authority: .vibe-tools/discussions/118-c2a-source-spine.md (CONVERGED, 2 rounds).
import type { CycleStep } from "./provenanceViewer";

export type Pane = "source" | "crl" | "cel";

/** Compact engine input — derived by the shell from C1's ViewerModel. No bulky content. */
export interface CockpitIndex {
  version: number;
  anchorFilePath: string;
  steps: CycleStep[];
  /** source-bearing step unitIds, in order — the cycle order for primary:"source" (skips source-less steps). */
  sourceCycleIds: string[];
  /** CRL nav list (pre-order; the cycle/selectable set for primary:"crl"). SUPERSET of every row a source unit can
   *  map to, so a source-click-mapped crl node always resolves. */
  crlNav: CrlNavItem[];
}

export interface CrlNavItem {
  nodeKey: string;
  label: string;
  description?: string;
}

export type Selection =
  | { primary: "source"; unitId: string }
  | { primary: "crl"; nodeKey: string }
  | { primary: "cel"; caseId: string };

export interface State {
  primary: Pane;
  selection?: Selection;
  paneVisibility: Record<Pane, boolean>;
  index?: CockpitIndex;
}

export type Action =
  | { type: "setInputs"; index: CockpitIndex }
  | { type: "setPrimary"; primary: Pane }
  | { type: "select"; selection: Selection }
  | { type: "next" }
  | { type: "prev" }
  | { type: "setPaneVisible"; pane: Pane; visible: boolean };

/** SEMANTIC reveal — a referent the shell resolves to each pane's locus + DOM anchor. No DOM/column/key here. */
export interface RevealEffect {
  type: "reveal";
  pane: Pane;
  target: { kind: "unit" | "crlNode" | "celCase"; id: string };
}
export type Effect = RevealEffect;
export interface ReduceResult {
  state: State;
  effects: Effect[];
}

export function initialState(): State {
  return { primary: "source", paneVisibility: { source: true, crl: true, cel: true } };
}

/** Headless navigator model — the items the navigator (a TreeView in C2a; a webview adapter later) renders. */
export interface NavigatorItem {
  id: string;
  label: string;
  description?: string;
  selection: Selection;
}

/** Derive the current-primary navigator list from state: source-bearing steps (source) or the CRL nav list (crl). */
export function navigatorItems(state: State): NavigatorItem[] {
  const idx = state.index;
  if (!idx) return [];
  if (state.primary === "source") {
    const byId = new Map(idx.steps.map((s) => [s.unitId, s]));
    return idx.sourceCycleIds
      .map((id) => byId.get(id))
      .filter((s): s is CycleStep => s !== undefined)
      .map((s) => ({ id: s.unitId, label: s.label, selection: { primary: "source", unitId: s.unitId } }));
  }
  if (state.primary === "crl") {
    return idx.crlNav.map((n) => ({
      id: n.nodeKey,
      label: n.label,
      ...(n.description ? { description: n.description } : {}),
      selection: { primary: "crl", nodeKey: n.nodeKey },
    }));
  }
  return []; // cel — C2c
}

const PANES: Pane[] = ["source", "crl", "cel"];

function selectionTarget(sel: Selection): RevealEffect["target"] {
  if (sel.primary === "source") return { kind: "unit", id: sel.unitId };
  if (sel.primary === "crl") return { kind: "crlNode", id: sel.nodeKey };
  return { kind: "celCase", id: sel.caseId };
}

/** A reveal for each VISIBLE pane (pane-agnostic — placeholder panes included; the shell no-ops them). */
function revealAllVisible(state: State, sel: Selection): Effect[] {
  const target = selectionTarget(sel);
  return PANES.filter((p) => state.paneVisibility[p]).map((pane) => ({ type: "reveal", pane, target }));
}

/** Does the selection's referent still exist + remain navigable in the index? (source: must stay source-bearing.) */
function selectionResolves(index: CockpitIndex | undefined, sel: Selection | undefined): boolean {
  if (!index || !sel) return false;
  if (sel.primary === "source") return index.sourceCycleIds.includes(sel.unitId);
  if (sel.primary === "crl") return index.crlNav.some((n) => n.nodeKey === sel.nodeKey);
  return false; // cel — C2c
}

function cycle(ids: string[], currentId: string | undefined, dir: 1 | -1): string | undefined {
  if (ids.length === 0) return undefined;
  const i = currentId ? ids.indexOf(currentId) : -1;
  const n = ids.length;
  const next = i < 0 ? (dir === 1 ? 0 : n - 1) : (((i + dir) % n) + n) % n;
  return ids[next];
}

export function reduce(state: State, action: Action): ReduceResult {
  switch (action.type) {
    case "setInputs": {
      // Remap selection: keep only if it still resolves against the new index; re-reveal it (the shell re-queues
      // against the new render/indexVersion via the coordinator).
      const keep = selectionResolves(action.index, state.selection);
      const selection = keep ? state.selection : undefined;
      const next: State = { ...state, index: action.index, selection };
      return { state: next, effects: selection ? revealAllVisible(next, selection) : [] };
    }
    case "setPrimary": {
      if (action.primary === state.primary) return { state, effects: [] };
      // Switching primary doesn't touch paneOrder/visibility; selection is primary-specific → clear it.
      return { state: { ...state, primary: action.primary, selection: undefined }, effects: [] };
    }
    case "select": {
      // Harden the command surface (direct invocation, a stale async quick-pick after a primary toggle): only apply a
      // selection that resolves in the current index AND is in the current primary's space.
      if (!selectionResolves(state.index, action.selection) || action.selection.primary !== state.primary) {
        return { state, effects: [] };
      }
      const next: State = { ...state, selection: action.selection };
      return { state: next, effects: revealAllVisible(next, action.selection) };
    }
    case "next":
    case "prev": {
      if (!state.index) return { state, effects: [] };
      const dir = action.type === "next" ? 1 : -1;
      if (state.primary === "source") {
        const cur = state.selection?.primary === "source" ? state.selection.unitId : undefined;
        const id = cycle(state.index.sourceCycleIds, cur, dir);
        if (id === undefined) return { state, effects: [] };
        const selection: Selection = { primary: "source", unitId: id };
        const next: State = { ...state, selection };
        return { state: next, effects: revealAllVisible(next, selection) };
      }
      if (state.primary === "crl") {
        const cur = state.selection?.primary === "crl" ? state.selection.nodeKey : undefined;
        const id = cycle(
          state.index.crlNav.map((n) => n.nodeKey),
          cur,
          dir,
        );
        if (id === undefined) return { state, effects: [] };
        const selection: Selection = { primary: "crl", nodeKey: id };
        const next: State = { ...state, selection };
        return { state: next, effects: revealAllVisible(next, selection) };
      }
      return { state, effects: [] };
    }
    case "setPaneVisible": {
      if (state.paneVisibility[action.pane] === action.visible) return { state, effects: [] };
      const next: State = {
        ...state,
        paneVisibility: { ...state.paneVisibility, [action.pane]: action.visible },
      };
      // Newly-visible pane with a current selection → reveal it there; hiding → no effect.
      const effects: Effect[] =
        action.visible && next.selection
          ? [{ type: "reveal", pane: action.pane, target: selectionTarget(next.selection) }]
          : [];
      return { state: next, effects };
    }
  }
}
