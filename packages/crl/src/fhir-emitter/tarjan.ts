/**
 * Tarjan's strongly-connected-components algorithm — shared helper.
 *
 * Used for cycle detection in dependency graphs:
 *   - per-library Decision graph in `decision.ts`
 *     (`classifyAndDetectCycles`)
 *   - closure-level Decision graph in `closureOrchestrator.ts`
 *     (`classifyClosureDecisions`)
 *
 * Both call sites have identical Tarjan needs (find SCCs over a
 * `Map<string, Set<string>>` adjacency table); v2.4.0 round-5
 * Gemini disposition: dedup. Same algorithm; identical semantics
 * across consumers.
 *
 * Returns an array of SCCs. A "real cycle" is either a multi-node SCC
 * or a single-node SCC whose node has a self-loop edge; callers
 * combine the result with the original outgoing map to detect this.
 *
 * Recursion implementation (no stack-overflow protection): the
 * decision-graph node count is bounded by the number of CRL
 * declarations in scope, typically O(10²) at most — well below
 * Node's default call-stack limit.
 */

export function tarjanSCC(
  nodes: ReadonlyArray<string>,
  outgoing: Map<string, Set<string>>,
): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of outgoing.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) strongConnect(node);
  }
  return sccs;
}
