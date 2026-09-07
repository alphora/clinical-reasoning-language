import type { BlockMember, BranchCondition, CRL } from "../ast/types";
import { isQualifiedRef, normalizeLocalRef, refDisplay } from "../ast/types";
import { visitBranchCondition } from "../ast/branchCondition";
import { foreignCriterionMessage } from "../ast/criterionDiagnostics";
import type { CRLError } from "../types/errors";

// REFACTOR:grounded (#320, review 563 C1): validator-free CQL entry points must
// refuse foreign criteria before a bare-name renderer or Interface closure can bind
// a local namesake. Source identity is ast.library.name, not the physical output name.
// Callers supply the statements they emit; an omitted custom-partition declaration
// is outside this scan. No criterion expansion or new cross-library resolver is needed.
export function foreignCriterionScopeErrors(ast: CRL): CRLError[] {
  const errors: CRLError[] = [];
  const check = (condition: BranchCondition): void => {
    visitBranchCondition<void>(condition, {
      criterionRef: (atom) => {
        if (!isQualifiedRef(normalizeLocalRef(atom.ref, ast.library.name))) return;
        errors.push({
          type: "Validation",
          kind: "criterion-guard-unavailable",
          line: atom.location.start.line,
          column: atom.location.start.column,
          message: foreignCriterionMessage(refDisplay(atom.ref)),
        });
      },
      ref: () => {},
      and: () => {},
      or: () => {},
      not: () => {},
    });
  };
  const walk = (members: readonly BlockMember[]): void => {
    for (const member of members) {
      if (member.type === "WhenBlock") {
        check(member.condition);
        if (member.body.type === "BlockBody") walk(member.body.statements);
      } else if (member.type === "OtherwiseBlock" && member.body.type === "BlockBody") {
        walk(member.body.statements);
      }
    }
  };
  for (const statement of ast.statements) {
    if (statement.type === "Criterion") check(statement.condition);
    else if (statement.type === "Decision") walk(statement.body.statements);
  }
  return errors;
}
