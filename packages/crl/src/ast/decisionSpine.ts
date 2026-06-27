import type {
  ActionStatement,
  BlockBody,
  BranchBlock,
  Decision,
  OtherwiseBlock,
  WhenBlock,
  WhenBlockBody,
} from "./types";
import { getRefLibrary, getRefName } from "./types";

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
 *
 * RECURSION (same-library `use decision`): when `resolve` is supplied, a `use decision "Sub"` action whose target is a
 * BARE same-library decision (not already on the delegation path → cycle-guarded) has its target's body recursed UNDER
 * the use-decision action's nodeId — so Sub's branches become `…/action[j]/when[0]`, `…/action[j]/otherwise`, etc. A
 * QUALIFIED (cross-library) target stays a leaf (transitive evaluation deferred). Without `resolve`, no recursion =
 * the original (pre-recursion) behavior. The CRE trace + view-model thread an identical resolver so all three walks
 * stay byte-identical.
 */

export type SpineNodeKind = "when" | "otherwise" | "action";

export interface SpineNode {
  nodeId: string; // decision-local childId path: when[0], when[0]/action[1], otherwise, ...
  kind: SpineNodeKind;
  node: WhenBlock | OtherwiseBlock | ActionStatement;
}

export type DecisionResolver = (name: string) => Decision | undefined;

export function decisionSpine(decision: Decision, resolve?: DecisionResolver): SpineNode[] {
  const out: SpineNode[] = [];
  walkBranches(decision.body.statements, "", out, resolve, new Set([decision.name]));
  return out;
}

function walkBranches(
  branches: BranchBlock[],
  parentId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  stack: Set<string>,
): void {
  branches.forEach((b, i) => {
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      out.push({ nodeId, kind: "otherwise", node: b });
      walkBody(b.body, nodeId, out, resolve, stack);
    } else {
      const nodeId = childId(parentId, `when[${i}]`);
      out.push({ nodeId, kind: "when", node: b });
      walkBody(b.body, nodeId, out, resolve, stack);
    }
  });
}

function walkBody(
  body: WhenBlockBody,
  parentId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  stack: Set<string>,
): void {
  if (body.type === "ActionStatement") {
    pushAction(body, childId(parentId, "action[0]"), out, resolve, stack);
    return;
  }
  const block = body as BlockBody;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch) {
    walkBranches(block.statements as BranchBlock[], parentId, out, resolve, stack);
    return;
  }
  (block.statements as ActionStatement[]).forEach((stmt, j) => {
    pushAction(stmt, childId(parentId, `action[${j}]`), out, resolve, stack);
  });
}

/** Emit the action node, then — for a same-library `use decision` target — recurse the sub-decision's body under it. */
function pushAction(
  stmt: ActionStatement,
  nodeId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  stack: Set<string>,
): void {
  out.push({ nodeId, kind: "action", node: stmt });
  if (!resolve || stmt.action.type !== "UseDecision") return;
  // Recurse ONLY a bare (same-library) target not already on the delegation path. Qualified → cross-library (leaf).
  if (getRefLibrary(stmt.action.decisionName)) return;
  const name = getRefName(stmt.action.decisionName);
  if (stack.has(name)) return;
  const sub = resolve(name);
  if (!sub) return;
  walkBranches(sub.body.statements, nodeId, out, resolve, new Set([...stack, name]));
}
