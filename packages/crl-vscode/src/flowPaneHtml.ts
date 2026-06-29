// CRL FLOW pane RENDERER (vscode-free, unit-tested) — the graphical decision-tree flowchart (T2, disc 132).
// Renders CrlDecisionStructure[] as an SVG forest: each decision root branches through its when/otherwise/action sub-nodes;
// the gating `when` concept and any action guard appear as concept PEEK glyphs, and recommend targets are activity boxes.
//
// CSP-safe by construction: geometry is SVG PRESENTATION attributes (x/y/width/d/…) — never a `style=` attribute and never
// a `<style>` element inside the SVG; all color/font lives in FLOW_STYLE (a CSS string the shell concatenates into its
// nonced <style>, exactly like CORR_STYLE). Reveal shapes are IDENTICAL to RenderedCrl ({nodeKey} | {conceptNodeKey}) so
// the shell reuses the existing webviewHit/peek machinery with no new hit shapes (T3). DOM ids are GENERATED counters — a
// nodeKey is a JSON string (quotes/brackets) and cannot be a DOM id; `anchors` is keyed BY nodeKey → the generated id (the
// cross-pane join, mirroring crlPaneHtml). `id` + `data-reveal` ride the SAME <g> so highlight (getElementById) and click
// (closest('[data-reveal]')) resolve to one element.
import { classifyConcept, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode } from "@smile-digital-health/crl";

