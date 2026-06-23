/**
 * AST provenance indexer (provenance spec §5). Builds, over a `.cel`'s covered CRL closure, the index the provenance
 * artifact + its validators (T4.4/T4.5) consume:
 *  - `nodes`: the inventory of every indexable node (declarations + every decision sub-node) — the over-reach denominator.
 *  - `decisionReachability`: STATIC reachability (all branches, not the CRE runtime trace) from the policy's decisions.
 *  - `resolveCrlNodeRef`, `nodeKindOf`, `ownershipOf`, `isDecisionReached`.
 *
 * Two phases: (1) ownership (manifest `crl.sharedLibraries` + package-origin, anchored on `coversTarget`); (2) the node
 * inventory + reachability (via the shared `decisionSpine` walker). Pure except an optional manifest read (overridable).
 *
 * v1 reference resolution is LOCAL-FIRST by library name (byNameLocal ?? byNamePackage). Include-aware scope resolution
 * (buildLibraryScopes — a qualified ref from an including lib resolving to a package over a same-name local) is deferred;
 * it is safe for the current corpus (no package libs; vendored shared libs are local siblings, no name collisions).
 *
 * decisionReachability `edges` are REPRESENTATIVE reaching paths (one per first-expansion within a seed), not exhaustive;
 * `reachedBy` (decision-level) IS complete across seeds — that is the boolean §9.2 consumers rely on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { decisionSpine } from "../ast/decisionSpine";
import type {
  Activity,
  Concept,
  CompositionExpression,
  Decision,
  NarrativeElement,
  ArgValue,
  ReferenceName,
  Statement,
  Location,
} from "../ast/types";
import { getRefName, getRefLibrary } from "../ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import type { RegistryEntry } from "../imports/types";
import type { LsLocation, ZeroBasedRange } from "../language-services/contracts";
import { toZeroBasedRange } from "../language-services/contracts";

import type { NodeKind, Ownership } from "./artifact";

export type DeclKind = "concept" | "decision" | "activity" | "terminology" | "parameter";
const STATEMENT_KIND: Partial<Record<Statement["type"], DeclKind>> = {
  Concept: "concept",
  Decision: "decision",
  Activity: "activity",
  Terminology: "terminology",
  Parameter: "parameter",
};

/** Structural reachability relation (how the spine references the node) — DISTINCT from the artifact's authoring-intent `relation`. */
export type StructuralRelation =
  | "when-condition"
  | "guard"
  | "recommend"
  | "use-decision"
  | "composition-operand"
  | "definition-narrative"
  | "activity-dependency"
  | "spine-member"; // a sub-node (or the decl) of a reached decision is itself decision-reached

export interface ProvNodeRef {
  lib: string;
  kind: string;
  name: string;
  nodeId?: string;
}

export interface IndexedCrlNode {
  ref: ProvNodeRef;
  declKind: DeclKind; // intrinsic (a decision sub-node is declKind "decision")
  nodeKind: NodeKind; // §5 derived (shared-reference override applied)
  ownership: Ownership;
  location: LsLocation;
}

export interface ReachEdge {
  fromDecision: string; // NodeKey of the seeding decision declaration
  fromNodeId: string; // the spine sub-node the ref sits on ("" = the decision root, for spine-member)
  relation: StructuralRelation;
  via?: string; // NodeKey of the intermediate node (e.g. the concept whose composition reached this operand)
}
export interface ReachInfo {
  reachedBy: Set<string>; // decision NodeKeys (complete across seeds)
  edges: ReachEdge[]; // representative paths
}

export type ProvenanceDiagnosticKind =
  | "manifest-unreadable"
  | "shared-libraries-not-array"
  | "undeclared-library-ownership"
  | "no-policy-anchor";

export interface ProvenanceIndexDiagnostic {
  kind: ProvenanceDiagnosticKind;
  message: string;
}

export type Resolved = LsLocation;
export type Unresolved = { unresolved: true; reason: string };

