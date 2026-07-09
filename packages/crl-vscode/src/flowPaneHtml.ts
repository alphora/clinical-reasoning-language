// CRL FLOW pane RENDERER (vscode-free, unit-tested) — the graphical decision-tree flowchart (T2, disc 132).
// Renders CrlDecisionStructure[] as an SVG forest: each decision root branches through its when/otherwise/action sub-nodes;
// a composite `when` hangs its `defined as` operator OUTLINE below it, and recommend targets are determination boxes.
// #187 Todo 2 BORDER SEMANTICS: a node's border carries meaning — a `when` is grey (Source) or purple (inferred, no
// `code is`); a determination target is green (certify) / gold (not-certify + pended); ordinary activity / use-decision /
// decision are neutral grey. Nothing is blue (blue is the on-path ring). The old asserted/inferred peek DOTS are gone.
//
// CSP-safe by construction: geometry is SVG PRESENTATION attributes (x/y/width/d/…) — never a `style=` attribute and never
// a `<style>` element inside the SVG; all color/font lives in FLOW_STYLE (a CSS string the shell concatenates into its
// nonced <style>, exactly like CORR_STYLE). Reveal shapes are IDENTICAL to RenderedCrl ({nodeKey} | {conceptNodeKey}) so
// the shell reuses the existing webviewHit/peek machinery with no new hit shapes (T3). DOM ids are GENERATED counters — a
// nodeKey is a JSON string (quotes/brackets) and cannot be a DOM id; `anchors` is keyed BY nodeKey → the generated id (the
// cross-pane join, mirroring crlPaneHtml). `id` + `data-reveal` ride the SAME <g> so highlight (getElementById) and click
// (closest('[data-reveal]')) resolve to one element.
import { buildDefStruct, determinationCategory, displayDetermination, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode, type DefStructExpr, type ResolveDefExprEntry } from "@smile-digital-health/crl";

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
const OUTLINE_ADVANCE = 0.64; // slot units an outline row advances the global cursor (compact vs a 1.0 tree slot)
const OUTLINE_NODE_W = 150; // a leaf box in the outline (narrower than a decision NODE_W, since it indents)
const OUTLINE_H = 24; // a leaf box height in the outline (shorter than NODE_H)
const OUTLINE_LABEL_MAX = 18; // chars before truncation in an outline box (narrower than a decision box)

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
  /** #187 Todo 2: a recommend-activity's PAS determination category (`certify` / `not-certify` / `pended`), parsed from
   *  its raw `<category>.<key>` name — drives the leaf border (certify → green, not-certify + pended → gold). `undefined`
   *  for an ordinary (non-determination) activity or a use-decision (those stay neutral). */
  dispositionCategory?: string;
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
    // #187 Todo 2: a recommend-activity's determination category, from its RAW `<category>.<key>` name (before display
    // stripping). An ordinary activity / use-decision / non-action → undefined → neutral (no green/gold).
    const dispositionCategory = n.kind === "action" && n.actionKind === "recommend-activity" ? determinationCategory(n.label) : undefined;
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
    return { nodeKey: n.nodeKey, kind: n.kind, useDecision, dispositionCategory, guard, label: display, full, depth, y: nodeY, children, ...cf };
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
  const height = Math.ceil(PAD * 2 + maxY * ROW + NODE_H);

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
          `<text x="${x + 9}" y="${y + OUTLINE_H / 2 + 4}">${escapeHtml(truncate(n.label, OUTLINE_LABEL_MAX))}</text></g>`;
      }
      continue;
    }

    // #187 Option-C: an OUTLINE LEAF row (a `defined as` concept operand). Peeks its OWN concept (`{conceptNodeKey}`); its
    // synthetic `leaf::` key (path-bearing → collision-free) anchors it + joins the Todo-5 verdict overlay. No peek dot
    // (the whole row IS the concept). Carries BOTH verdict ticks HIDDEN — `markLeaves` toggles `.flow-leaf-yes/-no`.
    if (n.outline) {
      const conceptKey = n.conceptKey as string; // an outline leaf always resolves a concept (else it's `external`)
      reveals[key] = { conceptNodeKey: conceptKey };
      if (n.conceptName !== undefined && n.conceptLib !== undefined && n.topWhenKey !== undefined)
        leafConcepts[n.nodeKey] = { lib: n.conceptLib, name: n.conceptName, topWhenKey: n.topWhenKey };
      // #187 Todo 2: border by Source — inferred (no `code is`) → purple, Source → grey — kept DASHED (an operand chip,
      // not a decision box). `isSource === false` is inferred; `true`/`undefined` stay grey (never mis-purple).
      const classes = ["flow-row", "flow-leaf"];
      if (n.isSource === false) classes.push("flow-inferred");
      const cx = x + OUTLINE_NODE_W - 11;
      const cy = y + OUTLINE_H / 2;
      const ticks =
        `<path class="leaf-tick leaf-tick-yes" d="M${cx - 4} ${cy} l3 3 l5 -6"/>` +
        `<path class="leaf-tick leaf-tick-no" d="M${cx - 4} ${cy - 4} l8 8 M${cx + 4} ${cy - 4} l-8 8"/>`;
      body +=
        `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}"><title>${escapeHtml(n.full)}</title>` +
        `<rect x="${x}" y="${y}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H}" rx="6"/>` +
        `<text x="${x + 9}" y="${y + OUTLINE_H / 2 + 4}">${escapeHtml(truncate(n.label, OUTLINE_LABEL_MAX))}</text>${ticks}</g>`;
      continue;
    }

    // A regular STRUCTURE node (decision / when / otherwise / action). #187 Todo 2 border semantics:
    //  - a `when` IS its gating concept → inferred (no `code is`) PURPLE / Source or unresolved GREY;
    //  - a recommend-activity is a determination TARGET → certify GREEN / not-certify+pended GOLD / ordinary neutral;
    //  - a use-decision, otherwise, decision → neutral grey (never blue — blue is reserved for the on-path ring, Todo 3).
    const classes = ["flow-row"];
    if (n.kind === "action") {
      if (n.useDecision) classes.push("flow-use");
      else if (n.dispositionCategory === "certify") classes.push("flow-certify");
      else if (n.dispositionCategory === "not-certify" || n.dispositionCategory === "pended") classes.push("flow-notcertify");
      else classes.push("flow-activity"); // ordinary (non-determination) activity → neutral
    } else {
      classes.push(`flow-${n.kind}`);
      if (n.kind === "when" && n.isSource === false) classes.push("flow-inferred"); // inferred gating concept → purple border
    }
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
    body +=
      `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}">` +
      `<title>${escapeHtml(n.full)}</title>` +
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6"/>` +
      `<text x="${x + 10}" y="${y + NODE_H / 2 + 4}">${escapeHtml(truncate(n.label, LABEL_MAX))}</text>` +
      guardTab +
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
 *  CORR_STYLE + shellHtml. `.flow-row.current rect` is the SVG-friendly highlight (the shell's global `.current` outline
 *  does not paint on a <g>). */