export interface FlowAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedFlow {
  html: string;
  /** structure nodeKey (decision/when/otherwise/action) → its <g> (highlight target). Concepts are NOT keyed here — a
   *  concept gates many whens; T3 derives concept→node highlight from the structure refKeys, not from these anchors.
   *  CONTRACT: `anchors` MUST stay structure-only. The cockpit highlights the tree by REUSING the CRL pane's anchor-key
   *  sets (crlAnchorsForUnits / conceptCrlAnchors), which mix structure-row keys with concept keys; the concept keys rely
   *  on no-op'ing here (no matching anchor). Keying a concept nodeKey would silently break the crl↔tree highlight lockstep. */
  anchors: Record<string, FlowAnchor>;
  /** opaque key → a node-body select ({nodeKey}, a crlNode) OR a concept/guard peek ({conceptNodeKey}). Same shapes as
   *  RenderedCrl, so the shell needs no new hit kinds. */
  reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
// SVG <text> has no CSS ellipsis — truncate the visible label here; the full text rides the <title> element for hover.
const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Layout constants (px). Fixed node width → deterministic + unit-testable coords. The SVG carries INTRINSIC width/height
// (not 100%) so an oversized chart scrolls/pans inside a narrow pane column rather than squashing.
const NODE_W = 168;
const NODE_H = 34;
const H_GAP = 52; // horizontal gap between depth columns
const V_GAP = 14; // vertical gap between slot rows
const PAD = 14; // outer padding
const FOREST_GAP = 1.4; // extra slot rows between successive decision trees
const ROW = NODE_H + V_GAP; // one slot's pixel height
const COL = NODE_W + H_GAP; // one depth's pixel width
const LABEL_MAX = 22; // chars before truncation

type FlowKind = "decision" | "when" | "otherwise" | "action";

interface LaidNode {
  nodeKey: string;
  kind: FlowKind;
  useDecision: boolean; // an action with actionKind "use-decision"
  label: string; // display label (NOT yet escaped/truncated)
  full: string; // untruncated label + lib, for the <title>
  conceptKey?: string; // resolved concept nodeKey for a peek (when concept / action guard); undefined if none/unresolved
  conceptLayer?: "asserted" | "inferred"; // for the peek glyph color, when a concept resolved
  conceptName?: string; // resolved concept's own name (disambiguates a when label + the peek <title>)
  conceptLib?: string; // resolved concept's OWN library (cross-lib concepts share a bare name — the lib disambiguates)
  depth: number;
  y: number; // slot units — leaves take the next integer slot; internal nodes take their children's midpoint
  children: LaidNode[];
}

/**
 * Tidy-tree layout (vscode-free, pure). Leaves take globally-sequential integer slots in DFS in-order, so every subtree
 * occupies a CONTIGUOUS disjoint slot band; an internal node sits at the midpoint of its children. Because x is fixed by
 * depth and sibling subtrees own disjoint bands, no two same-depth nodes overlap — no Reingold-Tilford contour pass is
 * needed (the only real overlap risk, advancing the forest cursor by root-center instead of subtree extent, is avoided by
 * keeping a SINGLE global slot cursor + a FOREST_GAP between trees).
 */
function buildLaid(
  structure: CrlDecisionStructure[],
  conceptMap: Map<string, CrlConceptNode>,
): { roots: LaidNode[]; maxDepth: number } {
  let slot = 0;
  let maxDepth = 0;

  const conceptFields = (refKey: string | undefined): Pick<LaidNode, "conceptKey" | "conceptLayer" | "conceptName" | "conceptLib"> => {
    if (refKey === undefined) return {};
    const c = conceptMap.get(refKey);
    if (!c) return {}; // unresolved concept ref → no peek (the node stays selectable via its OWN nodeKey)
    return { conceptKey: c.nodeKey, conceptLayer: classifyConcept(c).layer, conceptName: c.name, conceptLib: c.lib };
  };

  const layoutNode = (n: CrlStructureNode, depth: number): LaidNode => {
    maxDepth = Math.max(maxDepth, depth);
    const children = n.children.map((c) => layoutNode(c, depth + 1));
    const y = children.length ? (children[0].y + children[children.length - 1].y) / 2 : slot++;
    // when → gating concept = refKeys[0]; action → guard concept = refKeys[1] when present. refKeysOf emits exactly
    // [target] or [target, guardConcept] for an action, so the guard is at index 1 (NOT "the last" — reading [1] makes an
    // unexpected 3-element array fail loudly rather than silently mis-peeking). Either ref may be unresolved (refKeys are
    // string-constructed, not index-resolved) → conceptFields drops the peek but keeps the node.
    const conceptRef = n.kind === "when" ? n.refKeys[0] : n.kind === "action" && n.refKeys.length > 1 ? n.refKeys[1] : undefined;
    const cf = conceptFields(conceptRef);
    const useDecision = n.kind === "action" && n.actionKind === "use-decision";
    const display =
      n.kind === "when"
        ? cf.conceptName ?? n.label.replace(/^when\s+/, "") // concept name (resolved) else strip "when " from the label
        : useDecision
          ? `use decision ${n.label}` // distinct from a decision ROOT box so it doesn't read as the target's declaration
          : n.label; // otherwise → "otherwise"; recommend → the activity name
    // A when node IS its concept → title it with the CONCEPT's own lib (cross-lib concepts share a bare name). Other nodes
    // title with the owning decision row's lib. (Action TARGET lib isn't resolved here — the target's lib lives in its
    // nodeKey, not parsed in v1; the guard concept's lib rides its peek <title> via conceptName/conceptLib below.)
    const full = n.kind === "when" && cf.conceptName ? `${cf.conceptName} — concept "${cf.conceptLib}"` : `${display} — ${n.lib}`;
    return { nodeKey: n.nodeKey, kind: n.kind, useDecision, label: display, full, depth, y, children, ...cf };
  };

  const roots: LaidNode[] = [];
  for (const d of structure) {
    const children = d.children.map((c) => layoutNode(c, 1));
    const y = children.length ? (children[0].y + children[children.length - 1].y) / 2 : slot++; // lone decision → a leaf slot
    roots.push({
      nodeKey: d.nodeKey,
      kind: "decision",
      useDecision: false,
      label: `decision "${d.decision}"`,
      full: `decision "${d.decision}" — ${d.lib}`,
      depth: 0,
      y,
      children,
    });
    slot += FOREST_GAP; // next tree's leaves continue from here → disjoint vertical band per decision tree
  }
  return { roots, maxDepth };
}

export function renderFlowPane(
  structure: CrlDecisionStructure[],
  opts: { revealPrefix?: string; concepts?: CrlConceptNode[] } = {},
): RenderedFlow {
  const prefix = opts.revealPrefix ?? "";
  const concepts = opts.concepts ?? [];
  const anchors: Record<string, FlowAnchor> = {};
  const reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }> = {};

  if (structure.length === 0) {
    return { html: '<p class="placeholder">No CRL decisions to chart.</p>', anchors, reveals };
  }

  const conceptMap = new Map(concepts.map((c) => [c.nodeKey, c]));
  const { roots, maxDepth } = buildLaid(structure, conceptMap);

  const all: LaidNode[] = [];
  const collect = (n: LaidNode): void => {
    all.push(n);
    n.children.forEach(collect);
  };
  roots.forEach(collect);

  const maxY = all.reduce((m, n) => Math.max(m, n.y), 0);
  const width = PAD * 2 + maxDepth * COL + NODE_W;
  const height = Math.ceil(PAD * 2 + maxY * ROW + NODE_H);

  // Coordinates are ROUNDED to integers: midpoint averaging + FOREST_GAP yield fractional slots, and sub-pixel SVG coords
  // blur + make tests brittle. Distinct same-depth nodes are ≥1 slot apart (ROW=48px center-to-center) leaving ≥V_GAP=14px
  // box clearance — far more than the ≤1px rounding error can erode, so rounding never reintroduces overlap.
  const left = (n: LaidNode): number => PAD + n.depth * COL; // node left x (already integer: depth*COL + PAD)
  const top = (n: LaidNode): number => Math.round(PAD + n.y * ROW); // node top y (rounded)
  const midY = (n: LaidNode): number => top(n) + NODE_H / 2; // node vertical center (integer: NODE_H even)

