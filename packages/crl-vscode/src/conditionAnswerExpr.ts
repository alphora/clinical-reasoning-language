import type { CrlConceptNode, CrlStructureNode, DefStructExpr, GuardOutline, ConditionAnswerCheck } from '@smile-digital-health/crl';

// REFACTOR:grounded: expression placement never changes the declaration's predicate.
export type ConditionAnswerExpr = { kind: 'check'; check: ConditionAnswerCheck }
  | { kind: 'and'; children: ConditionAnswerExpr[] }
  | { kind: 'or'; children: ConditionAnswerExpr[] }
  | { kind: 'group'; label: string; lib:string; operand: ConditionAnswerExpr }
  | { kind: 'not'; operand: ConditionAnswerExpr }
  | { kind: 'text'; text: string };
export function conditionAnswerExpression(n: Pick<CrlStructureNode, 'kind' | 'nodeKey' | 'refKeys' | 'label'>,
  concepts: ReadonlyMap<string, CrlConceptNode>, outlines?: ReadonlyMap<string, GuardOutline>): ConditionAnswerExpr | undefined {
  if (n.kind !== 'when') return undefined;
  let present = false;
  const leaf = (key: string, text: string, composite?: DefStructExpr): ConditionAnswerExpr => {
    const check = concepts.get(key)?.conditionAnswers;
    if (check) { present = true; return { kind: 'check', check }; }
    return composite ? walk(composite) : { kind: 'text', text };
  };
  const walk = (e: DefStructExpr): ConditionAnswerExpr => {
    switch (e.kind) {
      case 'criterion': return { kind:'group', label:e.name, lib:e.lib, operand:walk(e.operand) };
      case 'and': case 'or': return { kind: e.kind, children: e.operands.map(walk) };
      case 'not': return { kind: 'not', operand: walk(e.operand) };
      case 'leaf': return leaf(e.nodeKey, e.name, e.composite);
      case 'external': return { kind: 'text', text: `${e.name} — source unavailable here` };
      case 'more': return { kind: 'text', text: 'Additional conditions are not shown here.' };
    }
  };
  const outline = outlines?.get(n.nodeKey);
  const value = outline ? walk(outline.expr) : n.refKeys.length === 1 ? leaf(n.refKeys[0], n.label) : undefined;
  return present ? value : undefined;
}
