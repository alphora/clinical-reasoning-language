import type { BranchConditionView, ExplanationView, ScenarioViewModel, ViewNode } from '@smile-digital-health/crl';
import { routeScenario, type ExecutionRoute } from './executionRoutes';

export type FocusTruth = 'true' | 'false' | 'unknown';
export interface FocusNode {
  parent: string;
  owner: string;
  outline: boolean;
  terminal: boolean;
  choice: boolean;
  criterion?: boolean;
  logic?: boolean;
  path?: string;
  concept?: [string, string];
}
export interface FocusOperand { owner: string; path: string; concept: [string, string]; result: FocusTruth }
export interface TreeTraversal {
  caseId: string;
  route: ExecutionRoute;
  operands: FocusOperand[];
  conditions: { key: string; result: FocusTruth }[];
  guards: { key: string; polarity: string; result: FocusTruth }[];
}
export interface TreeFocusPaint {
  key: string;
  nodeKeys: string[];
  groupKeys: string[];
  groupOutcomes: { key: string; result: 'true' | 'false' }[];
  operands: { key: string; result: FocusTruth }[];
  conditions: { key: string; result: FocusTruth }[];
}
const truth = (value?: boolean): FocusTruth => value === true ? 'true' : value === false ? 'false' : 'unknown';

/** Complete occurrence evidence; display grouping never rewrites these answers. */
export function treeTraversal(caseId: string, sv: ScenarioViewModel, route: ExecutionRoute, resolve: (id: string) => string | undefined): TreeTraversal {
  const operands: FocusOperand[] = [], conditions: TreeTraversal['conditions'] = [], guards: TreeTraversal['guards'] = [];
  const expression = (expr: BranchConditionView | ExplanationView, owner: string, lib: string, path: string, absorbedRef = false): void => {
    if (expr.op === 'ref') {
      const refLib = expr.concept.libraryName ?? lib;
      operands.push({owner,path,concept:[refLib,expr.concept.name],result:truth(expr.satisfied)});
      if (expr.explanation) expression(expr.explanation,owner,refLib,absorbedRef ? '0' : path+'.c');
    } else if (expr.op === 'criterion') {
      if (expr.body) expression(expr.body,owner,expr.criterion.libraryName ?? lib,path+'.b');
    } else if (expr.op === 'not' || expr.op === 'sem-not') expression(expr.operand,owner,lib,path+'.0');
    else if (expr.op === 'and' || expr.op === 'or' || expr.op === 'sem-and' || expr.op === 'sem-or') {
      expr.operands.forEach((child,i)=>expression(child,owner,lib,path+'.'+i));
    }
  };
  const walk = (nodes: ViewNode[], lib: string): void => {
    for (const n of nodes) {
      const owner=resolve(n.nodeId);
      if (n.evaluated && n.condition && owner && !n.invalidated && !n.publicationErrors?.length) {
        conditions.push({key:owner,result:truth(n.unknown ? undefined : n.condition.satisfied)});
        const expr=n.condition.expr;
        // One root criterion or direct concept is absorbed into the condition box.
        if (expr.op==='criterion' && expr.body) expression(expr.body,owner,expr.criterion.libraryName ?? lib,'0');
        else expression(expr,owner,lib,'0',expr.op==='ref');
      }
      if (n.evaluated && n.guard?.evaluated && owner && !n.invalidated && !n.publicationErrors?.length) {
        guards.push({key:owner,polarity:n.guard.polarity,result:truth(n.guard.unknown ? undefined : n.guard.satisfied)});
        expression({op:'ref',concept:n.guard.concept,satisfied:n.guard.satisfied,explanation:n.guard.explanation},owner,lib,'guard');
      }
      walk(n.children ?? [],n.action?.actionKind==='use-decision' ? n.action.target.libraryName ?? lib : lib);
    }
  };
  walk(routeScenario(sv,route).tree,sv.decision?.libraryName ?? '');
  return {caseId,route,operands,conditions,guards};
}

/** A display stop is the terminal, independent of case answers or guard status. */
export function treeTraversalSignature(entry: TreeTraversal): string {
  return JSON.stringify(entry.route.nodeKeys.at(-1) ?? null);
}

