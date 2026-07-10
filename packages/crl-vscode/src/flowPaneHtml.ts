// CRL FLOW pane RENDERER (vscode-free, unit-tested) — the graphical decision-tree flowchart (T2, disc 132).
// Renders CrlDecisionStructure[] as an SVG forest: each decision root branches through its when/otherwise/action sub-nodes;
// a composite `when` hangs its `defined as` operator OUTLINE below it, and recommend targets are determination boxes.
// #187 Todo 2 BORDER SEMANTICS: a node's border carries meaning — a `when` is grey (Source) or purple (inferred, no
// `code is`); every recommend target / ordinary activity / use-decision / decision is neutral grey (#210: the old PA-specific
// certify→green / not-certify→gold determination borders were removed). Nothing is blue (blue is the on-path ring).
//
// CSP-safe by construction: geometry is SVG PRESENTATION attributes (x/y/width/d/…) — never a `style=` attribute and never
// a `<style>` element inside the SVG; all color/font lives in FLOW_STYLE (a CSS string the shell concatenates into its
// nonced <style>, exactly like CORR_STYLE). Reveal shapes are IDENTICAL to RenderedCrl ({nodeKey} | {conceptNodeKey}) so
// the shell reuses the existing webviewHit/peek machinery with no new hit shapes (T3). DOM ids are GENERATED counters — a
// nodeKey is a JSON string (quotes/brackets) and cannot be a DOM id; `anchors` is keyed BY nodeKey → the generated id (the
// cross-pane join, mirroring crlPaneHtml). `id` + `data-reveal` ride the SAME <g> so highlight (getElementById) and click
// (closest('[data-reveal]')) resolve to one element.
import { buildDefStruct, displayDetermination, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode, type DefStructExpr, type ResolveDefExprEntry } from "@smile-digital-health/crl";

/** Reserved prefix marking a synthetic outline-row nodeKey — provably disjoint from every structure/concept nodeKey
 *  (those are JSON arrays), so a leaf anchor no-ops against every existing keyset. A concept-operand leaf's key carries
 *  the OPERAND-INDEX PATH (`leaf::<whenKey>|<opPath>|<conceptNodeKey>`) so two positional occurrences of the SAME concept
 *  under one composite get DISTINCT keys (else `anchors`/`leafConcepts` overwrite — corrupting highlight + the verdict
 *  join). Operator / top-OR / external / more rows carry a render-only synthetic key (never anchored). */
const LEAF_KEY = "leaf::";
/** Collision-proof synthetic outline-row key: `leaf::` + a JSON tuple (NOT raw `|` concat — a nodeKey is itself a JSON
 *  array that can contain any delimiter, so `${when}|${path}|${nodeKey}` could collide across different tuples, the same
 *  class of bug `truthKey` avoids in the questionnaire). `tag` is the concept nodeKey (a leaf) or "op"/"ext"/"more"/"or". */
const outlineKey = (topWhenKey: string, opPath: string, tag: string): string => `${LEAF_KEY}${JSON.stringify([topWhenKey, opPath, tag])}`;

// #187 Option-C: the operator OUTLINE that hangs BELOW a composite `when` (indented rows, not right-columns). X is
// INDENT-based (`when.left + BASE + indent*INDENT`), independent of the depth grid, so the outline never widens columns.
const OUTLINE_BASE = 16; // x offset of an indent-0 outline row from its `when`'s left edge
const OUTLINE_INDENT = 15; // x added per indent level
const OUTLINE_ADVANCE = 0.7; // slot units an outline row advances the global cursor (compact; sized for OUTLINE_H + ~6.7px gap over ROW)
const OUTLINE_NODE_W = 150; // a leaf box in the outline (narrower than a decision NODE_W, since it indents)
const OUTLINE_H = 34; // a leaf box height in the outline — sized for up to TWO wrapped lines (#208)
const OUTLINE_LABEL_MAX = 20; // chars PER LINE before wrapping/truncation (the min that de-collides the screenshot's outline leaves + box-fit margin)

export interface FlowAnchor {
  scrollTo: string;
  segmentIds: string[];
}
export interface RenderedFlow {
  html: string;
  /** structure nodeKey (decision/when/otherwise/action) → its <g> (highlight target). CONTRACT: no CONCEPT nodeKey is
   *  EVER an anchor key. The cockpit highlights the tree by REUSING the CRL pane's anchor-key sets (crlAnchorsForUnits /
   *  conceptCrlAnchors), which mix structure-row keys with concept keys; the concept keys rely on no-op'ing here (no
   *  matching anchor). Keying a concept nodeKey would silently break the crl↔tree highlight lockstep. #187 Todo 4 adds a
   *  SECOND anchor family — synthetic def-leaf keys (reserved `leaf::` prefix, a string, vs the JSON-array structure/concept
   *  keys) — which are provably DISJOINT from every existing keyset, so they too no-op against today's highlights and are
   *  the ONLY channel a future Todo-5 worklist-leaf highlight targets. The invariant is "no concept key is an anchor," not
   *  literally "structure-only". */
  anchors: Record<string, FlowAnchor>;
  /** opaque key → a node-body select ({nodeKey}, a crlNode) OR a concept/guard peek ({conceptNodeKey}). Same shapes as
   *  RenderedCrl, so the shell needs no new hit kinds. */
  reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }>;
  /** #187 Todo 5: def-leaf anchor key (the same `leaf::` key used in `anchors`) → its leaf concept identity + the OWNING
   *  composite `when` structure key. The cockpit joins `{lib,name}` to a case's `conceptTruth` for the yes/no verdict and
   *  gates on `topWhenKey` being on the fired-satisfied path. The `+N more` stub + cross-lib/omitted leaves get NO entry. */
  leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
