// Shared traversal for decision branch-condition guards (#224).
//
// A `WhenBlock.condition` is a monotone boolean expression over concept refs
// (`and`/`or`, parens). Every subsystem that reads guard refs MUST go through
// these helpers so no consumer silently drops operands when the guard is a
// compound. In slice i.1 the grammar produces only single-ref conditions, but
// the helpers are written multi-ref-correct so i.2+ need no re-touch.

import type {
  BranchCondition,
  BranchConditionAnd,
  BranchConditionOr,
  BranchConditionRef,
  BranchConditionCriterionRef,
  ReferenceName,
} from "./types";
import { getRefName } from "./types";
import {
  expandGuardOrRecord,
  containsCriterionRef,
  expandedSize,
  type CriterionTable,
  type ExpandedSize,
  type ExpansionReason,
} from "./criterionExpansion";

// #224 ii: an un-expanded `BranchConditionCriterionRef` reaching a SEMANTIC guard
// consumer (DNF / arm-count / eval / emit) means the criterion-expansion seam was
// missed — a bug, never a valid state post-expansion. Throw LOUDLY (the tripwire)
// rather than mis-handle it as a concept. SOURCE-side consumers (refs, describe,
// well-formedness, structure sig) handle it directly — it is expected there.
function unexpandedCriterion(node: BranchConditionCriterionRef, where: string): never {
  throw new Error(
    `internal: un-expanded criterion reference "${String(node.ref)}" reached ${where} — criterion expansion must run before this seam`,
  );
}

/**
 * Structure-preserving fold. Each callback receives the node plus the
 * already-folded results of its children — no call site recurses by hand.
 * Directly supports labelling, evaluation, and DNF conversion in later slices.
 */
export function visitBranchCondition<T>(
  c: BranchCondition,
  v: {
    ref: (node: BranchConditionRef) => T;
    and: (node: BranchConditionAnd, operands: T[]) => T;
    or: (node: BranchConditionOr, operands: T[]) => T;
    /** #224 ii: a criterion-ref leaf (source-side). REQUIRED so every fold caller
     *  decides explicitly rather than silently mis-folding it as a concept ref. */
    criterionRef: (node: BranchConditionCriterionRef) => T;
  },
): T {
  switch (c.type) {
    case "BranchConditionRef":
      return v.ref(c);
    case "BranchConditionCriterionRef":
      return v.criterionRef(c);
    case "BranchConditionAnd":
      return v.and(
        c,
        c.operands.map((o) => visitBranchCondition(o, v)),
      );
    case "BranchConditionOr":
      return v.or(
        c,
        c.operands.map((o) => visitBranchCondition(o, v)),
      );
  }
}

/**
 * All CONCEPT ref LEAVES in left-to-right order, duplicates PRESERVED. Returns the
 * ref nodes (not bare names) so callers keep each occurrence's own `location`.
 *
 * #224 ii: a `BranchConditionCriterionRef` is EXPLICITLY EXCLUDED — it is NOT a
 * concept ref (it resolves via criterion expansion, not concept resolution). Only
 * SOURCE-side callers that legitimately want concept-refs-only (the reference
 * resolver; the source-side provenance/index refKey collectors, which defer criterion
 * indexing to ii.4) use this. A SEMANTIC consumer (emit / CQL interface / closure)
 * that runs POST-expansion and must never SILENTLY drop a criterion ref uses
 * `branchConditionConceptRefsStrict` — else a missed expansion vanishes without a
 * diagnostic (the exact silent-omission the distinct node exists to prevent).
 */
export function branchConditionRefs(c: BranchCondition): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") out.push(n);
    else if (n.type === "BranchConditionCriterionRef") return; // EXPLICIT source-side skip (not a concept ref)
    // `Array.isArray` guards the untyped boundary (`projectIndex` casts a
    // possibly-malformed editor-buffer node to BranchCondition) — a node with no
    // `operands` array is skipped, matching the pre-#224 tolerant behavior rather
    // than throwing on a partial parse.
    else if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii: concept ref leaves for a SEMANTIC consumer (emit / CQL interface / emit
 * closure) that runs on the POST-expansion guard. THROWS on an un-expanded
 * `BranchConditionCriterionRef` (the tripwire, via `unexpandedCriterion`) instead of
 * silently dropping it — so a missed expansion is a loud error at every semantic
 * seam, not just at DNF/eval. `where` names the calling seam for the message.
 */
