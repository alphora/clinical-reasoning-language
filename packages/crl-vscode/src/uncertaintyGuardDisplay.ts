import type { CrlDecisionStructure, ViewNode } from "@smile-digital-health/crl";
import type { ProjectedFlowNode } from "./flowProjection";

export interface UncertaintyGuardCandidate {
  guardKey: string;
  passWhen: boolean;
  passTerminalKey: string;
  nonpassTerminalKey: string;
  subtreeKeys: string[];
}
export interface UncertaintyDisplayState {
  expanded?: ReadonlySet<string>;
  collapsed?: ReadonlySet<string>;
  forced?: ReadonlyMap<string, "case" | "flag" | "evidence">;
}
export interface UncertaintyGuardControl {
  guardKey: string;
  expanded: boolean;
  forced?: "case" | "flag" | "evidence";
}

/** REFACTOR:grounded: explicit marker + two unique unguarded terminals; no inferred clinical role. */
export function uncertaintyGuardCandidates(structure: readonly CrlDecisionStructure[]): Map<string, UncertaintyGuardCandidate> {
  const nodes: ProjectedFlowNode[] = [], counts = new Map<string, number>();
  const collect = (node: ProjectedFlowNode): void => {
    nodes.push(node); counts.set(node.nodeKey, (counts.get(node.nodeKey) ?? 0) + 1); node.children.forEach(collect);
  };
  structure.forEach(decision => decision.children.forEach(node => collect(node as ProjectedFlowNode)));
  const result = new Map<string, UncertaintyGuardCandidate>();
  const terminal = (node: ProjectedFlowNode): ProjectedFlowNode | undefined => {
    if (node.kind === "otherwise") {
      if (node.children.length !== 1) return;
      node = node.children[0];
    }
    return node.kind === "action" && node.actionKind === "recommend-activity" && node.refKeys.length === 1 && !node.children.length ? node : undefined;
  };
  for (const node of nodes) {
    if (node.kind !== "when" || typeof node.uncertaintyGuard?.passWhen !== "boolean" || node.children.length !== 2) continue;
    const children = node.children as ProjectedFlowNode[];
    const yes = children.filter(child => child.incomingOutcome === "Yes"), no = children.filter(child => child.incomingOutcome === "No");
    if (yes.length !== 1 || no.length !== 1) continue;
    const yesLeaf = terminal(yes[0]), noLeaf = terminal(no[0]);
    if (!yesLeaf || !noLeaf) continue;
    const subtree: string[] = [];
    const add = (child: ProjectedFlowNode): void => { subtree.push(child.nodeKey); child.children.forEach(add); };
    add(node);
    if (subtree.some(key => counts.get(key) !== 1)) continue;
    const passTerminalKey = (node.uncertaintyGuard.passWhen ? yesLeaf : noLeaf).nodeKey;
    const nonpassTerminalKey = (node.uncertaintyGuard.passWhen ? noLeaf : yesLeaf).nodeKey;
    result.set(node.nodeKey, { guardKey: node.nodeKey, passWhen: node.uncertaintyGuard.passWhen, passTerminalKey, nonpassTerminalKey,
      subtreeKeys: subtree });
  }
  return result;
}

/** Manual disclosure preferences apply to a known case; incomplete evidence and hidden flags require the full check. */
export function uncertaintyGuardExpanded(guardKey: string, state: UncertaintyDisplayState): boolean {
  const reason = state.forced?.get(guardKey);
  return reason === 'flag' || reason === 'evidence' || !!state.expanded?.has(guardKey)
    || (reason === 'case' && !state.collapsed?.has(guardKey));
}