// SVG <text> has no CSS ellipsis — truncate the visible label here; the full text rides the <title> element for hover.
const truncate = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// #187 Todo 3: the on-path RING — a hidden, stroked `<rect>` `off` px larger than the body box on every side, nested in a
// `<g class="flow-ring">` (a GRANDCHILD, so the `.flow-row>rect` / kind / overlay selectors never style it) and revealed
// by CSS when the row is `.current` (main path) or `.flow-leaf-yes` (a true operand). Deterministic rect-stroke (the proven
// SVG axis) — NOT a CSS `outline` (which is env-fragile on `<g>` and would ring box∪guard-tab). Composes with the node's
// own identity border (a separate axis). `pointer-events:none` (CSS) so a click falls through to the row's data-reveal.
const flowRing = (x: number, y: number, w: number, h: number, off: number, rx: number): string =>
  `<g class="flow-ring"><rect x="${x - off}" y="${y - off}" width="${w + 2 * off}" height="${h + 2 * off}" rx="${rx}"/></g>`;

/** #208: wrap a label to ≤2 lines for a FIXED-width box (we wrap, never widen — the operator rejected horizontal sprawl).
 *  `maxChars` is the per-line char budget (the old single-line limit). Line 1 is GUARANTEED ≤ maxChars — the LONGEST
 *  whitespace-bounded prefix that fits — so it never overflows horizontally. Line 2 is the remainder (trailing-trimmed,
 *  `…`-truncated only if it STILL overflows). A single word longer than maxChars is CHAR-split across both lines (keeps
 *  2× the distinguishing characters — the point is de-collision) rather than collapsing to one ellipsized line.
 *  Precondition: `maxChars >= 2` (real callers pass the box-fit constants). Labels are canonical CRL names (single ASCII
 *  spaces); the leading/trailing `trim` guards stray whitespace but internal tabs/nbsp are not treated as break points. */
export function wrapLabel(label: string, maxChars: number): string[] {
  const s = label.trim();
  if (s.length <= maxChars) return [s];
  let brk = -1; // the LAST space at/before maxChars → the longest fitting line 1
  for (let i = 0; i <= maxChars && i < s.length; i++) if (s[i] === " ") brk = i;
  if (brk <= 0) {
    const rest = s.slice(maxChars); // no fitting whitespace break → char-split
    return [s.slice(0, maxChars), rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest];
  }
  const line1 = s.slice(0, brk).trimEnd();
  const rest = s.slice(brk + 1).replace(/^\s+/, "");
  if (rest === "") return [line1]; // all-trailing-space remainder → one line, not an empty second tspan
  return [line1, rest.length > maxChars ? `${rest.slice(0, maxChars - 1).trimEnd()}…` : rest];
}

/** A centered node label — one `<text>` (short) or two vertically-centered `<tspan>`s (wrapped), inside a box of height `h`. */
const labelMarkup = (label: string, x: number, y: number, h: number, maxChars: number, dx: number): string => {
  const lines = wrapLabel(label, maxChars);
  const tx = x + dx;
  return lines.length === 1
    ? `<text x="${tx}" y="${y + h / 2 + 4}">${escapeHtml(lines[0])}</text>`
    : `<text x="${tx}"><tspan x="${tx}" y="${y + h / 2 - 4}">${escapeHtml(lines[0])}</tspan><tspan x="${tx}" y="${y + h / 2 + 11}">${escapeHtml(lines[1])}</tspan></text>`;
};

// Layout constants (px). Fixed node width → deterministic + unit-testable coords. The SVG carries INTRINSIC width/height
// (not 100%) so an oversized chart scrolls/pans inside a narrow pane column rather than squashing.
const NODE_W = 168;
const NODE_H = 44; // #208: sized for up to TWO wrapped lines (uniform → exact centering + a mechanical golden scale)
const H_GAP = 52; // horizontal gap between depth columns
const V_GAP = 14; // vertical gap between slot rows
const PAD = 14; // outer padding
const FOREST_GAP = 1.4; // extra slot rows between successive decision trees
const ROW = NODE_H + V_GAP; // one slot's pixel height
const COL = NODE_W + H_GAP; // one depth's pixel width
const LABEL_MAX = 22; // chars PER LINE before wrapping/truncation (the proven ~168px-box fit; already de-collides main labels)

type FlowKind = "decision" | "when" | "otherwise" | "action" | "leaf";

interface LaidNode {
  nodeKey: string;
  kind: FlowKind;
  useDecision: boolean; // an action with actionKind "use-decision"
  label: string; // display label (NOT yet escaped/truncated)
  full: string; // untruncated label + lib, for the <title>
  conceptKey?: string; // resolved concept nodeKey — a `when`'s gating concept or an outline leaf's own concept (peek target)
  conceptName?: string; // resolved concept's own name (disambiguates a when label + the peek <title>)
  conceptLib?: string; // resolved concept's OWN library (cross-lib concepts share a bare name — the lib disambiguates)
  /** Concept-bearing node's Source flag: `true` = has a local `code is` (grey border); `false` = inferred / no `code is`
   *  (purple border); `undefined` = concept-less OR an unresolved concept ref → neutral (Todo 2 border scheme). */
  isSource?: boolean;
  /** #187 Todo 2b: a guarded `recommend X when <guard>`'s resolved guard concept — rendered as a clickable "when …" TAB
   *  on the action box (a discoverable replacement for the removed peek dot). Absent for an unguarded recommend. */
  guard?: { conceptKey: string; conceptName: string; conceptLib: string; isSource: boolean };
  /** #187 Todo 4: a synthetic `defined as` operand leaf (a concept-operand row) hanging under a composite `when` — NOT a
   *  decision structure row. Rendered with a distinct `.flow-def-edge`; excluded from `{nodeKey}` select + the per-case
   *  overlays. Set ONLY on `outlineRow === "leaf"` rows (the addressable operands). */
  isDefLeaf?: boolean;
  /** #187 Todo 5: on a def-leaf, the structure nodeKey of the OWNING composite `when` (the leaf's top ancestor, threaded
   *  unchanged through nested operands). The per-case leaf-verdict overlay gates on THIS when being on the fired-satisfied
   *  path — so an off-path composite's leaves stay un-answered (parity with the questionnaire's on-path-only expansion). */
  topWhenKey?: string;
  /** #187 Option-C: an OUTLINE row (hangs below its `when`; x is indent-based, edges are the dashed spine). `outlineRow`
   *  is the row CATEGORY — only `"leaf"` rows are addressable (anchor + peek + verdict); `topor`/`op`/`external`/`more`
   *  are RENDER-ONLY (no anchor, no reveal). `indent` drives x; `absX` is the precomputed left (indent-based). */
  outline?: boolean;
  outlineRow?: "topor" | "op" | "leaf" | "external" | "more";
  indent?: number;
  absX?: number;
  depth: number;
  y: number; // slot units — leaves take the next integer slot; internal nodes take their children's midpoint
  children: LaidNode[];
}

