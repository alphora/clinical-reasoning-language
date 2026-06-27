// Direct arms of a decision — the bare names a CEL `result is "<D>" is "<X>"` branch may target
// (a `recommend activity` target or a `use decision` target). No transitive walk through sub-decisions.
// EXTRACTED from the CEL validator (T03/#86) to this leaf module so the language-services index can reuse
// it WITHOUT pulling the CEL validator/resolver into the lean `language-services` subpath — single source
// of truth with `validateResult`.
import type { ActionStatement, BlockBody, BranchBlock, Decision, WhenBlockBody } from "./types";
import { getRefLibrary, getRefName } from "./types";

export function collectDecisionArms(decision: Decision): Set<string> {
  const arms = new Set<string>();
  for (const branch of decision.body.statements) {
    walkArmsBranch(branch, arms);
  }
  return arms;
}

export type DecisionResolver = (name: string) => Decision | undefined;

/**
 * TRANSITIVE arms (option A) — the dispositions a CEL `result is "<D>" is "<X>"` may name once `use decision` recurses.
 * Union of the decision's DIRECT `recommend activity` names PLUS, for each BARE same-library RESOLVABLE non-cyclic
 * `use decision` target, that target's transitive arms — REPLACING the bare sub-name (a delegation is not a disposition).
 *
 * A `use decision` target contributes NO arm (its bare name is DROPPED, not kept) in ALL fallback cases — QUALIFIED
 * (cross-library), CYCLIC (`seen.has`), or UNRESOLVED bare. Rationale: the CRE (run.ts) produces NOTHING for any of
 * those (deferred / runtime-error / leaf), so keeping the bare name here would let validate_cel accept a `result is`
 * that run_decision can never satisfy — the exact validator↔runtime divergence #166 fixes. Both surfaces now reject a
 * disposition that can't be determined. Cycle-guarded via `seen` (seeded with the root decision name).
 */
export function collectDecisionArmsTransitive(
  decision: Decision,
  resolve: DecisionResolver,
  seen: Set<string> = new Set([decision.name]),
): Set<string> {
  const arms = new Set<string>();
  for (const branch of decision.body.statements) {
    walkArmsBranchTransitive(branch, arms, resolve, seen);
  }
  return arms;
}

function walkArmsBranchTransitive(
  branch: BranchBlock,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
): void {
  walkArmsWhenBlockBodyTransitive(branch.body, arms, resolve, seen);
}

function walkArmsWhenBlockBodyTransitive(
  body: WhenBlockBody,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
): void {
  if (body.type === "BlockBody") {
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
        walkArmsBranchTransitive(stmt, arms, resolve, seen);
      } else {
        walkArmsActionStatementTransitive(stmt as ActionStatement, arms, resolve, seen);
      }
    }
  } else {
    walkArmsActionStatementTransitive(body as ActionStatement, arms, resolve, seen);
  }
}

function walkArmsActionStatementTransitive(
  stmt: ActionStatement,
  arms: Set<string>,
  resolve: DecisionResolver,
  seen: Set<string>,
): void {
  const action = stmt.action;
  if (action.type === "RecommendActivity") {
    const n = getRefName(action.activityName);
    if (n) arms.add(n);
    return;
  }
  // UseDecision: ONLY a BARE, same-library, RESOLVABLE, NON-CYCLIC target contributes — it REPLACES its name with its
  // transitive arms. In every fallback case (QUALIFIED cross-library, CYCLIC, or UNRESOLVED bare) the bare name is
  // DROPPED, contributing NO arm — because the CRE produces nothing in those cases, so offering the name as a valid
  // arm here would diverge validate_cel from run_decision (the #166 bug). A disposition that can't be determined is
  // not a valid arm.
  const name = getRefName(action.decisionName);
  if (!name) return;
  if (getRefLibrary(action.decisionName) || seen.has(name)) return;
  const sub = resolve(name);
  if (!sub) return;
  const subArms = collectDecisionArmsTransitive(sub, resolve, new Set([...seen, name]));
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