export function terminalTraversals(entries: TreeTraversal[], key: string): TreeTraversal[] {
  const seen = new Set<string>();
  return entries.filter(entry => {
    if (entry.route.nodeKeys.at(-1) !== key) return false;
    const signature = treeTraversalSignature(entry);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

/** Paint prefixes across all cases, or one complete terminal traversal. */
export function treeFocusPaint(entries: TreeTraversal[], key: string, nodes: Record<string, FocusNode>): TreeFocusPaint {
  const target = nodes[key], keep = new Set<string>(), connectorOwners = new Map<string, 'true' | 'false'>(), operands: TreeFocusPaint['operands'] = [], conditions: TreeFocusPaint['conditions'] = [];
  if (!target || target.choice) return { key, nodeKeys: [], groupKeys: [], groupOutcomes: [], operands, conditions };
  const owner = target.outline ? target.owner : key;
  const outlineChain = new Set<string>();
  if (target.outline) {
    let cursor = key;
    while (cursor && !outlineChain.has(cursor)) {
      outlineChain.add(cursor);
      if (cursor === owner) break;
      cursor = nodes[cursor]?.parent ?? '';
    }
  }
  for (const entry of entries) {
    const index = entry.route.nodeKeys.indexOf(owner);
    if (index < 0) continue;
    const prefix = new Set(entry.route.nodeKeys.slice(0, index + 1));
    for (const k of prefix) keep.add(k);
    for (const k of outlineChain) keep.add(k);
    for (const mark of entry.conditions) if (prefix.has(mark.key)) conditions.push(mark);
    for (const mark of [...entry.conditions,...entry.guards]) if (prefix.has(mark.key)) {
      if (mark.result!=='unknown') connectorOwners.set(mark.key,mark.result);
    }
    // Full route-owned contents, including nodes absent from the case's explanation.
    // Blue denotes structural membership, independently of actual truth.
    // Decoration/logic parents stay traversable but are never blue node targets.
    if (target.terminal) for (const [k,n] of Object.entries(nodes)) {
      if (n.outline && prefix.has(n.owner) && !n.choice) keep.add(k);
    }
    for (const operand of entry.operands) {
      if (!prefix.has(operand.owner)) continue;
      // Stop at the clicked condition itself; its definition is downstream of the click.
      if (operand.owner === owner && !target.terminal && !target.outline) continue;
      for (const [k, n] of Object.entries(nodes)) {
        if (n.choice || !n.concept || n.owner !== operand.owner || JSON.stringify(n.concept) !== JSON.stringify(operand.concept)) continue;
        if (target.terminal && n.path !== undefined && n.path !== operand.path) continue;
        if (operand.owner === owner && target.outline && !outlineChain.has(k)) continue;
        keep.add(k);
        operands.push({ key: k, result: operand.result });
        // Resolved input questions can replace a visually suppressed helper. The
        // question is addressable; its individual answer codes remain decoration.
        if (operand.owner !== owner || target.terminal) {
          const descendants = new Set([k]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const [childKey, child] of Object.entries(nodes)) if (child.outline && child.owner === operand.owner && !child.choice && descendants.has(child.parent) && !descendants.has(childKey)
              && (!target.terminal || child.path === undefined || child.path === (n.outline ? n.path+'.inputs' : 'inputs') || child.path.startsWith((n.outline ? n.path+'.inputs' : 'inputs')+'.'))) {
              descendants.add(childKey); keep.add(childKey); changed = true;
            }
          }
        }
        // Include enclosing logical/component rows, never choice rows.
        let parent = n.parent;
        const seen = new Set<string>();
        while (parent && parent !== operand.owner && !seen.has(parent)) {
          seen.add(parent); keep.add(parent); parent = nodes[parent]?.parent ?? '';
        }
      }
    }
  }
  // No case evidence still permits a structural reading of this node's ancestors.
  if (!keep.size) {
    let cursor = key;
    while (cursor && !keep.has(cursor)) { keep.add(cursor); cursor = nodes[cursor]?.parent ?? ''; }
  }
  // A component click includes its complete visible contents, not downstream branches.
  if (target.criterion && !target.terminal) {
    const descendants = new Set([key]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [childKey, child] of Object.entries(nodes)) {
        if (!child.outline || child.owner !== owner || child.choice || !descendants.has(child.parent) || descendants.has(childKey)) continue;
        descendants.add(childKey); keep.add(childKey); changed = true;
      }
    }
  }
  const unique = <T>(items: T[]) => [...new Map(items.map(item => [JSON.stringify(item), item])).values()];
  // Route colors use the actual owner outcome; unknown never acquires a polarity.
  const groupKeys = target.terminal ? [...keep].filter(k=>nodes[k]?.logic && connectorOwners.has(nodes[k].owner)) : [];
  return { key, nodeKeys: [...keep].filter(k => !nodes[k]?.logic), groupKeys,
    groupOutcomes: groupKeys.map(key=>({key,result:connectorOwners.get(nodes[key].owner)!})),
    operands: unique(operands), conditions: unique(conditions) };
}