export const FLOW_STYLE =
  `.flow-wrap{display:inline-block;min-width:100%}` +
  `.flow-svg{display:block;font:12px var(--vscode-editor-font-family,sans-serif)}` +
  `.flow-row{cursor:pointer}` +
  `.flow-row>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-panel-border,#454545);stroke-width:1}` +
  `.flow-row>text{fill:var(--vscode-foreground,#cccccc)}` +
  // #187 Todo 2 BORDER SEMANTICS. NOTHING here is blue — blue is reserved for the on-path ring (Todo 3). Decision + a
  // Source `when` + an ordinary activity + a use-decision all read NEUTRAL GREY; meaning is carried by the exceptions
  // below (inferred → purple, certify → green, not-certify/pended → gold).
  `.flow-decision>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1.5}` +
  `.flow-decision>text{font-weight:bold}` +
  // A `when` IS its gating concept: Source (has local `code is`) OR unresolved → grey; inferred (no `code is`) → PURPLE.
  `.flow-when>rect{fill:var(--vscode-editorHoverWidget-background,#2c2c2d);stroke:var(--vscode-descriptionForeground,#8c8c8c)}` +
  `.flow-when.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0)}` +
  `.flow-otherwise>rect{stroke-dasharray:3 2;opacity:.85}` +
  // A recommend TARGET. A DETERMINATION colors by PAS category: certify → GREEN, not-certify + pended → GOLD (solid — the
  // preempt overlay's amber is DASHED, so the two are distinct even at a shared hue). An ordinary (non-determination)
  // activity → neutral grey; a use-decision → neutral grey with its dashed delegation shape.
  `.flow-activity>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1.5}` +
  `.flow-certify>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-charts-green,#3fb950);stroke-width:1.5}` +
  `.flow-notcertify>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-editorWarning-foreground,#cca700);stroke-width:1.5}` +
  `.flow-use>rect{fill:var(--vscode-editorWidget-background,#252526);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-dasharray:5 2}` +
  // #187 Todo 2b: a guarded recommend's "when <guard>" TAB — a labeled, clickable pill on the box top (the discoverable
  // replacement for the peek dot). Grey / purple by the guard's Source; a hover highlight signals it's interactive.
  `.flow-guard-tab{cursor:pointer}` +
  `.flow-guard-tab>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1}` +
  `.flow-guard-tab.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0)}` +
  `.flow-guard-tab>text{fill:var(--vscode-descriptionForeground,#cccccc);font:600 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.02em}` +
  `.flow-guard-tab:hover>rect{fill:var(--vscode-toolbar-hoverBackground,#2a2d2e)}` +
  `.flow-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.2}` +
  // #187 Todo 4: a DEF-LEAF edge — a distinct dashed grey line (definition decomposition, NOT a control-flow branch).
  `.flow-def-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1;stroke-dasharray:2 2;opacity:.6}` +
  // an outline operand chip — kept DASHED so it never reads as a decision box. Source → grey; inferred (no `code is`) → purple.
  `.flow-leaf>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1;stroke-dasharray:2 1.5}` +
  `.flow-leaf.flow-inferred>rect{stroke:var(--vscode-charts-purple,#c586c0)}` +
  `.flow-leaf>text{fill:var(--vscode-descriptionForeground,#bfbfbf);font-size:11px}` +
  // #187 Option-C OUTLINE rows. An OPERATOR / TOP-OR label — a bare uppercase caption (no box), like the questionnaire's
  // ANY OF / ALL OF tab; render-only (not clickable). An EXTERNAL / MORE stub — a faint dashed box (unaddressable operand).
  `.flow-outline{cursor:default}` +
  `.flow-op>text,.flow-topor>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font:700 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.12em}` +
  `.flow-ext>rect,.flow-more>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#6a6a72);stroke-width:1;stroke-dasharray:2 2;opacity:.7}` +
  `.flow-ext>text,.flow-more>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font-size:11px;font-style:italic}` +
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
  `.flow-row.this-node>rect{stroke:var(--vscode-charts-orange,#d18616);stroke-width:3;stroke-dasharray:none}` +
  // #187 Todo 5: the per-case leaf VERDICT tick. Both glyphs render HIDDEN in every concept-bearing def-leaf; the
  // `markLeaves` overlay toggles `.flow-leaf-yes`/`.flow-leaf-no` on the leaf <g> (a class-toggle, like the channels above)
  // and CSS reveals the matching tick. A corner GLYPH (not a rect fill) so it composes with the non-Source wash + the
  // dashed leaf border. yes = a green check (the testing-pass green, reused from `.done-node`); no = a MUTED grey X —
  // deliberately NOT error-red, so an unsatisfied ANSWER never reads as the red `.failed-criterion` blocker channel.
  `.leaf-tick{display:none;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}` +
  `.flow-row.flow-leaf-yes .leaf-tick-yes{display:inline;stroke:var(--vscode-testing-iconPassed,#3fb950)}` +
  `.flow-row.flow-leaf-no .leaf-tick-no{display:inline;stroke:var(--vscode-descriptionForeground,#8c8c8c)}`;
