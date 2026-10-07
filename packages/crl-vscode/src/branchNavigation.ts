export interface BranchIdentity { caseId: string; routeId: string; traversalKey?: string; }
export interface TraversalRoute extends BranchIdentity { leafKey: string; traversalKey: string; }

/** Visit each distinct traversal in tree order, retaining its first authored case/route. */
export function traversalRouteNeighbors(routes: readonly TraversalRoute[], current: BranchIdentity, visualLeafOrder: readonly string[] = []) {
  const selected = routes.find(r => r.caseId === current.caseId && r.routeId === current.routeId && (current.traversalKey === undefined || r.traversalKey === current.traversalKey));
  const byLeaf = new Map<string, TraversalRoute[]>();
  for (const route of routes) if (route.leafKey) {
    const group = byLeaf.get(route.leafKey) ?? [];
    if (!group.some(r => r.traversalKey === route.traversalKey)) group.push(route);
    byLeaf.set(route.leafKey, group);
  }
  const traversals: TraversalRoute[] = [];
  for (const key of visualLeafOrder) {
    const group = byLeaf.get(key);
    if (group) { traversals.push(...group); byLeaf.delete(key); }
  }
  // Keep unmapped endpoints in their existing encounter order after known visual leaves.
  traversals.push(...[...byLeaf.values()].flat());
  const index = selected?.leafKey ? traversals.findIndex(r => r.leafKey === selected.leafKey && r.traversalKey === selected.traversalKey) : -1;
  return { previous: index > 0 ? traversals[index - 1] : undefined,
    next: index >= 0 ? traversals[index + 1] : undefined, index, total: traversals.length };
}
