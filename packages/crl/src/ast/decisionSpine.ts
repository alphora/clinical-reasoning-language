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
 * Injective key over a (library, name) pair — the shared identity used across the CRE trace, the static spine, the
 * view-model, the transitive-arms walk, and the global decision resolver (#172). Names contain spaces (e.g. "Documented
 * Nonunion"), so a space-joined key would collide ("A B"+"C" vs "A"+"B C"); JSON makes it injective. The only consumer
 * that parses a key back is `nameOf` (below) — kept co-located + tested so the encoding is an explicit contract.
 * Single-sourced HERE (ast/ layer) so cre/run, decisionArms, viewModel, and the resolver all key identically — a
 * divergence would let `A.Sub` and `B.Sub` false-collide in a cross-library cycle guard (the #172 hazard).
 */
export const idOf = (lib: string, name: string): string => JSON.stringify([lib, name]);

/**
 * Inverse of `idOf` — recover the NAME from a `(lib, name)` key. The delegation-cycle diagnostic renders its chain by
 * name; co-locating this TESTED inverse next to `idOf` makes the encoding a pinned contract (`nameOf(idOf(l, n)) === n`)
 * instead of a fragile JSON-parse far from its origin.
 */
export const nameOf = (id: string): string => (JSON.parse(id) as [string, string])[1];

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

/**
 * The delegation cycle guard is keyed `idOf(lib, name)` (#172) — not the bare name — so a future cross-library
 * `A.Sub`/`B.Sub` can't false-collide. `rootLib` is the covered/owning library; it stays CONSTANT through this walk
 * because the cross-library guard (`getRefLibrary → leaf`) is UNTOUCHED in todo-1 (only same-library targets recurse).
 * For same-library that makes `idOf(rootLib, name)` a 1:1 rename of the old bare-name key → byte-identical cycle
 * detection. `rootLib` defaults to `""` so existing/non-recursive callers (provenance index, crlStructure) are
 * unaffected — within a single walk the lib prefix is uniform, so detection is identical regardless of its value.
 */
export function decisionSpine(decision: Decision, resolve?: DecisionResolver, rootLib = ""): SpineNode[] {
  const out: SpineNode[] = [];
  walkBranches(decision.body.statements, "", out, resolve, rootLib, new Set([idOf(rootLib, decision.name)]));
  return out;
}

function walkBranches(
  branches: BranchBlock[],
  parentId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  currentLib: string,
  stack: Set<string>,
): void {
  branches.forEach((b, i) => {
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      out.push({ nodeId, kind: "otherwise", node: b });
      walkBody(b.body, nodeId, out, resolve, currentLib, stack);
    } else {
      const nodeId = childId(parentId, `when[${i}]`);
      out.push({ nodeId, kind: "when", node: b });
      walkBody(b.body, nodeId, out, resolve, currentLib, stack);
    }
  });
}

function walkBody(
  body: WhenBlockBody,
  parentId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  currentLib: string,
  stack: Set<string>,
): void {
  if (body.type === "ActionStatement") {
    pushAction(body, childId(parentId, "action[0]"), out, resolve, currentLib, stack);
    return;
  }
  const block = body as BlockBody;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch) {
    walkBranches(block.statements as BranchBlock[], parentId, out, resolve, currentLib, stack);
    return;
  }
  (block.statements as ActionStatement[]).forEach((stmt, j) => {
    pushAction(stmt, childId(parentId, `action[${j}]`), out, resolve, currentLib, stack);
  });
}

/** Emit the action node, then — for a same-library `use decision` target — recurse the sub-decision's body under it. */
function pushAction(
  stmt: ActionStatement,
  nodeId: string,
  out: SpineNode[],
  resolve: DecisionResolver | undefined,
  currentLib: string,
  stack: Set<string>,
): void {
  out.push({ nodeId, kind: "action", node: stmt });
  if (!resolve || stmt.action.type !== "UseDecision") return;
  // Recurse ONLY a bare (same-library) target not already on the delegation path. Qualified → cross-library (leaf).
  // (todo-1: this DEFERRAL GUARD is UNTOUCHED — todo-2 lifts it to recurse cross-library into the sub's lib frame.)
  if (getRefLibrary(stmt.action.decisionName)) return;
  const name = getRefName(stmt.action.decisionName);
  // Cycle key is `(lib,name)` (#172). Same-library → `currentLib` is constant, so this is the old bare-name key renamed.
  if (stack.has(idOf(currentLib, name))) return;
  const sub = resolve(name);
  if (!sub) return;
  walkBranches(sub.body.statements, nodeId, out, resolve, currentLib, new Set([...stack, idOf(currentLib, name)]));
}
