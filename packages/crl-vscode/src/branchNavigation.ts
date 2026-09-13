export interface BranchIdentity { caseId: string; routeId: string; }
export interface LeafRoute extends BranchIdentity { leafKey: string; }

/** Visit each visual leaf once, using its first authored case/route as representative. */
export function leafRouteNeighbors(routes: readonly LeafRoute[], current: BranchIdentity) {
  const selected = routes.find(r => r.caseId === current.caseId && r.routeId === current.routeId);
  const firstByLeaf = new Map<string, LeafRoute>();
  for (const route of routes) if (route.leafKey && !firstByLeaf.has(route.leafKey)) firstByLeaf.set(route.leafKey, route);
  const leaves = [...firstByLeaf.values()];
  const index = selected?.leafKey ? leaves.findIndex(r => r.leafKey === selected.leafKey) : -1;
  return { previous: index > 0 ? leaves[index - 1] : undefined,
    next: index >= 0 ? leaves[index + 1] : undefined, index, total: leaves.length };
}
