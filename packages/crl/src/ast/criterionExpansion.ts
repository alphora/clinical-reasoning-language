// #224 ii.1b — the criterion EXPANSION engine.
//
// A `criterion` inline-EXPANDS into the guard DNF: `expandCriteria` replaces every
// `BranchConditionCriterionRef` leaf with the referenced criterion's RECURSIVELY-
// expanded condition, rebuilding fresh nodes (two uses of one criterion get disjoint
// subtrees), and stamps each substitution's boundary-root with `sourcedFromCriterion`.
// Emit is byte-identical to hand-inlining; the marker exists for rendering the author's
// name (A7) and source correspondence.
//
// This file is the PURE engine only — wiring it into the consumer seams (runCel /
// renderScenario / emit closure / CQL interface / provenance / casefeature) is ii.1c.
//
// Two-layer refusal (design disc 302):
//  - GRACEFUL (ii.1c seams): `containsCriterionRef` gate → `expandedSize` → on a
//    non-"ok" status, emit a `criterion-expansion-overflow` diagnostic and suppress the
//    guard, WITHOUT materializing. A guard with NO criterion ref bypasses the envelope
//    entirely (an inline compound guard is bounded by the emitter's own arm-cap, not
//    this one — else a pre-existing 1025-atom inline guard would be wrongly refused).
//  - HARD BACKSTOP (this engine): `expandCriteria` re-runs `expandedSize` and THROWS a
//    typed `CriterionExpansionError` on any breach, so a caller that skips the pre-check
//    can never infinite-loop or OOM (precedent: the `evalConcept` cycle guard,
//    cre/run.ts). The ii.1a-2 validator (`criterion-cycle`) is the user-facing layer.
//
// PRECONDITION (shared with `branchConditionDNF`/`branchConditionArmCount`,
// branchCondition.ts): a WELL-FORMED, bounded-depth guard tree (every `and`/`or` has an
// `operands` array). Like those helpers, `expandedSize`/`containsCriterionRef`/
// `materialize` recurse structurally and do NOT carry the projectIndex tolerant
// `Array.isArray` guard — do not route a malformed editor-buffer node through them. The
// "never overflows" property below is scoped to CRITERION-induced unbounded recursion
// (cycles + alias chains, which ARE guarded); a guard's own `and`/`or` nesting is
// parser-bounded, exactly as for every other guard walker.
//
// ATOM COUNTING: the envelope bounds the TOTAL materialized tree of a criterion-using
// guard — inline atoms AND substituted ones (`materialize` rebuilds the whole tree, so
// the whole tree is the allocation). A guard with NO criterion ref is exempt entirely
// (fast path), so a large pre-existing inline guard is never refused; but ADDING a
// criterion to a ≥cap inline guard subjects the whole thing to the envelope (a deliberate
// cliff — the ii.1c diagnostic should say "materialized tree", not "expands to").
//
// Envelope = ATOMS + criterion-DEPTH. Arm count is NOT recomputed here: it stays the
// emitter's existing post-expansion `branchConditionArmCount` check (256), which works
// once expansion has removed the criterion refs. This is a deliberate delta vs disc 299
// ("arm-count parity") — see disc 302 (a): there is no materialization path where the
// DNF blows up before that post-expansion arm check, so an arm figure here would only
// double-maintain the 256 bound. `expandedSize` bounds the materialized TREE (atoms);
// `branchConditionArmCount` bounds the DNF (arms), each saturating before its own
// materialization.

import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionOr,
  BranchConditionRef,
  Criterion,
  Location,
  SourcedFromCriterion,
  Statement,
} from "./types";
import { getRefName } from "./types";

// The BranchCondition node kinds that can carry a `sourcedFromCriterion` marker — an
// EXPANDED tree contains no `BranchConditionCriterionRef`, so `materialize` never
// returns one, and `stamp` only ever sees these three.
type MarkableCondition = BranchConditionRef | BranchConditionAnd | BranchConditionOr;

