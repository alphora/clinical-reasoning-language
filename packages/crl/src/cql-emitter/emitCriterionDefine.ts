// #236/#274 build step C — the DEDICATED total-boolean emitter for a `criterion` define.
//
// Design of record: docs/emit-236-274-criterion-lowering-design.md §2d, §3 C.
//
// A `criterion` lowers to ONE boolean CQL define (like a `defined as` concept), so N uses
// become N references to it instead of N inline expansions (the #236 tree→DAG collapse).
// This emitter produces the define BODY from the criterion's (unexpanded) guard tree.
//
// It is DELIBERATELY NOT the `defined as` composition path (`emitComposition`/`emitSemAnd`/
// `emitSemOr`): that path lowers `sem-*` over truth-sets / refinement lanes. A criterion body is a
// plain boolean guard (`and`/`or`/`not` over concept + sub-criterion refs).
//
// REFACTOR:grounded (#189 null/pause) — a criterion body is STRONG KLEENE. Leaves are rendered BARE,
// ⚠ NOT `Coalesce`-totalized per operand.
//
// A criterion is a GUARD, and a guard is where a pause has to be able to happen. Coalesce the leaves and
// `criterion "Eligible": - when ( "Pure Question" ).` becomes
// `define "Eligible": Coalesce("Pure Question", false)` — `$apply` then reads an unanswered question as
// `false` and runs on to the next arm while the CRE evaluates the same criterion as UNKNOWN and pauses.
// A two-lane disagreement on an ordinary supported shape.
//
// Totality belongs at the ARM, not per operand. The REFERENCE SITE re-totalizes where two-valuedness is
// genuinely required: the per-action `unless` / `only when` carrier emits `not Coalesce(<ref>, false)`, so an
// action guard never pauses. ⚠ That carrier names a CONCEPT, never a criterion — `referenceResolver` accepts
// only `concept` in the action-guard slot — so it re-totalizes a concept's define, not this one. A criterion's
// reference sites are branch guards, which is exactly where the pause has to be able to happen.
//
// The emitter takes a `qualify(name, kind)` callback rather than resolving library prefixes
// itself: WHICH library a leaf's define lives in (Root / Interface / a concept re-export,
// or a sibling criterion define) is a layered-emit wiring concern, supplied by the caller.
// This keeps the structure + totality rules pure and unit-testable.

import type { BranchCondition, BranchConditionCriterionRef, ReferenceName } from "../ast/types";

/** Resolve a guard leaf (a concept ref or a sibling criterion ref) to the CQL identifier its
 *  define is referenced by — bare `"Name"` for a same-library define, `Lib."Name"` for a
 *  cross-library re-export. Receives the FULL `ReferenceName` (#189 Slice 0c) — a name alone
 *  cannot distinguish `"A"."X"` from `"B"."X"` or a bare `"X"` from a qualified one, so a
 *  cross-library operand must qualify from the ref's own library token, not a name key. Whether
 *  the emitter then totalizes what this returns (`Coalesce(…, false)`) or references it BARE is
 *  the `RenderLeafPolicy`'s call, not this resolver's. */
export type QualifyLeaf = (ref: ReferenceName, kind: "concept" | "criterion") => string;

// CQL boolean operator precedence (higher binds tighter): a leaf is atomic; `not` > `and` >
// `or`. A child is parenthesised iff its precedence is LOWER than its parent's — the minimal
// parenthesisation that preserves meaning (correctness, not aesthetics: emitted CQL is a
// compilation artifact).
const PREC = { leaf: 4, not: 3, and: 2, or: 1 } as const;

interface Rendered {
  str: string;
  prec: number;
}

/**
 * Leaf-rendering policy — the ONE axis on which the two total-boolean lowerings differ. Everything
 * structural (precedence, parenthesisation, `not`/`and`/`or`) is SHARED via `renderNode`, so a
 * criterion define and a `defined as` boolean composition CANNOT drift on shape (#189 Slice 0b,
 * plan banner gpt56-5/Claude-7):
 *   - criterion define (`criterionDefineLeafPolicy`): every leaf is rendered BARE, so UNKNOWN
 *     propagates out of the define (a criterion is a GUARD, and a guard is where a pause has to be
 *     able to happen — see the module header). A criterion ref is a legal define→define edge.
 *     ⚠ Totality is the REFERENCE SITE's job, not this policy's.
 *   - boolean composition (`compositionLeafPolicy`, in `emitCQL`): a concept leaf is a BARE
 *     gate-proven ref (the emit pivot has ALREADY proven every operand a TOTAL scalar boolean via
 *     `emitsTotalScalarBoolean`; a `Coalesce` here would MASK that proof failure — charter §4
 *     no-magic), and a criterion ref is NOT a member of the boolean-composition family → it throws.
 */
