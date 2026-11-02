import type { CrlConceptNode, CrlStructureNode, DefStructExpr, GuardOutline, ConditionAnswerCheck, ConditionAnswerMember } from '@smile-digital-health/crl';

// REFACTOR:grounded: expression placement never changes the declaration's predicate.
export type ConnectorAnswerExpr = { kind: 'check'; check: ConditionAnswerCheck }
  | { kind: 'and'; children: ConnectorAnswerExpr[] }
  | { kind: 'or'; children: ConnectorAnswerExpr[] }
  | { kind: 'group'; label: string; operand: ConnectorAnswerExpr }
  | { kind: 'not'; operand: ConnectorAnswerExpr }
  | { kind: 'text'; text: string };
export const CONNECTOR_ANSWER_WIDTH = 224;
export const CONNECTOR_ANSWER_MAX_HEIGHT = 184;
export const CONNECTOR_ANSWER_GROUP_MAX_HEIGHT = 336;
export const CONNECTOR_ANSWER_GAP = CONNECTOR_ANSWER_WIDTH + 40;

export function connectorAnswerExpression(n: Pick<CrlStructureNode, 'kind' | 'nodeKey' | 'refKeys' | 'label'>,
  concepts: ReadonlyMap<string, CrlConceptNode>, outlines?: ReadonlyMap<string, GuardOutline>): ConnectorAnswerExpr | undefined {
  if (n.kind !== 'when') return undefined;
  let present = false;
  const leaf = (key: string, text: string, composite?: DefStructExpr): ConnectorAnswerExpr => {
    const check = concepts.get(key)?.conditionAnswers;
    if (check) { present = true; return { kind: 'check', check }; }
    return composite ? walk(composite) : { kind: 'text', text };
  };
  const walk = (e: DefStructExpr): ConnectorAnswerExpr => {
    switch (e.kind) {
      case 'criterion': return { kind:'group', label:e.name, operand:walk(e.operand) };
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

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function membersHtml(members: readonly ConditionAnswerMember[], domain = members): string {
  if (!members.length) return '<p class="connector-answer-note">No offered answer matches this part of the condition.</p>';
  const duplicates = new Set(domain.filter((m, i) => domain.some((v, j) => i !== j && v.display === m.display)).map(m => m.display));
  return '<ul>' + members.map(m => `<li title="${esc(`${m.system} | ${m.code}${m.description ? '\n' + m.description : ''}`)}">${esc(m.display)}${duplicates.has(m.display) ? ` <span>(${esc(m.code)}; ${esc(m.system)})</span>` : ''}</li>`).join('') + '</ul>';
}
export function connectorAnswerContent(expr: ConnectorAnswerExpr, outcome: boolean, nested = false): string {
  if (expr.kind === 'text') return `<p>${esc(expr.text)}</p>`;
  if (expr.kind === 'group') return `<p class="connector-answer-group">${esc(expr.label)}</p><div class="connector-answer-check">${connectorAnswerContent(expr.operand,outcome,true)}</div>`;
  // Known answer classifications invert through NOT; missing/error inputs never enter either list.
  if (expr.kind === 'not') return '<p class="connector-answer-note">Negated condition</p>' + connectorAnswerContent(expr.operand, !outcome, nested);
  if (expr.kind === 'and' || expr.kind === 'or') {
    const heading = expr.kind === 'and' ? outcome ? 'All of these conditions match:' : 'At least one of these conditions does not match:'
      : outcome ? 'At least one of these conditions matches:' : 'None of these conditions match:';
    return `<p class="connector-answer-group">${heading}</p>` + expr.children.map(c => `<div class="connector-answer-check">${connectorAnswerContent(c, outcome, true)}</div>`).join('');
  }
  const c = expr.check;
  if (c.status === 'simple') return (nested ? `<p class="connector-answer-question">${esc(c.label)}</p>${c.subjects[0].label!==c.label?`<p>${esc(c.subjects[0].label)}</p>`:''}` : '') + membersHtml(outcome ? c.subjects[0].matches : c.subjects[0].nonmatches, [...c.subjects[0].matches,...c.subjects[0].nonmatches]);
  const expression = `<p class="connector-answer-question">${esc(c.expression)}</p>`;
  if (c.status === 'aggregate') {
    const message = outcome ? 'At least one answer matches this check.' : c.availableValuesOnly
      ? 'None of the currently available answers match this check.' : 'Every required answer is present and does not match this check.';
    return `<p>${message}</p>` + c.subjects.map(s => `<div class="connector-answer-check"><p class="connector-answer-question">${esc(s.label)}</p>${membersHtml(outcome ? s.matches : s.nonmatches,[...s.matches,...s.nonmatches])}</div>`).join('') +
      `<p class="connector-answer-note">${c.availableValuesOnly ? 'Unanswered questions do not count as matching answers.' : 'A required unanswered question can leave this check undetermined.'}</p>` +
      `<details class="connector-answer-technical"><summary>Details</summary>${expression}${c.validityLabel ? `<p>Validity: ${esc(c.validityLabel)}</p>` : ''}</details>`;
  }
  return expression + `<p class="connector-answer-note">${esc(c.note ?? 'The answer interpretation is unavailable here.')}</p>`;
}
export function connectorAnswerHeight(content: string): number {
  // Reserve the expanded rectangle in both states, so opening cannot move the canvas.
  const rows = (content.match(/<li\b/g) ?? []).length + (content.match(/<p\b/g) ?? []).length;
  const limit=content.includes('connector-answer-group') || content.includes('connector-answer-check') ? CONNECTOR_ANSWER_GROUP_MAX_HEIGHT : CONNECTOR_ANSWER_MAX_HEIGHT;
  return Math.min(limit, Math.max(62, 38 + rows * 24));
}
export function connectorAnswerMarkup(id: string, from: string, to: string, outcome: boolean, expr: ConnectorAnswerExpr,
  x: number, y: number): string {
  const content = connectorAnswerContent(expr, outcome), height = connectorAnswerHeight(content);
  return `<g class="flow-connector-answers" data-answer-id="${esc(id)}" data-answer-from="${esc(from)}" data-answer-to="${esc(to)}" data-answer-height="${height}">` +
    `<foreignObject class="flow-connector-answer-body" x="${x}" y="${y}" width="${CONNECTOR_ANSWER_WIDTH}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="connector-answer-panel"><details data-connector-disclosure="${esc(id)}"><summary>View answers</summary><div class="connector-answer-content">${content}</div></details></div></foreignObject></g>`;
}
export const CONNECTOR_ANSWER_STYLE =
  '.flow-connector-answers{font-family:var(--vscode-font-family,sans-serif);font-size:12px;color:var(--vscode-foreground,#ddd)}' +
  '.connector-answer-panel{box-sizing:border-box;padding:3px;width:100%;max-height:100%;overflow:auto}' +
  '.connector-answer-panel>details{box-sizing:border-box;border:1px solid var(--vscode-panel-border,#555);border-radius:4px;background:var(--vscode-editor-background,#1e1e1e)}' +
  '.connector-answer-panel summary{padding:4px 6px;cursor:pointer;font-weight:500;user-select:none}' +
  '.connector-answer-panel summary:focus-visible{outline:1px solid var(--vscode-focusBorder,#007fd4);outline-offset:-2px}' +
  '.connector-answer-content{padding:0 8px 6px;overflow-wrap:anywhere}.connector-answer-content ul{padding-left:18px;margin:3px 0}.connector-answer-content li{margin:3px 0;line-height:18px}' +
  '.connector-answer-content p{margin:5px 0;line-height:17px}.connector-answer-note{opacity:.8}.connector-answer-question,.connector-answer-group{font-weight:600}.connector-answer-check{margin-left:8px}' +
  '.connector-answer-technical{margin-top:6px;font-size:11px}';
