import type { CrlDecisionStructure, CrlStructureNode } from '@smile-digital-health/crl';
import type { ExecutionRoute } from './executionRoutes';
import { projectFlowStructure } from './flowProjection';
import { foldUncertaintyGuards, uncertaintyGuardCandidates, uncertaintyGuardExpanded, type UncertaintyDisplayState } from './uncertaintyGuardDisplay';

// REFACTOR:grounded: modeled branches define rows; sparse execution evidence establishes coverage.
export const DECISION_TABLE_PAGE_SIZE = 20;

export interface DecisionTableScope {
  nodeKey: string;
  rootKey?: string;
  path?: readonly string[];
}

export interface DecisionTableCase {
  caseId: string;
  route: ExecutionRoute;
}

export interface DecisionTableRow {
  id: string;
  rootKey: string;
  terminalKey: string;
  runtimeTerminalId: string;
  label: string;
  pathKeys: string[];
  displayPathKeys: string[];
  cases: DecisionTableCase[];
  error?: string;
}

export interface DecisionTableModel {
  scope: DecisionTableScope;
  label: string;
  totalRows: bigint;
  underlyingRows: bigint;
  uncoveredRows: bigint;
  forcedGuards: string[];
  parent?: DecisionTableScope;
  children: { scope: DecisionTableScope; label: string; count: bigint }[];
  error?: string;
  rows(offset?: bigint, limit?: number): DecisionTableRow[];
  underlyingRow(id: string): DecisionTableRow | undefined;
  scopeForCase(entry: DecisionTableCase, nodeKey: string): DecisionTableScope | undefined;
}

interface GraphNode {
  key: string;
  owner: string;
  label: string;
  nodeId: string;
  kind: 'decision' | CrlStructureNode['kind'];
  children: string[];
  recommendation: boolean;
  delegation: boolean;
  error?: string;
}

interface Step { key: string; prefix: string }
interface Endpoint { steps: Step[]; runtimeId: string }
const runtimeId = (prefix: string, local: string) => prefix ? `${prefix}/${local}` : local;
const rowId = (root: string, terminal: string) => JSON.stringify([root, terminal]);
const hasPrefix = (path: readonly string[], prefix: readonly string[]) => prefix.every((key, i) => path[i] === key);