export interface RenderLeafPolicy {
  /** Render a positive concept leaf from its already-qualified CQL identifier. */
  concept: (qualified: string) => string;
  /** Render — or reject — a criterion-ref leaf, given the node and the layer `qualify` resolver. */
  criterionRef: (node: BranchConditionCriterionRef, qualify: QualifyLeaf) => string;
}

/** REFACTOR:grounded (#189) — the criterion-define leaf policy: leaves are rendered BARE so UNKNOWN
 *  propagates out of the define (criterion refs are define→define edges). */
export const criterionDefineLeafPolicy: RenderLeafPolicy = {
  concept: (qualified) => qualified,
  criterionRef: (node, qualify) => qualify(node.ref, "criterion"),
};

/** Render a well-formed boolean guard tree STRUCTURALLY (no NNF/DNF), parameterized by `leaf` (the
 *  criterion-define vs boolean-composition leaf policy). `not` > `and` > `or`; a child is
 *  parenthesised iff its precedence is LOWER than its parent's (minimal, meaning-preserving). */
function renderNode(n: BranchCondition, qualify: QualifyLeaf, leaf: RenderLeafPolicy): Rendered {
  switch (n.type) {
    case "BranchConditionRef":
      return { str: leaf.concept(qualify(n.ref, "concept")), prec: PREC.leaf };
    case "BranchConditionCriterionRef":
      return { str: leaf.criterionRef(n, qualify), prec: PREC.leaf };
    case "BranchConditionNot": {
      const child = renderNode(n.operand, qualify, leaf);
      // `not <leaf>` for a leaf operand; `not (…)` for a compound one. The totality (per policy)
      // already sits on each leaf INSIDE the operand, so `not` never re-totalizes.
      const inner = child.prec < PREC.not ? `(${child.str})` : child.str;
      return { str: `not ${inner}`, prec: PREC.not };
    }
    case "BranchConditionAnd": {
      const parts = n.operands.map((o) => {
        const c = renderNode(o, qualify, leaf);
        return c.prec < PREC.and ? `(${c.str})` : c.str;
      });
      return { str: parts.join(" and "), prec: PREC.and };
    }
    case "BranchConditionOr": {
      const parts = n.operands.map((o) => {
        const c = renderNode(o, qualify, leaf);
        return c.prec < PREC.or ? `(${c.str})` : c.str;
      });
      return { str: parts.join(" or "), prec: PREC.or };
    }
  }
}

/**
 * The total boolean CQL expression for a well-formed guard `cond`, under leaf policy `leaf`. The
 * tree is emitted STRUCTURALLY (no NNF, no DNF) — CQL handles arbitrary boolean nesting, and the
 * define is referenced as one identifier regardless of its internal shape (so a parent guard never
 * multiplies). PRECONDITION: a well-formed guard (`assertWellFormedBranchCondition`) — every
 * `and`/`or` has ≥2 operands, every `not` exactly one.
 */
export function emitTotalBooleanExpr(
  cond: BranchCondition,
  qualify: QualifyLeaf,
  leaf: RenderLeafPolicy,
): string {
  return renderNode(cond, qualify, leaf).str;
}

/** The criterion define BODY — every concept/sub-criterion leaf rendered BARE (strong Kleene, so an
 *  UNKNOWN leaf makes the guard UNKNOWN); criterion refs EXPECTED (define→define edges of the DAG). A
 *  thin wrapper over `emitTotalBooleanExpr` under the criterion-define policy. */
export function emitTotalBooleanGuard(cond: BranchCondition, qualify: QualifyLeaf): string {
  return emitTotalBooleanExpr(cond, qualify, criterionDefineLeafPolicy);
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
