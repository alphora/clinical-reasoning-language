import type { GuardOutline, DefStructExpr } from '@smile-digital-health/crl/provenance';
import type { FocusNode } from './unpinnedTreeFocus';
import { criterionVerdictKey, criterionVerdictState, type LiveCriterion, type PersistedCriterionVerdict, type CriterionVerdictUiState, type ReviewState } from './medicalValidationStore';

export interface ReviewReach { caseId?: string; state: ReviewState; status?: string; nodeKeys: string[] }
export interface ReviewCriterionOccurrence { gid: string; occurrenceKey: string; lib: string; name: string }

/** Review membership includes the whole reached definition, irrespective of clinical truth. */
export function caseReviewReach(routeKeys: string[], nodes: Record<string, FocusNode>): string[] {
  const owners = new Set(routeKeys);
  return [...new Set([...routeKeys, ...Object.entries(nodes).filter(([, n]) => n.outline && owners.has(n.owner) && !n.choice && !n.logic).map(([k]) => k)])];
}

/** Complete model membership, independent of which rows happen to be expanded. */
export function criterionReviewMembership(outlines: Map<string, GuardOutline>): { owners: Map<string, Set<string>>; descendants: Map<string, Set<string>>; bodies: Map<string, DefStructExpr>; incomplete: Set<string> } {
  const owners = new Map<string, Set<string>>(), descendants = new Map<string, Set<string>>();
  const bodies = new Map<string, DefStructExpr>(), incomplete = new Set<string>();
  const walk = (expr: DefStructExpr, owner: string, parents: string[]): void => {
    if (expr.kind === 'criterion') {
      const key = criterionVerdictKey(expr.lib, expr.name);
      bodies.set(key, expr.operand);
      if (expr.elided) incomplete.add(key);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(owner);
      for (const parent of parents) {
        if (!descendants.has(parent)) descendants.set(parent, new Set());
        descendants.get(parent)!.add(key);
      }
      walk(expr.operand, owner, [...parents, key]);
    } else if (expr.kind === 'and' || expr.kind === 'or') expr.operands.forEach(e => walk(e, owner, parents));
    else if (expr.kind === 'not') walk(expr.operand, owner, parents);
    else if (expr.kind === 'leaf' && expr.composite) walk(expr.composite, owner, parents);
  };
  for (const [owner, outline] of outlines) walk(outline.expr, owner, []);
  return { owners, descendants, bodies, incomplete };
}

/** Display approval only. Stored encoding judgments and the completion gate remain authoritative. */
export function projectCriterionReview(input: {
  nodes: Record<string, FocusNode>; occurrences: ReviewCriterionOccurrence[];
  membership: ReturnType<typeof criterionReviewMembership>;
  live: Map<string, LiveCriterion>; stored: Record<string, PersistedCriterionVerdict>;
  cases: ReviewReach[]; current: boolean;
}): { states: Record<string, CriterionVerdictUiState>; pass: Set<string>; blocked: Set<string> } {
  const { nodes, occurrences, membership, live, stored, cases, current } = input;
  const states: Record<string, CriterionVerdictUiState> = {}, pass = new Set<string>(), blocked = new Set<string>();
  const state = (key: string): CriterionVerdictUiState => live.has(key) ? criterionVerdictState(stored[key], live.get(key)!) : 'unreviewed';
  const complete = (key: string): boolean => !!live.get(key) && !live.get(key)!.elided && !membership.incomplete.has(key);
  const hasBlocker = (key: string): boolean => [key, ...(membership.descendants.get(key) ?? [])].some(k => !complete(k) || !['pass', 'unreviewed'].includes(state(k)));
  const casesByOwner = new Map<string, ReviewReach[]>();
  for (const entry of cases) for (const owner of new Set(entry.nodeKeys)) {
    if (!casesByOwner.has(owner)) casesByOwner.set(owner, []);
    casesByOwner.get(owner)!.push(entry);
  }
  const ownerCases = (owner: string): ReviewReach[] => casesByOwner.get(owner) ?? [];
  const approvedCache = new Map<string, boolean>();
  const ownerPass = (owner: string): boolean => {
    const reached = ownerCases(owner);
    return current && reached.length > 0 && reached.every(c => !!c.caseId && c.state === 'pass' && c.status !== 'error');
  };
  const approved = (key: string, visiting = new Set<string>()): boolean => {
    if (visiting.has(key)) return false;
    const cached = approvedCache.get(key);
    if (cached !== undefined) return cached;
    const result = computeApproved(key, visiting);
    if (!visiting.size) approvedCache.set(key, result);
    return result;
  };
  const computeApproved = (key: string, visiting: Set<string>): boolean => {
    if (!current || hasBlocker(key) || visiting.has(key) || [...(membership.owners.get(key) ?? [])].some(owner => ownerCases(owner).some(c => c.status === 'error'))) return false;
    if (state(key) === 'pass') return true;
    const owners = membership.owners.get(key);
    if (!owners?.size) return false;
    if ([...owners].every(ownerPass)) return true;
    const body = membership.bodies.get(key);
    const next = new Set([...visiting, key]);
    const bodyApproved = (expr: DefStructExpr): boolean => {
      if (expr.kind === 'criterion') return approved(criterionVerdictKey(expr.lib, expr.name), next);
      if (expr.kind === 'and' || expr.kind === 'or') return expr.operands.length > 0 && expr.operands.every(bodyApproved);
      if (expr.kind === 'not') return bodyApproved(expr.operand);
      return false; // Unreviewed facts, unresolved references, and elisions cannot attest a body.
    };
    return !!body && bodyApproved(body);
  };
  const within = (child: string, parent: string): boolean => {
    const owner = nodes[parent]?.owner, seen = new Set<string>();
    for (let k = child; k && !seen.has(k); k = nodes[k]?.parent ?? '') {
      if (k === parent) return true;
      if (nodes[k]?.owner !== owner) break;
      seen.add(k);
    }
    return false;
  };
  const identity = (o: ReviewCriterionOccurrence): string => criterionVerdictKey(o.lib, o.name);
  const inherited = (key: string): boolean => occurrences.some(o => current && complete(identity(o)) && state(identity(o)) === 'pass' && within(key, o.occurrenceKey));
  const containingOccurrences = (key: string): ReviewCriterionOccurrence[] => occurrences.filter(o => within(key, o.occurrenceKey));
  const eligible = (key: string): boolean => current && !ownerCases(nodes[key]?.owner ?? '').some(c => c.status === 'error') && containingOccurrences(key).every(o => complete(identity(o)) && ['pass', 'unreviewed'].includes(state(identity(o))));
  for (const occ of occurrences) {
    const key = identity(occ), explicit = state(key);
    states[occ.gid] = explicit === 'unreviewed' && eligible(occ.occurrenceKey) && !hasBlocker(key) && (approved(key) || inherited(occ.occurrenceKey)) ? 'pass' : explicit;
  }
  for (const [key, node] of Object.entries(nodes)) {
    if (node.choice || node.logic || (!node.outline && !node.criterion)) continue;
    const containing = containingOccurrences(key);
    // Checks and body fill share eligibility: no inherited approval across blockers or execution errors.
    if (!eligible(key)) { blocked.add(key); continue; }
    if (inherited(key) || (containing.length ? containing.every(o => approved(identity(o))) : ownerCases(node.owner).some(c => !!c.caseId && c.state === 'pass' && c.status !== 'error'))) pass.add(key);
  }
  return { states, pass, blocked };
}