function graphOf(structure: readonly CrlDecisionStructure[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();
  const add = (node: CrlStructureNode, owner: string): void => {
    const delegation = node.kind === 'action' && node.actionKind === 'use-decision';
    const recommendation = node.kind === 'action' && node.actionKind === 'recommend-activity';
    graph.set(node.nodeKey, {
      key: node.nodeKey, owner, label: node.label, nodeId: node.nodeId, kind: node.kind,
      recommendation, delegation,
      children: delegation ? node.refKeys.slice(0, 1) : node.children.map(child => child.nodeKey),
      ...(node.kind === 'action' && node.children.length ? { error: 'An activity with nested source nodes cannot be represented as a branch.' } : {}),
    });
    node.children.forEach(child => add(child, owner));
  };
  for (const decision of structure) {
    graph.set(decision.nodeKey, { key: decision.nodeKey, owner: decision.nodeKey, label: decision.decision,
      nodeId: '', kind: 'decision', recommendation: false, delegation: false, children: decision.children.map(child => child.nodeKey) });
    decision.children.forEach(node => add(node, decision.nodeKey));
  }
  for (const node of graph.values()) if (node.delegation &&
    (node.children.length !== 1 || graph.get(node.children[0])?.kind !== 'decision')) {
    node.error = 'The delegated decision is unavailable.';
    node.children = [];
  }
  return graph;
}

function branchCounts(graph: ReadonlyMap<string, GraphNode>, start: string) {
  const counts = new Map<string, bigint>(), visiting = new Set<string>(), order: string[] = [];
  let error: string | undefined;
  const count = (key: string): bigint => {
    if (counts.has(key)) return counts.get(key)!;
    const node = graph.get(key);
    if (!node) { error = 'A modeled branch contains an unavailable source node.'; return 0n; }
    if (visiting.has(key)) { error = `Circular decision dependency at ${node.label}.`; return 0n; }
    visiting.add(key);
    const value = node.error || node.recommendation ? 1n : node.children.reduce((total, child) => total + count(child), 0n);
    visiting.delete(key);
    counts.set(key, value);
    order.push(key);
    return value;
  };
  const total = count(start);
  return { counts, order, total, error };
}

/** Caller prefixes prune shared DAGs before walking an actual produced endpoint. */
function actualPath(graph: ReadonlyMap<string, GraphNode>, root: string, terminal: string, terminalKey?: string): Endpoint | undefined {
  const visiting = new Set<string>();
  const walk = (key: string, prefix: string, steps: Step[]): Endpoint | undefined => {
    const node = graph.get(key);
    if (!node || visiting.has(key)) return;
    const path = [...steps, { key, prefix }];
    const id = runtimeId(prefix, node.nodeId);
    if (node.error || node.recommendation) return id === terminal && (!terminalKey || key === terminalKey) ? { steps: path, runtimeId: id } : undefined;
    if (node.delegation && !terminal.startsWith(id + '/')) return;
    visiting.add(key);
    for (const child of node.children) {
      const result = walk(child, node.delegation ? id : prefix, path);
      if (result) { visiting.delete(key); return result; }
    }
    visiting.delete(key);
  };
  return walk(root, '', []);
}

function scopePath(graph: ReadonlyMap<string, GraphNode>, scope: DecisionTableScope): string[] | undefined {
  const root = scope.rootKey ?? graph.get(scope.nodeKey)?.owner;
  if (!root || graph.get(root)?.kind !== 'decision') return;
  if (scope.path) {
    const path = [...scope.path];
    if (path[0] !== root || path.at(-1) !== scope.nodeKey) return;
    return path.every((key, i) => graph.has(key) && (!i || graph.get(path[i - 1])!.children.includes(key))) ? path : undefined;
  }
  const find = (key: string, path: string[]): string[] | undefined => {
    if (key === scope.nodeKey) return [...path, key];
    const node = graph.get(key);
    // A source focus has an unambiguous local owner. A call-site focus supplies its path explicitly.
    if (!node || node.delegation) return;
    for (const child of node.children) {
      const found = find(child, [...path, key]);
      if (found) return found;
    }
  };
  return find(root, []);
}

function endpointAt(graph: ReadonlyMap<string, GraphNode>, counts: ReadonlyMap<string, bigint>, scope: readonly string[], offset: bigint): Endpoint | undefined {
  const steps: Step[] = [];
  let prefix = '';
  for (const key of scope) {
    const previous = steps.at(-1);
    if (previous && graph.get(previous.key)!.delegation) prefix = runtimeId(previous.prefix, graph.get(previous.key)!.nodeId);
    steps.push({ key, prefix });
  }
  let key = scope.at(-1)!;
  while (true) {
    const node = graph.get(key)!;
    if (node.error || node.recommendation) return { steps, runtimeId: runtimeId(prefix, node.nodeId) };
    let next: string | undefined;
    for (const child of node.children) {
      const size = counts.get(child) ?? 0n;
      if (offset < size) { next = child; break; }
      offset -= size;
    }
    if (!next) return;
    if (node.delegation) prefix = runtimeId(prefix, node.nodeId);
    key = next;
    steps.push({ key, prefix });
  }
}

/** Exact counts with bounded row materialization, including shared decisions. */
export function buildDecisionTable(
  structure: readonly CrlDecisionStructure[], entries: readonly DecisionTableCase[], requestedScope: DecisionTableScope,
  displayState: UncertaintyDisplayState = {},
): DecisionTableModel {
  const projected = projectFlowStructure([...structure]);
  const full = graphOf(projected), path = scopePath(full, requestedScope);
  const empty: DecisionTableModel = { scope: requestedScope, label: '', totalRows: 0n, underlyingRows: 0n, uncoveredRows: 0n,
    forcedGuards: [], children: [], rows: () => [], underlyingRow: () => undefined, scopeForCase: () => undefined };
  if (!path) return { ...empty, error: 'The focused source occurrence is unavailable. Choose a current node.' };
  const root = path[0], focus = path.at(-1)!;
  const scope: DecisionTableScope = { nodeKey: focus, rootKey: root, path };
  const inventory = branchCounts(full, focus);
  if (inventory.error) return { ...empty, scope, error: inventory.error };

  const evidence = new Map<string, { path: string[]; cases: DecisionTableCase[] }>();
  const actual = new Map<DecisionTableCase, Endpoint>();
  for (const entry of entries) {
    if (entry.route.terminalKind !== 'produced' || entry.route.gaps.length) continue;
    const primary = entry.route.nodeKeys[0];
    const terminal = actualPath(full, primary, entry.route.terminalId, entry.route.nodeKeys.at(-1));
    if (!terminal) continue;
    actual.set(entry, terminal);
    terminal.steps.forEach((step, i) => {
      if (full.get(step.key)?.kind !== 'decision') return;
      const relative = step.prefix ? terminal.runtimeId.slice(step.prefix.length + 1) : terminal.runtimeId;
      const id = rowId(step.key, relative);
      const record = evidence.get(id) ?? { path: terminal.steps.slice(i).map(s => s.key), cases: [] };
      if (!record.cases.some(c => c.caseId === entry.caseId && c.route.terminalId === entry.route.terminalId)) record.cases.push(entry);
      evidence.set(id, record);
    });
  }
  const covered = [...evidence].filter(([id, record]) => JSON.parse(id)[0] === root && hasPrefix(record.path, path));
  const coveredPerTerminal = new Map<string, bigint>();
  for (const [, record] of covered) {
    const key = record.path.at(-1)!;
    coveredPerTerminal.set(key, (coveredPerTerminal.get(key) ?? 0n) + 1n);
  }
  const occurrences = new Map<string, bigint>([[focus, 1n]]);
  for (const key of [...inventory.order].reverse()) {
    const node = full.get(key)!;
    if (node.error || node.recommendation) continue;
    for (const child of node.children) occurrences.set(child, (occurrences.get(child) ?? 0n) + (occurrences.get(key) ?? 0n));
  }
  const forced = new Map(displayState.forced), expanded = new Set(displayState.expanded), forcedGuards: string[] = [];
  for (const [guard, candidate] of uncertaintyGuardCandidates(projected)) {
    if (candidate.subtreeKeys.includes(focus) && ![candidate.passTerminalKey, candidate.nonpassTerminalKey].includes(focus)) expanded.add(guard);
    if (uncertaintyGuardExpanded(guard, { ...displayState, forced, expanded })) continue;
    const omitted = forced.get(guard) === 'case' ? candidate.passTerminalKey : candidate.nonpassTerminalKey;
    if ((occurrences.get(omitted) ?? 0n) > (coveredPerTerminal.get(omitted) ?? 0n)) {
      forced.set(guard, 'evidence'); forcedGuards.push(guard);
    }
    if (candidate.subtreeKeys.includes(focus) && focus !== (forced.get(guard) === 'case' ? candidate.nonpassTerminalKey : candidate.passTerminalKey)) expanded.add(guard);
  }
  const display = graphOf(foldUncertaintyGuards(projected, { ...displayState, forced, expanded }).structure);
  const displayPath = scopePath(display, { nodeKey: focus, rootKey: root }) ?? path.filter(key => display.has(key));
  const visible = branchCounts(display, focus);
  if (visible.error || !display.has(focus)) return { ...empty, scope, error: visible.error ?? 'The focused branch is unavailable in this view.' };

  const makeRow = (endpoint: Endpoint, displayedPath?: string[]): DecisionTableRow => {
    const key = endpoint.steps.at(-1)!.key, node = full.get(key)!;
    const id = rowId(root, endpoint.runtimeId), cases = evidence.get(id)?.cases ?? [];
    return { id, rootKey: root, terminalKey: key, runtimeTerminalId: endpoint.runtimeId, label: node.label,
      pathKeys: endpoint.steps.map(s => s.key), displayPathKeys: displayedPath ?? endpoint.steps.map(s => s.key), cases: [...cases],
      ...(node.error || !cases.length ? { error: node.error ?? 'Coverage error: no MV case reaches this modeled branch.' } : {}) };
  };
  const model: DecisionTableModel = {
    scope, label: full.get(focus)!.label, totalRows: visible.total, underlyingRows: inventory.total,
    uncoveredRows: inventory.total - BigInt(covered.length), forcedGuards, children: [],
    rows(offset = 0n, limit = DECISION_TABLE_PAGE_SIZE) {
      if (offset < 0n || offset >= visible.total || !Number.isSafeInteger(limit) || limit <= 0) return [];
      const result: DecisionTableRow[] = [];
      for (let i = 0; i < Math.min(limit, DECISION_TABLE_PAGE_SIZE) && offset + BigInt(i) < visible.total; i++) {
        const shown = endpointAt(display, visible.counts, displayPath, offset + BigInt(i));
        if (!shown) break;
        const original = actualPath(full, root, shown.runtimeId, shown.steps.at(-1)!.key);
        if (original) result.push(makeRow(original, shown.steps.map(s => s.key)));
      }
      return result;
    },
    underlyingRow(id) {
      let value: unknown;
      try { value = JSON.parse(id); } catch { return; }
      if (!Array.isArray(value) || value[0] !== root || typeof value[1] !== 'string') return;
      const endpoint = actualPath(full, root, value[1]);
      return endpoint && hasPrefix(endpoint.steps.map(s => s.key), path) ? makeRow(endpoint) : undefined;
    },
    scopeForCase(entry, nodeKey) {
      const endpoint = actual.get(entry);
      const i = endpoint?.steps.findIndex(s => s.key === nodeKey) ?? -1;
      if (!endpoint || i < 0) return;
      const keys = endpoint.steps.slice(0, i + 1).map(s => s.key);
      return { nodeKey, rootKey: keys[0], path: keys };
    },
  };
  const parent = [...path]; parent.pop();
  while (parent.length && full.get(parent.at(-1)!)?.kind === 'otherwise') parent.pop();
  if (parent.length) model.parent = { nodeKey: parent.at(-1)!, rootKey: root, path: parent };
  const originalContinuation = (key: string, target: string, keys: string[]): string[] | undefined => {
    if (key === target) return keys;
    const node = full.get(key);
    if (!node || node.recommendation || node.error) return;
    for (const child of node.children) {
      // A projected shortcut never crosses a decision call. Keep its contextual edge explicit.
      if (node.delegation && child !== target) continue;
      const found = originalContinuation(child, target, [...keys, child]);
      if (found) return found;
    }
  };
  const addChild = (key: string): void => {
    const node = full.get(key)!;
    if (node.kind === 'otherwise') { display.get(key)!.children.forEach(addChild); return; }
    const childPath = originalContinuation(focus, key, [...path]);
    const counted = branchCounts(display, key);
    if (counted.total && childPath) model.children.push({ scope: { nodeKey: key, rootKey: root, path: childPath }, label: node.label, count: counted.total });
  };
  if (!full.get(focus)!.recommendation && !full.get(focus)!.error) display.get(focus)!.children.forEach(addChild);
  return model;
}
