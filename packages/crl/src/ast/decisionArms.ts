// Direct arms of a decision — the bare names a CEL `result is "<D>" is "<X>"` branch may target
// (a `recommend activity` target or a `use decision` target). No transitive walk through sub-decisions.
// EXTRACTED from the CEL validator (T03/#86) to this leaf module so the language-services index can reuse
// it WITHOUT pulling the CEL validator/resolver into the lean `language-services` subpath — single source
// of truth with `validateResult`.
import { idOf, type LibAwareDecisionResolver } from "./decisionSpine";
import type { ActionStatement, BlockBody, BranchBlock, Decision, WhenBlockBody } from "./types";
import { getRefName } from "./types";

export function collectDecisionArms(decision: Decision): Set<string> {
  const arms = new Set<string>();
  for (const branch of decision.body.statements) {
    walkArmsBranch(branch, arms);
  }
  return arms;
}

/** The lib-aware resolver the transitive-arms walk recurses through — shared with the CRE / spine / VM (#172). */
export type DecisionResolver = LibAwareDecisionResolver;

/**
 * TRANSITIVE arms — the dispositions a CEL `result is "<D>" is "<X>"` may name once `use decision` recurses.
 * Union of the decision's DIRECT `recommend activity` names PLUS, for each RESOLVABLE non-cyclic `use decision` target
 * (same-library bare/self-qualified or cross-library qualified, #172), that target's transitive arms — REPLACING the
 * sub-name (a delegation is not a disposition). A cross-library sub's arms are collected IN ITS OWN library.
 *
 * A `use decision` target contributes NO arm (its name is DROPPED, not kept) in the two fallback cases — CYCLIC
 * (`seen.has`) or UNRESOLVED (target lib/name not in the graph). Rationale: the CRE (run.ts) produces NOTHING for those
 * (runtime-error / leaf), so keeping the name here would let validate_cel accept a `result is` that run_decision can
 * never satisfy — the exact validator↔runtime divergence #166 fixes. Both surfaces reject a disposition that can't be
 * determined. Cycle-guarded via `seen` (seeded with `(callerLib, decision.name)`).
 */
export function collectDecisionArmsTransitive(
  decision: Decision,
  resolve: DecisionResolver,
  // `callerLib` BEFORE `seen` so the default seed is correctly `(callerLib, name)`-keyed (#172). A caller that has no
  // library context passes "" → a same-library-only walk seeded `("" , name)`.
  callerLib = "",
  seen: Set<string> = new Set([idOf(callerLib, decision.name)]),
): Set<string> {
  const arms = new Set<string>();
  for (const branch of decision.body.statements) {
    walkArmsBranchTransitive(branch, arms, resolve, seen, callerLib);
  }
  return arms;
}

function walkArmsBranchTransitive(
  branch: BranchBlock,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
  callerLib: string,
): void {
  walkArmsWhenBlockBodyTransitive(branch.body, arms, resolve, seen, callerLib);
}

function walkArmsWhenBlockBodyTransitive(
  body: WhenBlockBody,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
  callerLib: string,
): void {
  if (body.type === "BlockBody") {
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
        walkArmsBranchTransitive(stmt, arms, resolve, seen, callerLib);
      } else {
        walkArmsActionStatementTransitive(stmt as ActionStatement, arms, resolve, seen, callerLib);
      }
    }
  } else {
    walkArmsActionStatementTransitive(body as ActionStatement, arms, resolve, seen, callerLib);
  }
}

function walkArmsActionStatementTransitive(
  stmt: ActionStatement,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
  callerLib: string,
): void {
  const action = stmt.action;
  if (action.type === "RecommendActivity") {
    const n = getRefName(action.activityName);
    if (n) arms.add(n);
    return;
  }
  // UseDecision: a RESOLVABLE, NON-CYCLIC target (same-library bare/self-qualified or cross-library qualified, #172)
  // REPLACES its name with its transitive arms, collected in the SUB'S library. In the fallback cases (CYCLIC/UNRESOLVED) the
  // name is DROPPED, contributing NO arm — the CRE produces nothing for those, so offering the name as a valid arm here
  // would diverge validate_cel from run_decision (the #166 bug). A disposition that can't be determined is not an arm.
  const resolved = resolve(callerLib, action.decisionName);
  if (!resolved) return;
  // Cycle key is `(lib,name)` of the RESOLVED owning library so cross-library `A.Sub`/`B.Sub` are distinct.
  const subId = idOf(resolved.lib, resolved.decision.name);
  if (seen.has(subId)) return;
  // Recurse in the SUB'S library so its own bare `use decision` targets resolve there.
  const subArms = collectDecisionArmsTransitive(
    resolved.decision,
    resolve,
    resolved.lib,
    new Set([...seen, subId]),
  );
  for (const a of subArms) arms.add(a);
}

function walkArmsBranch(branch: BranchBlock, arms: Set<string>): void {
  // `when` and `otherwise` arms both reach their body's leaf targets.
  walkArmsWhenBlockBody(branch.body, arms);
}

function walkArmsWhenBlockBody(body: WhenBlockBody, arms: Set<string>): void {
  if (body.type === "BlockBody") {
    walkArmsBlockBody(body, arms);
  } else {
    walkArmsActionStatement(body as ActionStatement, arms);
  }
}

function walkArmsBlockBody(block: BlockBody, arms: Set<string>): void {
  for (const stmt of block.statements) {
    if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
      walkArmsBranch(stmt, arms);
    } else {
      walkArmsActionStatement(stmt, arms);
    }
  }
}

function walkArmsActionStatement(stmt: ActionStatement, arms: Set<string>): void {
  const action = stmt.action;
  if (action.type === "RecommendActivity") {
    const n = getRefName(action.activityName);
    if (n) arms.add(n);
  } else if (action.type === "UseDecision") {
    const n = getRefName(action.decisionName);
    if (n) arms.add(n);
  }
}