export function branchConditionConceptRefsStrict(
  c: BranchCondition,
  where: string,
): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") out.push(n);
    else if (n.type === "BranchConditionCriterionRef") unexpandedCriterion(n, where);
    else if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii.1c — SOURCE-side concept refs of a guard, FOLLOWING criterion refs INTO their
 * bodies. For provenance reachability / gating: a concept referenced ONLY inside a criterion
 * body is still gating on / reached by the decision (the disc-300 closure argument, source-
 * side). Unlike `branchConditionConceptRefsExpanded` this does NOT materialize a fresh tree —
 * it walks the body in place and collects its concept-ref LEAVES (a criterion ref becomes its
 * body's concepts, recursively).
 *
 * The GLOBAL envelope still applies (a criterion DAG doubles: `C_k := C_{k-1} and C_{k-1}` →
 * 2^k leaf visits). Provenance runs on UNVALIDATED input (`buildProvenanceIndex` calls no
 * validator — the same reason `runCel` must gate), so a cyclic OR envelope-breaching table
 * would otherwise loop/hang the host. Gate on `expandedSize` first; a non-`ok` guard falls
 * back to its INLINE concept refs only (criteria skipped — the pre-ii.1c behavior: the
 * criterion-only concepts are under-reported for that one guard, not collected via an
 * unbounded walk). The `ok` path is then bounded by the atom cap (≤ CAP leaf visits). The
 * `active` cycle guard is retained as defence in depth even though `ok` implies acyclic.
 *
 * Name-level criterion DECLARATION indexing (find-refs / hover / rename on the criterion NAME
 * itself) stays deferred to ii.4; this covers only the concept-reachability correctness.
 */
export function branchConditionConceptRefsFollowingCriteria(
  c: BranchCondition,
  table: CriterionTable,
): BranchConditionRef[] {
  // GLOBAL-envelope gate (see doc): a breaching/cyclic table falls back to inline refs only,
  // never an unbounded DAG walk. Criterion-free guards are `ok` with no walk (exempt).
  if (containsCriterionRef(c) && expandedSize(c, table).status !== "ok") {
    return branchConditionRefs(c);
  }
  const out: BranchConditionRef[] = [];
  const active = new Set<string>(); // criterion names on the current path (cycle guard)
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") {
      out.push(n);
      return;
    }
    if (n.type === "BranchConditionCriterionRef") {
      const name = getRefName(n.ref);
      const crit = table.get(name);
      if (!crit || active.has(name)) return; // undefined or cyclic → contribute nothing
      active.add(name);
      walk(crit.condition);
      active.delete(name);
      return;
    }
    if (Array.isArray((n as BranchConditionAnd | BranchConditionOr).operands))
      (n as BranchConditionAnd | BranchConditionOr).operands.forEach(walk);
  };
  walk(c);
  return out;
}

/**
 * #224 ii.1c — the criterion-aware ref collector for the EMIT seams (closure, CQL
 * interface surface, case-features). It EXPANDS the guard's criterion refs (gated by the
 * GLOBAL envelope) against `table`, then collects the concept refs of the expanded tree
 * via `branchConditionConceptRefsStrict` — which therefore never trips (the expanded tree
 * holds no criterion ref). A criterion-free guard fast-paths to identity (no envelope).
 *
 * On a non-`ok` envelope status it returns `{ refs: [], overflow }` WITHOUT throwing — the
 * seam disposes of the overflow per its lane (closure/case-features: skip; CQL interface:
 * hard error). This is the single point where the emit seams cross the criterion boundary,
 * so the tripwire in `branchConditionConceptRefsStrict` stays a live backstop for any seam
 * that forgot to route through here.
 */
export function branchConditionConceptRefsExpanded(
  c: BranchCondition,
  table: CriterionTable,
  where: string,
): { refs: BranchConditionRef[]; overflow?: { status: ExpansionReason; detail?: ExpandedSize["detail"] } } {
  const g = expandGuardOrRecord(c, table);
  if (!g.ok) return { refs: [], overflow: { status: g.status, detail: g.detail } };
  return { refs: branchConditionConceptRefsStrict(g.cond, where) };
}

/**
 * Disjunctive Normal Form of a guard: the list of ARMS, each an ordered list of
 * ref atoms (a conjunction). Each arm lowers to ONE `PlanDefinition.action` with
 * N ANDed `condition[kind=applicability]` (#224 i.3 structural emit).
 *   - ref       → `[[ref]]`
 *   - and(ops)  → cartesian PRODUCT of the operands' DNFs (atoms concatenated,
 *                 operand order preserved)
 *   - or(ops)   → CONCATENATION (union) of the operands' DNFs
 * Atom order within an arm is deterministic left-to-right source order; duplicate
 * atoms are PRESERVED (dedup is a display/input concern, not identity). Callers
 * that lower to FHIR MUST first guard on `branchConditionArmCount` (below) — this
 * fully materializes the product and is unbounded for a pathological guard.
 *
 * PRECONDITION: a WELL-FORMED condition (every `and`/`or` has an `operands` array
 * with >= 2 entries — the builder/grammar invariant, asserted by
 * `assertWellFormedBranchCondition`). Unlike `branchConditionRefs` (which tolerates
 * a malformed operand-less node for the projectIndex editor-buffer path), this
 * structural transform assumes valid input — the emitter only ever runs on a
 * parse-success AST, so the invariant holds there.
 */
