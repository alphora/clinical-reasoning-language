import type { CrlDecisionStructure, CrlStructureNode } from '@smile-digital-health/crl';
import { projectFlowStructure, type ProjectedFlowNode } from './flowProjection';

type Direction = 'Yes' | 'No' | 'unconditional' | undefined;

/** Review colors follow the node's chosen connector, not just its identity or its next node's name. */
export function createRouteReviewMatcher(structure: CrlDecisionStructure[], targetPath: readonly string[]) {
  const known = new Set<string>();
  const conditions = new Map<string, Map<string, Direction>>();
  const index = (nodes: readonly CrlStructureNode[]): void => {
    for (const node of nodes) {
      known.add(node.nodeKey);
      if (node.kind === 'when') {
        let edges = conditions.get(node.nodeKey);
        if (!edges) conditions.set(node.nodeKey, edges = new Map());
        for (const child of node.children as ProjectedFlowNode[]) {
          const direction = child.incomingOutcome;
          edges.set(child.nodeKey, edges.has(child.nodeKey) && edges.get(child.nodeKey) !== direction ? undefined : direction);
        }
      }
      index(node.children);
    }
  };
  for (const decision of projectFlowStructure(structure)) {
    known.add(decision.nodeKey);index(decision.children);
  }
  const directions = (path: readonly string[]): Map<string, Direction> => {
    const result = new Map<string, Direction>();
    path.forEach((key, position) => {
      const direction = !known.has(key) ? undefined : conditions.has(key)
        ? conditions.get(key)!.get(path[position + 1]) : 'unconditional';
      // A repeated key with conflicting or incomplete evidence must never become last-direction-wins.
      result.set(key, result.has(key) && result.get(key) !== direction ? undefined : direction);
    });
    return result;
  };
  const target = directions(targetPath);
  return {
    keys: new Set([...target].filter(([, direction]) => direction !== undefined).map(([key]) => key)),
    matchingKeys(path: readonly string[]): string[] {
      return [...directions(path)].filter(([key, direction]) => direction !== undefined && target.get(key) === direction).map(([key]) => key);
    },
  };
}
