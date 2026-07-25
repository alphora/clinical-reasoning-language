/**
 * Failed-criteria selection — the two PURE functions behind the cockpit's "All / Blocking" toggle (#173 T2, disc 158
 * §"WHICH criteria" / §"Trigger" / §"Slice plan T2"). NO UI, NO engine coupling: both functions read a DUCK-TYPED
 * scenario view-model (the structural `ScenarioViewModel` contract — viewModel.ts) and return runtime nodeIds the cockpit
 * later re-roots through `runtimeNodePathRefs` (runPath.ts, T1). Kept in `provenance/` next to runPath.ts so T3 joins
 * one module; the duck-type means no `cre` import (no cycle).
 *
 * The TWO modes (operator decision, disc 158 §"WHICH criteria" — a toggle, both ship, default the frontier):
 *   - `allUnsatisfiedCriteria` — "All": every evaluated-unsatisfied `when` in the tree (the raw truth, any case).
 *   - `failedCriterionFrontier` — "Blocking" (default): the criteria that actually BLOCKED the EXPECTED disposition.
 *
 * The EXACT VM signals consumed (cited by FIELD/FUNCTION name — NOT line numbers, which drift):
 *   - a `when`'s evaluated-unsatisfied state: `kind === "when" && evaluated === true && condition?.satisfied === false`
 *     (ViewNode.evaluated = `!!t`; ConditionView.satisfied is set ONLY when the when was evaluated — `walkBranchesVM`).
 *   - an action guarded out: ViewNode.guardedOut === true (projected from the trace's `guardedOut` in `buildActionVM`);
 *     the guard's polarity + concept are on ViewNode.guard (GuardView — `buildActionVM`).
 *   - a `first:`-PREEMPTED branch: `evaluated === false && unreachedReason === "preempted"` — `walkBranchesVM` sets
 *     `unreachedReason:"preempted"` on an unreached branch IFF a PRIOR sibling matched in the same ORDERED (`first:`)
 *     block (its `priorMatch` flag). The matched prior sibling that short-circuited is the one with (when)
 *     `condition?.satisfied === true` or (otherwise) `evaluated === true` — the same condition `walkBranchesVM` uses to
 *     set `priorMatch`.
 *   - a TARGET site is a PRODUCIBLE disposition: a `recommend-activity` action whose label == expected.branch. A
 *     `use-decision` row is NEVER a producible disposition (`buildActionVM` forces its `produced:false`; the sub-NAME is
 *     never produced in run.ts) → it is EXCLUDED from target-site collection.
 */

/** DUCK-TYPED ViewNode — a structural superset of the fields this module reads (compatible with the real
 *  `ViewNode` from viewModel.ts). Kept local + minimal so the module stays pure (no `cre` import). */
export interface FcViewNode {
  nodeId: string;
  kind: "when" | "otherwise" | "action";
  /** `when ${concept}` / "otherwise" / the action's bare disposition name (matched against `expected.branch`). */
  label: string;
  source: unknown;
  evaluated: boolean;
  /** Only on an unreached BRANCH whose ordered block had a prior matching sibling. */
  unreachedReason?: "preempted";
  /** #224: the guard EXPRESSION (was a single `concept`). For the failed-criterion
   *  display we need only the op + a `ref`'s concept; a compound falls back to the
   *  branch `label` (rich per-conjunct rendering is i.4). Structurally a subset of
   *  the real `ConditionView.expr` / `BranchConditionView`. */
  condition?: {
    expr: { op: "and" | "or" | "ref"; concept?: { name: string; libraryName?: string } };
    satisfied?: boolean;
  };
  guard?: {
    polarity: "unless" | "only-when";
    concept: { name: string; libraryName?: string };
    evaluated: boolean;
    satisfied?: boolean;
  };
  action?: { actionKind: "recommend-activity" | "use-decision"; produced: boolean };
  guardedOut?: boolean;
  children?: FcViewNode[];
}

/** DUCK-TYPED ScenarioViewModel — only the fields the two functions read (status / expected / tree). */
export interface FcScenario {
  status: "pass" | "fail" | "error";
  expected: { decision: string; branch: string } | null;
  tree: FcViewNode[];
}

/**
 * The precise display payload for ONE failed criterion, discriminated by `reason` (FIX 3 — label sufficiency). The
 * cockpit renders each blocker correctly from THIS alone — no second VM lookup:
 *   - "unsatisfied-when": the `when` concept that was false (render e.g. "when Indication").
 *   - "preemption": the MATCHED prior sibling — a `when` (its concept) or an `otherwise` (no concept) — that diverted
 *     the run (render e.g. "matched: when Early" / "matched: otherwise").
 *   - "guarded-out": the GUARD that excluded the action — polarity + concept (render e.g. "unless Contraindication" /
 *     "only-when Indication"). `concept` is absent only for the structurally-degenerate guard with no concept.
 */