export function branchConditionDNF(c: BranchCondition): BranchConditionRef[][] {
  switch (c.type) {
    case "BranchConditionRef":
      return [[c]];
    case "BranchConditionCriterionRef":
      return unexpandedCriterion(c, "branchConditionDNF");
    case "BranchConditionOr":
      return c.operands.flatMap((o) => branchConditionDNF(o));
    case "BranchConditionAnd": {
      // Cartesian product: start with one empty arm, extend by each operand's arms.
      let arms: BranchConditionRef[][] = [[]];
      for (const operand of c.operands) {
        const opArms = branchConditionDNF(operand);
        const next: BranchConditionRef[][] = [];
        for (const arm of arms) for (const opArm of opArms) next.push([...arm, ...opArm]);
        arms = next;
      }
      return arms;
    }
  }
}

/**
 * The number of DNF arms `branchConditionDNF` WOULD produce, computed WITHOUT
 * materializing them and SATURATING at `cap + 1` so a pathological `and`-of-`or`s
 * (2^N arms) can never allocate exponentially. The emitter checks this against the
 * expansion cap (16) BEFORE calling `branchConditionDNF`, so a bad editor buffer
 * bundled into crl-vscode reports a compile error instead of hanging/OOM.
 *   - ref      → 1
 *   - and(ops) → product of children (saturating)
 *   - or(ops)  → sum of children (saturating)
 */
export function branchConditionArmCount(c: BranchCondition, cap = 16): number {
  const ceiling = cap + 1;
  const go = (n: BranchCondition): number => {
    if (n.type === "BranchConditionRef") return 1;
    if (n.type === "BranchConditionCriterionRef") return unexpandedCriterion(n, "branchConditionArmCount");
    if (n.type === "BranchConditionOr") {
      let sum = 0;
      for (const o of n.operands) {
        sum += go(o);
        if (sum >= ceiling) return ceiling;
      }
      return sum;
    }
    // and: product
    let product = 1;
    for (const o of n.operands) {
      product *= go(o);
      if (product >= ceiling) return ceiling;
    }
    return product;
  };
  return go(c);
}

/**
 * Assert every `and`/`or` node carries >= 2 operands (the grammar/builder
 * invariant). i.1 has no producer of compounds; i.2's builder and the semantic
 * validator call this on parsed / hand-built compounds. Throws on violation.
 */
export function assertWellFormedBranchCondition(c: BranchCondition): void {
  const check = (n: BranchCondition): void => {
    // A concept ref OR a criterion ref is a well-formed leaf (source-side; criterion
    // bodies + guards are validated pre-expansion, where criterion refs are expected).
    if (n.type === "BranchConditionRef" || n.type === "BranchConditionCriterionRef") return;
    if (n.operands.length < 2) {
      throw new Error(`${n.type} requires >= 2 operands, got ${n.operands.length}`);
    }
    n.operands.forEach(check);
  };
  check(c);
}

/**
 * The sole ref IFF the condition is exactly a single ref leaf; else null.
 * NOTE: this is "kind is ref", NOT "exactly one ref exists anywhere" — a
 * malformed `and([ref])` must NOT collapse to atomic semantics.
 */
export function soleRef(c: BranchCondition): BranchConditionRef | null {
  return c.type === "BranchConditionRef" ? c : null;
}

/**
 * Human-readable guard label, e.g. `"A"`, `"A" and "B"`, `("A" or "B") and "C"`.
 * `display` renders each ref — pass `getRefName` for bare names or `refDisplay`
 * for qualified display; the two call sites (cascade labels vs unmatched-ref
 * messages) need different renderings, so it is explicit, never defaulted.
 */
export function describeBranchCondition(
  c: BranchCondition,
  display: (r: ReferenceName) => string,
): string {
  const go = (n: BranchCondition, parentOp: "and" | "or" | null): string => {
    // A concept ref OR a criterion ref renders via `display` (source-side label; a
    // criterion ref shows the criterion's own name — the name-preserving render).
    if (n.type === "BranchConditionRef" || n.type === "BranchConditionCriterionRef") return display(n.ref);
    const op: "and" | "or" = n.type === "BranchConditionAnd" ? "and" : "or";
    const inner = n.operands.map((o) => go(o, op)).join(` ${op} `);
    // Parenthesize a sub-expression nested under a DIFFERENT operator so the
    // rendered precedence is never ambiguous.
    return parentOp !== null && parentOp !== op ? `(${inner})` : inner;
  };
  return go(c, null);
}
