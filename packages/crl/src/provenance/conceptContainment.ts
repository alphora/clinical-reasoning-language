/**
 * Concept containment closures (#166 Slice 2) — the transitive structure over the concept definition graph that lets a
 * correspondence unit citing a NESTED sub-concept resolve to the decision row whose concept transitively contains it (and
 * the reverse: a `when`-row's concept down to its contained sub-concepts). Pure graph math over Slice 1's
 * `CrlConceptNode.definitionRefs` (the DIRECT forward edges: concept → the concepts it's defined in terms of). Cycle-
 * guarded (a mutual `A↔B` definition terminates), self-excluded, first-discovery order. Headless — no correspondence,
 * structure, or vscode dependency; the cockpit's reveal maps consume the precomputed result.
 */
import type { CrlConceptNode } from "./crlConceptLayer";

export interface ConceptContainment {
  /** concept key → its transitive CONTAINER keys (concepts whose `defined as`/`definition is` transitively reaches it) —
   *  i.e. the ancestors. Used to resolve a sub-concept UP to the `when` whose concept contains it. */
  containersOf: Map<string, string[]>;
  /** concept key → the transitive keys it is defined in terms of (its descendants) — used to resolve a `when`'s concept
   *  DOWN to its contained sub-concepts. */
  containedBy: Map<string, string[]>;
}

/** BFS the adjacency from `start`, excluding `start` itself; first-discovery order; cycle-safe (visited set). */
function closure(start: string, adj: Map<string, string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([start]); // self-excluded (a self-loop A→A yields [])
  const queue = [...(adj.get(start) ?? [])];
  while (queue.length) {
    const k = queue.shift() as string;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    for (const n of adj.get(k) ?? []) if (!seen.has(n)) queue.push(n);
  }
  return out;
}

export function buildConceptContainment(conceptLayer: CrlConceptNode[]): ConceptContainment {
  const forward = new Map<string, string[]>(); // key → directly defined in terms of (definitionRefs)
  const reverse = new Map<string, string[]>(); // key → concepts that directly reference it
  for (const c of conceptLayer) {
    if (forward.has(c.nodeKey)) continue; // first-wins on a duplicate (invalid) decl — matches conceptByKey
    forward.set(c.nodeKey, c.definitionRefs);
    for (const ref of c.definitionRefs) {
      const arr = reverse.get(ref);
      if (arr) arr.push(c.nodeKey);
      else reverse.set(ref, [c.nodeKey]);
    }
  }
  // Note: a `definitionRef` may name a concept that's not itself in the layer (e.g. a location-less decl, skipped by
  // buildCrlConceptLayer) → a closure list can contain a dangling key. Consumers null-coalesce + the node-returning
  // helper (conceptNodesForRow) filters to conceptByKey, so dangling keys are harmless.
  const containedBy = new Map<string, string[]>();
  const containersOf = new Map<string, string[]>();
  for (const c of conceptLayer) {
    containedBy.set(c.nodeKey, closure(c.nodeKey, forward));
    containersOf.set(c.nodeKey, closure(c.nodeKey, reverse));
  }
  return { containersOf, containedBy };
}