/** REFACTOR:grounded: paint authority remains unfolded; only this cloned layout is shortened. */
export function foldUncertaintyGuards(structure: readonly CrlDecisionStructure[], state: UncertaintyDisplayState) {
  const candidates = uncertaintyGuardCandidates(structure), controls = new Map<string, UncertaintyGuardControl>();
  const disclosures: Record<string, string[]> = {};
  const visit = (node: ProjectedFlowNode): ProjectedFlowNode => {
    const candidate = candidates.get(node.nodeKey), forced = state.forced?.get(node.nodeKey);
    if (candidate) {
      const expanded = uncertaintyGuardExpanded(node.nodeKey, state);
      if (expanded) {
        controls.set(node.nodeKey, { guardKey: node.nodeKey, expanded: true, forced });
        disclosures[node.nodeKey] = candidate.subtreeKeys;
      } else {
        const retainedTerminalKey = forced === 'case' ? candidate.nonpassTerminalKey : candidate.passTerminalKey;
        const find = (children: ProjectedFlowNode[]): ProjectedFlowNode | undefined => {
          for (const child of children) { if (child.nodeKey === retainedTerminalKey) return child; const nested = find(child.children); if (nested) return nested; }
        };
        const leaf = find(node.children)!;
        controls.set(leaf.nodeKey, { guardKey: node.nodeKey, expanded: false });
        // The incoming edge belongs to the parent, not the omitted guard's pass polarity.
        return { ...leaf, incomingOutcome: node.incomingOutcome, children: [] };
      }
    }
    return { ...node, children: node.children.map(visit) };
  };
  return { structure: structure.map(decision => ({ ...decision, children: decision.children.map(node => visit(node as ProjectedFlowNode)) })),
    candidates, controls, disclosures };
}

/** REFACTOR:grounded: no paint record is not proof that a reached guard succeeded. */
export function forcedUncertaintyVisibility(candidates: ReadonlyMap<string, UncertaintyGuardCandidate>, context?: {
  tree: readonly ViewNode[];
  status: "pass" | "fail" | "error";
  resolve: (nodeId: string) => string | undefined;
  routeNodeIds?: ReadonlySet<string>;
}): Map<string, "case" | "evidence"> {
  const forced = new Map<string, "case" | "evidence">();
  if (!context) return forced;
  const observed = new Map<string, boolean>();
  let unknownError = context.status === "error";
  const visit = (nodes: readonly ViewNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "when" && (!context.routeNodeIds || context.routeNodeIds.has(node.nodeId))) {
        const bad = !!node.invalidated || !!node.publicationErrors?.length;
        if (node.evaluated || node.unknown || bad) {
          const key = context.resolve(node.nodeId), candidate = key ? candidates.get(key) : undefined;
          if (!key) unknownError = true;
          if (candidate) {
            if (bad || node.unknown || typeof node.condition?.satisfied !== "boolean") forced.set(key!, "evidence");
            else {
              const value = node.condition.satisfied;
              if (observed.has(key!) && observed.get(key!) !== value) forced.set(key!, 'evidence');
              observed.set(key!, value);
              if (value !== candidate.passWhen && forced.get(key!) !== 'evidence') forced.set(key!, 'case');
            }
          }
        }
      }
      visit(node.children ?? []);
    }
  };
  visit(context.tree);
  if (unknownError) for (const key of candidates.keys()) forced.set(key, "evidence");
  return forced;
}

/** REFACTOR:grounded: exported trees are static captures, not disconnected live disclosure controls. */
export function sanitizeUncertaintySnapshot(root: HTMLElement): void {
  for (const control of Array.from(root.querySelectorAll<HTMLElement>('[data-flow-uncertainty-toggle]'))) {
    control.removeAttribute('role'); control.removeAttribute('tabindex'); control.removeAttribute('aria-disabled');
    const collapsed = control.hasAttribute('data-flow-uncertainty-collapsed');
    control.setAttribute('aria-label', collapsed ? 'Uncertainty check hidden in this snapshot' : 'Uncertainty check shown');
    const title = control.querySelector('title');
    if (title) title.textContent = collapsed ? 'Show this check in the live tree before exporting to include it' : 'Uncertainty check shown';
  }
}

/** REFACTOR:grounded: disclosure adds visibility only, never traversal/highlight membership. */
export function addUncertaintyDisclosureKeys(visible: Set<string>, pinned: readonly string[], disclosures: Record<string, string[]>): void {
  const actual = new Set(pinned);
  for (const [guard, keys] of Object.entries(disclosures)) if (actual.has(guard)) for (const key of keys) visible.add(key);
}

/** REFACTOR:grounded: placement GIDs include non-addressable Criterion rows and flag proxies. */
export function flaggedUncertaintyGuards(candidates: ReadonlyMap<string, UncertaintyGuardCandidate>, gids: ReadonlySet<string>, owners: Readonly<Record<string, string>>, retainedTerminals?: ReadonlyMap<string, string>): Set<string> {
  const flagged = new Set([...gids].map(gid => owners[gid]).filter((key): key is string => !!key));
  return new Set([...candidates].filter(([guardKey,candidate]) => {
    const retained = retainedTerminals?.get(guardKey) ?? candidate.passTerminalKey;
    return candidate.subtreeKeys.some(key => key !== retained && flagged.has(key));
  }).map(([key]) => key));
}
