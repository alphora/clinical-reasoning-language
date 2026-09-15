export interface BranchIdentity { caseId: string; routeId: string; }
export interface LeafRoute extends BranchIdentity { leafKey: string; }

/** Visit each visual leaf once in tree order, retaining its first authored case/route. */
export function leafRouteNeighbors(routes: readonly LeafRoute[], current: BranchIdentity, visualLeafOrder: readonly string[] = []) {
  const selected = routes.find(r => r.caseId === current.caseId && r.routeId === current.routeId);
  const firstByLeaf = new Map<string, LeafRoute>();
  for (const route of routes) if (route.leafKey && !firstByLeaf.has(route.leafKey)) firstByLeaf.set(route.leafKey, route);
  const leaves: LeafRoute[] = [];
  for (const key of visualLeafOrder) {
    const route = firstByLeaf.get(key);
    if (route) { leaves.push(route); firstByLeaf.delete(key); }
  }
  // Keep unmapped endpoints in their existing encounter order after known visual leaves.
  leaves.push(...firstByLeaf.values());
  const index = selected?.leafKey ? leaves.findIndex(r => r.leafKey === selected.leafKey) : -1;
  return { previous: index > 0 ? leaves[index - 1] : undefined,
    next: index >= 0 ? leaves[index + 1] : undefined, index, total: leaves.length };
}
