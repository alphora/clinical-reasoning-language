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
import { buildDefStruct, displayDetermination, topCriterion, type CrlConceptNode, type CrlDecisionStructure, type CrlStructureNode, type DefStructExpr, type GuardOutline, type ResolveDefExprEntry } from "@smile-digital-health/crl";

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
  /** opaque key → a node-body select ({nodeKey}, a crlNode), a concept/guard peek ({conceptNodeKey}), a tree sub-question
   *  ({subQuestionLeafKey}), or a #233 criterion collapse chevron ({criterionToggle}, a `leaf::` position key). The first
   *  two mirror RenderedCrl; the latter two are flow-only and are DIVERTED before the engine-selection path host-side. */
  reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string } | { subQuestionLeafKey: string } | { criterionToggle: string } | { criterionOccurrence: { lib: string; name: string; bodyHash: string; elided: boolean } }>;
  /** #187 Todo 5: def-leaf anchor key (the same `leaf::` key used in `anchors`) → its leaf concept identity + the OWNING
   *  composite `when` structure key. The cockpit joins `{lib,name}` to a case's `conceptTruth` for the yes/no verdict and
   *  gates on `topWhenKey` being on the fired-satisfied path. The `+N more` stub + cross-lib/omitted leaves get NO entry. */
  leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }>;
  /** #203 Todo 4b Slice A — every rendered node that REPRESENTS a concept (a `when`'s gating concept + each def-leaf),
   *  with its `<g>` id and the concept's `{lib,name}` identity. The cockpit maps a CONCEPT-scope flag `{libraryName,
   *  targetName}` to these gids to paint the per-node flag badge (a concept may render as SEVERAL `when` nodes / def-leaves
   *  → badge ALL; matched on (lib,name), never name alone — cross-lib same-name concepts exist). Decision-scope flags reuse
   *  `anchors[decisionNodeKey]`; activity/`otherwise` nodes carry no meta so they never appear here (they can't be flagged). */
  conceptOccurrences: { gid: string; lib: string; name: string }[];
  /** #224 ii.3 Slice 2b / #233 Todo 2a — one entry per RENDERED criterion box: a ROOT criterion absorbed into a `when`
   *  box (the sole case) AND every NON-ROOT `flow-crit-row` (a conjunct / nested criterion, #233). Each carries its `<g>`
   *  id, the criterion IDENTITY (`{lib,name}`, library-local), its `collapsed` state, and the body leaf identities. The
   *  host maps a model-level criterion verdict (keyed by identity) to these gids to paint the verdict chip, and rolls a
   *  body flag up onto a COLLAPSED box. A criterion rendered at N sites → N entries sharing one identity. NOTE (#233 2a):
   *  a non-root row carries NO verdict-chip markup yet and the `.crit-*` classes are `.flow-row`-scoped, so a shared
   *  criterion's non-root occurrence receives a (visually inert) verdict class in 2a; the chip + gate land in Todo 2b. */
  criterionOccurrences: { gid: string; lib: string; name: string; collapsed: boolean; bodyConcepts: { lib: string; name: string }[] }[];
  /** #203 Todo 4b Slice A — the gids of nodes that CAN carry a flag badge (`when` / decision root / def-leaf), so the
   *  webview can bulk-clear `.has-flag` before re-applying (a flag resolve must un-paint its node without a full re-render). */
  flaggableGids: string[];
  /** #203 Todo 4b (start-node chrome mirror) — the gid of the PRIMARY/start node (the first decision root the operator
   *  works from). It carries a COUNT badge (a copy of the tree chrome's `⚑ N open flags`) + is the catch-all click target;
   *  the host sets its count text + `.has-startflag` visibility (like the chrome), separate from the per-node `.has-flag`. */
  startNodeGid?: string;
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

/** #224 ii.3 Slice 2: the criterion COLLAPSE disclosure — a `▸` (collapsed) / `▾` (expanded) triangle, its OWN hit
 *  surface (`data-toggle-crit`, resolved host-side via the row's reveal key exactly like a peek). A grandchild of the
 *  when `<g>`, so `closest('[data-toggle-crit]')` wins for a chevron click and `closest('[data-reveal]')` for the box. */
const critToggle = (cx: number, cy: number, collapsed: boolean, revealKey: string, what = "criterion body"): string => {
  const d = collapsed ? `M${cx - 3} ${cy - 4} L${cx + 3} ${cy} L${cx - 3} ${cy + 4} Z` : `M${cx - 4} ${cy - 3} L${cx + 4} ${cy - 3} L${cx} ${cy + 3} Z`;
  return (
    `<g class="flow-crit-toggle" data-toggle-crit="${escapeHtml(revealKey)}">` +
    // `what` names what this chevron opens. #189 reuses this toggle for a coded question's ANSWERS, and a
    // hardcoded "criterion body" would have told a clinician the wrong thing about their own question.
    `<title>${collapsed ? `expand ${what}` : `collapse ${what}`}</title>` +
    `<rect class="flow-crit-hit" x="${cx - 7}" y="${cy - 8}" width="16" height="16" rx="3"/>` +
    `<path class="flow-crit-chevron" d="${d}"/></g>`
  );
};

/** #224 ii.3 Slice 2b — the model-level criterion VERDICT chip: a small circle + a state glyph, HIDDEN by default and
 *  revealed by the host adding `.crit-pass` / `.crit-fail` / `.crit-pending` / `.crit-stale` to the row (the
 *  `.flow-allpass-badge` idiom — pre-rendered + class-toggled so a verdict change never re-renders `#root`). All four
 *  glyphs are pre-rendered; the row class shows exactly one + colors the dot. Informational (`pointer-events:none`) — the
 *  verdict is SET via the right-click menu, not this chip (disc 319). Sits top-right, where a criterion `when`'s suppressed
 *  concept leaves the flag slot free. A `stale` verdict (edited-since-review) shows a muted "in-flux" three-dot glyph and
 *  is NEVER the settled pass/fail. */
const critVerdictChip = (cx: number, cy: number): string =>
  `<g class="flow-crit-verdict"><title>criterion review verdict</title>` +
  `<circle class="flow-crit-vdot" cx="${cx}" cy="${cy}" r="7"/>` +
  `<path class="flow-crit-g flow-crit-g-pass" d="M${cx - 3.2} ${cy} l2.2 2.4 l4.2 -4.8"/>` +
  `<path class="flow-crit-g flow-crit-g-fail" d="M${cx - 2.6} ${cy - 2.6} l5.2 5.2 M${cx + 2.6} ${cy - 2.6} l-5.2 5.2"/>` +
  `<path class="flow-crit-g flow-crit-g-pending" d="M${cx - 3} ${cy} h6"/>` +
  `<g class="flow-crit-g flow-crit-g-stale"><circle cx="${cx - 2.7}" cy="${cy}" r="0.95"/><circle cx="${cx}" cy="${cy}" r="0.95"/><circle cx="${cx + 2.7}" cy="${cy}" r="0.95"/></g>` +
  `</g>`;

/** #224 ii.3 Slice 2b-2: collect the ADDRESSABLE leaf-concept identities in a criterion body outline (recursing or/and/not
 *  and a leaf's own nested `composite`). Used to roll an open flag on a body concept up onto the COLLAPSED criterion box —
 *  else a flag inside a folded body is invisible in the flow. `external`/`more` stubs have no addressable identity → skipped. */
const collectLeafIdentities = (e: DefStructExpr, out: { lib: string; name: string }[]): void => {
  if (e.kind === "leaf") {
    out.push({ lib: e.lib, name: e.name });
    if (e.composite) collectLeafIdentities(e.composite, out);
  } else if (e.kind === "or" || e.kind === "and") {
    for (const o of e.operands) collectLeafIdentities(o, out);
  } else if (e.kind === "not") {
    collectLeafIdentities(e.operand, out);
  } else if (e.kind === "criterion") {
    // #233: a criterion BOUNDARY hides its body leaves when collapsed — recurse `.operand` so a flag on a concept
    // referenced ONLY inside a folded criterion (root OR nested) still rolls up onto the visible collapsed box.
    // (Also the root-criterion rollup at guardOutline.expr now passes through here — Todo 1 wraps the sole guard.)
    collectLeafIdentities(e.operand, out);
  }
};

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