// Materialized concept-atom-leaf count of a fully-expanded guard. An OPERATIONAL
// resource default (a well-formed guard with 1024 leaves has ≤1023 operator nodes),
// NOT a clinically-established complexity threshold. Refuses the doubling attack
// `C_k := C_{k-1} and C_{k-1}` at C_11 (2048 > 1024). Tunable.
export const CRITERION_EXPANSION_ATOM_CAP = 1024;
// Max criterion-nesting depth (alias-chain length: `C_n := C_{n-1}` has atoms 1 at any
// depth, so the atom cap cannot bound it — only this can). A guard's OWN `and`/`or`
// nesting does NOT count. First criterion entered = depth 1. Bounds recursion/stack.
export const CRITERION_MAX_DEPTH = 32;

// Saturating sentinels — returned instead of an exact count once a bound is breached.
const ATOM_SENTINEL = CRITERION_EXPANSION_ATOM_CAP + 1;
const DEPTH_SENTINEL = CRITERION_MAX_DEPTH + 1;

export type CriterionTable = Map<string, Criterion>;

/** name → Criterion, first-write-wins (a duplicate criterion name is a validation
 *  error; this mirrors the other by-name maps and stays deterministic regardless). The
 *  `s.name` truthiness filter mirrors `collectLocalNames`/`buildDefinedByCandidates`; an
 *  empty criterion name is a validation error (`empty-name`) and cannot be REFERENCED (a
 *  ref carries a name), so a dropped empty-named criterion is unreachable, not a hazard. */
export function buildCriterionTable(statements: Statement[]): CriterionTable {
  const t: CriterionTable = new Map();
  for (const s of statements) {
    if (s.type === "Criterion" && s.name && !t.has(s.name)) t.set(s.name, s);
  }
  return t;
}

/** Does the guard contain any un-expanded criterion ref? The fast-path predicate: a
 *  guard with NONE needs no expansion AND is not subject to the expansion envelope. */
export function containsCriterionRef(c: BranchCondition): boolean {
  switch (c.type) {
    case "BranchConditionCriterionRef":
      return true;
    case "BranchConditionRef":
      return false;
    case "BranchConditionAnd":
    case "BranchConditionOr":
      return c.operands.some(containsCriterionRef);
  }
}

export type ExpansionReason = "atom-cap" | "depth-cap" | "cycle" | "undefined-criterion";

/**
 * The fully-expanded size of a guard, or the reason it cannot be expanded. `atoms` /
 * `criterionDepth` are EXACT only when `status === "ok"`; otherwise they are saturated
 * sentinels (`CAP+1` / `MAX+1`). `detail` names the offending criterion for the
 * `cycle` / `undefined-criterion` / `depth-cap` reasons (with a `chain` for cycles and
 * descent-bail depth-caps); `atom-cap` carries NO `detail` — a seam diagnostic falls back
 * to the guard's own location.
 */
export interface ExpandedSize {
  atoms: number;
  criterionDepth: number;
  status: "ok" | ExpansionReason;
  detail?: { name: string; refLocation: Location; chain?: string[] };
}

/** A refused expansion reaching the ENGINE (the pre-check was bypassed). instanceof-
 *  distinguishable; carries the offending criterion name/location (+ chain for cycles)
 *  so a failure deep in the extension host is debuggable. */