  // Edges first (so node boxes paint over them). Edges are pure <path> — NEVER reveal targets.
  let body = "";
  for (const n of all) {
    const px = left(n) + NODE_W;
    const py = midY(n);
    for (const c of n.children) {
      const ex = left(c);
      const ey = midY(c);
      const mx = Math.round((px + ex) / 2);
      body += `<path class="flow-edge" d="M${px} ${py} C${mx} ${py} ${mx} ${ey} ${ex} ${ey}"/>`;
    }
  }

  // Nodes. Generated counter ids (NOT nodeKey-derived) for both `id` and the reveal key.
  let idx = 0;
  for (const n of all) {
    const gid = `${prefix}flow${idx++}`;
    const key = `${prefix}k${gid}`;
    anchors[n.nodeKey] = { scrollTo: gid, segmentIds: [gid] };
    reveals[key] = { nodeKey: n.nodeKey };
    const x = left(n);
    const y = top(n);
    const kindClass = n.kind === "action" ? (n.useDecision ? "flow-use" : "flow-activity") : `flow-${n.kind}`;
    // Concept/guard PEEK glyph — a nested data-reveal so closest() resolves a glyph click to the {conceptNodeKey} peek and
    // a body click to the {nodeKey} select. Only when the concept resolved (else the node stays selectable, no peek).
    let peek = "";
    if (n.conceptKey !== undefined) {
      const pk = `${prefix}p${gid}`;
      reveals[pk] = { conceptNodeKey: n.conceptKey };
      const cls = n.conceptLayer === "inferred" ? "flow-peek-inferred" : "flow-peek-asserted";
      const peekTitle = n.conceptName ? escapeHtml(`${n.conceptName} — concept "${n.conceptLib}"`) : "peek concept";
      peek =
        `<g class="flow-peek ${cls}" data-reveal="${escapeHtml(pk)}">` +
        `<circle cx="${x + NODE_W - 13}" cy="${y + 13}" r="5"/><title>${peekTitle}</title></g>`;
    }
    body +=
      `<g id="${escapeHtml(gid)}" class="flow-row ${kindClass}" data-reveal="${escapeHtml(key)}">` +
      `<title>${escapeHtml(n.full)}</title>` +
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6"/>` +
      `<text x="${x + 10}" y="${y + NODE_H / 2 + 4}">${escapeHtml(truncate(n.label, LABEL_MAX))}</text>` +
      peek +
      `</g>`;
  }