/** A node label — one `<text>` (short) or two `<tspan>`s (wrapped), vertically centered in a box of height `h`. Horizontally
 *  it is LEFT-anchored at `x+dx` by default; `center` (a disposition LEAF, #210) sets `text-anchor="middle"` so `x+dx` is
 *  the label's CENTER (the caller passes `dx = NODE_W/2`). */
const labelMarkup = (label: string, x: number, y: number, h: number, maxChars: number, dx: number, center = false): string => {
  const lines = wrapLabel(label, maxChars);
  const tx = x + dx;
  const anchor = center ? ` text-anchor="middle"` : "";
  return lines.length === 1
    ? `<text x="${tx}" y="${y + h / 2 + 4}"${anchor}>${escapeHtml(lines[0])}</text>`
    : `<text x="${tx}"${anchor}><tspan x="${tx}" y="${y + h / 2 - 4}">${escapeHtml(lines[0])}</tspan><tspan x="${tx}" y="${y + h / 2 + 11}">${escapeHtml(lines[1])}</tspan></text>`;
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
// #203 GAP 3: a LEAF's centered label must clear BOTH end badges — the all-pass ✓ (right-center) and the new ⚑ (left-
// center) — so a leaf wraps/truncates a few chars sooner than a left-aligned node, reserving a badge gutter each side.
const LEAF_LABEL_MAX = 17;

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
  /**
   * ⭐ #189: this def-leaf is a CODED QUESTION — the concept declares `value from:` answer options, so the
   * row gets a ▸/▾ chevron and expands to show the answers a clinician is actually offered.
   *
   * ⚠ WITHOUT THIS A CODED QUESTION IS ONE FLAT BOX. A reviewer opening the tree on a policy whose
   * complaint criterion offers seven alternatives sees a single leaf — the whole point of collapsing
   * nineteen boolean leaves into four coded questions is invisible in the surface a clinician reads.
   */
  optionsRow?: { posKey: string; collapsed: boolean; count: number };
  /** #187 Todo 5: on a def-leaf, the structure nodeKey of the OWNING composite `when` (the leaf's top ancestor, threaded
   *  unchanged through nested operands). The per-case leaf-verdict overlay gates on THIS when being on the fired-satisfied
   *  path — so an off-path composite's leaves stay un-answered (parity with the questionnaire's on-path-only expansion). */
  topWhenKey?: string;
  /** #187 Option-C: an OUTLINE row (hangs below its `when`; x is indent-based, edges are the dashed spine). `outlineRow`
   *  is the row CATEGORY — only `"leaf"` rows are addressable (anchor + peek + verdict); `topor`/`op`/`external`/`more`
   *  are RENDER-ONLY (no anchor, no reveal). A `"crit"` row (#233) is a NAMED collapsible criterion boundary — its own
   *  toggle channel (chevron), an occurrence + collapsed-body flag rollup, but NOT an anchor/verdict target in 2a.
   *  `indent` drives x; `absX` is the precomputed left (indent-based). */
  outline?: boolean;
  outlineRow?: "topor" | "op" | "leaf" | "external" | "more" | "crit" | "option";
  /** #233 Todo 2a: set on a `"crit"` outline row (a NON-ROOT criterion boundary) — the criterion IDENTITY (`lib`/`name`),
   *  its `collapsed` state (default collapsed; independent, position-keyed), the addressable leaf identities inside its body
   *  (collapsed-box flag rollup, like `criterionCollapse.bodyConcepts`), and the POSITION collapse key (`n.nodeKey`, flipped
   *  in `expandedGuardWhens` by the toggle channel). A ROOT criterion is absorbed into the `when` box via `criterionCollapse`
   *  instead (byte-identical sole render), so it never produces a `"crit"` row. */
  critRow?: { lib: string; name: string; bodyHash: string; elided: boolean; collapsed: boolean; bodyConcepts: { lib: string; name: string }[]; posKey: string };
  /** #224 ii.3 Slice 2: set on a `when` whose guard is a SINGLE criterion ref (the collapse unit) — carries the current
   *  collapsed/expanded state so the render draws a `▸`/`▾` disclosure, plus the criterion IDENTITY (`lib`/`name` from
   *  `soleCriterion`) that the model-level verdict chip keys on (Slice 2b). `bodyConcepts` = the addressable leaf-concept
   *  identities inside the criterion body (Slice 2b-2: an open flag on one rolls up onto the COLLAPSED box, else it's
   *  invisible while folded). Absent on a compound-guard / non-criterion when. */
  criterionCollapse?: { collapsed: boolean; lib: string; name: string; bodyConcepts: { lib: string; name: string }[] };
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
  opts: {
    defExpr?: ResolveDefExprEntry;
    guardOutlines?: Map<string, GuardOutline>;
    expandedGuardWhens?: Set<string>;
    answerOptionsByConcept?: Map<string, { code: string; display: string }[]>;
    /** #189 — for a question whose answers live in a pure-REFERENCE terminology we cannot expand: the
     *  terminology NAME, rendered as one plain row and NEVER a chevron. See `answersFromTerminology`. */
    answersFromByConcept?: Map<string, string>;
  } = {},
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
        // ⭐ #189: a concept with `value from:` options is a CODED QUESTION. Expanding it shows the answers,
        // POSITION-keyed like a criterion and default-COLLAPSED, so a wide option set never bloats the tree
        // until a reviewer asks for it. Reuses the criterion toggle channel with its own key prefix.
        const answers = opts.answerOptionsByConcept?.get(s.nodeKey);
        let optionsRow: LaidNode["optionsRow"];
        // ⚠ NOT gated on `children.length === 0`. An earlier cut skipped any leaf that already had a
        // composite body — which silently excluded EVERY coded question in the field, because the node a
        // tree shows is the boolean wrapper and wrappers have composites. Option rows APPEND after the
        // composite: the body says how the answer is computed, the options say what may be answered.
        if (answers && answers.length > 0) {
          const posKey = outlineKey(topWhenKey, opPath, "opts");
          const collapsed = !(opts.expandedGuardWhens?.has(posKey) ?? false);
          optionsRow = { posKey, collapsed, count: answers.length };
          if (!collapsed) {
            for (const [oi, o] of answers.entries()) {
              children.push({
                ...base,
                nodeKey: outlineKey(topWhenKey, `${opPath}.o${oi}`, "opt"),
                kind: "leaf", outlineRow: "option", indent: indent + 1,
                absX: outlineX(whenLeft, indent + 1),
                label: o.display, full: `${o.display} — answer option \`${o.code}\``,
                y: take(), children: [],
              });
            }
          }
        }
        // ⭐ #189 — a question whose answers live in a pure-REFERENCE terminology. ONE plain row, ALWAYS
        // visible, NO chevron: we hold no member list, and a disclosure promises content. Without it the
        // node is indistinguishable from a concept that asks nothing at all.
        const answersFrom = !answers?.length ? opts.answersFromByConcept?.get(s.nodeKey) : undefined;
        if (answersFrom) {
          children.push({
            ...base,
            nodeKey: outlineKey(topWhenKey, `${opPath}.vs`, "opt"),
            kind: "leaf", outlineRow: "option", indent: indent + 1,
            absX: outlineX(whenLeft, indent + 1),
            label: `answers: ${answersFrom}`,
            full: `answers come from the value set "${answersFrom}" — resolved at deployment, so its members are not known here`,
            y: take(), children: [],
          });
        }
        return {
          ...base, nodeKey: outlineKey(topWhenKey, opPath, s.nodeKey), kind: "leaf", outlineRow: "leaf", isDefLeaf: true,
          label: s.name, full: `${s.name} — concept "${s.lib}"`,
          conceptKey: s.nodeKey, conceptName: s.name, conceptLib: s.lib, isSource: s.isSource,
          ...(optionsRow ? { optionsRow } : {}),
          y, children,
        };
      }
      case "criterion": {
        // #233 Todo 2a: a NON-ROOT criterion reference — a NAMED collapsible boundary row (mirroring the questionnaire's
        // named criterion box). A ROOT criterion never reaches here (it is absorbed into the `when` box via
        // `criterionCollapse` — the outline-hanging branch unwraps a root criterion to its `.operand`). Collapse is
        // POSITION-keyed (`posKey = (whenKey,opPath)`) + INDEPENDENT (a criterion nested inside a just-expanded parent
        // appears collapsed), default COLLAPSED. `bodyConcepts` = the addressable leaf identities inside the body (the
        // collapsed-box flag rollup, model-derived so it is complete whether or not the body is laid out this render).
        const y = take();
        const posKey = outlineKey(topWhenKey, opPath, "crit");
        const collapsed = !(opts.expandedGuardWhens?.has(posKey) ?? false);
        const bodyConcepts: { lib: string; name: string }[] = [];
        collectLeafIdentities(s.operand, bodyConcepts);
        const children = collapsed ? [] : [buildOutline(s.operand, whenLeft, topWhenKey, indent + 1, `${opPath}.b`, cursor)];
        return {
          ...base, nodeKey: posKey, kind: "leaf", outlineRow: "crit",
          label: s.name, full: `${s.name} — criterion "${s.lib}"`,
          critRow: { lib: s.lib, name: s.name, bodyHash: s.bodyHash, elided: s.elided === true, collapsed, bodyConcepts, posKey },
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
    // #224 ii.3 Todo 3 / #242: a COMPOUND (or criterion-bearing) `when` carries a GUARD OUTLINE (its decomposed
    // operands, keyed by nodeKey). It TAKES PRECEDENCE over single-concept resolution: a sole-ref criterion
    // (`criterion C: when A`) OR a `not X` guard flattens to `refKeys=[…]` (length 1) — resolving `conceptRef` would
    // masquerade the box as that concept (border/peek/label) AND double-hang its `defined as` outline beside the guard
    // outline. Gating `conceptRef` on `!guardOutline` suppresses the concept identity entirely (neutral border, no peek,
    // the label falls back to the guard text) and leaves the guard outline the SOLE outline source (disc 318 [critical] 1).
    // #242 NOTE: this is why a single-ref `not X` intentionally loses its (wrong) positive-concept identity. The CONCEPT
    // X becomes a `conceptOccurrence` at its new outline leaf, so the concept-object FLAG target migrates there (works).
    // Its left-click CASE-SELECT, though, is inert under `not` (a satisfied `when not X` has X false → the leaf never
    // lights `.flow-leaf-yes`; pre-existing negated-leaf semantics). The box's OWN verdict/case path is unchanged.
    const guardOutline = n.kind === "when" ? opts.guardOutlines?.get(n.nodeKey) : undefined;
    // #224 ii.3 Slice 2 / #233 Todo 2b: a ROOT-criterion guard (`topCriterion(expr)` defined — the guard's TOP expr IS a
    // single criterion node) is COLLAPSIBLE via the `when` box — default collapsed, expanded only when its nodeKey is in
    // `expandedGuardWhens`. A compound guard's top expr is `and`/`or` → no root criterion here (its NON-root criterion
    // conjuncts collapse independently as `flow-crit-row`s). `sole` is DERIVED from `expr` (the single source — the
    // `soleCriterion` sidecar was retired disc 330), so the render + the outline-hanging unwrap read ONE fact.
    const sole = guardOutline ? topCriterion(guardOutline.expr) : undefined;
    const collapsible = sole !== undefined;
    const collapsed = collapsible && !opts.expandedGuardWhens?.has(n.nodeKey);
    // #224 ii.3 Slice 2b-2: the criterion body's addressable leaf identities (for the collapsed-box flag rollup).
    const critBodyConcepts: { lib: string; name: string }[] = [];
    if (sole && guardOutline) collectLeafIdentities(guardOutline.expr, critBodyConcepts);
    // #224: only a SINGLE-ref `when` IS one concept (border/peek/outline). A
    // COMPOUND guard (>1 refKey) has no single concept — `refKeys[0]` would
    // masquerade the first operand as the whole guard, so drop the peek/border
    // and let the box label fall back to the full guard text. #242: the compound's
    // operands are now shown by its GUARD OUTLINE (hung below), not dropped.
    const conceptRef = n.kind === "when" && !guardOutline && n.refKeys.length === 1 ? n.refKeys[0] : undefined;
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
    // #224 ii.3 Todo 3: a criterion-bearing `when` hangs its GUARD OUTLINE (the criterion body, already a
    // `DefStructExpr`) DIRECTLY — no `isSource` top-`or`, no inferred-`ANY OF` wrap (those are `defined as`
    // ALIAS-parity concerns; a guard body is not a Source alias). `topWhenKey = n.nodeKey` so the per-leaf on-path
    // verdict overlay lights the criterion-body leaves exactly as it does a composite's. Mutually exclusive with the
    // single-concept path below: `guardOutline` is set ⇒ `conceptRef`/`cf.conceptName` were suppressed (see above).
    if (guardOutline && !collapsed) {
      const whenLeft = PAD + depth * COL;
      const cursor = { y: nodeY + (NODE_H * 1.5) / ROW };
      // #233 Todo 2a ROOT-ABSORPTION: a guard whose TOP expr IS a criterion (the sole case) has that criterion absorbed
      // INTO the `when` box (its name/chevron/verdict live on the box via `criterionCollapse`), so we hang the criterion's
      // BODY (`.operand`), NOT a redundant named `crit` row for the root — keeping the sole render byte-identical to before
      // criterion nodes existed. A compound-root guard (`when A and Meets X`) passes its expr as-is; its NON-root criterion
      // conjuncts render as named `crit` rows via `buildOutline`'s criterion arm. This unwrap and the `sole` collapse read
      // above both key on `guardOutline.expr` (via `topCriterion`) — ONE source since `soleCriterion` was retired (disc 330).
      const rootExpr = guardOutline.expr.kind === "criterion" ? guardOutline.expr.operand : guardOutline.expr;
      outlineRoots.push(buildOutline(rootExpr, whenLeft, n.nodeKey, 0, "0", cursor));
      slot = Math.max(slot, cursor.y); // reserve the outline's vertical extent so the next sibling clears it
    } else if (n.kind === "when" && cf.conceptName !== undefined && opts.defExpr) {
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
    // ⭐⭐ #189 — THE CANONICAL SHAPE, which BOTH branches above decline.
    //
    // ⚠ MEASURED (0 chevrons) before this existed, on `coded-question.crl:59` — our OWN reference fixture
    // for this feature, and `example-direct.crl:12`. A bare single-ref `when "Q"` has NO `guardOutline`
    // (`buildGuardOutlines` skips a `BranchConditionRef`), and the #189 wrapper is `definition is "…" in
    // …` — a REDUCTION, so `hasDefinedAs` is false. Neither arm hangs an outline, so no leaf exists for
    // `answerOptionsByConcept` to be consulted against, and the question renders as one flat box.
    //
    // ⚠ WHY IT SURVIVED A REAL-POLICY MEASUREMENT: every question in the policy I measured sat inside a
    // COMPOUND guard, which takes the `guardOutline` arm. 8 chevrons appeared and this hole did not. A
    // measurement against live content is worth more than a fixture AND is still only evidence about the
    // shapes that content happens to use.
    //
    // Keyed on `n.outlineRoots.length === 0` rather than on the negation of the two conditions above, so a
    // future third outline path cannot silently reintroduce a double render.
    const selfAnswers = n.kind === "when" && cf.conceptKey !== undefined ? opts.answerOptionsByConcept?.get(cf.conceptKey) : undefined;
    const selfAnswersFrom =
      n.kind === "when" && cf.conceptKey !== undefined && !selfAnswers?.length
        ? opts.answersFromByConcept?.get(cf.conceptKey)
        : undefined;
    if (outlineRoots.length === 0 && selfAnswersFrom) {
      // The pointer case on the canonical shape — one plain row under the `when`, no disclosure.
      const whenLeft = PAD + depth * COL;
      outlineRoots.push({
        nodeKey: outlineKey(n.nodeKey, "self.vs", "opt"),
        kind: "leaf", useDecision: false, outline: true, outlineRow: "option",
        indent: 0, absX: outlineX(whenLeft, 0),
        label: `answers: ${selfAnswersFrom}`,
        full: `answers come from the value set "${selfAnswersFrom}" — resolved at deployment, so its members are not known here`,
        depth: 0, topWhenKey: n.nodeKey, y: nodeY + (NODE_H * 1.5) / ROW, children: [],
      });
      slot = Math.max(slot, nodeY + (NODE_H * 1.5) / ROW + OUTLINE_ADVANCE);
    }
    if (outlineRoots.length === 0 && selfAnswers && selfAnswers.length > 0) {
      const whenLeft = PAD + depth * COL;
      const cursor = { y: nodeY + (NODE_H * 1.5) / ROW };
      const posKey = outlineKey(n.nodeKey, "self", "opts");
      const optCollapsed = !(opts.expandedGuardWhens?.has(posKey) ?? false);
      const y = cursor.y;
      cursor.y += OUTLINE_ADVANCE;
      const optChildren: LaidNode[] = [];
      if (!optCollapsed) {
        for (const [oi, o] of selfAnswers.entries()) {
          optChildren.push({
            nodeKey: outlineKey(n.nodeKey, `self.o${oi}`, "opt"),
            kind: "leaf", useDecision: false, outline: true, outlineRow: "option",
            indent: 1, absX: outlineX(whenLeft, 1),
            label: o.display, full: `${o.display} — answer option \`${o.code}\``,
            depth: 0, topWhenKey: n.nodeKey, y: cursor.y, children: [],
          });
          cursor.y += OUTLINE_ADVANCE;
        }
      }
      // The question itself renders as a leaf so the chevron and the rows sit where they do in every other
      // shape — one rendering path for option rows, not a second one on the structure box.
      outlineRoots.push({
        nodeKey: outlineKey(n.nodeKey, "self", "q"),
        kind: "leaf", useDecision: false, outline: true, outlineRow: "leaf", isDefLeaf: true,
        indent: 0, absX: outlineX(whenLeft, 0),
        label: cf.conceptName ?? "", full: `${cf.conceptName} — concept "${cf.conceptLib}"`,
        conceptKey: cf.conceptKey, conceptName: cf.conceptName, conceptLib: cf.conceptLib, isSource: cf.isSource,
        optionsRow: { posKey, collapsed: optCollapsed, count: selfAnswers.length },
        depth: 0, topWhenKey: n.nodeKey, y, children: optChildren,
      });
      slot = Math.max(slot, cursor.y);
    }
    const children = [...structureChildren, ...outlineRoots];
    return {
      nodeKey: n.nodeKey, kind: n.kind, useDecision, guard, label: display, full, depth, y: nodeY, children, ...cf,
      ...(sole ? { criterionCollapse: { collapsed, lib: sole.lib, name: sole.name, bodyConcepts: critBodyConcepts } } : {}),
    };
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
    /** #224 ii.3 Todo 3 / #242: guard outline per COMPOUND (or criterion-bearing) `when` (keyed by nodeKey) — hung as
     *  the operator outline so a compound guard's operands (and any criterion / `defined as` body) are visible instead
     *  of one opaque node. Built by `buildGuardOutlines` (crl core); a single bare ref has none (branch B renders it). */
    guardOutlines?: Map<string, GuardOutline>;
    /** #224 ii.3 Slice 2: nodeKeys of criterion whens the user has EXPANDED (default: absent ⇒ collapsed). A single-
     *  criterion-ref when not listed renders `▸ <name>` with its body hidden; listed → `▾` + the Slice-1 body outline. */
    expandedGuardWhens?: Set<string>;
    /** #189: inline `value from:` answers per concept nodeKey — what makes a coded question expandable. */
    answerOptionsByConcept?: Map<string, { code: string; display: string }[]>;
    /** #189 — for a question whose answers live in a pure-REFERENCE terminology we cannot expand: the
     *  terminology NAME, rendered as one plain row and NEVER a chevron. See `answersFromTerminology`. */
    answersFromByConcept?: Map<string, string>;
  } = {},
): RenderedFlow {
  const prefix = opts.revealPrefix ?? "";
  const concepts = opts.concepts ?? [];
  const anchors: Record<string, FlowAnchor> = {};
  const reveals: Record<string, { nodeKey: string } | { conceptNodeKey: string } | { subQuestionLeafKey: string } | { criterionToggle: string } | { criterionOccurrence: { lib: string; name: string; bodyHash: string; elided: boolean } }> = {};
  const leafConcepts: Record<string, { lib: string; name: string; topWhenKey: string }> = {};
  const conceptOccurrences: { gid: string; lib: string; name: string }[] = []; // #203 Todo 4b Slice A
  const criterionOccurrences: { gid: string; lib: string; name: string; collapsed: boolean; bodyConcepts: { lib: string; name: string }[] }[] = []; // #224 ii.3 Slice 2b
  const flaggableGids: string[] = [];

  if (structure.length === 0) {
    return { html: '<p class="placeholder">No CRL decisions to chart.</p>', anchors, reveals, leafConcepts, conceptOccurrences, criterionOccurrences, flaggableGids };
  }

  const conceptMap = new Map(concepts.map((c) => [c.nodeKey, c]));
  const { roots, maxDepth } = buildLaid(structure, conceptMap, {
    defExpr: opts.defExpr,
    guardOutlines: opts.guardOutlines,
    expandedGuardWhens: opts.expandedGuardWhens,
    answerOptionsByConcept: opts.answerOptionsByConcept,
    answersFromByConcept: opts.answersFromByConcept,
  });
  const startNodeKey = roots[0]?.nodeKey; // the PRIMARY/start node — carries the chrome-mirror count badge (see below)
  let startNodeGid: string | undefined;

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

    // #233 Todo 2a/2b: a NON-ROOT criterion boundary — a NAMED collapsible box. TWO channels: a ▸/▾ chevron
    // (`data-toggle-crit` → `{criterionToggle: posKey}` → `toggleCriterionExpand`), and the box BODY (`data-reveal` →
    // `{criterionOccurrence}` carrying the criterion identity + canonical bodyHash → RIGHT-click opens the model-level
    // criterion-encoding menu; LEFT-click is inert, diverted host-side). #233 Todo 2b: the hidden model-level verdict CHIP
    // (top-right) + a collapsed-body flag ROLLUP ⚑ (host lights `.has-flag` when folded + a body concept has an open flag);
    // `driveCriterionVerdicts` maps this occurrence's `(lib,name)` verdict → `.crit-*` on the gid (the chip idiom).
    if (n.outline && n.outlineRow === "crit") {
      const cr = n.critRow!;
      const togKey = `${prefix}t${gid}`; // the chevron's OWN key (distinct from the box's data-reveal key)
      reveals[key] = { criterionOccurrence: { lib: cr.lib, name: cr.name, bodyHash: cr.bodyHash, elided: cr.elided } };
      reveals[togKey] = { criterionToggle: cr.posKey };
      criterionOccurrences.push({ gid, lib: cr.lib, name: cr.name, collapsed: cr.collapsed, bodyConcepts: cr.bodyConcepts });
      flaggableGids.push(gid); // the rollup ⚑ participates in the host's bulk-clear (the flagBadge idiom)
      body +=
        `<g id="${escapeHtml(gid)}" class="flow-outline flow-crit-row" data-reveal="${escapeHtml(key)}"><title>${escapeHtml(n.full)}</title>` +
        `<rect x="${x}" y="${y}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H}" rx="6"/>` +
        labelMarkup(n.label, x, y, OUTLINE_H, OUTLINE_LABEL_MAX - 5, 20) +
        critToggle(x + 9, y + OUTLINE_H / 2, cr.collapsed, togKey) +
        critVerdictChip(x + OUTLINE_NODE_W - 11, y + 9) +
        flagBadge(x + OUTLINE_NODE_W - 27, y + 11, gid) +
        `</g>`;
      continue;
    }

    // ⭐ #189: an ANSWER OPTION row — one coded answer a clinician is offered for the coded question
    // above it. Render-only and deliberately quiet: it is evidence about the question, not a node anyone
    // selects, flags or navigates to. A reviewer needs to SEE the seven alternatives; they do not need
    // seven more things to click.
    if (n.outline && n.outlineRow === "option") {
      body +=
        `<g id="${escapeHtml(gid)}" class="flow-outline flow-opt"><title>${escapeHtml(n.full)}</title>` +
        `<rect x="${x}" y="${y + 2}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H - 4}" rx="4"/>` +
        labelMarkup(n.label, x, y, OUTLINE_H, OUTLINE_LABEL_MAX, 9) +
        `</g>`;
      continue;
    }

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

    // #187 Option-C: an OUTLINE LEAF row (a `defined as` concept operand). Its synthetic `leaf::` key (`n.nodeKey`,
    // path-bearing → collision-free) anchors it + joins the Todo-5 verdict overlay. #187 Todo 3: carries a hidden on-path
    // RING revealed when the operand is TRUE (`markLeaves` toggles `.flow-leaf-yes`); a false / unknown operand shows nothing.
    if (n.outline) {
      // #216: a sub-question left-click SELECTS the case(s) where THIS operand is TRUE on-path — a SUBSET of the owning
      // branch's cases (the cases that would light this leaf `.flow-leaf-yes`), resolved DYNAMICALLY host-side + selected in
      // the current primary. The hit carries the STABLE `leaf::` key (`n.nodeKey`), NOT the render-scoped reveal key. (Was a
      // concept PEEK → highlighted the parent `when` = the "selects its parent" bug; a first fix revealed the owning `when`'s
      // nodeKey, but that offered the parent's FULL case list, including cases this operand isn't on-path for.)
      reveals[key] = { subQuestionLeafKey: n.nodeKey };
      // #203 Todo 4b Slice A: a def-leaf that names a concept is a concept OCCURRENCE (flaggable). The `; more`/external
      // stubs (no conceptName) are not. A leaf-only concept flag lands here.
      const leafConcept = n.conceptName !== undefined && n.conceptLib !== undefined && n.outlineRow === "leaf";
      if (n.conceptName !== undefined && n.conceptLib !== undefined && n.topWhenKey !== undefined)
        leafConcepts[n.nodeKey] = { lib: n.conceptLib, name: n.conceptName, topWhenKey: n.topWhenKey };
      if (leafConcept) {
        conceptOccurrences.push({ gid, lib: n.conceptLib!, name: n.conceptName! });
        flaggableGids.push(gid);
      }
      // #187 Todo 2: border by Source — inferred (no `code is`) → purple, Source → grey — kept DASHED (an operand chip,
      // not a decision box). `isSource === false` is inferred; `true`/`undefined` stay grey (never mis-purple).
      const classes = ["flow-row", "flow-leaf"];
      if (n.isSource === false) classes.push("flow-inferred"); // inferred sub-question → purple (kept under the ring)
      else classes.push("flow-greyborder"); // a source sub-question's grey border hides under the on-path ring (Todo 3b)
      // ⭐ #189: a CODED QUESTION gets a ▸/▾ chevron that expands its answer options. Reuses the criterion
      // toggle channel (`{criterionToggle}` → `toggleCriterionExpand`) with its own disjoint `opts`-suffixed
      // position key, so no new message type, no new state set, and no new host plumbing.
      const optRow = n.optionsRow;
      let optTogKey = "";
      if (optRow) {
        optTogKey = `${prefix}o${gid}`;
        reveals[optTogKey] = { criterionToggle: optRow.posKey };
      }
      body +=
        `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}"><title>${escapeHtml(n.full)}</title>` +
        `<rect x="${x}" y="${y}" width="${OUTLINE_NODE_W}" height="${OUTLINE_H}" rx="6"/>` +
        // ⚠ The 5th arg is maxChars, NOT pixels. `- 12` (mistaking it for the 12px shift) left EIGHT chars
        // per line out of OUTLINE_LABEL_MAX = 20, so every coded question wrapped to two 8-char fragments.
        // The crit-row precedent above reserves 5 chars for a 20px gutter; 12px is ~2 chars at ~5.9px/char.
        labelMarkup(n.label, x + (optRow ? 12 : 0), y, OUTLINE_H, OUTLINE_LABEL_MAX - (optRow ? 2 : 0), 9) +
        (optRow ? critToggle(x + 8, y + OUTLINE_H / 2, optRow.collapsed, optTogKey, `${optRow.count} answer options`) : "") +
        flowRing(x, y, OUTLINE_NODE_W, OUTLINE_H, 1.5, 7) +
        (leafConcept ? flagBadge(x + OUTLINE_NODE_W - 11, y + 11, gid) : "") +
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
    // #203 Slice A + GAP 3: a `when` (→ its concept, object-flaggable, OR the condition, occurrence-flaggable), a decision
    // ROOT (→ the decision), AND a recommend-activity LEAF (→ the recommendation site, occurrence-flaggable) are FLAGGABLE;
    // an `otherwise` / use-decision node is not. Pre-render the hidden ⚑ + record concept occurrences (for object flags).
    const isWhenConcept = n.kind === "when" && n.conceptName !== undefined && n.conceptLib !== undefined;
    const flaggable = n.kind === "decision" || isWhenConcept || isLeafEnd; // isLeafEnd = a recommend-activity leaf
    if (flaggable) flaggableGids.push(gid);
    if (isWhenConcept) conceptOccurrences.push({ gid, lib: n.conceptLib!, name: n.conceptName! });
    // Badge position: a LEAF mirrors its all-pass ✓ — ⚑ at LEFT-center, ✓ at right-center, label centered between (they
    // no longer collide, GAP 3 / Claude I3); a decision stadium → left of its rounded end; a `when` rect → top-right.
    const flagBadgeMarkup = flaggable ? flagBadge(isLeafEnd ? x + 13 : stadium ? x + NODE_W - 30 : x + NODE_W - 14, isLeafEnd ? y + NODE_H / 2 : y + 13, gid) : "";
    // The PRIMARY/start node (first decision root) additionally carries the chrome-mirror COUNT badge — a pill showing the
    // total open-flag count (`⚑ N`), the catch-all click target (see driveFlagBadges). Pre-rendered hidden; the host sets
    // its text + `.has-startflag`. Sits at the top-right, straddling the node's top edge (within the PAD, no clip).
    const isStart = n.kind === "decision" && n.nodeKey === startNodeKey;
    if (isStart) startNodeGid = gid;
    const startFlagMarkup = isStart ? startFlagBadge(x + NODE_W - 48, y - 8) : "";
    // #224 ii.3 Slice 2: a collapsible criterion `when` reserves a left gutter for its `▸`/`▾` disclosure — the label
    // shifts right + wraps a few chars sooner (mirrors LEAF_LABEL_MAX reserving badge gutters, disc 319 nit 10).
    const critC = n.criterionCollapse;
    const critToggleMarkup = critC ? critToggle(x + 10, y + NODE_H / 2, critC.collapsed, key) : "";
    const labelDx = critC ? 24 : 10;
    const labelMax = critC ? LABEL_MAX - 4 : LABEL_MAX;
    // #224 ii.3 Slice 2b: a single-criterion `when` records an OCCURRENCE (identity `{lib,name}` — the model-level verdict
    // is keyed on it, reviewed once across all occurrences + cases) + carries a HIDDEN verdict chip at the top-right (a
    // criterion `when` has its concept suppressed → no flag badge there, so the slot is free). The host reveals the chip
    // per-occurrence via `.flow-row.crit-{pass,fail,pending,stale}` without re-render (the flagBadge/allPass idiom).
    if (critC) criterionOccurrences.push({ gid, lib: critC.lib, name: critC.name, collapsed: critC.collapsed, bodyConcepts: critC.bodyConcepts });
    const critVerdictMarkup = critC ? critVerdictChip(x + NODE_W - 13, y + 13) : "";
    // #224 ii.3 Slice 2b-2: a criterion when carries a HIDDEN rollup ⚑ (left of the verdict chip). The host lights it
    // (`.has-flag`) ONLY when the box is COLLAPSED and a body concept has an open flag (driveFlagBadges) — so a folded body's
    // flag isn't invisible. `flaggableGids` includes the gid so the host's bulk-clear covers it (the flagBadge idiom).
    const critFlagMarkup = critC ? flagBadge(x + NODE_W - 30, y + 13, gid) : "";
    if (critC) flaggableGids.push(gid);
    body +=
      `<g id="${escapeHtml(gid)}" class="${classes.join(" ")}" data-reveal="${escapeHtml(key)}">` +
      `<title>${escapeHtml(n.full)}</title>` +
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="${rx}"/>` +
      // #210: a disposition LEAF (outcome tip) centers its label; interior nodes stay left-aligned (shifted for a chevron).
      (isLeafEnd ? labelMarkup(n.label, x, y, NODE_H, LEAF_LABEL_MAX, NODE_W / 2, true) : labelMarkup(n.label, x, y, NODE_H, labelMax, labelDx)) +
      flowRing(x, y, NODE_W, NODE_H, 2.5, stadium ? (NODE_H + 5) / 2 : 8) + // #187 Todo 3: on-path ring — BEFORE the guard tab so the tab's opaque fill occludes the ring's top crossing segment
      guardTab +
      critToggleMarkup +
      critVerdictMarkup +
      critFlagMarkup +
      allPassBadge +
      flagBadgeMarkup +
      startFlagMarkup +
      `</g>`;
  }

  const svg =
    `<svg class="flow-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    body +
    `</svg>`;
  // A floating zoom control (fixed to the pane corner). The zoom LEVEL is webview-local state re-applied after every
  // render (applyZoom); this markup is stateless — the % is filled in by applyZoom. Ctrl+wheel / Ctrl +/-/0 also zoom.
  const zoom =
    `<div class="flow-zoom" data-flow-zoom>` +
    `<button type="button" data-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>` +
    `<button type="button" data-zoom="reset" class="flow-zoom-pct" title="Reset zoom (or Ctrl+scroll to zoom)" aria-label="Reset zoom">100%</button>` +
    `<button type="button" data-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>` +
    `</div>`;
  return { html: `<div class="flow-wrap">${svg}</div>${zoom}`, anchors, reveals, leafConcepts, conceptOccurrences, criterionOccurrences, flaggableGids, startNodeGid };
}

// #203 Todo 4b Slice A — the hidden per-node flag badge: a ⚑ glyph grandchild `<g>`, shown when the host adds `.has-flag`
// to the row (the `.flow-allpass-badge` idiom — pre-rendered + class-toggled so a flag change never re-renders `#root` and
// clobbers the painted verdict/failed-criterion overlays). Clickable (`pointer-events:auto` + `data-mv-flag-badge`, the
// webview intercepts it BEFORE the row's `data-reveal`). Top-RIGHT interior (clears the left label + the top guard-tab band;
// leaves never carry both an all-pass ✓ [right-center] and a flag [top-right]).
//
// Todo 2 (disc 356): the per-node badge carries `data-node-flag-gid="${gid}"` on the badge `<g>` ITSELF (NOT the row) → the
// webview posts `{nodeFlags, gid}` so the host filters to THIS node's flags. CRITICAL that it's on the badge, not the row: on
// the start node the per-node ⚑ and the start-count pill are SIBLINGS in one row `<g>`, so a row-level attribute would make a
// start-pill click resolve it too and break "root → full list". The START pill (startFlagBadge) has NO gid → still `mvFlags`.
const flagBadge = (bx: number, by: number, gid: string): string =>
  `<g class="flow-flag-badge" data-mv-flag-badge="1" data-node-flag-gid="${escapeHtml(gid)}"><title>review flag(s) on this node — click to review</title>` +
  `<circle cx="${bx}" cy="${by}" r="7"/><text class="flow-flag-glyph" x="${bx}" y="${by + 3.5}">⚑</text></g>`;

// The start-node COUNT badge — a copy of the tree chrome (`⚑ N open flags`) pinned to the primary/start node: a pill with
// a count the host sets (`.flow-startflag-text`), shown via `.has-startflag` on the row (the same class-toggle idiom as
// `.has-flag`, so a flag change never re-renders `#root`). Clickable → the flag list (the catch-all: orphan/library-scope
// flags surface here since they map to no specific node). Distinct from the per-node ⚑ (presence) — this is the TOTAL.
const startFlagBadge = (bx: number, by: number): string =>
  `<g class="flow-startflag-badge" data-mv-flag-badge="1"><title>open review flags (all) — click to review</title>` +
  `<rect x="${bx}" y="${by}" width="44" height="16" rx="8"/>` +
  `<text class="flow-startflag-text" x="${bx + 22}" y="${by + 11.5}" text-anchor="middle"></text></g>`;

/** Flow-pane CSS — concatenated into the cockpit's nonced <style> (CSP-safe: no inline styles / no SVG <style>). Every
 *  var(--vscode-*) carries a hex fallback (the chart renders in tests / high-contrast with no live theme), matching
 *  CORR_STYLE + shellHtml. #187 Todo 3: the on-path highlight is the `.flow-ring` rect (a deterministic SVG rect-stroke);
 *  the shell's global `.current`/`.diverter`/`.failed-criterion` OUTLINE overlays ARE neutralized on flow `<g>`s (they
 *  paint a lumpy square there — the flow uses the ring + rect strokes instead). The per-case CHANNELS still paint rect
 *  strokes/fills: `.this-node` (orange), `.failed-criterion`/`-preempt` (dashed), `.diverter` (dotted), `.review-pass/-fail/-pending`/`.error-node` (fill). */
// #218: the FIVE authoritative paint tokens the MV legend decodes. ONE const per concept, interpolated into BOTH the tree
// paint rules AND the legend swatch rules below → the legend cannot drift from the paint BY CONSTRUCTION (Claude R1). Named
// semantically (not after the token) so a future reader doesn't "clean up" a shared token that's reused elsewhere (e.g.
// focusBorder is also the filter-chip focus color). Verdict = a FILL (with an alpha wash on the tree); inferred/ring = a STROKE.
const TOK_VERDICT_PASS = "var(--vscode-testing-iconPassed,#73c991)";
const TOK_VERDICT_FAIL = "var(--vscode-testing-iconFailed,#f14c4c)";
const TOK_VERDICT_PENDING = "var(--vscode-charts-yellow,#d29922)";
const TOK_INFERRED = "var(--vscode-charts-purple,#c586c0)";
const TOK_RING = "var(--vscode-focusBorder,#3794ff)";

/** #218: the MV flow-pane color KEY (operator-scoped to EXACTLY three concepts — verdict fill, inferred purple, selected-path
 *  ring; no grey/disposition, no ✓ badge, no stadium). MV-ONLY: verdict fills paint only in medical-validation mode, and the
 *  operator chose MV-only (so purple/ring go unlabelled in cockpit mode — a known, accepted limitation). Rendered into the
 *  tree-pane `#fcChrome`; the swatch CSS lives in FLOW_STYLE keyed on the SAME `TOK_*` consts. The verdict chips are full
 *  opacity (hue-truthful; the tree wash is `.2/.16`, invisible at chip size — a deliberate alpha divergence, hue is what the
 *  key decodes). "Selected path" NOT "Selected case": the ring also marks source-primary correspondence reach, not only a case. */
export function flowLegendChrome(mode: "cockpit" | "medical-validation"): string {
  if (mode !== "medical-validation") return "";
  const chip = (cls: string, label: string, gap: boolean): string =>
    `<span class="fc-lg${gap ? " fc-lg-gap" : ""}"><i class="fc-sw ${cls}" aria-hidden="true"></i>${label}</span>`;
  return (
    `<div class="fc-legend" role="group" aria-label="Tree color key: green fill Pass, red fill Fail, yellow fill Pending, purple border Inferred, blue ring Selected path">` +
    chip("fc-sw-pass", "Pass", false) +
    chip("fc-sw-fail", "Fail", false) +
    chip("fc-sw-pending", "Pending", false) +
    chip("fc-sw-inferred", "Inferred", true) + // fc-lg-gap → 3 visual concept-groups: [Pass Fail Pending] · [Inferred] · [Selected path]
    chip("fc-sw-ring", "Selected path", true) +
    `</div>`
  );
}

export const FLOW_STYLE =
  `.flow-wrap{display:inline-block;min-width:100%}` +
  // `cursor:grab` = the grab-drag pan affordance on the tree background (a `.flow-row` overrides it with `pointer`, so nodes
  // still read as clickable); `user-select:none` so a pan-drag over node text doesn't select it.
  `.flow-svg{display:block;font:12px var(--vscode-editor-font-family,sans-serif);cursor:grab;user-select:none}` +
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
  `.flow-when.flow-inferred>rect{stroke:${TOK_INFERRED};stroke-width:1.4}` +
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
  `.flow-guard-tab.flow-inferred>rect{stroke:${TOK_INFERRED}}` +
  `.flow-guard-tab>text{fill:var(--vscode-descriptionForeground,#cccccc);font:600 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.02em}` +
  `.flow-guard-tab:hover>rect{fill:var(--vscode-toolbar-hoverBackground,#2a2d2e)}` +
  // #224 ii.3 Slice 2: the criterion collapse chevron — a clickable ▸/▾ triangle with a transparent hit rect.
  `.flow-crit-toggle{cursor:pointer;pointer-events:auto}` +
  `.flow-crit-hit{fill:transparent}` +
  `.flow-crit-chevron{fill:var(--vscode-descriptionForeground,#8c8c8c)}` +
  `.flow-crit-toggle:hover .flow-crit-hit{fill:var(--vscode-toolbar-hoverBackground,#2a2d2e)}` +
  `.flow-crit-toggle:hover .flow-crit-chevron{fill:var(--vscode-foreground,#cccccc)}` +
  `.flow-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.6}` + // slightly thicker — hard to see on Mac (operator feedback)
  // #187 Todo 4: a DEF-LEAF edge — a distinct dashed grey line (definition decomposition, NOT a control-flow branch).
  // Slightly THICKER + less faint so the connector reads on Mac (operator feedback).
  `.flow-def-edge{fill:none;stroke:var(--vscode-panel-border,#454545);stroke-width:1.5;stroke-dasharray:2 2;opacity:.8}` +
  // an outline operand SUB-QUESTION looks EXACTLY like a main `when` question: a SOLID border — GREY (has a local `code is`)
  // / PURPLE (inferred, decomposes into its own sub-questions recursively). On-path → the blue ring, same as a main node.
  // (Solid, not the Todo-2 dashed chip: the indent + smaller box + dashed spine already distinguish it from a decision box.)
  `.flow-leaf>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1}` +
  `.flow-leaf.flow-inferred>rect{stroke:${TOK_INFERRED};stroke-width:1.4}` + // #210: off-path purple slightly heavier (on-path 2 wins, later)
  `.flow-leaf>text{fill:var(--vscode-descriptionForeground,#bfbfbf);font-size:11px}` +
  // #187 Option-C OUTLINE rows. An OPERATOR / TOP-OR label — a bare uppercase caption (no box), like the questionnaire's
  // ANY OF / ALL OF tab; render-only (not clickable). An EXTERNAL / MORE stub — a faint dashed box (unaddressable operand).
  `.flow-outline{cursor:default}` +
  `.flow-op>text,.flow-topor>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font:700 9px/1 var(--vscode-editor-font-family,monospace);letter-spacing:.12em}` +
  `.flow-ext>rect,.flow-more>rect{fill:var(--vscode-editor-background,#1e1e1e);stroke:var(--vscode-descriptionForeground,#6a6a72);stroke-width:1;stroke-dasharray:2 2;opacity:.7}` +
  `.flow-ext>text,.flow-more>text{fill:var(--vscode-descriptionForeground,#8c8c8c);font-size:11px;font-style:italic}` +
  // #189: an ANSWER OPTION row — a quiet, borderless chip under its coded question. Deliberately not a
  // box: it is one of the answers, not another question, and it must not read as a node to click.
  `.flow-opt{cursor:default}` +
  `.flow-opt>rect{fill:var(--vscode-editorHoverWidget-background,#252526);stroke:none}` +
  `.flow-opt>text{fill:var(--vscode-descriptionForeground,#9d9d9d);font-size:10.5px}` +
  // #233 Todo 2a: a NON-ROOT criterion boundary box — a SOLID box (like a sub-question leaf) marking a NAMED criterion,
  // with a left ▸/▾ chevron (`.flow-crit-toggle`, already styled) toggling its body. The collapsed-body flag ROLLUP ⚑
  // shows via `.has-flag` — this row is `.flow-outline` (NOT `.flow-row`), so it needs its OWN has-flag rule (the shared
  // `.flow-row.has-flag .flow-flag-badge` selector wouldn't match). The verdict chip + right-click verdict land in 2b.
  `.flow-crit-row{cursor:default}` +
  `.flow-crit-row>rect{fill:var(--vscode-editorHoverWidget-background,#2c2c2d);stroke:var(--vscode-descriptionForeground,#8c8c8c);stroke-width:1.2}` +
  `.flow-crit-row>text{fill:var(--vscode-foreground,#cccccc);font-size:11px}` +
  `.flow-crit-row.has-flag .flow-flag-badge{display:inline}` +
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
  `.flow-ring>rect{fill:none;stroke:${TOK_RING};stroke-width:2.5;stroke-dasharray:none}` +
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
  // disc 359/360 (revised 361): the GOLD node-link for the OPEN flag-action drawer's flag — a HALO (drop-shadow glow) on the
  // node's OWN border rect, mirroring the `.node-focus` focus glow the operator pointed at. A glow is a SEPARATE visual axis:
  // it leaves the node's identity border its ORIGINAL colour (the operator's ask — the earlier gold RING read as a recoloured
  // border) AND coexists with the blue `.flow-ring` (a node that is BOTH selected/on-path AND the drawer's target shows the
  // blue ring AND the gold halo — the two-signal ask) + the base-`>rect` overlays. Applied to the FIRST `>rect` (the border box)
  // of the id-bearing `<g>`, present on all three flaggable kinds (struct/def-leaf/crit-row); crit-row is NOT `.flow-row`, so
  // this class-agnostic selector reaches it where `.node-focus` (row-only) could not. GOLD regardless of the flag's open/resolved
  // status — the channel means "this drawer's target". Single gold (mid-tone, reads on light + dark), so no theme swap.
  `.flag-current>rect{filter:drop-shadow(0 0 5px var(--vscode-charts-yellow,#cca700)) drop-shadow(0 0 2px var(--vscode-charts-yellow,#cca700))}` +
  // disc 361 fix: the drawer target is ALSO the flag anchor (`driveNodeFocus` marks the clicked flag node `.node-focus`), so
  // a drawer-target node is ALWAYS both `.node-focus` (white glow) and `.flag-current` (gold glow) — NOT the "rare overlap" the
  // first pass assumed. The white glow's higher specificity was winning, hiding the gold. The operator wants gold to win, ideally
  // WITH the white still visible. This COMBINED rule (higher specificity than either single glow) chains BOTH: a punchy GOLD core
  // (front, doubled) + a wider WHITE fringe (behind, peeks beyond the gold) → "gold node with a white outer halo". Order matters:
  // drop-shadow chains render each shadow BEHIND the prior result, so the LAST (white, widest) sits furthest back. THEME-ADAPTIVE
  // like `.node-focus`: white on dark, black on light (`body.vscode-light`/`-high-contrast-light`). Only for `.flow-row` — the
  // white `.node-focus` rule is row-only, so a crit-row never has a white glow to fight (gold wins there via the base rule).
  `.flow-row.node-focus.flag-current>rect{filter:drop-shadow(0 0 4px var(--vscode-charts-yellow,#cca700)) drop-shadow(0 0 4px var(--vscode-charts-yellow,#cca700)) drop-shadow(0 0 8px #ffffff)}` +
  `body.vscode-light .flow-row.node-focus.flag-current>rect,body.vscode-high-contrast-light .flow-row.node-focus.flag-current>rect{filter:drop-shadow(0 0 4px var(--vscode-charts-yellow,#cca700)) drop-shadow(0 0 4px var(--vscode-charts-yellow,#cca700)) drop-shadow(0 0 8px #000000)}` +
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
  `.flow-row.review-pass>rect{fill:${TOK_VERDICT_PASS};fill-opacity:.2}` + // #218: shared TOK_* consts (legend swatches key on the same) → paint/legend can't drift
  `.flow-row.review-fail>rect{fill:${TOK_VERDICT_FAIL};fill-opacity:.2}` +
  `.flow-row.review-pending>rect{fill:${TOK_VERDICT_PENDING};fill-opacity:.16}` +
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
  // #224 ii.3 Slice 2b / #233 Todo 2b — the model-level criterion VERDICT chip (top-right of a ROOT criterion `when` box OR
  // a NON-ROOT `flow-crit-row`). HIDDEN; the host reveals it per-occurrence by toggling `.crit-{pass,fail,pending,stale}` on
  // the row (no #root re-render — the allpass idiom). The `.crit-*` classes are posted ONLY to criterion rows (both kinds),
  // so the selectors key on `.crit-*` WITHOUT a row-type prefix → one rule matches the `when` box AND the crit-row. The dot
  // color encodes the state (the same TOK_* the case-verdict wash uses; stale = a muted grey), and exactly one glyph shows:
  // ✓ pass / ✗ fail / – pending (undecided) / ⋯ stale (edited-since-review, never the settled judgment).
  `.flow-crit-verdict{display:none;pointer-events:none}` +
  `.crit-pass .flow-crit-verdict,.crit-fail .flow-crit-verdict,.crit-pending .flow-crit-verdict,.crit-stale .flow-crit-verdict{display:inline}` +
  `.flow-crit-vdot{stroke:var(--vscode-editorWidget-background,#252526);stroke-width:1.2}` +
  `.crit-pass .flow-crit-vdot{fill:${TOK_VERDICT_PASS}}` +
  `.crit-fail .flow-crit-vdot{fill:${TOK_VERDICT_FAIL}}` +
  `.crit-pending .flow-crit-vdot{fill:${TOK_VERDICT_PENDING}}` +
  `.crit-stale .flow-crit-vdot{fill:var(--vscode-descriptionForeground,#8c8c8c)}` +
  `.flow-crit-g{display:none;fill:none;stroke:#ffffff;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}` +
  `.flow-crit-g-stale circle{fill:#ffffff;stroke:none}` +
  `.crit-pass .flow-crit-g-pass{display:inline}` +
  `.crit-fail .flow-crit-g-fail{display:inline}` +
  `.crit-pending .flow-crit-g-pending{display:inline}` +
  `.crit-stale .flow-crit-g-stale{display:inline}` +
  // #203 Todo 4b Slice A — the per-node review-flag ⚑ badge. HIDDEN; shown when the host toggles `.has-flag` on the row
  // (a flag resolve un-paints without a #root re-render, preserving the verdict/failed-criterion overlays). The `<g>` is
  // CLICKABLE (`pointer-events:auto`) and carries `data-mv-flag-badge` — the webview intercepts it BEFORE the row's
  // `data-reveal` and opens the flag list. Amber circle (the open-flag color, matching `.mv-flags-open`) + a dark ⚑ glyph.
  `.flow-flag-badge{display:none;cursor:pointer;pointer-events:auto}` +
  `.flow-row.has-flag .flow-flag-badge{display:inline}` +
  `.flow-flag-badge>circle{fill:var(--vscode-testing-iconQueued,var(--vscode-charts-yellow,#cca700));stroke:var(--vscode-editorWidget-background,#252526);stroke-width:1.2}` +
  `.flow-flag-glyph{fill:#1e1e1e;font-size:9px;font-weight:bold;text-anchor:middle;pointer-events:none}` +
  // The start-node COUNT badge (chrome mirror). HIDDEN; shown when the host toggles `.has-startflag` on the start row +
  // sets `.flow-startflag-text`. Amber pill (open) — the host recolors the text/pill semantics via the count it posts.
  `.flow-startflag-badge{display:none;cursor:pointer;pointer-events:auto}` +
  `.flow-row.has-startflag .flow-startflag-badge{display:inline}` +
  `.flow-startflag-badge>rect{fill:var(--vscode-testing-iconQueued,var(--vscode-charts-yellow,#cca700));stroke:var(--vscode-editorWidget-background,#252526);stroke-width:1.2}` +
  `.flow-startflag-text{fill:#1e1e1e;font-size:10px;font-weight:bold;pointer-events:none}` +
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
  // #210 (disc 239): the CRL Assist FOCUS ring — the tree node the agent has as its flag anchor. A neutral GLOW (drop-shadow),
  // NOT a coloured stroke: EVERY semantic colour in the flowchart is taken (blue=selection, orange=this-node, purple=Inferred,
  // yellow=flags/pending, green/red=verdicts), so a bright NEUTRAL halo is the only non-colliding "the agent is focused here"
  // signal. A glow is a separate visual axis — it leaves every node's border intact + coexists with the protected overlays.
  // THEME-ADAPTIVE: a WHITE halo pops on a dark canvas (default / HC-dark); on a LIGHT theme swap to a BLACK halo (VS Code
  // stamps `vscode-light` / `vscode-high-contrast-light` on the webview body) so it never disappears. Two shadows = crisp.
  `.flow-row.node-focus>rect{filter:drop-shadow(0 0 5px #ffffff) drop-shadow(0 0 2px #ffffff)}` +
  `body.vscode-light .flow-row.node-focus>rect,body.vscode-high-contrast-light .flow-row.node-focus>rect{filter:drop-shadow(0 0 5px #000000) drop-shadow(0 0 2px #000000)}` +
  // #187 Todo 3: the per-case leaf verdict is now the on-path RING (above) — `markLeaves` toggles `.flow-leaf-yes` (TRUE
  // → ring) / `.flow-leaf-no` (false → NOTHING; `.flow-leaf-no` is a RESERVED no-op class, kept so a muted false marker is
  // a cheap re-add if the audit ever needs false≠unevaluated). The old green ✓ / grey ✗ tick glyphs are removed.
  `.flow-row.flow-leaf-no{}` +
  // #218: the MV color KEY (rendered into `#fcChrome` by `flowLegendChrome`, outside the SVG). Swatch tokens are the SHARED
  // `TOK_*` consts — the SAME ones the paint rules above interpolate — so the key cannot drift from the paint. Verdict chips
  // are a FILL at FULL opacity (the tree wash is `.2/.16` — invisible at 9px; the key decodes HUE, deliberately not alpha);
  // inferred/ring chips are a BORDER (mirroring the tree's stroke). Muted via the LABEL `color` only (NOT parent `opacity`,
  // which would fade the chips too). `fc-lg-gap` splits the row into 3 concept-groups: [Pass Fail Pending] · [Inferred] · [Selected path].
  `.fc-legend{display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin-left:8px;font-size:.9em;color:var(--vscode-descriptionForeground,#8c8c8c)}` +
  `.fc-legend .fc-lg{display:inline-flex;align-items:center}` +
  `.fc-legend .fc-lg-gap{margin-left:8px}` +
  `.fc-legend .fc-sw{display:inline-block;width:9px;height:9px;margin-right:3px;border-radius:2px;box-sizing:border-box}` +
  `.fc-legend .fc-sw-pass{background:${TOK_VERDICT_PASS}}` +
  `.fc-legend .fc-sw-fail{background:${TOK_VERDICT_FAIL}}` +
  `.fc-legend .fc-sw-pending{background:${TOK_VERDICT_PENDING}}` +
  `.fc-legend .fc-sw-inferred{border:1.5px solid ${TOK_INFERRED}}` +
  `.fc-legend .fc-sw-ring{border:1.5px solid ${TOK_RING}}` +
  // tree zoom control — a floating control fixed to the pane corner. Co-located HERE with the control's MARKUP (renderFlowPane's
  // `${zoom}`) so the ONE flow-pane stylesheet owns it: the cockpit shell (which includes FLOW_STYLE) AND the standalone
  // snapshot export both get it, and they can't drift. ⚠ the background fallback ends in a HEX (not a nested var) so it renders
  // in a themeless standalone document (the snapshot) — a nested `var(--vscode-editor-background)` with no hex resolves to nothing.
  `.flow-zoom{position:fixed;bottom:10px;right:14px;z-index:7;display:flex;gap:1px;background:var(--vscode-editorWidget-background,#252526);border:1px solid var(--vscode-panel-border,#454545);border-radius:4px;padding:1px;box-shadow:0 1px 4px rgba(0,0,0,.3)}` +
  `.flow-zoom button{cursor:pointer;background:none;border:none;color:inherit;font:inherit;padding:1px 6px;min-width:22px;border-radius:3px}` +
  `.flow-zoom button:hover{background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,.2))}` +
  `.flow-zoom-pct{font-variant-numeric:tabular-nums;min-width:46px}`;