export interface ProvenanceIndex {
  nodes: Map<string, IndexedCrlNode>;
  decisionReachability: Map<string, ReachInfo>;
  diagnostics: ProvenanceIndexDiagnostic[];
  resolveCrlNodeRef(ref: ProvNodeRef): Resolved | Unresolved;
  nodeKindOf(ref: ProvNodeRef): NodeKind | undefined;
  ownershipOf(ref: ProvNodeRef): Ownership | undefined;
  isDecisionReached(ref: ProvNodeRef): boolean;
}

export const nodeKey = (ref: ProvNodeRef): string =>
  JSON.stringify([ref.lib, ref.kind, ref.name, ref.nodeId ?? null]);

const collapseToStart = (r: ZeroBasedRange): ZeroBasedRange => ({
  startLine: r.startLine,
  startCol: r.startCol,
  endLine: r.startLine,
  endCol: r.startCol,
});

interface DeclEntry {
  kind: DeclKind;
  node: Statement;
}
interface LibInfo {
  entry: RegistryEntry;
  ownership: Ownership;
  decls: Map<string, DeclEntry[]>; // by name → all decls (a name may exist across kinds, e.g. concept + activity)
}

function emptyIndex(diagnostics: ProvenanceIndexDiagnostic[]): ProvenanceIndex {
  return {
    nodes: new Map(),
    decisionReachability: new Map(),
    diagnostics,
    resolveCrlNodeRef: (ref) => ({
      unresolved: true,
      reason: `No node for ${nodeKey(ref)} (empty index)`,
    }),
    nodeKindOf: () => undefined,
    ownershipOf: () => undefined,
    isDecisionReached: () => false,
  };
}

