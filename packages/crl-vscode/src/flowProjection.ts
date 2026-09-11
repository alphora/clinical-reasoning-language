import type { CrlDecisionStructure, CrlStructureNode, ViewNode } from "@smile-digital-health/crl";

export type ProjectedFlowNode = CrlStructureNode & {
  children: ProjectedFlowNode[];
  incomingOutcome?: "Yes" | "No";
};

/** Display graph only. Source identities and the evaluator's tree remain unchanged. */
export function projectFlowBranches(nodes: CrlStructureNode[], qualifier?: "first" | "all" | "any"): ProjectedFlowNode[] {
  const projected: ProjectedFlowNode[] = nodes.map(n => ({
    ...n,
    children: projectFlowBranches(n.children, n.childrenQualifier).map(c =>
      n.kind === "when" ? { ...c, incomingOutcome: "Yes" as const } : c),
  }));
  // Otherwise is legal only in first. This also supports older static-view inputs that
  // predate explicit block metadata. Without either signal, preserve the input forest.
  const ordered = qualifier === "first" || (qualifier === undefined && nodes.some(n => n.kind === "otherwise"));
  if (!ordered || !projected.every(n => n.kind === "when" || n.kind === "otherwise")) return projected;
  let next: ProjectedFlowNode | undefined;
  for (let i = projected.length - 1; i >= 0; i--) {
    const node = projected[i];
    if (node.kind === "otherwise") {
      // Keep the fallback identity as a compact No connector label: selection and
      // existing per-occurrence review verdicts must remain addressable.
      node.label = "No";
    } else if (next) {
      node.children.push({ ...next, incomingOutcome: "No" });
    }
    next = node;
  }
  return next ? [next] : [];
}

export function projectFlowStructure(structure: CrlDecisionStructure[]): CrlDecisionStructure[] {
  return structure.map(d => ({ ...d, children: projectFlowBranches(d.children, d.childrenQualifier) }));
}

/** Only execution evidence paints a condition. Whole-case concept values cannot
 * establish that an unreached condition was tested, or which route was taken. */
export function conditionTruthKeys(nodes: ViewNode[], resolve: (id: string) => string | undefined): { key: string; result: "true" | "false" | "unknown" }[] {
  const marks: { key: string; result: "true" | "false" | "unknown" }[] = [];
  const walk = (nodes: ViewNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "when" && n.evaluated && !n.invalidated && !n.publicationErrors?.length) {
        const key = resolve(n.nodeId);
        const value = n.condition?.satisfied;
        if (key && (n.unknown || typeof value === "boolean")) marks.push({ key, result: n.unknown ? "unknown" : value ? "true" : "false" });
      }
      if (n.evaluated && !n.invalidated) walk(n.children ?? []);
    }
  };
  walk(nodes);
  return marks;
}