export type FailedCriterionDisplay =
  | { reason: "unsatisfied-when"; concept: { name: string; libraryName?: string } }
  | {
      reason: "preemption";
      siblingKind: "when" | "otherwise";
      concept?: { name: string; libraryName?: string };
    }
  | {
      reason: "guarded-out";
      polarity: "unless" | "only-when";
      concept?: { name: string; libraryName?: string };
    };

/**
 * One failed criterion the cockpit can peek + label. `nodeId` is the RUNTIME (deep, caller-inlined) id — T3 re-roots it
 * via `runtimeNodePathRefs`. The `display` payload carries the PRECISE per-reason label data (FIX 3) so the cockpit
 * renders the row WITHOUT a second lookup — including the guard polarity/concept and the matched-sibling concept that a
 * bare action `label` could not supply.
 */
export interface FailedCriterionNode {
  /** The runtime (deep inlined) nodeId — feed to `runtimeNodePathRefs` to get the standalone ref. */
  nodeId: string;
  /** The blocking VM node's own `label` (e.g. "when Indic" / "otherwise" / the disposition name for a guarded action).
   *  A coarse fallback; prefer `display` for precise per-reason rendering. */
  conceptLabel: string;
  /** The VM node's own source location (opaque here — the structural `LsLocation`); the gap fallback "Open CRL source"
   *  uses it directly (disc 158 §Gap). */
  source: unknown;
  /** WHY this node is a failed criterion — lets the cockpit distinguish the three frontier blocker cases + the All-mode
   *  raw unsatisfied `when`. "unsatisfied-when": an evaluated `when` whose condition is false. "preemption": a prior
   *  sibling that MATCHED and short-circuited past the expected branch (satisfied:TRUE — the case All-mode misses).
   *  "guarded-out": the expected (or an ancestor) action's guard excluded it. */
  reason: "unsatisfied-when" | "preemption" | "guarded-out";
  /** The precise display payload (FIX 3) — discriminated by `reason`; renders the blocker with no second VM lookup. */
  display: FailedCriterionDisplay;
}

/**
 * "All" mode — every evaluated-unsatisfied `when` in the whole tree (recursing children, incl. inlined sub-decisions),
 * regardless of which branch was taken or the scenario status. This is the raw per-criterion truth; false `when`s on
 * UNTAKEN branches are informational (disc 158 §Trigger: All mode works for any case). DFS pre-order.
 */
export function allUnsatisfiedCriteria(sv: FcScenario): FailedCriterionNode[] {
  const out: FailedCriterionNode[] = [];
  const visit = (nodes: FcViewNode[]): void => {
    for (const n of nodes) {
      if (isUnsatisfiedWhen(n)) {
        out.push(unsatisfiedWhenNode(n));
      }
      if (n.children) visit(n.children);
    }
  };
  visit(sv.tree);
  return out;
}

/**
 * "Blocking" mode (default) — the criteria that BLOCKED the EXPECTED disposition. EMPTY for `status === "pass"`
 * (self-gating: the expected fired, nothing blocked it — disc 158 §Trigger) and for `status === "error"` (partial trace,
 * expected path undefined — out of scope). For `status === "fail"`:
 *
 *   1. Find EVERY RECOMMEND-ACTIVITY action node whose disposition label == `sv.expected.branch` (the TARGET sites — a
 *      disposition name can repeat under multiple branches, so there may be more than one; collected at any depth, incl.
 *      inlined subs). A `use-decision` row is NOT a producible disposition (it delegates; never `produced`) so it is
 *      EXCLUDED even when its label coincidentally matches a delegated decision name (FIX 1).
 *   2. For each target site, walk its INCLUSIVE ancestor chain (root→target) and pick the FIRST blocking node, priority:
 *        (a) an ancestor `when`/guard on the path that is evaluated && unsatisfied → that ancestor is the blocker;
 *        (b) an ancestor branch on the path that is `first:`-PREEMPTED (`evaluated:false && unreachedReason:"preempted"`)
 *            → the blocker is the MATCHED prior sibling that short-circuited (found by scanning the preempted node's
 *            prior siblings for the one that matched). This is the load-bearing case All-mode MISSES (the blocker is
 *            satisfied:TRUE, not a false `when`);
 *        (c) the target action's OWN `guardedOut === true` → its guard row is the blocker.
 *   3. Collect blockers across all target sites into a SET (dedup by nodeId, first-seen order).
 *
 * If a target site exists but NONE of (a)/(b)/(c) applies (the action evaluated but wasn't produced for some OTHER
 * reason — e.g. it sits on a taken path with all conditions satisfied yet still wasn't in `produced`), we surface
 * NOTHING for that site rather than guessing (disc 158 §T2). If `expected.branch` names a disposition with NO action
 * node anywhere → empty (a CEL/authoring inconsistency the cockpit surfaces elsewhere — disc 158 §T2).
 */
