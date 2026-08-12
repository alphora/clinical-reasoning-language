// #236/#274 build step C — the DEDICATED total-boolean emitter for a `criterion` define.
//
// Design of record: docs/emit-236-274-criterion-lowering-design.md §2d, §3 C.
//
// A `criterion` lowers to ONE boolean CQL define (like a `defined as` concept), so N uses
// become N references to it instead of N inline expansions (the #236 tree→DAG collapse).
// This emitter produces the define BODY from the criterion's (unexpanded) guard tree.
//
// It is DELIBERATELY NOT the `defined as` composition path (`emitComposition`/`emitSemAnd`/
// `emitSemOr`): that path lowers `sem-*` over truth-sets / refinement lanes and does NOT
// `Coalesce` — so it is not per-operand total. A criterion body is a plain boolean guard
// (`and`/`or`/`not` over concept + sub-criterion refs), and North Star §4 requires it to be
// TWO-VALUED: every leaf is totalized `Coalesce(<leaf>, false)` BEFORE any `not`, never a
// terminal `Coalesce(<whole>, false)`. A criterion ref is itself total (it resolves to
// another totalized define), so composition stays two-valued all the way down.
//
// The emitter takes a `qualify(name, kind)` callback rather than resolving library prefixes
// itself: WHICH library a leaf's define lives in (Root / Interface / a concept re-export,
// or a sibling criterion define) is a layered-emit wiring concern, supplied by the caller.
// This keeps the structure + totality rules pure and unit-testable.

import type { BranchCondition } from "../ast/types";
import { getRefName } from "../ast/types";

/** Resolve a guard leaf (a concept ref or a sibling criterion ref) to the CQL identifier its
 *  define is referenced by — bare `"Name"` for a same-library define, `Lib."Name"` for a
 *  cross-library re-export. The emitter wraps whatever this returns in `Coalesce(…, false)`. */
export type QualifyLeaf = (name: string, kind: "concept" | "criterion") => string;

// CQL boolean operator precedence (higher binds tighter): a leaf is atomic; `not` > `and` >
// `or`. A child is parenthesised iff its precedence is LOWER than its parent's — the minimal
// parenthesisation that preserves meaning (correctness, not aesthetics: emitted CQL is a
// compilation artifact).
const PREC = { leaf: 4, not: 3, and: 2, or: 1 } as const;

interface Rendered {
  str: string;
  prec: number;
}

function totalLeaf(qualified: string): string {
  // Per-operand totality (North Star §4): a nullable define re-export becomes two-valued.
  // Applied to POSITIVE leaves too (design §3 C) — a deliberate defensive boundary so the
  // define body is total regardless of how a referenced concept re-export was declared.
  return `Coalesce(${qualified}, false)`;
}

function renderNode(n: BranchCondition, qualify: QualifyLeaf): Rendered {
  switch (n.type) {
    case "BranchConditionRef":
      return { str: totalLeaf(qualify(getRefName(n.ref), "concept")), prec: PREC.leaf };
    case "BranchConditionCriterionRef":
      // A sub-criterion reference — resolves to that criterion's OWN totalized define
      // (define→define edge), never its inline expansion.
      return { str: totalLeaf(qualify(getRefName(n.ref), "criterion")), prec: PREC.leaf };
    case "BranchConditionNot": {
      const child = renderNode(n.operand, qualify);
      // `not Coalesce("A", false)` for a leaf operand; `not (…)` for a compound one. The
      // totality already sits on each leaf INSIDE the operand, so `not` never re-totalizes.
      const inner = child.prec < PREC.not ? `(${child.str})` : child.str;
      return { str: `not ${inner}`, prec: PREC.not };
    }
    case "BranchConditionAnd": {
      const parts = n.operands.map((o) => {
        const c = renderNode(o, qualify);
        return c.prec < PREC.and ? `(${c.str})` : c.str;
      });
      return { str: parts.join(" and "), prec: PREC.and };
    }
    case "BranchConditionOr": {
      const parts = n.operands.map((o) => {
        const c = renderNode(o, qualify);
        return c.prec < PREC.or ? `(${c.str})` : c.str;
      });
      return { str: parts.join(" or "), prec: PREC.or };
    }
  }
}

/**
 * The per-operand-total boolean CQL expression for a criterion's guard `cond`. Every concept
 * or sub-criterion leaf is `Coalesce(<qualify(...)>, false)`; `not` sits over the totalized
 * leaf (or a parenthesised compound); `and`/`or` compose already-total operands with minimal
 * parenthesisation. The tree is emitted STRUCTURALLY (no NNF, no DNF) — CQL handles arbitrary
 * boolean nesting, and the define is referenced as one identifier regardless of its internal
 * shape (so the parent guard never multiplies).
 *
 * PRECONDITION: a well-formed guard (`assertWellFormedBranchCondition`) — every `and`/`or` has
 * ≥2 operands, every `not` exactly one. Criterion refs are EXPECTED here (unlike the emit-DNF
 * seams) — they are the define→define edges of the DAG.
 */
export function emitTotalBooleanGuard(cond: BranchCondition, qualify: QualifyLeaf): string {
  return renderNode(cond, qualify).str;
}

/** `define "<defineId>":\n  <total boolean body>` — the full criterion define statement. The
 *  header mirrors `emitConcept` (a `defined as` concept define); the caller supplies the
 *  already-collision-checked `defineId` (bare name) and the `qualify` resolver for its layer. */
export function emitCriterionDefine(
  defineId: string,
  cond: BranchCondition,
  qualify: QualifyLeaf,
  cqlIdent: (name: string) => string,
): string {
  const body = emitTotalBooleanGuard(cond, qualify);
  return `define ${cqlIdent(defineId)}:\n  ${body}`;
}
