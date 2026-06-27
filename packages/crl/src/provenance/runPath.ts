/**
 * Shared "run path" primitives — the ONE definition of "what a CEL case's run path is", consumed by BOTH the
 * provenance↔cockpit correspondence check (correspondenceCheck.ts) AND the disposition-path scaffold generator
 * (generate.ts). Moved verbatim out of correspondenceCheck.ts (#174 disc 149): a second copy in generate.ts would
 * let the two drift, so the round-trip (generate a disposition-path scaffold → the FINAL gate verifies it) would no
 * longer be honest. The util imports nothing from either consumer (no cycle).
 *
 * A case's run path is: collectProduced (the produced-action ViewNodes in the scenario tree) → for each, the inclusive
 * `/`-prefix ancestor chain of its decision-local nodeId. ViewNode is DUCK-TYPED here (the scenario VM contract) so
 * this module's only `cre` coupling stays structural.
 */

/** The inclusive `/`-prefix ancestor chain of a decision-local nodeId (`a/b/c` → [a, a/b, a/b/c]). */
export function ancestorChain(nodeId: string): string[] {
  const segs = nodeId.split("/");
  return segs.map((_, i) => segs.slice(0, i + 1).join("/"));
}

/** Walk a ViewNode tree (recursing children) collecting the PRODUCED action nodes. ViewNode is duck-typed here (the
 *  scenario VM contract) to keep this module's only `cre` coupling structural. */
export interface MinimalViewNode {
  nodeId: string;
  kind: string;
  action?: { produced?: boolean };
  children?: MinimalViewNode[];
}

export function collectProduced(nodes: MinimalViewNode[], out: MinimalViewNode[]): void {
  for (const n of nodes) {
    if (n.kind === "action" && n.action?.produced === true) out.push(n);
    if (n.children) collectProduced(n.children, out);
  }
}