  const svg =
    `<svg class="flow-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    body +
    `</svg>`;
  return { html: `<div class="flow-wrap">${svg}</div>`, anchors, reveals };
}

/** Flow-pane CSS — concatenated into the cockpit's nonced <style> (CSP-safe: no inline styles / no SVG <style>). Every
 *  var(--vscode-*) carries a hex fallback (the chart renders in tests / high-contrast with no live theme), matching
 *  CORR_STYLE + shellHtml. `.flow-row.current rect` is the SVG-friendly highlight (the shell's global `.current` outline
 *  does not paint on a <g>). */
export const FLOW_STYLE =
  `.flow-wrap{display:inline-block;min-width:100%}` +
  `.flow-svg{display:block;font:12px var(--vscode-editor-font-family,sans-serif)}` +
  `.flow-row{cursor:pointer}` +
  `.flow-row>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-panel-border,#454545);stroke-width:1}` +
  `.flow-row>text{fill:var(--vscode-foreground,#cccccc)}` +
  `.flow-decision>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-focusBorder,#3794ff);stroke-width:1.5}` +
  `.flow-decision>text{font-weight:bold}` +
  `.flow-when>rect{fill:var(--vscode-editorHoverWidget-background,#2c2c2d);stroke:var(--vscode-symbolIcon-keywordForeground,#c586c0)}` +
  `.flow-otherwise>rect{stroke-dasharray:3 2;opacity:.85}` +
  `.flow-activity>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-symbolIcon-functionForeground,#dcdcaa);stroke-width:1.5}` +
  `.flow-use>rect{stroke:var(--vscode-textLink-foreground,#3794ff);stroke-dasharray:5 2}` +
  `.flow-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.2}` +
  `.flow-peek{cursor:pointer}` +
  `.flow-peek-asserted>circle{fill:var(--vscode-charts-blue,#3794ff)}` +
  `.flow-peek-inferred>circle{fill:var(--vscode-charts-purple,#c586c0)}` +
  `.flow-row.current>rect{stroke:var(--vscode-focusBorder,#3794ff);stroke-width:2.5}` +
  // disc 164: the produced-path DIVERTER overlay on the SVG rect (the shell's HTML `.diverter` outline does not paint on
  // a <g>, same as the channels below). A neutral teal DOTTED stroke for the evaluated-false `when`s that routed the case
  // to its produced disposition (the Adult gate for a not-adult deny). Ordered BEFORE `.failed-criterion` so a blocker
  // (red) wins over a diverter on the rare fail-overlap; `.this-node` (last) still wins over both (focus is primary).
  `.flow-row.diverter>rect{stroke:var(--vscode-terminal-ansiCyan,#4ec9b0);stroke-width:2;stroke-dasharray:1 3}` +
  // #173 T3: the failed-criterion overlay on an SVG <g> — the shell's global `.failed-criterion` HTML outline does not
  // paint on a <g>, so paint the rect (a dashed error-colored stroke, visually distinct from `.current`'s solid focus).
  `.flow-row.failed-criterion>rect{stroke:var(--vscode-editorError-foreground,#f14c4c);stroke-width:2.5;stroke-dasharray:4 2}` +
  // FIX 3 (disc 160): a preemption row (a SATISFIED diverting sibling) gets the DISTINCT amber stroke, not the red.
  `.flow-row.failed-criterion-preempt>rect{stroke:var(--vscode-charts-yellow,#d29922);stroke-width:2.5;stroke-dasharray:4 2}` +
  // #156 slice 5: the Medical Validation review overlay — a PERSISTENT done/error channel that survives selection (unlike
  // failed-criterion, which clears on every reveal). It is a NON-OUTLINE FILL TINT on the rect, an INDEPENDENT SVG axis
  // from the two stroke-only channels above: `.current` and `.failed-criterion`/`-preempt` set only `stroke`/`stroke-width`,
  // so a done/error FILL coexists with both WITHOUT fighting (a `.current.done-node` keeps its focus stroke AND reads as
  // done; a `.failed-criterion.error-node` keeps its dashed red stroke over the error fill). The fill overrides the base
  // `.flow-row>rect` fill AND the kind-fills (flow-decision/when/activity) by SPECIFICITY, not order: `.flow-row.done-node>rect`
  // = (0,2,1) outranks `.flow-decision>rect`/`.flow-activity>rect` = (0,1,1) regardless of where they sit in the sheet
  // (FIX 4, Claude impl review). done = a subdued green wash; error = a subdued red wash, visually distinct from done AND
  // from the amber/red STROKES of the failed-criterion channel (different axis: a reviewed-case RUN error, not a blocking
  // criterion). error renders over done (error⊆done by construction): the host adds `.error-node` only (not `.done-node`)
  // to error nodes; the two review rules are EQUAL specificity, so `.error-node>rect` sits AFTER `.done-node>rect` — the
  // last-wins tiebreak that makes error beat done if both classes ever co-occur.
  `.flow-row.done-node>rect{fill:var(--vscode-testing-iconPassed,#3fb950);fill-opacity:.18}` +
  `.flow-row.error-node>rect{fill:var(--vscode-testing-iconFailed,#f14c4c);fill-opacity:.20}` +
  // #177 slice 4: the "this node" cross-pane marker — the FOCUSED questionnaire question's tree node. It paints a
  // distinctive solid `stroke` on the >rect — the SAME proven axis `.current`/`.failed-criterion` use (FIX 1 impl review:
  // this repo's evidence is that `outline` does NOT paint on the SVG here, which is exactly why those switched to stroke).
  // It COEXISTS with `.done-node`/`.error-node` (those are `fill` — fill + stroke layer fine: a done node that's the focused
  // question shows the green fill AND this accent border). Against the OTHER stroke channels (`.current`/`.failed-criterion`/
  // `-preempt`/`.diverter`) it deliberately WINS: it is ordered LAST among the stroke rules (after them in the sheet, equal specificity),
  // so on a node that is BOTH the focused question and selected/a-criterion the focused-question marker (the primary
  // indicator) overrides the transient selection/criterion stroke (the right tradeoff). The color is a DISTINCT accent
  // (`--vscode-charts-orange`), NOT the blue `--vscode-focusBorder` the reveal (`.current`) uses — blue means "selected /
  // on the path", so the focus ("the question you're on") must read differently from a path node (it is not on the path,
  // e.g. a not-adult deny whose Q1 `when` isn't in the reveal cluster). Thicker than `.current` (2.5); `stroke-dasharray:none`.
  `.flow-row.this-node>rect{stroke:var(--vscode-charts-orange,#d18616);stroke-width:3;stroke-dasharray:none}`;