/**
 * #210: the DISPOSITION-LEAF nodeKeys in a structure forest — a recommend-activity `action` (an outcome tip, whatever its
 * determination category). Used by the MV verdict fold's leaf-aware precedence (pass wins on interior nodes, FAIL
 * wins on a leaf). Deliberately EXCLUDES `use-decision` actions (interior delegation glue — the real disposition is the
 * sub-decision's own recommend) and every `when`/`otherwise`/`decision` node. A branch with MULTIPLE recommends yields
 * MULTIPLE leaves (any outcome tip reddens); an `otherwise → Unmet` recommend IS a leaf (walks all children regardless of
 * parent kind). Pure + vscode-free so the host's `driveDoneOverlay` and the unit test share ONE definition.
 */
export function collectDispositionLeafKeys(structure: CrlDecisionStructure[]): Set<string> {
  const leaves = new Set<string>();
  const walk = (nodes: readonly CrlStructureNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "action" && n.actionKind === "recommend-activity") leaves.add(n.nodeKey);
      walk(n.children);
    }
  };
  for (const d of structure) walk(d.children);
  return leaves;
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
  opts: { defExpr?: ResolveDefExprEntry } = {},
): { roots: LaidNode[]; maxDepth: number } {
  let slot = 0;
  let maxDepth = 0;
  const outlineX = (whenLeft: number, indent: number): number => whenLeft + OUTLINE_BASE + indent * OUTLINE_INDENT;

  const conceptFields = (refKey: string | undefined): Pick<LaidNode, "conceptKey" | "conceptName" | "conceptLib" | "isSource"> => {
    if (refKey === undefined) return {};
    const c = conceptMap.get(refKey);
    if (!c) return {}; // unresolved concept ref → the node stays selectable via its OWN nodeKey, border stays neutral
    return { conceptKey: c.nodeKey, conceptName: c.name, conceptLib: c.lib, isSource: c.hasLocalCode };
  };

  // #187 Option-C: lay out a composite's `defined as` structure (`DefStructExpr`, the SAME shared builder the
  // Questionnaire consumes) as an INDENTED OUTLINE hanging below the `when`. Rows advance a LOCAL `cursor` (NOT the global
  // slot) so the outline is positioned relative to its OWN `when` (top-aligned, just below the node) instead of sinking to
  // the bottom of the branch-body band. Each visible row (op label / leaf / external / more) takes ONE compact row (DFS
  // pre-order: a header before its children) at an INDENT-based `absX`. `opPath` is the positional index path — the same
  // concept at two positions gets DISTINCT `leaf::` keys (no anchor/verdict collision). `topWhenKey` threads to every leaf.
  const buildOutline = (s: DefStructExpr, whenLeft: number, topWhenKey: string, indent: number, opPath: string, cursor: { y: number }): LaidNode => {
    const base = { useDecision: false, outline: true as const, indent, absX: outlineX(whenLeft, indent), depth: 0, topWhenKey };
    const take = (): number => {
      const y = cursor.y;
      cursor.y += OUTLINE_ADVANCE;
      return y;
    };
    switch (s.kind) {
      case "or":
      case "and": {
        const y = take();
        const children = s.operands.map((o, i) => buildOutline(o, whenLeft, topWhenKey, indent + 1, `${opPath}.${i}`, cursor));
        return { ...base, nodeKey: outlineKey(topWhenKey, opPath, "op"), kind: "leaf", outlineRow: "op", label: s.kind === "or" ? "any of" : "all of", full: s.kind === "or" ? "any of" : "all of", y, children };
      }
      case "not": {
        const y = take();
        const child = buildOutline(s.operand, whenLeft, topWhenKey, indent + 1, `${opPath}.0`, cursor);
        return { ...base, nodeKey: outlineKey(topWhenKey, opPath, "op"), kind: "leaf", outlineRow: "op", label: "not", full: "not", y, children: [child] };
      }
      case "external": {
        const y = take();
        return { ...base, nodeKey: outlineKey(topWhenKey, opPath, "ext"), kind: "leaf", outlineRow: "external", label: s.name, full: `${s.name} — external (unresolved here)`, conceptName: s.name, conceptLib: s.lib, y, children: [] };
      }
      case "more": {
        const y = take();
        const label = s.count > 0 ? `+${s.count} more` : "…";
        return { ...base, nodeKey: outlineKey(topWhenKey, opPath, "more"), kind: "leaf", outlineRow: "more", label, full: s.count > 0 ? `${s.count} more operand(s)` : "deeper operands elided", y, children: [] };
      }
      case "leaf": {
        const y = take();
        const children = s.composite ? [buildOutline(s.composite, whenLeft, topWhenKey, indent + 1, `${opPath}.c`, cursor)] : [];
        return {
          ...base, nodeKey: outlineKey(topWhenKey, opPath, s.nodeKey), kind: "leaf", outlineRow: "leaf", isDefLeaf: true,
          label: s.name, full: `${s.name} — concept "${s.lib}"`,
          conceptKey: s.nodeKey, conceptName: s.name, conceptLib: s.lib, isSource: s.isSource,
          y, children,
        };
      }
    }
  };

  const layoutNode = (n: CrlStructureNode, depth: number): LaidNode => {
    maxDepth = Math.max(maxDepth, depth);
    const structureChildren = n.children.map((c) => layoutNode(c, depth + 1));
    // when → gating concept = refKeys[0]; action → guard concept = refKeys[1] when present. refKeysOf emits exactly
    // [target] or [target, guardConcept] for an action, so the guard is at index 1 (NOT "the last" — reading [1] makes an
    // unexpected 3-element array fail loudly rather than silently mis-peeking). Either ref may be unresolved (refKeys are
    // string-constructed, not index-resolved) → conceptFields drops the peek but keeps the node.
    // Only a `when` IS its concept (the box carries its border). An action's guard concept is no longer resolved here —
    // Todo 2 removed the guard peek + colors an action by its DETERMINATION target, not its guard — so resolving it would
    // be dead work (the guard stays visible in the crl pane).
    const conceptRef = n.kind === "when" ? n.refKeys[0] : undefined;
    const cf = conceptFields(conceptRef);
    const useDecision = n.kind === "action" && n.actionKind === "use-decision";
    // #187 Todo 2b: a guarded action (`recommend X when <guard>` OR `use decision D when <guard>`) — resolve the guard
    // concept (refKeys[1], present on ANY guarded action) for its "when …" tab.
    const guardRef = n.kind === "action" && n.refKeys.length > 1 ? n.refKeys[1] : undefined;
    const gcf = guardRef !== undefined ? conceptFields(guardRef) : {};
    const guard =
      gcf.conceptKey !== undefined ? { conceptKey: gcf.conceptKey, conceptName: gcf.conceptName ?? "?", conceptLib: gcf.conceptLib ?? "", isSource: gcf.isSource ?? true } : undefined;
    const display =
      n.kind === "when"
        ? cf.conceptName ?? n.label.replace(/^when\s+/, "") // concept name (resolved) else strip "when " from the label
        : useDecision
          ? `use decision ${n.label}` // distinct from a decision ROOT box so it doesn't read as the target's declaration
          : displayDetermination(n.label); // otherwise → "otherwise" (unchanged); recommend → the determination KEY (Met/Unmet), not the dotted <category>.<key> — MV Tree users are non-technical
    // A when node IS its concept → title it with the CONCEPT's own lib (cross-lib concepts share a bare name). Other nodes
    // title with the owning decision row's lib. (Action TARGET lib isn't resolved here — the target's lib lives in its
    // nodeKey, not parsed in v1; the guard concept's lib rides its peek <title> via conceptName/conceptLib below.)
    const full = n.kind === "when" && cf.conceptName ? `${cf.conceptName} — concept "${cf.conceptLib}"` : `${display} — ${n.lib}`;
    // A BODY-LESS node (no branch body) reserves its OWN slot NOW, so its `y` is fixed before any outline hangs below it.
    const selfSlot = structureChildren.length === 0 ? slot++ : undefined;
    // Center a `when` on its CONTROL-FLOW spine (its branch body); a body-less node sits at its own reserved slot.
    const nodeY = structureChildren.length ? (structureChildren[0].y + structureChildren[structureChildren.length - 1].y) / 2 : (selfSlot as number);
    // #187 Option-C: a `when` gating a `defined as` composite hangs its operator OUTLINE below the node, TOP-ALIGNED to the
    // node itself — the outline's local `cursor` starts one-and-a-half node-heights below `nodeY` (half a node of padding
    // under the box), NOT at the bottom of the branch-body band. A top `or` row precedes the body iff the concept is Source
    // (mirroring the Questionnaire's forced top-`or`). After the outline, the global `slot` is advanced past its bottom so a
    // following sibling clears it (the outline vertically overlaps the branch body but sits in the node's OWN indented column).
    const outlineRoots: LaidNode[] = [];
    if (n.kind === "when" && cf.conceptName !== undefined && opts.defExpr) {
      const entry = opts.defExpr(cf.conceptLib ?? "", cf.conceptName);
      if (entry?.hasDefinedAs && entry.body) {
        const whenLeft = PAD + depth * COL;
        const cursor = { y: nodeY + (NODE_H * 1.5) / ROW }; // top-aligned: half a node of padding below the box
        if (cf.isSource) {
          const y = cursor.y;
          cursor.y += OUTLINE_ADVANCE;
          outlineRoots.push({ nodeKey: outlineKey(n.nodeKey, "top", "or"), kind: "leaf", useDecision: false, outline: true, outlineRow: "topor", indent: 0, absX: outlineX(whenLeft, 0), label: "or", full: "or", depth: 0, topWhenKey: n.nodeKey, y, children: [] });
        }
        // Parity with the questionnaire's `renderInferredWhen`: an INFERRED (non-Source) composite whose body is a single
        // operand (a bare-ref alias / a top-level `not` / an `external`) is wrapped in an `ANY OF` box — so `X defined as Y`
        // reads identically in both panes. An `or`/`and` body already carries its own box, so it is not wrapped.
        const struct = buildDefStruct(entry.body, opts.defExpr, new Set([entry.nodeKey]), 1);
        const wrapped: DefStructExpr = !cf.isSource && struct.kind !== "or" && struct.kind !== "and" ? { kind: "or", operands: [struct] } : struct;
        outlineRoots.push(buildOutline(wrapped, whenLeft, n.nodeKey, 0, "0", cursor));
        slot = Math.max(slot, cursor.y); // reserve the outline's vertical extent so the next sibling doesn't overlap it
      }
    }
    const children = [...structureChildren, ...outlineRoots];
    return { nodeKey: n.nodeKey, kind: n.kind, useDecision, guard, label: display, full, depth, y: nodeY, children, ...cf };
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
  opts: {
    revealPrefix?: string;
    concepts?: CrlConceptNode[];
    /** #187 Option-C: a composite `when`'s `defined as` OPERATOR tree — the SAME shared builder the Questionnaire uses. */
    defExpr?: ResolveDefExprEntry;
  } = {},
): RenderedFlow {
  const prefix = opts.revealPrefix ?? "";
  const concepts = opts.concepts ?? [];
  const anchors: Record<string, FlowAnchor> = {};
  const reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string }> = {};
  const leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }> = {};

  if (structure.length === 0) {
    return { html: '<p class="placeholder">No CRL decisions to chart.</p>', anchors, reveals, leafConcepts };
  }

  const conceptMap = new Map(concepts.map((c) => [c.nodeKey, c]));
  const { roots, maxDepth } = buildLaid(structure, conceptMap, { defExpr: opts.defExpr });

  const all: LaidNode[] = [];
  const collect = (n: LaidNode): void => {
    all.push(n);
    n.children.forEach(collect);
  };
  roots.forEach(collect);

  // An OUTLINE row is shorter (OUTLINE_H) than a decision box (NODE_H); an op/top-OR row is a bare label (no box).
  const nodeH = (n: LaidNode): number => (n.outline ? OUTLINE_H : NODE_H);
  // An op/top-OR row is a bare ~60px caption; a leaf/external/more is OUTLINE_NODE_W. The 60 never determines `rightEdge`
  // (an op row always has an operand at indent+1 that extends ≥OUTLINE_NODE_W further right; a top-OR sits above the body
  // root) — but it keeps the extent honest if the outline shape ever changed.
  const nodeW = (n: LaidNode): number =>
    n.outline ? (n.outlineRow === "op" || n.outlineRow === "topor" ? 60 : OUTLINE_NODE_W) : NODE_W;
  // left x: an OUTLINE row uses its precomputed INDENT-based `absX`; a structure node uses its depth column.
  const left = (n: LaidNode): number => n.absX ?? PAD + n.depth * COL;
  const top = (n: LaidNode): number => Math.round(PAD + n.y * ROW); // node top y (rounded)
  const midY = (n: LaidNode): number => top(n) + nodeH(n) / 2; // node vertical center

  const maxY = all.reduce((m, n) => Math.max(m, n.y), 0);
  // EXTENT-based width — the outline's indent-based x is decoupled from the depth grid (`maxDepth` is NOT bumped for
  // outline rows), so width MUST come from the actual right edge of EVERY node (boxes + labels + stubs), not `maxDepth*COL`.
  const rightEdge = all.reduce((m, n) => Math.max(m, left(n) + nodeW(n)), PAD + maxDepth * COL + NODE_W);
  const width = Math.ceil(rightEdge + PAD);
  // EXTENT-based height (#208) — the bottommost box may be a taller NODE_H or a shorter outline OUTLINE_H at a fractional
  // `y`, and the on-path RING extends ~3px beyond the box, so take the true max bottom + a ring margin, not `maxY*ROW+NODE_H`.
  const bottomEdge = all.reduce((m, n) => Math.max(m, top(n) + nodeH(n)), PAD + NODE_H);
  const height = Math.ceil(bottomEdge + 4 + PAD);

  // Edges first (so node boxes paint over them). Edges are pure <path> — NEVER reveal targets.
  let body = "";
  for (const n of all) {
    const px = left(n) + nodeW(n);
    const py = midY(n);
    for (const c of n.children) {
      if (c.outline) {
        // #187 Option-C: an OUTLINE connector is a dashed grey `.flow-def-edge` ELBOW (a vertical spine down from the
        // parent + a horizontal run to the child's left) — NOT the horizontal control-flow Bézier. The spine sits just
        // inside the parent's left so nested rows fan down like a file tree, never reading as a fired branch.
        const sx = left(n) + (n.outline ? 8 : 10);
        body += `<path class="flow-def-edge" d="M${sx} ${py} V${midY(c)} H${left(c)}"/>`;
      } else {
        const ex = left(c);
        const ey = midY(c);
        const mx = Math.round((px + ex) / 2);
        body += `<path class="flow-edge" d="M${px} ${py} C${mx} ${py} ${mx} ${ey} ${ex} ${ey}"/>`;
      }
    }
  }

  // Nodes. Generated counter ids (NOT nodeKey-derived) for both `id` and the reveal key.
  let idx = 0;
  for (const n of all) {
    const gid = `${prefix}flow${idx++}`;
    const key = `${prefix}k${gid}`;
    const x = left(n);
    const y = top(n);
    // ROW CATEGORY gates the anchor/reveal surface: a structure node and an OUTLINE LEAF are addressable (anchor + reveal);
    // an operator / top-OR / external / more row is RENDER-ONLY (no anchor, no reveal — a click resolves to nothing).
    const addressable = !n.outline || n.outlineRow === "leaf";
    if (addressable) anchors[n.nodeKey] = { scrollTo: gid, segmentIds: [gid] };

    // #187 Option-C: OUTLINE render-only rows — an operator/top-OR LABEL (no box) or an external/more STUB box.
    if (n.outline && n.outlineRow !== "leaf") {
      if (n.outlineRow === "op" || n.outlineRow === "topor") {
        const cls = n.outlineRow === "topor" ? "flow-topor" : "flow-op";
        body +=
          `<g id="${escapeHtml(gid)}" class="flow-outline ${cls}">` +
          `<text x="${x}" y="${y + OUTLINE_H / 2 + 3}">${escapeHtml(n.label.toUpperCase())}</text></g>`;
      } else {
        const cls = n.outlineRow === "external" ? "flow-ext" : "flow-more";
        body +=
          `<g id="${escapeHtml(gid)}" class="flow-outline ${cls}"><title>${escapeHtml(n.full)}</title>` +
          `<rect x="${x}" y="${y}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H}" rx="6"/>` +
          labelMarkup(n.label, x, y, OUTLINE_H, OUTLINE_LABEL_MAX, 9) +
          `</g>`;
      }
      continue;
    }

    // #187 Option-C: an OUTLINE LEAF row (a `defined as` concept operand). Peeks its OWN concept (`{conceptNodeKey}`); its
    // synthetic `leaf::` key (path-bearing → collision-free) anchors it + joins the Todo-5 verdict overlay. No peek dot
    // (the whole row IS the concept). #187 Todo 3: carries a hidden on-path RING revealed when the operand is TRUE
    // (`markLeaves` toggles `.flow-leaf-yes`); a false / unknown operand shows nothing (ring = on-path, not a verdict tick).
    if (n.outline) {
      const conceptKey = n.conceptKey as string; // an outline leaf always resolves a concept (else it's `external`)
      reveals[key] = { conceptNodeKey: conceptKey };
      if (n.conceptName !== undefined && n.conceptLib !== undefined && n.topWhenKey !== undefined)
        leafConcepts[n.nodeKey] = { lib: n.conceptLib, name: n.conceptName, topWhenKey: n.topWhenKey };
      // #187 Todo 2: border by Source — inferred (no `code is`) → purple, Source → grey — kept DASHED (an operand chip,
      // not a decision box). `isSource === false` is inferred; `true`/`undefined` stay grey (never mis-purple).
      const classes = ["flow-row", "flow-leaf"];
      if (n.isSource === false) classes.push("flow-inferred"); // inferred sub-question → purple (kept under the ring)
      else classes.push("flow-greyborder"); // a source sub-question's grey border hides under the on-path ring (Todo 3b)
      body +=
        `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}"><title>${escapeHtml(n.full)}</title>` +
        `<rect x="${x}" y="${y}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H}" rx="6"/>` +
        labelMarkup(n.label, x, y, OUTLINE_H, OUTLINE_LABEL_MAX, 9) +
        flowRing(x, y, OUTLINE_NODE_W, OUTLINE_H, 1.5, 7) +
        `</g>`;
      continue;
    }

    // A regular STRUCTURE node (decision / when / otherwise / action). #187 Todo 2 border semantics:
    //  - a `when` IS its gating concept → inferred (no `code is`) PURPLE / Source or unresolved GREY;
    //  - every recommend-activity / use-decision / otherwise / decision → neutral grey (#210: no PA-specific determination
    //    border; never blue — blue is reserved for the on-path ring, Todo 3).
    const classes = ["flow-row"];
    if (n.kind === "action") {
      if (n.useDecision) classes.push("flow-use");
      // #210: a recommend-activity disposition leaf is NEUTRAL grey — the SAME as a regular internal activity. The former
      // certify→green / not-certify+pended→gold borders made the viewer PA-specific; the outcome's meaning is carried by
      // the node label + the verdict painting, not a determination-category border.
      else classes.push("flow-activity");
    } else {
      classes.push(`flow-${n.kind}`);
      if (n.kind === "when" && n.isSource === false) classes.push("flow-inferred"); // inferred gating concept → purple border
    }
    // #187 Todo 3b: a plain GREY SOLID identity border (decision / non-inferred when / ordinary activity, incl. a disposition
    // leaf) muddies the blue on-path ring → mark it so CSS can HIDE it when ringed. A COLOURED border (inferred) or a DASHED
    // one (use-decision/otherwise) is NOT marked — it stays visible (it carries meaning the ring doesn't).
    if (classes.includes("flow-decision") || classes.includes("flow-activity") || (classes.includes("flow-when") && !classes.includes("flow-inferred")))
      classes.push("flow-greyborder");
    reveals[key] = { nodeKey: n.nodeKey };
    // #187 Todo 2b: a guarded recommend's "when <guard>" TAB — a clickable, labeled pill on the box (the discoverable
    // replacement for the removed peek dot). NESTED inside the row <g> so closest() routes a tab click → the guard peek
    // ({conceptNodeKey}) and a body click → the action select ({nodeKey}). Bordered grey / purple by the guard's Source.
    let guardTab = "";
    if (n.kind === "action" && n.guard !== undefined) {
      const pk = `${prefix}p${gid}`;
      reveals[pk] = { conceptNodeKey: n.guard.conceptKey };
      const label = truncate(`when ${n.guard.conceptName}`, 22);
      const tw = Math.round(label.length * 5.9 + 14);
      const tabCls = n.guard.isSource === false ? "flow-guard-tab flow-inferred" : "flow-guard-tab";
      guardTab =
        `<g class="${tabCls}" data-reveal="${escapeHtml(pk)}"><title>${escapeHtml(`guard: ${n.guard.conceptName} — concept "${n.guard.conceptLib}"`)}</title>` +
        `<rect x="${x + 8}" y="${y - 9}" width="${tw}" height="15" rx="4"/>` +
        `<text x="${x + 14}" y="${y + 2}">${escapeHtml(label)}</text></g>`;
    }
    // #210 FLOWCHART SHAPE: the decision ROOT (start) and a recommend-activity outcome LEAF (end) are STADIUMS (fully
    // rounded pills, rx = half-height); every INTERIOR node (when / use-decision / otherwise) stays a rounded rectangle
    // (rx 6). The on-path ring matches — a stadium node rings as a pill (rx = half the ring-rect height, off 2.5 → NODE_H+5).
    const isLeafEnd = n.kind === "action" && !n.useDecision; // a recommend-activity outcome tip (disposition leaf)
    const stadium = n.kind === "decision" || isLeafEnd;
    const rx = stadium ? NODE_H / 2 : 6;
    // #210 ALL-PASS ✓ BADGE — a HIDDEN theme-aware (green circle + white check) grandchild on every disposition leaf,
    // revealed by the host-toggled `.leaf-allpass` when EVERY route producing this outcome is pass. Right-CENTER interior
    // (clears the top guard-tab band + the stadium's rounded corners + the left-aligned label). `pointer-events:none` (CSS).
    const badgeCx = x + NODE_W - 13;
    const badgeCy = y + NODE_H / 2;
    const allPassBadge = isLeafEnd
      ? `<g class="flow-allpass-badge"><circle cx="${badgeCx}" cy="${badgeCy}" r="8"/><path d="M${badgeCx - 4} ${badgeCy} l2.6 2.9 l5 -5.6"/></g>`
      : "";
    body +=
      `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}">` +
      `<title>${escapeHtml(n.full)}</title>` +
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="${rx}"/>` +
      labelMarkup(n.label, x, y, NODE_H, LABEL_MAX, 10) +
      flowRing(x, y, NODE_W, NODE_H, 2.5, stadium ? (NODE_H + 5) / 2 : 8) + // #187 Todo 3: on-path ring — BEFORE the guard tab so the tab's opaque fill occludes the ring's top crossing segment
      guardTab +
      allPassBadge +
      `</g>`;
  }

  const svg =
    `<svg class="flow-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    body +
    `</svg>`;
  return { html: `<div class="flow-wrap">${svg}</div>`, anchors, reveals, leafConcepts };
}