export function failedCriterionFrontier(sv: FcScenario): FailedCriterionNode[] {
  if (sv.status !== "fail" || !sv.expected) return [];
  const expectedBranch = sv.expected.branch;

  // Collect every target action site (label == expected.branch) WITH its inclusive ancestor chain (root→target). The
  // chain carries the actual ViewNodes (not just ids) so the per-site blocker walk can read satisfied / unreachedReason
  // and scan a preempted node's prior siblings. `siblingsOf` lets the preemption case find the matched prior sibling.
  type Site = { chain: FcViewNode[]; siblings: FcViewNode[][] };
  const sites: Site[] = [];
  const walk = (nodes: FcViewNode[], chain: FcViewNode[], siblings: FcViewNode[][]): void => {
    for (const n of nodes) {
      const nextChain = [...chain, n];
      const nextSiblings = [...siblings, nodes];
      // A TARGET site is a PRODUCIBLE disposition: a recommend-activity whose label matches. A use-decision delegation
      // row is excluded (never `produced`) even if its target name coincides with `expected.branch` (FIX 1).
      if (
        n.kind === "action" &&
        n.action?.actionKind === "recommend-activity" &&
        n.label === expectedBranch
      ) {
        sites.push({ chain: nextChain, siblings: nextSiblings });
      }
      if (n.children) walk(n.children, nextChain, nextSiblings);
    }
  };
  walk(sv.tree, [], []);

  // No target action anywhere → CEL/authoring inconsistency, not a criterion (disc 158 §T2).
  if (sites.length === 0) return [];

  const seen = new Set<string>();
  const out: FailedCriterionNode[] = [];
  const push = (node: FailedCriterionNode): void => {
    if (seen.has(node.nodeId)) return;
    seen.add(node.nodeId);
    out.push(node);
  };

  for (const site of sites) {
    const blocker = firstBlockerOnPath(site.chain, site.siblings);
    if (blocker) push(blocker);
    // else: target evaluated but unproduced for another reason → surface nothing for this site (no guessing).
  }
  return out;
}

/**
 * Walk the inclusive ancestor chain (root→target) and return the FIRST blocking node in priority (a) → (b) → (c). The
 * chain[i] is at depth i; siblings[i] is the ordered sibling array chain[i] was drawn from (used to find the matched
 * prior sibling for a preemption). Returns undefined when no blocker case applies (the "surface nothing" path).
 *
 * Priority ordering note: (a) ancestor-unsatisfied and (b) ancestor-preemption are checked TOGETHER per ancestor in
 * top-down order so the FIRST (shallowest) blocking ancestor wins regardless of which kind it is — a higher unsatisfied
 * `when` blocks before a deeper preemption and vice-versa. (c) the target's own `guardedOut` is the fallback, checked
 * only after no ancestor blocked (it is the LAST node on the path).
 */
function firstBlockerOnPath(
  chain: FcViewNode[],
  siblings: FcViewNode[][],
): FailedCriterionNode | undefined {
  // (a) + (b): scan ancestors top-down (EXCLUDING the target action itself at the last position — its own guardedOut is
  // case (c)). The first blocking ancestor (unsatisfied when/guard OR preemption) wins.
  for (let i = 0; i < chain.length; i++) {
    const n = chain[i];
    const isTarget = i === chain.length - 1;

    // (a) an ancestor `when` evaluated && unsatisfied.
    if (!isTarget && isUnsatisfiedWhen(n)) {
      return unsatisfiedWhenNode(n);
    }
    // (a) an ancestor action's GUARD evaluated && unsatisfied (a guard on a use-decision delegation row on the path can
    // gate the whole sub-tree). The blocker is that guarded ancestor row.
    if (!isTarget && isGuardBlocked(n)) {
      return guardedOutNode(n);
    }
    // (b) an ancestor branch first:-PREEMPTED → the blocker is the matched prior sibling that short-circuited.
    if (!isTarget && n.evaluated === false && n.unreachedReason === "preempted") {
      const matched = matchedPriorSibling(siblings[i], n.nodeId);
      if (matched) {
        return preemptionNode(matched);
      }
      // A preempted ancestor with no findable matched sibling is structurally impossible (preempted ⇒ a prior match) —
      // fall through rather than fabricate. Keep scanning for a deeper blocker.
    }
  }

  // (c) the target action's OWN guardedOut.
  const target = chain[chain.length - 1];
  if (target && target.kind === "action" && target.guardedOut === true) {
    return guardedOutNode(target);
  }
  return undefined;
}

