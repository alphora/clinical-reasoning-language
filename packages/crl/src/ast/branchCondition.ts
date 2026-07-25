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
  ReferenceName,
} from "./types";

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
  },
): T {
  switch (c.type) {
    case "BranchConditionRef":
      return v.ref(c);
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
 * All ref LEAVES in left-to-right order, duplicates PRESERVED. Returns the ref
 * nodes (not bare names) so callers keep each occurrence's own `location`.
 */
export function branchConditionRefs(c: BranchCondition): BranchConditionRef[] {
  const out: BranchConditionRef[] = [];
  const walk = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") out.push(n);
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
 * Assert every `and`/`or` node carries >= 2 operands (the grammar/builder
 * invariant). i.1 has no producer of compounds; i.2's builder and the semantic
 * validator call this on parsed / hand-built compounds. Throws on violation.
 */
export function assertWellFormedBranchCondition(c: BranchCondition): void {
  const check = (n: BranchCondition): void => {
    if (n.type === "BranchConditionRef") return;
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
    if (n.type === "BranchConditionRef") return display(n.ref);
    const op: "and" | "or" = n.type === "BranchConditionAnd" ? "and" : "or";
    const inner = n.operands.map((o) => go(o, op)).join(` ${op} `);
    // Parenthesize a sub-expression nested under a DIFFERENT operator so the
    // rendered precedence is never ambiguous.
    return parentOp !== null && parentOp !== op ? `(${inner})` : inner;
  };
  return go(c, null);
}
