// The criterion TABLE + the expansion-SIZE envelope.
//
// #236 retired criterion inline-expansion: a criterion no longer materializes into the guard DNF
// (it lowers to a named boolean define referenced by identity — see `criterionIndex.ts`). What
// survives here is the pure, non-materializing machinery that is still LIVE:
//  - `buildCriterionTable` / `CriterionTable` — name → Criterion, the shared lookup used by the
//    criterion index, the CRE evaluator, and the FHIR/CQL emit lanes;
//  - `containsCriterionRef` — the fast-path predicate;
//  - `expandedSize` — a SATURATING, non-materializing size/breach summarizer over `table`, used by
//    the provenance guard-outline render (`guardOutline.ts`) as a decomposition bound: a breaching
//    or cyclic criterion table degrades the outline to a bounded stub instead of walking an
//    unbounded DAG. It NEVER materializes — it counts (atoms, criterionDepth) and bails during
//    descent, so a cyclic or pathologically-deep table can never stack-overflow.
//
// PRECONDITION (shared with `branchConditionDNF`/`branchConditionArmCount`, branchCondition.ts): a
// WELL-FORMED, bounded-depth guard tree (every `and`/`or` has an `operands` array). Like those
// helpers, `expandedSize`/`containsCriterionRef` recurse structurally and do NOT carry the
// projectIndex tolerant `Array.isArray` guard — do not route a malformed editor-buffer node through
// them. The "never overflows" property is scoped to CRITERION-induced unbounded recursion (cycles +
// alias chains, which ARE guarded); a guard's own `and`/`or` nesting is parser-bounded.

import type { BranchCondition, Criterion, Location, Statement } from "./types";
import { getRefName } from "./types";

// Materialized concept-atom-leaf count ceiling for `expandedSize`. An OPERATIONAL resource default,
// NOT a clinically-established complexity threshold. Refuses the doubling attack
// `C_k := C_{k-1} and C_{k-1}` at C_11 (2048 > 1024). Tunable.
export const CRITERION_EXPANSION_ATOM_CAP = 1024;
// Max criterion-nesting depth (alias-chain length: `C_n := C_{n-1}` has atoms 1 at any depth, so the
// atom cap cannot bound it — only this can). A guard's OWN `and`/`or` nesting does NOT count. First
// criterion entered = depth 1. Bounds recursion/stack.
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

/** Does the guard contain any criterion ref? The fast-path predicate: a guard with NONE
 *  is not subject to the expansion-size envelope. */
export function containsCriterionRef(c: BranchCondition): boolean {
  switch (c.type) {
    case "BranchConditionCriterionRef":
      return true;
    case "BranchConditionRef":
      return false;
    case "BranchConditionNot":
      return containsCriterionRef(c.operand); // #224 iii.2: recurse the negated operand
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
 * descent-bail depth-caps); `atom-cap` carries NO `detail` — a caller diagnostic falls back
 * to the guard's own location.
 */
export interface ExpandedSize {
  atoms: number;
  criterionDepth: number;
  status: "ok" | ExpansionReason;
  detail?: { name: string; refLocation: Location; chain?: string[] };
}

/**
 * Compute the HYPOTHETICAL decomposition size (atoms, criterionDepth) of a guard over `table`,
 * WITHOUT materializing — memoized per-invocation + SATURATING, and bailing DURING descent so a
 * cyclic or pathologically-deep criterion TABLE can never stack-overflow. #236: nothing is ever
 * materialized/expanded from this — it is a render-decomposition BOUND only (guardOutline), never
 * a gate on criterion lowering or emission. Cycle → status "cycle"; a ref to a name absent from
 * `table` → "undefined-criterion"; > caps → "atom-cap"/"depth-cap".
 *
 * A guard with NO criterion ref is EXEMPT from the envelope entirely — it returns
 * `{ atoms: 0, criterionDepth: 0, status: "ok" }` without walking. (`atoms: 0` is the "no
 * expansion" sentinel, not a real leaf count.)
 */
export function expandedSize(cond: BranchCondition, table: CriterionTable): ExpandedSize {
  // Fold the envelope-bypass into the size function itself, so no caller has to remember to
  // gate on `containsCriterionRef` first. A criterion-free guard is not subject to the cap.
  if (!containsCriterionRef(cond)) return { atoms: 0, criterionDepth: 0, status: "ok" };
  // Per-invocation memo of each criterion's fully-expanded body size (keyed by name; scoped to
  // THIS call so an editor rebuild with the same names can't reuse stale sizes). Only "ok" results
  // are memoized — a bailed computation is never cached.
  const memo = new Map<string, ExpandedSize>();
  // `stack` = criteria currently being sized = the current criterion-nesting; its size is the
  // descent-depth bound (cycle detection + stack-overflow guard in one).
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
      case "BranchConditionNot":
        // #224 iii.2: a `not` contributes 0 atoms and 0 depth — its size IS its operand's.
        return sizeOf(c.operand);
      case "BranchConditionCriterionRef": {
        const name = getRefName(c.ref);
        if (!table.has(name)) {
          return overflow("undefined-criterion", { name, refLocation: c.location });
        }
        if (stack.has(name)) {
          return overflow("cycle", { name, refLocation: c.location, chain: [...stack, name] });
        }
        // Descent bound: refuse BEFORE recursing a (MAX+1)-th criterion level, so a deep alias chain
        // can't overflow the JS stack inside this summarizer.
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
        // Crossing this criterion boundary adds one nesting level. The arithmetic check catches
        // over-depth composed via a memo hit (no physical descent occurred).
        const criterionDepth = inner.criterionDepth + 1;
        if (criterionDepth > CRITERION_MAX_DEPTH) {
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