// ── blocker → FailedCriterionNode builders (each carries the precise per-reason `display`, FIX 3) ───────────────────

/** An evaluated-unsatisfied `when` blocker → display carries the false `when`'s concept. */
/** #224: the display concept for a failed `when`. A single-ref guard → its
 *  concept; a COMPOUND guard → the whole guard label (the branch failed;
 *  which-conjunct-failed rendering is i.4). Never masquerades one operand as the
 *  whole guard. */
function fcConcept(n: FcViewNode): { name: string; libraryName?: string } {
  const e = n.condition?.expr;
  if (e && e.op === "ref" && e.concept) return e.concept;
  return { name: n.label.replace(/^when\s+/, "") };
}

function unsatisfiedWhenNode(n: FcViewNode): FailedCriterionNode {
  return {
    nodeId: n.nodeId,
    conceptLabel: n.label,
    source: n.source,
    reason: "unsatisfied-when",
    display: { reason: "unsatisfied-when", concept: fcConcept(n) },
  };
}

/** A guarded-out action blocker → display carries the guard polarity + concept (e.g. "unless Contraindication"). */
function guardedOutNode(n: FcViewNode): FailedCriterionNode {
  return {
    nodeId: n.nodeId,
    conceptLabel: n.label,
    source: n.source,
    reason: "guarded-out",
    display: {
      reason: "guarded-out",
      // A guarded-out action ALWAYS has a guard (the trace produced `guardedOut` by evaluating it); polarity from there.
      polarity: n.guard?.polarity ?? "unless",
      ...(n.guard?.concept ? { concept: n.guard.concept } : {}),
    },
  };
}

/** A first:-preemption blocker (the matched prior sibling) → display carries the sibling kind + (for a `when`) concept. */
function preemptionNode(matched: FcViewNode): FailedCriterionNode {
  return {
    nodeId: matched.nodeId,
    conceptLabel: matched.label,
    source: matched.source,
    reason: "preemption",
    display:
      matched.kind === "when"
        ? {
            reason: "preemption",
            siblingKind: "when",
            ...(matched.condition ? { concept: fcConcept(matched) } : {}),
          }
        : { reason: "preemption", siblingKind: "otherwise" },
  };
}

/** The EXACT evaluated-unsatisfied `when` signal — `kind === "when" && evaluated && condition.satisfied === false`
 *  (`walkBranchesVM` sets `evaluated = !!t` and `condition.satisfied` only when the when ran). */
function isUnsatisfiedWhen(n: FcViewNode): boolean {
  return n.kind === "when" && n.evaluated === true && n.condition?.satisfied === false;
}

/** An action whose GUARD excluded it → ViewNode.guardedOut === true (projected in `buildActionVM`). On the ancestor
 *  path this gates the whole sub-tree; the guard polarity/concept live on ViewNode.guard (GuardView). */
function isGuardBlocked(n: FcViewNode): boolean {
  return n.kind === "action" && n.guardedOut === true;
}

/**
 * Find the MATCHED prior sibling that short-circuited an ordered (`first:`) block, given the preempted node's sibling
 * array and the preempted node's id. `walkBranchesVM` sets `unreachedReason:"preempted"` on a branch IFF a PRIOR sibling
 * matched (its `priorMatch` flag) — so we scan siblings BEFORE the preempted one and return the LAST that matched:
 *   - a `when` that matched: `evaluated === true && condition?.satisfied === true` (priorMatch set by `t?.satisfied`).
 *   - an `otherwise` that ran: `evaluated === true` (priorMatch set by the trace node `t` being present).
 * The LAST matching prior sibling is the one that actually short-circuited (in an ordered block the first match wins, so
 * there is exactly one matched sibling before the preempted node; "last" is robust if the array is malformed). Scoped to
 * the SAME sibling array — a cousin in a different (inner/outer) ordered group is never returned (gpt55-3).
 */
function matchedPriorSibling(siblings: FcViewNode[], preemptedNodeId: string): FcViewNode | undefined {
  const idx = siblings.findIndex((s) => s.nodeId === preemptedNodeId);
  if (idx < 0) return undefined;
  let match: FcViewNode | undefined;
  for (let i = 0; i < idx; i++) {
    const s = siblings[i];
    if (s.kind === "when" && s.evaluated === true && s.condition?.satisfied === true) match = s;
    else if (s.kind === "otherwise" && s.evaluated === true) match = s;
  }
  return match;
}
