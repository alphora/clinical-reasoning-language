/**
 * CRL-structure view-model (three-pane viewer C2b-1, #156). The STATIC decision tree with human labels but NO run-state,
 * built on the shared `decisionSpine` walker. Each node carries the SAME `nodeKey` the provenance indexer assigns
 * (`indexer.ts` — via the shared `decisionSubNodeRef`/`decisionDeclRef`/`lsLoc` so keys + locations cannot drift), so a
 * shell can join a structure node → its correspondence unit (cross-pane reveal) by `nodeKey`, and → run-state by
 * `nodeId`+decision. Pure + headless; the rendering, engine, and cross-pane wiring are C2b-2/3/4.
 *
 * Inventories ALL decisions the indexer inventories (covered policy + every registry library), NOT the reachability
 * closure — a source viewer must not silently drop an authored-but-unreached decision.
 */
import { decisionSpine, type SpineNodeKind } from "../ast/decisionSpine";
import type { ActionStatement, WhenBlock } from "../ast/types";
import { getRefName } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type { LsLocation } from "../language-services/contracts";

import { collectLibs, decisionDeclRef, decisionSubNodeRef, lsLoc, nodeKey } from "./indexer";
import { isStrictAncestor } from "./validators";

export type CrlNodeKind = SpineNodeKind; // "when" | "otherwise" | "action"
export type CrlActionKind = "recommend-activity" | "use-decision"; // matches the scenario VM's ActionKind vocabulary

export interface CrlStructureNode {
  nodeKey: string;
  nodeId: string; // decision-local childId path (when[0], when[0]/action[1], otherwise, …)
  decision: string;
  lib: string;
  kind: CrlNodeKind;
  label: string;
  actionKind?: CrlActionKind; // present iff kind === "action"
  location: LsLocation; // always present: location-less nodes are skipped (mirrors the indexer) to keep nodeKey parity
  children: CrlStructureNode[];
}

export interface CrlDecisionStructure {
  decision: string;
  lib: string;
  nodeKey: string; // the decision-level key (no nodeId)
  location: LsLocation;
  children: CrlStructureNode[];
}

function labelOf(kind: CrlNodeKind, node: WhenBlock | ActionStatement | { type: string }): string {
  if (kind === "when") return `when ${getRefName((node as WhenBlock).conceptName)}`;
  if (kind === "otherwise") return "otherwise";
  const a = (node as ActionStatement).action;
  return getRefName(a.type === "RecommendActivity" ? a.activityName : a.decisionName);
}

function actionKindOf(node: ActionStatement): CrlActionKind {
  return node.action.type === "RecommendActivity" ? "recommend-activity" : "use-decision";
}

/**
 * Re-nest a PRE-ORDER flat node list into a tree by NEAREST strict ancestor (longest `/`-prefix). Stack-based O(n):
 * pop until the top is a strict ancestor of the current node (its immediate parent, given pre-order), attach, push.
 * Sibling order = emission order. (isStrictAncestor identifies AN ancestor; the stack discipline picks the nearest.)
 */
function nest(flat: CrlStructureNode[]): CrlStructureNode[] {
  const roots: CrlStructureNode[] = [];
  const stack: CrlStructureNode[] = [];
  for (const n of flat) {
    while (stack.length && !isStrictAncestor(stack[stack.length - 1].nodeId, n.nodeId)) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(n);
    else roots.push(n);
    stack.push(n);
  }
  return roots;
}

export function buildCrlStructure(
  graph: ResolvedCelGraph,
  opts?: { sharedLibraries?: string[] },
): CrlDecisionStructure[] {
  const { libs, coversName } = collectLibs(graph, opts);
  if (!coversName) return []; // no policy anchor → empty (defensive, mirrors the index)

  const out: CrlDecisionStructure[] = [];
  for (const [lib, info] of libs) {
    // Iterate the AST statements directly (SOURCE order, deterministic) + filter to decisions — NOT the by-name decls
    // map (which would order by first-name-appearance and could be perturbed by a cross-kind same-name declaration).
    for (const s of info.entry.ast.statements) {
      if (s.type !== "Decision") continue;
      const name = s.name;
      const declLoc = lsLoc(info.entry.filePath, s.location);
      if (!declLoc) continue; // mirror the indexer: a location-less decl is not inventoried (keeps nodeKey parity)
      const flat: CrlStructureNode[] = [];
      for (const sn of decisionSpine(s)) {
        const location = lsLoc(info.entry.filePath, sn.node.location);
        if (!location) continue; // mirror the indexer's per-sub-node skip
        flat.push({
          nodeKey: nodeKey(decisionSubNodeRef(lib, name, sn.nodeId)),
          nodeId: sn.nodeId,
          decision: name,
          lib,
          kind: sn.kind,
          label: labelOf(sn.kind, sn.node),
          ...(sn.kind === "action" ? { actionKind: actionKindOf(sn.node as ActionStatement) } : {}),
          location,
          children: [],
        });
      }
      out.push({
        decision: name,
        lib,
        nodeKey: nodeKey(decisionDeclRef(lib, name)),
        location: declLoc,
        children: nest(flat),
      });
    }
  }
  return out;
}
