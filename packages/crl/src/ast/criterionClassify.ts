// #224 ii — criterion-reference CLASSIFICATION.
//
// The parser produces a `BranchConditionRef` for every bare guard atom (it cannot
// know at parse time whether a name is a concept or a criterion). This pass, run in
// `buildCRL` so the ONE source AST every consumer reads is already classified,
// rewrites a bare guard ref whose name is a LOCAL `criterion` into a distinct
// `BranchConditionCriterionRef`. That distinct node is the TRIPWIRE precondition:
// the criterion-expansion seam (ii.1b/c) replaces it, and every semantic consumer
// throws on an un-expanded one — so a missed expansion is a loud error, never a
// silently misresolved concept (round-2 finding, disc 299).
//
// Pure + idempotent. A BARE ref, OR a SELF-qualified ref (`"G"."X"` in library G —
// which the language treats as bare everywhere, so classification must too), is
// rewritten. A genuinely CROSS-library qualified ref (`"Other"."X"`) is left as a
// concept ref for the resolver/diagnostic to handle (cross-library criterion refs are
// out of scope in v0; a foreign criterion gets a targeted diagnostic elsewhere, not a
// silent rewrite here). Per-library by construction: `buildCRL` builds one library, so
// every `Criterion` statement here is same-library.

import { getRefLibrary, getRefName } from "./types";
import type {
  BranchBlock,
  BranchCondition,
  CRL,
  DecisionBody,
  ReferenceName,
  WhenBlockBody,
} from "./types";

type IsCrit = (ref: ReferenceName) => boolean;

export function classifyCriterionRefs(ast: CRL): CRL {
  const criterionNames = new Set<string>();
  for (const s of ast.statements) if (s.type === "Criterion") criterionNames.add(s.name);
  if (criterionNames.size === 0) return ast; // no criteria → nothing to classify (byte-identical)
  const selfLib = ast.library.name;
  // A guard ref names a LOCAL criterion when it is bare OR SELF-qualified (`"G"."X"`
  // in library G) — the language treats self-qualified ≡ bare everywhere (resolver
  // `checkRef`), so classification must too, or the bare spelling classifies while the
  // self-qualified spelling silently stays a (later-unresolved) concept ref.
  const isCrit: IsCrit = (ref) => {
    const lib = getRefLibrary(ref);
    return (lib === null || lib === selfLib) && criterionNames.has(getRefName(ref));
  };

  const statements = ast.statements.map((s) => {
    if (s.type === "Criterion") return { ...s, condition: rewriteCond(s.condition, isCrit) };
    if (s.type === "Decision") return { ...s, body: rewriteDecisionBody(s.body, isCrit) };
    return s;
  });
  return { ...ast, statements };
}

function rewriteCond(cond: BranchCondition, isCrit: IsCrit): BranchCondition {
  switch (cond.type) {
    case "BranchConditionRef":
      // A bare OR self-qualified ref whose name is a local criterion → distinct node.
      return isCrit(cond.ref)
        ? { type: "BranchConditionCriterionRef", ref: cond.ref, location: cond.location }
        : cond;
    case "BranchConditionCriterionRef":
      return cond; // idempotent
    case "BranchConditionNot":
      // #224 iii.2: recurse the negated operand — `not "SomeCriterion"` must classify too.
      return { ...cond, operand: rewriteCond(cond.operand, isCrit) };
    case "BranchConditionAnd":
    case "BranchConditionOr":
      return { ...cond, operands: cond.operands.map((o) => rewriteCond(o, isCrit)) };
  }
}

function rewriteDecisionBody(body: DecisionBody, isCrit: IsCrit): DecisionBody {
  return { ...body, statements: body.statements.map((b) => rewriteBranchBlock(b, isCrit)) };
}

function rewriteBranchBlock(b: BranchBlock, isCrit: IsCrit): BranchBlock {
  return b.type === "WhenBlock"
    ? { ...b, condition: rewriteCond(b.condition, isCrit), body: rewriteWhenBody(b.body, isCrit) }
    : { ...b, body: rewriteWhenBody(b.body, isCrit) }; // OtherwiseBlock — no guard, recurse body
}

function rewriteWhenBody(body: WhenBlockBody, isCrit: IsCrit): WhenBlockBody {
  if (body.type !== "BlockBody") return body; // a bare ActionStatement carries no guard
  const hasBranches = body.statements.some((m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock");
  if (!hasBranches) return body; // action-only block — no nested guards
  return {
    ...body,
    statements: body.statements.map((m) =>
      m.type === "WhenBlock" || m.type === "OtherwiseBlock" ? rewriteBranchBlock(m, isCrit) : m,
    ),
  };
}