export class CriterionExpansionError extends Error {
  readonly reason: ExpansionReason;
  readonly detail?: { name: string; refLocation: Location; chain?: string[] };
  constructor(reason: ExpansionReason, detail?: { name: string; refLocation: Location; chain?: string[] }) {
    const where = detail?.name ? `: "${detail.name}"` : "";
    const chain = detail?.chain ? ` [${detail.chain.join(" → ")}]` : "";
    super(`criterion expansion refused (${reason})${where}${chain}`);
    this.name = "CriterionExpansionError";
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * Compute the fully-expanded (atoms, criterionDepth) of a guard over `table`, WITHOUT
 * materializing — memoized per-invocation + SATURATING, and bailing DURING descent so a
 * cyclic or pathologically-deep criterion TABLE can never stack-overflow (the graceful
 * seam calls this FIRST, so it must never crash — see the precondition note at the top of
 * the file for the structural-depth scope). Cycle → status "cycle"; a ref to a name absent
 * from `table` → "undefined-criterion"; > caps → "atom-cap"/"depth-cap".
 *
 * A guard with NO criterion ref is EXEMPT from the envelope entirely — it returns
 * `{ atoms: 0, criterionDepth: 0, status: "ok" }` without walking, so `expandedSize` and
 * the `expandCriteria` fast path agree: a large pre-existing inline guard is never refused.
 * (`atoms: 0` is the "no expansion" sentinel, not a real leaf count.)
 *
 * Same atom-accounting the materializer produces (each expanded concept ref = 1 atom;
 * operator + marker nodes = 0), so a guard that passes here materializes within bounds.
 */
export function expandedSize(cond: BranchCondition, table: CriterionTable): ExpandedSize {
  // Fold the envelope-bypass into the size function itself, so no ii.1c seam has to
  // remember to gate on `containsCriterionRef` first (six seams → the contract would be
  // dropped once). A criterion-free guard is not an expansion and not subject to the cap.
  if (!containsCriterionRef(cond)) return { atoms: 0, criterionDepth: 0, status: "ok" };
  // Per-invocation memo of each criterion's fully-expanded body size (keyed by name;
  // scoped to THIS call so an editor rebuild with the same names can't reuse stale
  // sizes). Only "ok" results are memoized — a bailed computation is never cached.
  const memo = new Map<string, ExpandedSize>();
  // `stack` = criteria currently being sized = the current criterion-nesting; its size
  // is the descent-depth bound (cycle detection + stack-overflow guard in one).
  const stack = new Set<string>();

  const overflow = (status: ExpansionReason, detail?: ExpandedSize["detail"]): ExpandedSize => ({
    atoms: ATOM_SENTINEL,
    criterionDepth: DEPTH_SENTINEL,
    status,
    detail,
  });

  const sizeOf = (c: BranchCondition): ExpandedSize => {
    switch (c.type) {
      case "BranchConditionRef":
        return { atoms: 1, criterionDepth: 0, status: "ok" };
      case "BranchConditionCriterionRef": {
        const name = getRefName(c.ref);
        if (!table.has(name)) {
          return overflow("undefined-criterion", { name, refLocation: c.location });
        }
        if (stack.has(name)) {
          return overflow("cycle", { name, refLocation: c.location, chain: [...stack, name] });
        }
        // Descent bound: refuse BEFORE recursing a (MAX+1)-th criterion level, so a deep
        // alias chain can't overflow the JS stack inside this summarizer.
        if (stack.size >= CRITERION_MAX_DEPTH) {
          return overflow("depth-cap", { name, refLocation: c.location, chain: [...stack, name] });
        }
        let inner = memo.get(name);
        if (!inner) {
          stack.add(name);
          inner = sizeOf(table.get(name)!.condition);
          stack.delete(name);
          if (inner.status === "ok") memo.set(name, inner);
        }
        if (inner.status !== "ok") return inner; // propagate the reason unchanged
        // Crossing this criterion boundary adds one nesting level. The arithmetic check
        // catches over-depth composed via a memo hit (no physical descent occurred).
        const criterionDepth = inner.criterionDepth + 1;
        if (criterionDepth > CRITERION_MAX_DEPTH) {
          // Over-depth composed via a memo hit (shallow physical stack, no descent-bail).
          // No full chain here (the depth came from the memoized body, not the stack), but
          // carry the boundary criterion + ref location so the diagnostic can point at it.
          return overflow("depth-cap", { name, refLocation: c.location });
        }
        return { atoms: inner.atoms, criterionDepth, status: "ok" };
      }
      case "BranchConditionAnd":
      case "BranchConditionOr": {
        let atoms = 0;
        let criterionDepth = 0;
        for (const op of c.operands) {
          const s = sizeOf(op);
          if (s.status !== "ok") return s; // propagate first failure (saturating short-circuit)
          atoms += s.atoms;
          if (atoms > CRITERION_EXPANSION_ATOM_CAP) return overflow("atom-cap");
          if (s.criterionDepth > criterionDepth) criterionDepth = s.criterionDepth;
        }
        return { atoms, criterionDepth, status: "ok" };
      }
    }
  };

  return sizeOf(cond);
}

/**
 * Expand every criterion ref in `cond` into its (recursively expanded) body, over
 * `table`. A guard with NO criterion ref is returned UNCHANGED (identity preserved,
 * and NOT subject to the envelope). Otherwise the size is checked first (the hard
 * backstop) — a non-"ok" status THROWS `CriterionExpansionError` — then the tree is
 * materialized with fresh nodes throughout (no aliasing: two uses of one criterion get
 * disjoint `BranchCondition` nodes; immutable `Location`/`ReferenceName` metadata may
 * be shared). Idempotent: expanding an already-expanded guard is a no-op (no criterion
 * refs remain). Deterministic: structurally byte-stable, though each call yields fresh
 * node objects (never rely on node identity across calls).
 *
 * The "a graceful pre-check (`expandedSize`) that returned ok ⇒ this never throws"
 * guarantee holds only when the seam passes the IDENTICAL `table` to both calls (the
 * backstop re-derives size from `table`); rebuild the table from a differently-filtered
 * statement list and the guarantee is void.
 */
export function expandCriteria(cond: BranchCondition, table: CriterionTable): BranchCondition {
  if (!containsCriterionRef(cond)) return cond; // fast path — identity, no envelope
  const size = expandedSize(cond, table);
  if (size.status !== "ok") {
    throw new CriterionExpansionError(size.status, size.detail);
  }
  return materialize(cond, table);
}

/** Rebuild `c` with FRESH nodes, substituting each criterion ref with its expanded body
 *  and stamping the boundary-root. Precondition: `expandedSize` returned "ok" for the
 *  enclosing guard, so recursion is bounded and no cycle/undefined ref is reachable.
 *  A PRE-EXISTING `sourcedFromCriterion` on an input node (a partially-expanded guard) is
 *  PRESERVED across the rebuild; a fresh criterion boundary (the `CriterionRef` case)
 *  stamps unconditionally over it, so outermost still wins. */
function materialize(c: BranchCondition, table: CriterionTable): MarkableCondition {
  // Carry an already-present marker through the rebuild (see doc above).
  const keep = (n: MarkableCondition): MarkableCondition =>
    c.sourcedFromCriterion ? { ...n, sourcedFromCriterion: c.sourcedFromCriterion } : n;
  switch (c.type) {
    case "BranchConditionRef":
      // Fresh node (disjoint identity per use); ref + location metadata shared.
      return keep({ type: "BranchConditionRef", ref: c.ref, location: c.location });
    case "BranchConditionAnd":
      return keep({
        type: "BranchConditionAnd",
        operands: c.operands.map((o) => materialize(o, table)),
        location: c.location,
      });
    case "BranchConditionOr":
      return keep({
        type: "BranchConditionOr",
        operands: c.operands.map((o) => materialize(o, table)),
        location: c.location,
      });
    case "BranchConditionCriterionRef": {
      const name = getRefName(c.ref);
      const body = table.get(name)!.condition; // guaranteed present ("ok" precondition)
      const expanded = materialize(body, table);
      // Stamp the boundary-root. Unconditional overwrite → for coincident boundaries
      // (a bare-alias chain, whose roots are the same physical node) the OUTERMOST
      // criterion wins (the author wrote this name); non-coincident inner boundaries
      // sit on deeper nodes and keep their own markers.
      return stamp(expanded, { name, refLocation: c.location });
    }
  }
}

/** Return `node` with `sourcedFromCriterion` set (a fresh object; unconditional). */
function stamp(node: MarkableCondition, marker: SourcedFromCriterion): MarkableCondition {
  return { ...node, sourcedFromCriterion: marker };
}
