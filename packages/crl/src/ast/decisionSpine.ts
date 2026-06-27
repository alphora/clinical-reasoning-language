import type {
  ActionStatement,
  BlockBody,
  BranchBlock,
  Decision,
  OtherwiseBlock,
  ReferenceName,
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
 * RECURSION (`use decision`, #172 todo-2): when a lib-aware `resolve` is supplied, a `use decision` action whose target
 * RESOLVES (same-library BARE, or cross-library QUALIFIED — not already on the delegation path → cycle-guarded keyed
 * `(lib,name)`) has its target's body recursed UNDER the use-decision action's nodeId — so Sub's branches become
 * `…/action[j]/when[0]`, `…/action[j]/otherwise`, etc. A cross-library sub recurses in ITS OWN library (the resolver
 * returns `resolved.lib`), so a future `A.Sub`/`B.Sub` cannot false-collide in the cycle guard. Without `resolve`, no
 * recursion = the original (pre-recursion) standalone behavior (the provenance index / crlStructure callers). The CRE
 * trace + view-model thread an identical resolver so all three walks stay byte-identical (the golden parity invariant).
 */

export type SpineNodeKind = "when" | "otherwise" | "action";

export interface SpineNode {
  nodeId: string; // decision-local childId path: when[0], when[0]/action[1], otherwise, ...
  kind: SpineNodeKind;
  node: WhenBlock | OtherwiseBlock | ActionStatement;
}

export type DecisionResolver = (name: string) => Decision | undefined;

/**
 * A resolved `use decision` target plus the library + source file it belongs to — the shape the cross-library frame
 * (#172 todo-2) is built from. Lives HERE in ast/ (not in cre/decisionResolver) so the ast-layer surfaces (decisionArms,
 * decisionSpine) can recurse cross-library without an ast→cre dependency; `cre/decisionResolver.ts` ResolvedDecision is
 * structurally identical and assignable to it.
 */
export interface ResolvedDecisionRef {
  decision: Decision;
  /** The library that OWNS this decision (the frame `currentLib` when it is recursed). */
  lib: string;
  /** Absolute path of the owning library's CRL file (the frame `currentFilePath` — for spans/VM). */
  filePath: string;
}

/**
 * The lib-aware `use decision` resolver shared by all four surfaces (#172 todo-2): a BARE ref resolves against
 * `callerLib`, a QUALIFIED ref against its explicit library, over the WHOLE resolved graph. Returns `undefined` when the
 * target library/name is not in the graph (→ an unresolved-cross-lib diagnostic). The structural surfaces (spine, VM)
 * accept this OPTIONALLY — when absent (provenance index / crlStructure callers) a `use decision` stays a non-recursive
 * leaf, the original standalone behavior.
 */
export type LibAwareDecisionResolver = (
  callerLib: string,
  ref: ReferenceName,
) => ResolvedDecisionRef | undefined;

/**
 * The delegation cycle guard is keyed `idOf(lib, name)` (#172) — not the bare name — so a cross-library `A.Sub`/`B.Sub`
 * can't false-collide. `rootLib` is the covered/owning library the walk starts in; a cross-library sub recurses under
 * `resolved.lib` (the resolver's owning library), so the key tracks the REAL library of each frame. `rootLib` defaults to
 * `""` so the non-recursive callers (provenance index, crlStructure — no `resolve`) are unaffected; within a single
 * non-recursive walk the lib prefix is uniform, so the value is immaterial there.
 */
export function decisionSpine(
  decision: Decision,
  resolve?: LibAwareDecisionResolver,
  rootLib = "",
): SpineNode[] {
  const out: SpineNode[] = [];
  walkBranches(
    decision.body.statements,
    "",
    out,
    resolve,
    rootLib,
    new Set([idOf(rootLib, decision.name)]),
  );
  return out;
}

function walkBranches(
  branches: BranchBlock[],
  parentId: string,
  out: SpineNode[],
  resolve: LibAwareDecisionResolver | undefined,
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
  resolve: LibAwareDecisionResolver | undefined,
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

/**
 * Emit the action node, then — for a RESOLVABLE `use decision` target (same-library BARE or cross-library QUALIFIED) —
 * recurse the sub-decision's body under it, IN THE SUB'S OWN LIBRARY (`resolved.lib`). Cycle-guarded keyed `(lib,name)`.
 * Without a resolver (provenance index / crlStructure) the action stays a leaf.
 */
function pushAction(
  stmt: ActionStatement,
  nodeId: string,
  out: SpineNode[],
  resolve: LibAwareDecisionResolver | undefined,
  currentLib: string,
  stack: Set<string>,
): void {
  out.push({ nodeId, kind: "action", node: stmt });
  if (!resolve || stmt.action.type !== "UseDecision") return;
  // Resolve via the lib-aware resolver: a BARE target binds in `currentLib`, a QUALIFIED target in its explicit library
  // (#172 todo-2 — the cross-library deferral guard is GONE). An unresolved target stays a leaf (no body to recurse).
  const resolved = resolve(currentLib, stmt.action.decisionName);
  if (!resolved) return;
  // Cycle key is `(lib,name)` of the RESOLVED owning library — cross-library `A.Sub`/`B.Sub` are distinct keys.
  const subId = idOf(resolved.lib, resolved.decision.name);
  if (stack.has(subId)) return;
  // Recurse in the SUB'S library so its own bare `use decision` targets resolve there.
  walkBranches(
    resolved.decision.body.statements,
    nodeId,
    out,
    resolve,
    resolved.lib,
    new Set([...stack, subId]),
  );
}
