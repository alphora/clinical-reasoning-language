// REFACTOR:grounded — retention transports current supplied answers without gathering
// absent alternatives or changing nullable clinical guards. Both emit lanes use this plan.
import { createHash } from "node:crypto";
import type { BlockMember, BlockQualifier, BranchCondition, CRL, Decision } from "../ast/types";
import { normalizeLocalRef } from "../ast/types";
import { buildCriterionIndex, guardConceptClosure } from "../ast/criterionIndex";
import { planConditionDefineName } from "../ast/guardDefines";
import { cqlQuotedIdentifier, cqlStringLiteral } from "../cql-emitter/cqlStrings";
import { publicationCaseFeatures } from "./publicationInputs";
import { publicationProducerOperands, type PublicationDescriptor, type PublicationProgram } from "./publicationProgram";

export interface RetentionPredicate { readonly name: string; readonly body: string }
export interface RetentionSlot {
  readonly answer: PublicationDescriptor;
  readonly condition: BranchCondition;
  readonly reach: RetentionPredicate;
  readonly presence: RetentionPredicate;
}

function predicate(kind: "reach" | "presence", expression: string): RetentionPredicate {
  // This boundary belongs only to transport. Original if/exists predicates already
  // return false for missing prerequisites/records. Evaluation errors still propagate.
  const body = `Coalesce((${expression}), false)`;
  return { name: `CRL retention ${kind} ${createHash("sha256").update(body).digest("hex")}`, body };
}

export function publicationRetentionPlan(program: PublicationProgram, source: string, ast: CRL, decision: Decision): RetentionSlot[] {
  type Scope = { condition: BranchCondition; negated: boolean };
  const index = buildCriterionIndex(ast.statements);
  const slots = new Map<string, { answer: PublicationDescriptor; condition: BranchCondition; scopes: string[][] }>();
  const seen = new Set<string>();
  const visit = (members: readonly BlockMember[], qualifier: BlockQualifier | undefined, parents: Scope[]) => {
    const prior: Scope[] = [];
    for (const member of members) {
      const scope = [...parents, ...(qualifier === "first" ? prior : [])];
      if (member.type === "WhenBlock") {
        const gathered = new Set([member.condition, ...scope.map(s => s.condition)]
          .flatMap(condition => guardConceptClosure(condition, index))
          .flatMap(atom => publicationCaseFeatures(program, source, normalizeLocalRef(atom.ref, ast.library.name), "questions"))
          .map(answer => answer.profileUrl));
        for (const atom of guardConceptClosure(member.condition, index)) {
          for (const consumer of publicationCaseFeatures(program, source, normalizeLocalRef(atom.ref, ast.library.name), "dependencies")) {
            if (consumer.producer?.kind !== "anyMembership" || !consumer.producer.availableValuesOnly) continue;
            for (const operand of publicationProducerOperands(consumer.producer)) {
              for (const answer of publicationCaseFeatures(program, operand.sourceIdentity, operand.conceptName, "definitions")) {
                if (!answer.profileUrl || !answer.localCode || gathered.has(answer.profileUrl)) continue;
                const names = scope.map(s => planConditionDefineName(s.condition, s.negated, "branch"));
                const key = JSON.stringify([answer.profileUrl, names]);
                if (seen.has(key)) continue;
                seen.add(key);
                const slot = slots.get(answer.profileUrl) ?? { answer, condition: member.condition, scopes: [] };
                slot.scopes.push(names);
                slots.set(answer.profileUrl, slot);
              }
            }
          }
        }
        if (member.body.type === "BlockBody") visit(member.body.statements, member.body.qualifier,
          [...scope, { condition: member.condition, negated: false }]);
        prior.push({ condition: member.condition, negated: true });
      } else if (member.type === "OtherwiseBlock" && member.body.type === "BlockBody") {
        visit(member.body.statements, member.body.qualifier, scope);
      }
    }
  };
  visit(decision.body.statements, decision.body.qualifier, []);
  return [...slots.values()].map(({ answer, condition, scopes }) => {
    const reaches = scopes.map(names => names.reduceRight((rest, name) => `if ${cqlQuotedIdentifier(name)} then (${rest}) else false`, "true"));
    const reach = reaches.reduceRight((rest, item) => `if (${item}) then true else (${rest})`, "false");
    const code = answer.localCode!;
    const presence = `exists ([Observation] O where exists (O.code.coding C where C.system.value = ${cqlStringLiteral(code.system)} and C.code.value = ${cqlStringLiteral(code.code)}))`;
    return { answer, condition, reach: predicate("reach", reach), presence: predicate("presence", presence) };
  });
}
