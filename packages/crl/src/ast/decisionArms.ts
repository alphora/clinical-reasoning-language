// Direct arms of a decision — the bare names a CEL `result is "<D>" is "<X>"` branch may target
// (a `recommend activity` target or a `use decision` target). No transitive walk through sub-decisions.
// EXTRACTED from the CEL validator (T03/#86) to this leaf module so the language-services index can reuse
// it WITHOUT pulling the CEL validator/resolver into the lean `language-services` subpath — single source
// of truth with `validateResult`.
import type { ActionStatement, BlockBody, BranchBlock, Decision, WhenBlockBody } from "./types";
import { getRefName } from "./types";

export function collectDecisionArms(decision: Decision): Set<string> {
  const arms = new Set<string>();
  for (const branch of decision.body.statements) {
    walkArmsBranch(branch, arms);
  }
  return arms;
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
