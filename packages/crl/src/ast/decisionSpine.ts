import type {
  ActionStatement,
  BlockBody,
  BranchBlock,
  Decision,
  OtherwiseBlock,
  WhenBlock,
  WhenBlockBody,
} from "./types";

/**
 * Construct a decision-local child node id: `/`-delimited path (parent "" → bare segment). Single source of the id
 * format shared by the CRE runtime trace, the scenario view-model, and the static spine — all must agree byte-for-byte.
 * (Lives in ast/ so cre/ imports it in the natural layer direction; cre/run re-exports it for existing consumers.)
 */
export const childId = (parent: string, seg: string): string => (parent ? `${parent}/${seg}` : seg);

/**
 * Static decision spine (provenance spec §5). Walks a Decision's full AST tree — ALL branches and actions, evaluated
 * or not — and assigns each sub-node the SAME `childId` path the CRE/scenario view-model assigns. Provenance addresses
 * decision sub-nodes (`CrlNodeRef.nodeId`) by these paths, so they MUST stay byte-identical to the view-model; that
 * invariant is pinned by a golden id-parity test (decisionSpine.test) rather than by refactoring the view-model.
 *
 * This is the STATIC counterpart to the CRE runtime trace (which walks only reached-for-given-facts paths) and mirrors
 * the view-model's full walk structure (run.ts/viewModel.ts walkBranchesVM/walkBodyVM) — root parentId "", `when[i]`
 * counting `otherwise` positions, `action[0]` for an inline action, `action[j]` for a menu, nested branches reusing the
 * parent id.
 */

export type SpineNodeKind = "when" | "otherwise" | "action";

export interface SpineNode {
  nodeId: string; // decision-local childId path: when[0], when[0]/action[1], otherwise, ...
  kind: SpineNodeKind;
  node: WhenBlock | OtherwiseBlock | ActionStatement;
}

export function decisionSpine(decision: Decision): SpineNode[] {
  const out: SpineNode[] = [];
  walkBranches(decision.body.statements, "", out);
  return out;
}

function walkBranches(branches: BranchBlock[], parentId: string, out: SpineNode[]): void {
  branches.forEach((b, i) => {
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      out.push({ nodeId, kind: "otherwise", node: b });
      walkBody(b.body, nodeId, out);
    } else {
      const nodeId = childId(parentId, `when[${i}]`);
      out.push({ nodeId, kind: "when", node: b });
      walkBody(b.body, nodeId, out);
    }
  });
}

function walkBody(body: WhenBlockBody, parentId: string, out: SpineNode[]): void {
  if (body.type === "ActionStatement") {
    out.push({ nodeId: childId(parentId, "action[0]"), kind: "action", node: body });
    return;
  }
  const block = body as BlockBody;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch) {
    walkBranches(block.statements as BranchBlock[], parentId, out);
    return;
  }
  (block.statements as ActionStatement[]).forEach((stmt, j) => {
    out.push({ nodeId: childId(parentId, `action[${j}]`), kind: "action", node: stmt });
  });
}