/** Flow-pane CSS — concatenated into the cockpit's nonced <style> (CSP-safe: no inline styles / no SVG <style>). Every
 *  var(--vscode-*) carries a hex fallback (the chart renders in tests / high-contrast with no live theme), matching
 *  CORR_STYLE + shellHtml. #187 Todo 3: the on-path highlight is the `.flow-ring` rect (a deterministic SVG rect-stroke);
 *  the shell's global `.current`/`.diverter`/`.failed-criterion` OUTLINE overlays ARE neutralized on flow `<g>`s (they
 *  paint a lumpy square there — the flow uses the ring + rect strokes instead). The per-case CHANNELS still paint rect
 *  strokes/fills: `.this-node` (orange), `.failed-criterion`/`-preempt` (dashed), `.diverter` (dotted), `.review-pass/-fail/-pending`/`.error-node` (fill). */
export const FLOW_STYLE =
  `.flow-wrap{display:inline-block;min-width:100%}` +
  `.flow-svg{display:block;font:12px var(--vscode-editor-font-family,sans-serif)}` +
  `.flow-row{cursor:pointer}` +
  `.flow-row>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-panel-border,#454545);stroke-width:1}` +
  `.flow-row>text{fill:var(--vscode-foreground,#cccccc)}` +
  // #187 Todo 2 BORDER SEMANTICS. NOTHING here is blue — blue is reserved for the on-path ring (Todo 3). Decision + a
  // Source `when` + every recommend activity + a use-decision all read NEUTRAL GREY; the ONLY border exception is an
  // inferred `when` → purple (#210: the certify/not-certify determination borders were removed — de-PA-specific).
  `.flow-decision>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1.5}` +
  `.flow-decision>text{font-weight:bold}` +
  // A `when` IS its gating concept: Source (has local `code is`) OR unresolved → grey; inferred (no `code is`) → PURPLE.
  `.flow-when>rect{fill:var(--vscode-editorHoverWidget-background,#2c2c2d);stroke:var(--vscode-descriptionForeground,#8c8c8c)}` +
  // #210: the inferred (purple) OFF-PATH border reads slightly THICKER than the grey Source border (operator: make the
  // off-path purple a touch heavier). On-path still wins — the `.flow-row.current/flow-leaf-yes>rect` thicken rules (2.5/2)
  // are EQUAL specificity ((0,2,1)) but sit LATER in the sheet, so a ringed inferred node overrides this 1.4.
  `.flow-when.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0);stroke-width:1.4}` +
  `.flow-otherwise>rect{stroke-dasharray:3 2;opacity:.85}` +
  // A recommend TARGET. #210: ALL recommend activities (incl. determinations) → neutral grey, the SAME as an ordinary
  // activity (the certify→green / not-certify+pended→gold borders were removed — they made the viewer PA-specific). A
  // use-decision → neutral grey with its dashed delegation shape.
  `.flow-activity>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1.5}` +
  `.flow-use>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-dasharray:5 2}` +
  // #187 Todo 2b: a guarded recommend's "when <guard>" TAB — a labeled, clickable pill on the box top (the discoverable
  // replacement for the peek dot). Grey / purple by the guard's Source; a hover highlight signals it's interactive.
  `.flow-guard-tab{cursor:pointer}` +
  `.flow-guard-tab>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1}` +
  `.flow-guard-tab.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0)}` +
  `.flow-guard-tab>text{fill:var(--vscode-descriptionForeground,#cccccc);font:600 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.02em}` +
  `.flow-guard-tab:hover>rect{fill:var(--vscode-toolbar-hoverBackground,#2a2d2e)}` +
  `.flow-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.6}` + // slightly thicker — hard to see on Mac (operator feedback)
  // #187 Todo 4: a DEF-LEAF edge — a distinct dashed grey line (definition decomposition, NOT a control-flow branch).
  // Slightly THICKER + less faint so the connector reads on Mac (operator feedback).
  `.flow-def-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.5;stroke-dasharray:2 2;opacity:.8}` +
  // an outline operand SUB-QUESTION looks EXACTLY like a main `when` question: a SOLID border — GREY (has a local `code is`)
  // / PURPLE (inferred, decomposes into its own sub-questions recursively). On-path → the blue ring, same as a main node.
  // (Solid, not the Todo-2 dashed chip: the indent + smaller box + dashed spine already distinguish it from a decision box.)
  `.flow-leaf>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1}` +
  `.flow-leaf.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0);stroke-width:1.4}` + // #210: off-path purple slightly heavier (on-path 2 wins, later)
  `.flow-leaf>text{fill:var(--vscode-descriptionForeground,#bfbfbf);font-size:11px}` +
  // #187 Option-C OUTLINE rows. An OPERATOR / TOP-OR label — a bare uppercase caption (no box), like the questionnaire's
  // ANY OF / ALL OF tab; render-only (not clickable). An EXTERNAL / MORE stub — a faint dashed box (unaddressable operand).
  `.flow-outline{cursor:default}` +
  `.flow-op>text,.flow-topor>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font:700 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.12em}` +
  `.flow-ext>rect,.flow-more>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#6a6a72);stroke-width:1;stroke-dasharray:2 2;opacity:.7}` +
  `.flow-ext>text,.flow-more>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font-size:11px;font-style:italic}` +
  // #187 Todo 3: the on-path RING — a hidden `<rect>` in `.flow-ring`, revealed by `.current` (main path) or
  // `.flow-leaf-yes` (a TRUE operand). Deterministic rect-stroke (NOT a CSS outline), composes with the node's own
  // identity border (a separate axis) — `.current` no longer recolors the base border. NEUTRALIZE every shell `outline`
  // overlay on flow nodes (`.current`/`.diverter`/`.failed-criterion`/`-preempt` — those DO paint a lumpy square outline
  // on the SVG `<g>`; the flow uses the rect ring + rect strokes instead). GEOMETRY: `off` (render, per node) + `stroke-width`
  // (here) are coupled — outer extent = off + stroke/2; keep them in lockstep (leaf ≈2.25px/side < the ~3.36px half-gap;
  // struct ≈3.75px/side < the 7px half-gap). The leaf ring is THINNER to clear the compact outline row pitch. No
  // `pointer-events:none` — the ring is nested in the row `<g data-reveal>`, so a click on the ring band routes to the row.
  `.flow-row.current,.flow-row.diverter,.flow-row.failed-criterion,.flow-row.failed-criterion-preempt{outline:none}` +
  `.flow-ring{display:none}` +
  `.flow-ring>rect{fill:none;stroke:var(--vscode-focusBorder,#3794ff);stroke-width:2.5;stroke-dasharray:none}` +
  `.flow-leaf .flow-ring>rect{stroke-width:1.5}` +
  `.flow-row.current .flow-ring,.flow-row.flow-leaf-yes .flow-ring{display:inline}` +
  // #187 Todo 3b: when the ring is shown — HIDE a plain GREY SOLID border (`.flow-greyborder`): a faint grey line just
  // inside the blue ring only muddies it (the ring is the border). A COLOURED identity border (inferred purple)
  // instead THICKENS so its meaning still reads inside the ring. Both are EQUAL-specificity ((0,2,1)) to the overlay stroke
  // channels and placed BEFORE them, so `.this-node`/`.failed-criterion`/`.diverter` still win on a node that is on-path AND
  // an overlay (the thicken sets only stroke-WIDTH; the hide sets `stroke:transparent`, which a later overlay's stroke beats).
  `.flow-row.current>rect{stroke-width:2.5}` +
  `.flow-row.flow-leaf-yes>rect{stroke-width:2}` +
  `.flow-greyborder.current>rect,.flow-greyborder.flow-leaf-yes>rect{stroke:transparent}` +
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
  // #156 slice 5 / #210 VERDICT PAINTING: the Medical Validation review overlay — a PERSISTENT channel that survives
  // selection (unlike failed-criterion, which clears on every reveal). It is a NON-OUTLINE FILL TINT on the rect, an
  // INDEPENDENT SVG axis from the two stroke-only channels above: `.current` and `.failed-criterion`/`-preempt` set only
  // `stroke`/`stroke-width`, so a verdict FILL coexists with both WITHOUT fighting (a `.current.review-pass` keeps its
  // focus stroke AND reads green; a `.failed-criterion.error-node` keeps its dashed red stroke over the error fill). The
  // fill overrides the base `.flow-row>rect` fill AND the kind-fills (flow-decision/when/activity) by SPECIFICITY, not
  // order: `.flow-row.review-pass>rect` = (0,2,1) outranks `.flow-decision>rect`/`.flow-activity>rect` = (0,1,1) regardless
  // of sheet position (FIX 4, Claude impl review). Each RINGED reviewed node paints its case's VERDICT with the SAME color
  // tokens the worklist verdict dropdown uses (`.cel-review-*`, correspondenceCockpit.ts): pass→green, fail→red, pending→
  // YELLOW (pending is subdued at a lower opacity — it "loses" precedence, a faint context tint). The host resolves the
  // per-node verdict (pass/fail/pending are DISJOINT — exactly one class per node), so these three never co-occur and need no
  // tiebreak among themselves. `.error-node` (a pass node whose case's RUN errored — the host filters error ⊆ pass) is
  // painted INSTEAD of `.review-pass` (error-over-pass), a subdued red wash distinct from the failed-criterion STROKE channel.
  `.flow-row.review-pass>rect{fill:var(--vscode-testing-iconPassed,#73c991);fill-opacity:.2}` +
  `.flow-row.review-fail>rect{fill:var(--vscode-testing-iconFailed,#f14c4c);fill-opacity:.2}` +
  `.flow-row.review-pending>rect{fill:var(--vscode-charts-yellow,#d29922);fill-opacity:.16}` +
  `.flow-row.error-node>rect{fill:var(--vscode-testing-iconFailed,#f14c4c);fill-opacity:.22}` +
  // #210 ALL-PASS ✓ BADGE — a green circle + white check, HIDDEN until the host toggles `.leaf-allpass` (every route producing
  // this outcome is pass). Theme-aware WITHOUT a media query: solid green + white read on light AND dark. A thin separation
  // ring (`--vscode-editorWidget-background`, the node's own fill) keeps the badge green legible over the `.review-pass` green
  // wash. `pointer-events:none` so the glyph never intercepts a click (the row's `data-reveal` still routes). Grandchild `<g>`,
  // so `.flow-row>rect`/`>text` selectors don't touch it.
  `.flow-allpass-badge{display:none;pointer-events:none}` +
  `.flow-row.leaf-allpass .flow-allpass-badge{display:inline}` +
  `.flow-allpass-badge>circle{fill:var(--vscode-testing-iconPassed,#3fb950);stroke:var(--vscode-editorWidget-background,#252526);stroke-width:1.2}` +
  `.flow-allpass-badge>path{fill:none;stroke:#ffffff;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}` +
  // #177 slice 4: the "this node" cross-pane marker — the FOCUSED questionnaire question's tree node. It paints a
  // distinctive solid `stroke` on the >rect — the SAME proven axis `.current`/`.failed-criterion` use (FIX 1 impl review:
  // this repo's evidence is that `outline` does NOT paint on the SVG here, which is exactly why those switched to stroke).
  // It COEXISTS with the verdict fills (`.review-pass/-fail/-pending`/`.error-node` are `fill` — fill + stroke layer fine: a
  // pass node that's the focused question shows the green fill AND this accent border). Against the OTHER stroke channels (`.current`/`.failed-criterion`/
  // `-preempt`/`.diverter`) it deliberately WINS: it is ordered LAST among the stroke rules (after them in the sheet, equal specificity),
  // so on a node that is BOTH the focused question and selected/a-criterion the focused-question marker (the primary
  // indicator) overrides the transient selection/criterion stroke (the right tradeoff). The color is a DISTINCT accent
  // (`--vscode-charts-orange`), NOT the blue `--vscode-focusBorder` the reveal (`.current`) uses — blue means "selected /
  // on the path", so the focus ("the question you're on") must read differently from a path node (it is not on the path,
  // e.g. a not-adult deny whose Q1 `when` isn't in the reveal cluster). Thicker than `.current` (2.5); `stroke-dasharray:none`.
  `.flow-row.this-node>rect{stroke:var(--vscode-charts-orange,#d18616);stroke-width:3;stroke-dasharray:none}` +
  // #187 Todo 3: the per-case leaf verdict is now the on-path RING (above) — `markLeaves` toggles `.flow-leaf-yes` (TRUE
  // → ring) / `.flow-leaf-no` (false → NOTHING; `.flow-leaf-no` is a RESERVED no-op class, kept so a muted false marker is
  // a cheap re-add if the audit ever needs false≠unevaluated). The old green ✓ / grey ✗ tick glyphs are removed.
  `.flow-row.flow-leaf-no{}`;