function readManifestShared(
  projectRoot: string | undefined,
  diags: ProvenanceIndexDiagnostic[],
): string[] {
  if (!projectRoot) return [];
  let raw: string;
  try {
    raw = readFileSync(join(projectRoot, "package.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return []; // no package.json — silent (a project may lack one)
    diags.push({
      kind: "manifest-unreadable",
      message: "package.json could not be read; ignoring crl.sharedLibraries.",
    });
    return [];
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    diags.push({
      kind: "manifest-unreadable",
      message: "package.json is not valid JSON; ignoring crl.sharedLibraries.",
    });
    return [];
  }
  const shared = (pkg as { crl?: { sharedLibraries?: unknown } })?.crl?.sharedLibraries;
  if (shared === undefined) return [];
  if (!Array.isArray(shared) || shared.some((s) => typeof s !== "string")) {
    diags.push({
      kind: "shared-libraries-not-array",
      message: "package.json crl.sharedLibraries must be a string[]; ignoring.",
    });
    return [];
  }
  return shared as string[];
}

export function buildProvenanceIndex(
  graph: ResolvedCelGraph,
  opts?: { sharedLibraries?: string[] },
): ProvenanceIndex {
  const diagnostics: ProvenanceIndexDiagnostic[] = [];
  const nodes = new Map<string, IndexedCrlNode>();
  const decisionReachability = new Map<string, ReachInfo>();

  const shared = opts?.sharedLibraries ?? readManifestShared(graph.projectRoot, diagnostics);
  const sharedSet = new Set(shared);
  const coversName = graph.coversTarget?.name ?? null;

  // Degenerate input: with no resolved policy anchor there is no ownership basis — return an EMPTY index + diagnostic
  // rather than inventorying the whole registry as (misleadingly) policy-owned.
  if (!coversName) {
    diagnostics.push({
      kind: "no-policy-anchor",
      message: "No resolved coversTarget with a name; provenance index is empty.",
    });
    return emptyIndex(diagnostics);
  }

  // ── gather libs (coversTarget + every registry library), dedup by name ──
  const libs = new Map<string, LibInfo>();
  const addLib = (entry: RegistryEntry): void => {
    if (!entry.name || libs.has(entry.name)) return;
    const isShared = sharedSet.has(entry.name) || entry.origin === "package";
    const ownership: Ownership = isShared ? "shared-reference" : "policy-owned";
    const decls = new Map<string, DeclEntry[]>();
    for (const s of entry.ast.statements) {
      const kind = STATEMENT_KIND[s.type];
      if (!kind || !s.name) continue;
      const arr = decls.get(s.name);
      if (arr) arr.push({ kind, node: s });
      else decls.set(s.name, [{ kind, node: s }]);
    }
    libs.set(entry.name, { entry, ownership, decls });
    // Warn on a local lib that is neither the covered policy nor declared shared (silent policy-owned → false over-reach).
    if (entry.origin === "local" && entry.name !== coversName && !sharedSet.has(entry.name)) {
      diagnostics.push({
        kind: "undeclared-library-ownership",
        message: `Local library "${entry.name}" is neither the covered policy nor in crl.sharedLibraries; defaulting to policy-owned (add it to crl.sharedLibraries only if shared).`,
      });
    }
  };
  if (graph.coversTarget) addLib(graph.coversTarget);
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNameLocal.values()) addLib(e);
    for (const e of graph.crlRegistry.byNamePackage.values()) addLib(e);
  }

  const lsLoc = (filePath: string, loc: Location | undefined): LsLocation | undefined =>
    loc ? { filePath, range: collapseToStart(toZeroBasedRange(loc)) } : undefined;

  const intrinsicNodeKind = (declKind: DeclKind, node: Statement): NodeKind => {
    switch (declKind) {
      case "terminology":
        return "terminology";
      case "parameter":
        return "parameter";
      case "activity":
        return "leaf";
      case "decision":
        return "decision-node";
      case "concept":
        return (node as Concept).definition?.type === "DefinedAsDefinition"
          ? "composition"
          : "leaf";
    }
  };

  // ── PHASE 2a: inventory ALL declarations (every kind, incl. cross-kind same-name) + decision sub-nodes ──
  for (const [libName, info] of libs) {
    for (const [name, entries] of info.decls) {
      for (const { kind, node } of entries) {
        const loc = lsLoc(info.entry.filePath, (node as { location?: Location }).location);
        if (!loc) continue;
        const ref: ProvNodeRef = { lib: libName, kind, name };
        const nodeKindV: NodeKind =
          info.ownership === "shared-reference"
            ? "shared-reference"
            : intrinsicNodeKind(kind, node);
        nodes.set(nodeKey(ref), {
          ref,
          declKind: kind,
          nodeKind: nodeKindV,
          ownership: info.ownership,
          location: loc,
        });
        if (kind === "decision") {
          for (const sn of decisionSpine(node as Decision)) {
            const snRef: ProvNodeRef = { lib: libName, kind: "decision", name, nodeId: sn.nodeId };
            const snLoc = lsLoc(info.entry.filePath, sn.node.location);
            if (!snLoc) continue;
            nodes.set(nodeKey(snRef), {
              ref: snRef,
              declKind: "decision",
              nodeKind:
                info.ownership === "shared-reference" ? "shared-reference" : "decision-node",
              ownership: info.ownership,
              location: snLoc,
            });
          }
        }
      }
    }
  }

  // ── ref resolution (local-first; acceptable-kinds per slot so a cross-kind same-name resolves the RIGHT kind) ──
  const resolveRef = (
    ref: ReferenceName,
    containingLib: string,
    acceptable: readonly DeclKind[],
  ): { lib: string; kind: DeclKind; name: string; node: Statement } | undefined => {
    const targetLib = getRefLibrary(ref) ?? containingLib;
    const name = getRefName(ref);
    const entries = libs.get(targetLib)?.decls.get(name);
    if (!entries) return undefined;
    for (const want of acceptable) {
      const d = entries.find((e) => e.kind === want); // precedence = acceptable order (concept-first for narrative)
      if (d) return { lib: targetLib, kind: d.kind, name, node: d.node };
    }
    return undefined;
  };

  // ── PHASE 2b: static reachability, seeded from the covered policy's decisions ──
  const recordEdge = (targetKey: string, edge: ReachEdge): void => {
    let info = decisionReachability.get(targetKey);
    if (!info) {
      info = { reachedBy: new Set(), edges: [] };
      decisionReachability.set(targetKey, info);
    }
    info.reachedBy.add(edge.fromDecision);
    info.edges.push(edge);
  };

  const compositionRefs = (expr: CompositionExpression, out: ReferenceName[]): void => {
    switch (expr.type) {
      case "SemOrExpression":
      case "SemAndExpression":
        for (const t of expr.terms) compositionRefs(t, out);
        break;
      case "SemNotExpression":
        compositionRefs(expr.expression, out);
        break;
      case "CompositionGroup":
        compositionRefs(expr.expression, out);
        break;
      case "CompositionRef":
        out.push(expr.ref);
        break;
    }
  };

  // Collect concept refs from a narrative; non-ref elements (NWord/Quantity) are intentionally skipped (not reachability targets).
  const narrativeRefs = (elements: NarrativeElement[] | ArgValue[], out: ReferenceName[]): void => {
    for (const el of elements) {
      switch (el.type) {
        case "NConceptRef":
          out.push(el.value);
          break;
        case "NDisjunction":
          narrativeRefs(el.disjuncts, out);
          break;
        case "NConjunction":
          narrativeRefs(el.conjuncts, out);
          break;
      }
    }
  };

  // Acceptable target kind(s) per slot — so a cross-kind same-name resolves the RIGHT kind (concept-first for narrative).
  const ACCEPTABLE: Record<StructuralRelation, readonly DeclKind[]> = {
    "when-condition": ["concept"],
    guard: ["concept"],
    "composition-operand": ["concept"],
    "definition-narrative": ["concept", "parameter"],
    recommend: ["activity"],
    "use-decision": ["decision"],
    "activity-dependency": ["terminology"],
    "spine-member": ["decision"],
  };

  // Per-SEED cycle guards (reset before each seed decision): prevent infinite recursion on composition/decision cycles
  // WITHIN one decision's walk, while still re-expanding a node shared across seeds so its `reachedBy` is complete.
  const seenConcepts = new Set<string>();
  const seenDecisions = new Set<string>();

  const expandConcept = (
    c: Concept,
    lib: string,
    fromDecision: string,
    fromNodeId: string,
  ): void => {
    const key = nodeKey({ lib, kind: "concept", name: c.name });
    if (seenConcepts.has(key)) return;
    seenConcepts.add(key);
    const def = c.definition;
    const refs: ReferenceName[] = [];
    let relation: StructuralRelation = "composition-operand";
    if (def?.type === "DefinedAsDefinition") {
      if (def.body.type === "DefinedAsBareRef") refs.push(def.body.ref);
      else compositionRefs(def.body.expression, refs);
      relation = "composition-operand";
    } else if (def?.type === "DefinitionIsDefinition") {
      narrativeRefs(def.body.elements, refs);
      relation = "definition-narrative";
    }
    // Deliberately NOT walked (spec §5 scopes terminology-reachability to a reached ACTIVITY's `with`): a reached
    // concept's `coded from` / representation terminology. Those concepts are leaf + terminology is over-reach-excluded.
    for (const r of refs) reach(r, lib, fromDecision, fromNodeId, relation, key);
  };

  const expandActivity = (
    a: Activity,
    lib: string,
    fromDecision: string,
    fromNodeId: string,
  ): void => {
    const term = a.body.withClause?.terminologyReference;
    if (term)
      reach(
        term,
        lib,
        fromDecision,
        fromNodeId,
        "activity-dependency",
        nodeKey({ lib, kind: "activity", name: a.name }),
      );
  };

  function reach(
    ref: ReferenceName,
    containingLib: string,
    fromDecision: string,
    fromNodeId: string,
    relation: StructuralRelation,
    via?: string,
  ): void {
    const t = resolveRef(ref, containingLib, ACCEPTABLE[relation]);
    if (!t) return; // unresolved / wrong-kind refs are a validator concern (T4.5), not a reachability crash
    recordEdge(nodeKey({ lib: t.lib, kind: t.kind, name: t.name }), {
      fromDecision,
      fromNodeId,
      relation,
      via,
    });
    if (t.kind === "concept") expandConcept(t.node as Concept, t.lib, fromDecision, fromNodeId);
    else if (t.kind === "activity")
      expandActivity(t.node as Activity, t.lib, fromDecision, fromNodeId);
    else if (t.kind === "decision") walkDecision(t.node as Decision, t.lib, fromDecision);
  }

  function walkDecision(decision: Decision, lib: string, fromDecision: string): void {
    const dkey = nodeKey({ lib, kind: "decision", name: decision.name });
    if (seenDecisions.has(dkey)) return;
    seenDecisions.add(dkey);
    // A reached decision AND all its sub-nodes are themselves decision-reached (structural members of a reached subtree) —
    // so §9.2 can flag an item linked to any decision sub-node, and isDecisionReached works for nodeId-bearing refs.
    recordEdge(dkey, { fromDecision, fromNodeId: "", relation: "spine-member" });
    for (const sn of decisionSpine(decision)) {
      recordEdge(nodeKey({ lib, kind: "decision", name: decision.name, nodeId: sn.nodeId }), {
        fromDecision,
        fromNodeId: sn.nodeId,
        relation: "spine-member",
      });
      if (sn.kind === "when") {
        reach(
          (sn.node as { conceptName: ReferenceName }).conceptName,
          lib,
          fromDecision,
          sn.nodeId,
          "when-condition",
        );
      } else if (sn.kind === "action") {
        const stmt = sn.node as {
          action: { type: string; activityName?: ReferenceName; decisionName?: ReferenceName };
          guard?: { conceptName: ReferenceName };
        };
        if (stmt.guard) reach(stmt.guard.conceptName, lib, fromDecision, sn.nodeId, "guard");
        if (stmt.action.type === "RecommendActivity" && stmt.action.activityName) {
          reach(stmt.action.activityName, lib, fromDecision, sn.nodeId, "recommend");
        } else if (stmt.action.type === "UseDecision" && stmt.action.decisionName) {
          reach(stmt.action.decisionName, lib, fromDecision, sn.nodeId, "use-decision");
        }
      }
    }
  }

  // Seed: the covered policy's decisions only (NOT every policy-owned lib's decisions). coversTarget is defined here
  // (the `!coversName` early-return above guarantees it).
  const policyLib = coversName;
  const coverAst = graph.coversTarget!.ast;
  for (const s of coverAst.statements) {
    if (s.type !== "Decision") continue;
    seenConcepts.clear(); // per-seed reset: a node shared across top-level decisions accrues all their reachedBy edges
    seenDecisions.clear();
    walkDecision(s, policyLib, nodeKey({ lib: policyLib, kind: "decision", name: s.name }));
  }

  // ── API ──
  const lookup = (ref: ProvNodeRef): IndexedCrlNode | undefined => nodes.get(nodeKey(ref));

  return {
    nodes,
    decisionReachability,
    diagnostics,
    resolveCrlNodeRef(ref) {
      const n = lookup(ref);
      if (n) return n.location;
      return { unresolved: true, reason: `No node for ${nodeKey(ref)}` };
    },
    nodeKindOf: (ref) => lookup(ref)?.nodeKind,
    ownershipOf: (ref) => lookup(ref)?.ownership,
    isDecisionReached: (ref) => decisionReachability.has(nodeKey(ref)),
  };
}
