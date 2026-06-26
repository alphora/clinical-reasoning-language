/**
 * Provenance SCAFFOLD generator (Model A). Pure + headless: from a policy's resolved CRL+CEL graph, derive the
 * structurally-derivable MAJORITY of a `ProvenanceArtifact`, leaving the human/agent KE only the source-attribution
 * work that genuinely needs the policy narrative.
 *
 * Model A — what we DO and DON'T emit:
 *  - We fill `clusters[].crl` / `clusters[].cel` with refs whose nodeKind/ownership come straight from the §5-authoritative
 *    index (so they pass the §9 V1/V2 checks) BUT whose `status` is "provisional" — a scaffold is not yet linked.
 *  - We emit NO `items` (the artifact-level `items` and EVERY `cluster.items` stay empty): items are the source-attribution
 *    layer the KE authors. Because the refs are provisional (not "linked"), every policy-owned leaf / decision sub-node we
 *    cluster is STILL over-reach under §4 — that is intentional: over-reach IS the KE worklist, surfaced in `diagnostics`.
 *  - We pre-wire NO `drivesDetermination` edges (those carry an `expectedDisposition` we must NOT fabricate); instead the
 *    structurally-derivable criterion→determination gating is offered as a `drives-determination-hint` diagnostic.
 *
 * Everything that needs human judgment leaves the artifact and travels in the structured `diagnostics` channel: the
 * attribution worklist, the drives-determination hints, the over-reach baseline (so a consumer can diff the KE's progress
 * against the generated starting point), and the CEL freeze / ambiguity / unsupported-result findings.
 *
 * Determinism: clusters are sorted by id; each cluster's `crl[]` by nodeKey and `cel[]` by (file, caseId, relation); the
 * diagnostics are emitted in a fixed structural order. Two runs on the same graph produce byte-identical JSON.
 */
import { collectDecisionArms } from "../ast/decisionArms";
import { decisionSpine, type SpineNode } from "../ast/decisionSpine";
import type { ActionStatement, Decision, ReferenceName, WhenBlock } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import type { CELBranchResult, CELCase, CELResultField } from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";

import type {
  AnchorSourceMeta,
  CelNodeRef,
  CelRelation,
  Cluster,
  CrlNodeRef,
  CrlRelation,
  Item,
  ProvenanceArtifact,
} from "./artifact";
import { PROVENANCE_SCHEMA_VERSION } from "./artifact";
import { isOverReach } from "./coverage";
import {
  buildProvenanceIndex,
  collectLibs,
  conceptDeclRef,
  decisionDeclRef,
  decisionSubNodeRef,
  nodeKey,
  type ProvenanceIndex,
  type ProvNodeRef,
} from "./indexer";
import { isStrictAncestor } from "./validators";

// ── public shape ──────────────────────────────────────────────────────────────

export interface GenerateDiagnostic {
  kind:
    | "attribution-needed"
    | "drives-determination-hint"
    | "overreach-baseline"
    | "unfrozen-case"
    | "ambiguous-cel-branch"
    | "unsupported-cel-result";
  message: string;
  nodeKey?: string; // for attribution-needed / overreach-baseline
  nodeId?: string; // decision sub-node path
  // drives-determination-hint:
  criterionNodeKey?: string;
  determinationNodeKey?: string;
  polarity?: "present-drives" | "absent-drives";
  // cel diagnostics:
  caseId?: string;
}

export interface GenerateResult {
  artifact: ProvenanceArtifact;
  diagnostics: GenerateDiagnostic[];
}

// ── relation mapping (SUGGESTIONS; the KE confirms) ────────────────────────────

/** A spine sub-node's suggested authoring relation. when/otherwise gate a criterion; an action recommends a disposition
 *  (RecommendActivity) or composes a sub-decision's criteria (UseDecision). */
function spineRelation(sn: SpineNode): CrlRelation {
  if (sn.kind === "when" || sn.kind === "otherwise") return "implements-criterion";
  // action
  const action = (sn.node as ActionStatement).action;
  return action.type === "RecommendActivity" ? "recommends-disposition" : "composes-criteria";
}

/** The action target name a spine action node points at (activity for RecommendActivity, decision for UseDecision). */
function actionTargetName(sn: SpineNode): string | undefined {
  const action = (sn.node as ActionStatement).action;
  return action.type === "RecommendActivity"
    ? getRefName(action.activityName)
    : getRefName(action.decisionName);
}

/** The `/`-segment immediately before the trailing `action[N]` segment — the branch arm the action sits under
 *  ("otherwise" ⇒ a catch-all arm). "" when the action is somehow not under a branch (defensive). */
function branchArmSegment(nodeId: string): string {
  const segs = nodeId.split("/");
  return segs.length >= 2 ? segs[segs.length - 2] : "";
}

// ── concept-ref helpers (same lib/kind/name rule as the indexer/crlStructure — keys cannot drift) ──

/** A referenced concept's nodeKey, resolved by the same lib/kind/name rule the indexer + crlStructure use (qualified-ref
 *  lib via getRefLibrary, else the decision's lib). Pure string construction; not resolved against the index. */
function conceptKeyOf(ref: ReferenceName, decisionLib: string): string {
  const lib = getRefLibrary(ref) ?? decisionLib;
  return nodeKey(conceptDeclRef(lib, getRefName(ref)));
}

// ──────────────────────────────────────────────────────────────────────────────

export function generateProvenanceScaffold(
  graph: ResolvedCelGraph,
  opts: {
    policyId: string;
    policyVersion: string;
    anchorSource: AnchorSourceMeta;
    celFileName: string;
  },
): GenerateResult {
  const index = buildProvenanceIndex(graph);
  const diagnostics: GenerateDiagnostic[] = [];

  // The covered policy lib + its decisions are the scaffold's spine. With no policy anchor there is nothing to generate
  // (collectLibs surfaces the no-policy-anchor diagnostic via the index; we mirror its empty result).
  const { coversName } = collectLibs(graph);
  const policyLib = coversName;
  const decisions: Decision[] =
    policyLib && graph.coversTarget
      ? (graph.coversTarget.ast.statements.filter((s) => s.type === "Decision") as Decision[])
      : [];

  // Per-decision context (built once, reused by the cluster + CEL passes): the decision decl key, its spine, the set of
  // concept keys that GATE a criterion (when/guard), and the spine action nodes keyed by their target name (for CEL).
  interface DecisionCtx {
    decision: Decision;
    declKey: string;
    declRef: ProvNodeRef;
    spine: SpineNode[];
    gatingConceptKeys: Set<string>;
    armTargets: Set<string>;
  }
  const ctxByName = new Map<string, DecisionCtx>();
  for (const decision of decisions) {
    const declRef = decisionDeclRef(policyLib!, decision.name);
    const spine = decisionSpine(decision);
    const gatingConceptKeys = new Set<string>();
    for (const sn of spine) {
      if (sn.kind === "when") {
        gatingConceptKeys.add(conceptKeyOf((sn.node as WhenBlock).conceptName, policyLib!));
      } else if (sn.kind === "action") {
        const guard = (sn.node as ActionStatement).guard;
        if (guard) gatingConceptKeys.add(conceptKeyOf(guard.conceptName, policyLib!));
      }
    }
    ctxByName.set(decision.name, {
      decision,
      declKey: nodeKey(declRef),
      declRef,
      spine,
      gatingConceptKeys,
      armTargets: collectDecisionArms(decision),
    });
  }

  // ── build one cluster per covered-policy decision ──
  const clusters = decisions.map((decision) =>
    buildDecisionCluster(ctxByName.get(decision.name)!, policyLib!, index),
  );

  // ── CEL pass: per-case result fields → cel refs + cel diagnostics ──
  const celRefsByCluster = new Map<string, CelNodeRef[]>();
  const conceptToClusterIds = buildConceptToClusterIds(decisions, index, policyLib);
  for (const c of clusters) celRefsByCluster.set(c.id, []);
  for (const celCase of enumerateCelCases(graph)) {
    processCelCase(
      celCase,
      opts.celFileName,
      policyLib!,
      ctxByName,
      conceptToClusterIds,
      clusterIdFor(policyLib),
      celRefsByCluster,
      diagnostics,
    );
  }
  for (const c of clusters) {
    c.cel = sortCelRefs(celRefsByCluster.get(c.id) ?? []);
  }

  // Sort clusters by id; crl[] is sorted inside buildDecisionCluster, cel[] just above.
  clusters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const artifact: ProvenanceArtifact = {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    policyId: opts.policyId,
    policyVersion: opts.policyVersion,
    anchorSource: opts.anchorSource,
    items: [], // Model A: the source-attribution layer is the KE's, left empty by the scaffold
    ignoredRanges: [],
    clusters,
  };

  // ── over-reach baseline: exactly the nodes §4 isOverReach flags on the JUST-built artifact (provisional refs do not
  //    escape over-reach), so a consumer can diff the KE's later linking against this starting point. Computed against
  //    the real artifact (not the closure set) so the diagnostic set is GUARANTEED to equal coverage's over-reach set. ──
  const itemsById = new Map<string, never>(); // no items in a scaffold → empty (isOverReach reads it for authored-support)
  for (const node of index.nodes.values()) {
    if (isOverReach(node, artifact, itemsById)) {
      diagnostics.push({
        kind: "overreach-baseline",
        message: `policy-owned ${node.nodeKind} "${node.ref.name}"${node.ref.nodeId ? "#" + node.ref.nodeId : ""} is provisional-only (KE must attribute it to a source span).`,
        nodeKey: nodeKey(node.ref),
        ...(node.ref.nodeId !== undefined ? { nodeId: node.ref.nodeId } : {}),
      });
    }
  }

  // ── attribution-needed + drives-determination-hint (per covered decision, structural) ──
  for (const decision of decisions) {
    emitDecisionHints(ctxByName.get(decision.name)!, policyLib!, diagnostics);
  }

  return { artifact, diagnostics };
}

// ── cluster construction ────────────────────────────────────────────────────────

const clusterIdFor =
  (policyLib: string | null) =>
  (decisionName: string): string =>
    // CLEAN id (no JSON punctuation, unlike a nodeKey) so it reads in a UI + a manifest.
    `cluster:${policyLib}:${decisionName}`;

function buildDecisionCluster(
  ctx: {
    decision: Decision;
    declRef: ProvNodeRef;
    spine: SpineNode[];
    gatingConceptKeys: Set<string>;
  },
  policyLib: string,
  index: ProvenanceIndex,
): Cluster {
  const id = clusterIdFor(policyLib)(ctx.decision.name);
  const crl: CrlNodeRef[] = [];
  const added = new Set<string>(); // dedupe by nodeKey within the cluster (a concept reached twice appears once)

  /** Push a CrlNodeRef whose nodeKind/ownership are taken from the §5-authoritative index (so V1/V2 pass), status
   *  provisional (Model A), deduped by nodeKey. The only ref the index fails to resolve is a LOCATION-LESS spine sub-node
   *  (the indexer skips those at inventory time too — `indexer.ts`), so it is also absent from coverage's over-reach
   *  denominator: skipping it here keeps the scaffold + the baseline in lockstep (never an un-baseline un-clustered node).
   *  Reachability-sourced refs (the closure loop below) come straight from `index.nodes`, so they never skip. */
  const push = (ref: ProvNodeRef, relation: CrlRelation): void => {
    const key = nodeKey(ref);
    if (added.has(key)) return;
    const nodeKind = index.nodeKindOf(ref);
    const ownership = index.ownershipOf(ref);
    if (nodeKind === undefined || ownership === undefined) return; // location-less sub-node (not indexed) → don't emit a born-broken ref
    added.add(key);
    crl.push({
      lib: ref.lib,
      kind: ref.kind,
      name: ref.name,
      ...(ref.nodeId !== undefined ? { nodeId: ref.nodeId } : {}),
      nodeKind,
      ownership,
      relation,
      status: "provisional",
    });
  };

  // NB: we deliberately do NOT emit a ref to the bare decision DECL. It isn't an over-reach candidate (no nodeId), so it
  // needs no cluster for coverage hygiene; and suggesting a counting decision-relation on the WHOLE-decision decl would
  // let a KE satisfy a must-link-decision item by linking the bare decl instead of a concrete criterion/determination.

  // every spine sub-node, relation by kind.
  for (const sn of ctx.spine) {
    push(decisionSubNodeRef(policyLib, ctx.decision.name, sn.nodeId), spineRelation(sn));
  }

  // 3) every policy-owned concept + activity in THIS decision's reachability closure (so each policy-owned leaf is
  //    clustered — un-clustered would be undocumented over-reach). Relation by role: a gating concept leaf →
  //    implements-criterion; a composition concept → composes-criteria; a pure definitional/operand leaf → defines-concept;
  //    an activity (recommend target) → recommends-disposition.
  const declKey = nodeKey(ctx.declRef);
  for (const [key, reach] of index.decisionReachability) {
    if (!reach.reachedBy.has(declKey)) continue;
    const node = index.nodes.get(key);
    if (!node || node.ownership !== "policy-owned") continue;
    if (node.declKind === "concept") {
      const relation: CrlRelation = ctx.gatingConceptKeys.has(key)
        ? "implements-criterion"
        : node.nodeKind === "inference"
          ? "composes-criteria"
          : "defines-concept";
      push(node.ref, relation);
    } else if (node.declKind === "activity") {
      push(node.ref, "recommends-disposition");
    }
    // decisions / sub-nodes reached as nested `use decision` targets are clustered by THEIR own decision's cluster;
    // terminology/parameter are over-reach-excluded — neither needs a ref here.
  }

  crl.sort((a, b) => (nodeKey(a) < nodeKey(b) ? -1 : nodeKey(a) > nodeKey(b) ? 1 : 0));
  return { id, label: ctx.decision.name, items: [], crl, cel: [] };
}

// ── attribution + drives-determination hints ──────────────────────────────────

function emitDecisionHints(
  ctx: { decision: Decision; spine: SpineNode[] },
  policyLib: string,
  diagnostics: GenerateDiagnostic[],
): void {
  // attribution-needed: one per criterion (`when`) and per terminal recommend determination — these are the spine nodes
  // that MUST trace to a source span. (otherwise + use-decision are structural glue; they get no attribution worklist row.)
  const whens = ctx.spine.filter((sn) => sn.kind === "when");
  const recommends = ctx.spine.filter(
    (sn) =>
      sn.kind === "action" && (sn.node as ActionStatement).action.type === "RecommendActivity",
  );

  const subNodeKey = (nodeId: string): string =>
    nodeKey(decisionSubNodeRef(policyLib, ctx.decision.name, nodeId));

  for (const sn of whens) {
    diagnostics.push({
      kind: "attribution-needed",
      message: `criterion ${ctx.decision.name}#${sn.nodeId} (${labelOfWhen(sn)}) needs a source attribution.`,
      nodeId: sn.nodeId,
      nodeKey: subNodeKey(sn.nodeId),
    });
  }
  for (const sn of recommends) {
    diagnostics.push({
      kind: "attribution-needed",
      message: `determination ${ctx.decision.name}#${sn.nodeId} (recommend ${actionTargetName(sn)}) needs a source attribution.`,
      nodeId: sn.nodeId,
      nodeKey: subNodeKey(sn.nodeId),
    });
  }

  // drives-determination-hint (ANCESTOR edges): a criterion (`when`) gates a determination whose node it strictly
  // CONTAINS (present-drives). The rare absent-drives ancestor case is a determination under an `otherwise` that is itself
  // NESTED under that when. We do NOT fabricate the expectedDisposition.
  for (const crit of whens) {
    for (const det of recommends) {
      if (!isStrictAncestor(crit.nodeId, det.nodeId)) continue;
      const polarity: "present-drives" | "absent-drives" =
        branchArmSegment(det.nodeId) === "otherwise" ? "absent-drives" : "present-drives";
      diagnostics.push({
        kind: "drives-determination-hint",
        message: `criterion ${ctx.decision.name}#${crit.nodeId} structurally gates determination ${ctx.decision.name}#${det.nodeId} (${polarity}); confirm + set expectedDisposition.`,
        criterionNodeKey: subNodeKey(crit.nodeId),
        determinationNodeKey: subNodeKey(det.nodeId),
        polarity,
      });
    }
  }

  // drives-determination-hint (SIBLING-ABSENCE edges): a determination directly under a TOP-LEVEL `otherwise` is gated by
  // the ABSENCE of its sibling top-level `when`s — they are NOT its ancestors, so the ancestor loop above never emits it
  // (the bug a reviewer caught). §9's ancestor model can't VERIFY a sibling-absence edge, so this travels only as a hint;
  // the KE/editor authors the real edge. Scoped to a top-level otherwise (the common shape); a nested otherwise is a gap.
  const topWhens = whens.filter((sn) => !sn.nodeId.includes("/"));
  for (const det of recommends) {
    if (!det.nodeId.startsWith("otherwise/")) continue; // a TOP-LEVEL otherwise arm's determination
    for (const crit of topWhens) {
      diagnostics.push({
        kind: "drives-determination-hint",
        message: `determination ${ctx.decision.name}#${det.nodeId} fires on the ABSENCE of criterion ${ctx.decision.name}#${crit.nodeId} (absent-drives); confirm + set expectedDisposition.`,
        criterionNodeKey: subNodeKey(crit.nodeId),
        determinationNodeKey: subNodeKey(det.nodeId),
        polarity: "absent-drives",
      });
    }
  }
}

function labelOfWhen(sn: SpineNode): string {
  return `when ${getRefName((sn.node as WhenBlock).conceptName)}`;
}

// ── CEL pass ───────────────────────────────────────────────────────────────────

/** Enumerate the policy `.cel`'s cases in SOURCE order (empty when the CEL failed to parse). */
function enumerateCelCases(graph: ResolvedCelGraph): CELCase[] {
  return (graph.cel?.statements.filter((s) => s.type === "CELCase") as CELCase[]) ?? [];
}

/** concept nodeKey → the set of cluster ids whose decision reaches that concept (for an `asserts-fact` boolean result). */
function buildConceptToClusterIds(
  decisions: Decision[],
  index: ProvenanceIndex,
  policyLib: string | null,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!policyLib) return out;
  const idFor = clusterIdFor(policyLib);
  for (const decision of decisions) {
    const declKey = nodeKey(decisionDeclRef(policyLib, decision.name));
    for (const [key, reach] of index.decisionReachability) {
      if (!reach.reachedBy.has(declKey)) continue;
      const node = index.nodes.get(key);
      if (!node || node.declKind !== "concept") continue;
      let set = out.get(key);
      if (!set) out.set(key, (set = new Set()));
      set.add(idFor(decision.name));
    }
  }
  return out;
}

function processCelCase(
  celCase: CELCase,
  celFileName: string,
  policyLib: string,
  ctxByName: Map<string, { decision: Decision; spine: SpineNode[]; armTargets: Set<string> }>,
  conceptToClusterIds: Map<string, Set<string>>,
  idFor: (decisionName: string) => string,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
): void {
  const frozen = celCase.caseId !== undefined; // §7: only a frozen case is a durable provenance address
  const caseId = celCase.caseId; // undefined ⇒ we never emit a ref, only an unfrozen-case diagnostic

  const results = celCase.body.filter((b) => b.type === "CELResultField") as CELResultField[];
  for (const rf of results) {
    if (rf.value.type === "CELBranchResult") {
      handleBranchResult(
        rf,
        rf.value,
        celCase,
        celFileName,
        frozen,
        caseId,
        ctxByName,
        idFor,
        celRefsByCluster,
        diagnostics,
      );
    } else {
      handleBooleanResult(
        rf,
        celCase,
        celFileName,
        policyLib,
        frozen,
        caseId,
        conceptToClusterIds,
        celRefsByCluster,
        diagnostics,
      );
    }
  }
}

function handleBranchResult(
  rf: CELResultField,
  branch: CELBranchResult,
  celCase: CELCase,
  celFileName: string,
  frozen: boolean,
  caseId: string | undefined,
  ctxByName: Map<string, { spine: SpineNode[]; armTargets: Set<string> }>,
  idFor: (decisionName: string) => string,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
): void {
  const decisionName = rf.leafName;
  const ctx = ctxByName.get(decisionName);
  if (!ctx) {
    // a branch result whose leaf does not name a covered decision — nothing structural to attach it to.
    diagnostics.push({
      kind: "unsupported-cel-result",
      message: `CEL case ${celCase.name} result "${decisionName} is ${branch.branchName}" does not name a covered decision.`,
      caseId: celCase.caseId,
    });
    return;
  }
  // branchName is an ARM TARGET name (activity/decision), never literally "otherwise". Resolve it to the spine action
  // node(s) whose target == branchName, then read the arm the action sits under to pick tests-otherwise vs tests-branch.
  const matches = ctx.spine.filter(
    (sn) => sn.kind === "action" && actionTargetName(sn) === branch.branchName,
  );
  let relation: CelRelation;
  if (matches.length === 1) {
    relation =
      branchArmSegment(matches[0].nodeId) === "otherwise" ? "tests-otherwise" : "tests-branch";
  } else if (matches.length === 0) {
    // branchName is a declared arm but not on a resolvable action node, or an unknown name → default + surface it.
    relation = "tests-branch";
    if (!ctx.armTargets.has(branch.branchName)) {
      diagnostics.push({
        kind: "unsupported-cel-result",
        message: `CEL case ${celCase.name} result "${decisionName} is ${branch.branchName}" names no arm of that decision.`,
        caseId: celCase.caseId,
      });
    }
  } else {
    // an arm target reused across arms (e.g. the same activity under when AND otherwise) — ambiguous; default + surface.
    relation = "tests-branch";
    diagnostics.push({
      kind: "ambiguous-cel-branch",
      message: `CEL case ${celCase.name} branch "${branch.branchName}" matches ${matches.length} arms of ${decisionName}; defaulting to tests-branch.`,
      caseId: celCase.caseId,
    });
  }
  emitCelRef(
    idFor(decisionName),
    celFileName,
    frozen,
    caseId,
    relation,
    celCase,
    celRefsByCluster,
    diagnostics,
  );
}

function handleBooleanResult(
  rf: CELResultField,
  celCase: CELCase,
  celFileName: string,
  policyLib: string,
  frozen: boolean,
  caseId: string | undefined,
  conceptToClusterIds: Map<string, Set<string>>,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
): void {
  // A boolean result names a CONCEPT (a fact assertion). The CEL validator resolves a result leaf against the COVERED
  // library's top-level decls, so resolve the bare name the SAME way — to the covered-lib concept key — rather than scanning
  // every reachable concept by bare name (which would over-attach on a cross-library name collision). Then attach to every
  // cluster whose decision's closure reaches that exact concept.
  const conceptKey = nodeKey(conceptDeclRef(policyLib, rf.leafName));
  const targetClusters = conceptToClusterIds.get(conceptKey) ?? new Set<string>();
  if (targetClusters.size === 0) {
    diagnostics.push({
      kind: "unsupported-cel-result",
      message: `CEL case ${celCase.name} boolean result "${rf.leafName}" is reached by no covered decision.`,
      caseId: celCase.caseId,
    });
    return;
  }
  for (const clusterId of targetClusters) {
    emitCelRef(
      clusterId,
      celFileName,
      frozen,
      caseId,
      "asserts-fact",
      celCase,
      celRefsByCluster,
      diagnostics,
    );
  }
}

/** Emit a CelNodeRef into a cluster IFF the case is frozen (§7); an un-frozen case yields an unfrozen-case diagnostic
 *  instead of a born-failing ref. The diagnostic fires once per (case, would-be relation) the scaffold wanted to emit. */
function emitCelRef(
  clusterId: string,
  celFileName: string,
  frozen: boolean,
  caseId: string | undefined,
  relation: CelRelation,
  celCase: CELCase,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
): void {
  if (!frozen || caseId === undefined) {
    diagnostics.push({
      kind: "unfrozen-case",
      message: `CEL case ${celCase.name} has no explicit \`- id is "..."\`; freeze it before it can carry a provenance ref (would-be relation ${relation}).`,
    });
    return;
  }
  const bucket = celRefsByCluster.get(clusterId);
  if (!bucket) return; // a cluster id we did not build (defensive — every covered decision has a bucket)
  bucket.push({ file: celFileName, kind: "case", caseId, relation, status: "provisional" });
}

/** Deterministic CEL-ref order: (file, caseId, relation). Also dedupes identical refs (a concept reached twice). */
function sortCelRefs(refs: CelNodeRef[]): CelNodeRef[] {
  const seen = new Set<string>();
  const unique: CelNodeRef[] = [];
  for (const r of refs) {
    const k = `${r.file} ${r.caseId} ${r.relation}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  unique.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.caseId !== b.caseId) return a.caseId < b.caseId ? -1 : 1;
    return a.relation < b.relation ? -1 : a.relation > b.relation ? 1 : 0;
  });
  return unique;
}

// ══════════════════════════════════════════════════════════════════════════════
// mergeScaffold — re-run a scaffold over an EDITED policy WITHOUT clobbering the KE's hand-attribution.
//
// A re-generation (`fresh` = a brand-new scaffold: items:[], every ref status:"provisional") would otherwise overwrite
// the KE's authored items + edited ref statuses/relations/relink-hints. mergeScaffold overlays `fresh`'s up-to-date
// STRUCTURE (the cluster set, each ref's identity + nodeKind/ownership/nodeId straight from the §5-authoritative index)
// onto `previous`'s preserved WORK (items, ignoredRanges, item↔cluster links, KE-edited ref status/relation/relinkHints),
// and surfaces every place the edit broke a link as a structured diagnostic (never a silent drop). Pure + headless.
//
// Two contracts worth stating:
//  - IMMUTABILITY: the KE-authored layers (items, ignoredRanges, surviving cluster item-lists) are shallow-COPIED into the
//    result, but ref objects taken from `fresh` are shared by reference. Treat `previous`, `fresh`, AND the returned
//    artifact as immutable — don't mutate one and expect the others untouched.
//  - needs-relink + the validator: a KE-linked CRL/CEL ref whose node VANISHED from the regenerated structure is kept as
//    `status:"needs-relink"` (preserving the KE's relation/relinkHints for an §8 repair) rather than dropped. That ref no
//    longer resolves in the index, so `validateProvenance` will (correctly) report `unresolved-ref` for it — that finding
//    IS the "this link needs repair" signal, complementing the merge's `needs-relink` diagnostic. Softening the validator
//    for needs-relink is a deferred follow-on, not part of T2.
// ══════════════════════════════════════════════════════════════════════════════

export interface MergeDiagnostic {
  kind:
    | "source-changed"
    | "added-node"
    | "removed-node"
    | "needs-relink"
    | "orphaned-cluster"
    | "orphaned-link"
    | "dangling-item-id"
    | "relation-changed";
  message: string;
  cluster?: string; // cluster id
  surface?: "crl" | "cel";
  nodeKey?: string; // crl ref key
  caseId?: string; // cel ref key
  itemIds?: string[]; // orphaned-cluster / orphaned-link
}

export interface MergeResult {
  artifact: ProvenanceArtifact;
  diagnostics: MergeDiagnostic[];
}

/** A ref is "KE-touched" iff the KE moved it off the scaffold default — status flipped off "provisional", OR a relink
 *  hint was attached. A fresh scaffold ref (always status:"provisional", no relinkHints) is never KE-touched. */
function crlTouched(ref: CrlNodeRef): boolean {
  return ref.status !== "provisional" || (ref.relinkHints !== undefined && ref.relinkHints.length > 0);
}
/** CEL refs carry no relinkHints, so KE-touched is purely "status !== provisional" (a changed relation rides on the same
 *  ref the KE re-statused; the spec keys cel survival on (file,kind,caseId) and preserves relation when KE-touched). */
function celTouched(ref: CelNodeRef): boolean {
  return ref.status !== "provisional";
}

/** CEL ref identity key — (file, kind, caseId), NOT relation (a KE relation override must survive a fresh re-derivation
 *  that picks a different relation for the same case). Mirrors the spec's cel survive/add/drop key. */
const celKey = (r: CelNodeRef): string => JSON.stringify([r.file, r.kind, r.caseId]);

export function mergeScaffold(previous: ProvenanceArtifact, fresh: ProvenanceArtifact): MergeResult {
  const diagnostics: MergeDiagnostic[] = [];

  // ── Rule 1: envelope from `fresh`; anchorSource kept from `previous` on a hash drift (so the validator keeps emitting
  //    anchor-hash-drift durably + the existing sourceRefs stay valid against the text they were authored on — the
  //    re-anchor to the new source is a DEFERRED, separate step). ──
  let anchorSource = fresh.anchorSource;
  if (previous.anchorSource.textHash !== fresh.anchorSource.textHash) {
    anchorSource = previous.anchorSource; // keep the old anchor; do NOT strip sourceRefs
    diagnostics.push({
      kind: "source-changed",
      message: `anchor source changed (previous textHash ${previous.anchorSource.textHash} != fresh ${fresh.anchorSource.textHash}); keeping the previous anchorSource so existing sourceRefs stay valid — re-anchoring is deferred.`,
    });
  }

  // ── Rule 2: items + ignoredRanges are pure KE-authored layers — taken from `previous` (shallow-copied so a caller that
  //    mutates the result can't alias back into `previous`; the per-item objects are still shared — see the header). ──
  const items: Item[] = [...previous.items];
  const itemIds = new Set(items.map((it) => it.id));

  // Index previous clusters by id for the per-fresh-cluster overlay below.
  const prevById = new Map(previous.clusters.map((c) => [c.id, c]));
  const freshIds = new Set(fresh.clusters.map((c) => c.id));

  // Track, across all SURVIVING output clusters, which item ids end up linked somewhere (for the §3-cover orphan test in
  // Rule 4: an item that still appears in a surviving cluster is NOT orphaned even if a now-removed cluster also held it).
  const itemsInSurvivingClusters = new Set<string>();

  // ── Rule 3: one output cluster per FRESH cluster (fresh is the up-to-date decision set). ──
  const mergedClusters: Cluster[] = fresh.clusters.map((freshC) => {
    const prevC = prevById.get(freshC.id);

    // items[]: the KE's item↔cluster links from the previous same-id cluster ([] for a brand-new decision), copied.
    const clusterItems = prevC ? [...prevC.items] : [];
    for (const id of clusterItems) itemsInSurvivingClusters.add(id);

    // Rule 5: a cluster.items id with no backing item in `previous.items` is dangling (an item was deleted out from under
    // the link). One diagnostic per offending id, scoped to this cluster.
    for (const id of clusterItems) {
      if (!itemIds.has(id)) {
        diagnostics.push({
          kind: "dangling-item-id",
          message: `cluster ${freshC.id} links item "${id}" which is not present in items[] (the item was removed).`,
          cluster: freshC.id,
          itemIds: [id],
        });
      }
    }

    const crl = mergeCrlRefs(freshC, prevC, diagnostics);
    const cel = mergeCelRefs(freshC, prevC, diagnostics);

    return { id: freshC.id, label: freshC.label, items: clusterItems, crl, cel };
  });

  // ── Rule 4: a PREVIOUS cluster with no fresh match (the decision was removed or renamed) — emit an orphaned-cluster
  //    diagnostic. We do NOT add a phantom cluster (fresh is authoritative for the decision set). The orphaned itemIds are
  //    the cluster's items that appear in NO surviving output cluster (clusters are a COVER, so an item that also lives in
  //    a surviving cluster is not orphaned), PLUS any authored item whose `supports.cluster` named this now-gone cluster
  //    (its `supports` is now dangling → validator V7). ──
  for (const prevC of previous.clusters) {
    if (freshIds.has(prevC.id)) continue;
    const orphanedIds = new Set<string>();
    for (const id of prevC.items) {
      if (!itemsInSurvivingClusters.has(id)) orphanedIds.add(id);
    }
    for (const it of items) {
      if (it.origin === "authored" && it.supports?.cluster === prevC.id) orphanedIds.add(it.id);
    }
    diagnostics.push({
      kind: "orphaned-cluster",
      message: `cluster ${prevC.id} no longer corresponds to any decision (removed or renamed); its links + any authored \`supports\` on it are dangling.`,
      cluster: prevC.id,
      itemIds: [...orphanedIds].sort(),
    });
  }

  // ── Rule 6: deterministic cluster order by id. ──
  mergedClusters.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const artifact: ProvenanceArtifact = {
    schemaVersion: fresh.schemaVersion,
    policyId: fresh.policyId,
    policyVersion: fresh.policyVersion,
    anchorSource,
    items,
    ignoredRanges: [...previous.ignoredRanges],
    clusters: mergedClusters,
  };

  return { artifact, diagnostics };
}

/** Rule 3 crl[] overlay for one cluster: survive/add/drop by nodeKey, preserving KE work; sorted by nodeKey. */
function mergeCrlRefs(
  freshC: Cluster,
  prevC: Cluster | undefined,
  diagnostics: MergeDiagnostic[],
): CrlNodeRef[] {
  const prevByKey = new Map((prevC?.crl ?? []).map((r) => [nodeKey(r), r]));
  const freshKeys = new Set(freshC.crl.map((r) => nodeKey(r)));
  const out: CrlNodeRef[] = [];

  // fresh refs: survivors (with a previous match) + fresh-only additions.
  for (const f of freshC.crl) {
    const key = nodeKey(f);
    const p = prevByKey.get(key);
    if (!p) {
      // fresh-only: a node the edit ADDED. Keep the fresh (provisional) ref + surface it for the KE.
      out.push(f);
      diagnostics.push({
        kind: "added-node",
        message: `cluster ${freshC.id}: new CRL node ${key} appeared (needs attribution).`,
        cluster: freshC.id,
        surface: "crl",
        nodeKey: key,
      });
      continue;
    }
    // Preserve the previous ref if the KE touched it OR if its relation diverges from fresh's re-derived suggestion (a
    // relation-only edit leaves status "provisional", so a touched-by-status check alone would SILENTLY lose it). Keeping a
    // provisional ref's relation is harmless to coverage (only "linked" refs count) and the relation-changed diagnostic
    // surfaces every divergence so a genuine structural relation change isn't hidden either.
    const preserve = crlTouched(p) || p.relation !== f.relation;
    if (preserve) {
      // Keep the KE's status/relation/relinkHints; refresh identity + structural fields (lib/kind/name/nodeId/nodeKind/
      // ownership) from `fresh` — NEVER overlay nodeKind/ownership (the index is the §5 authority).
      out.push({
        lib: f.lib,
        kind: f.kind,
        name: f.name,
        ...(f.nodeId !== undefined ? { nodeId: f.nodeId } : {}),
        nodeKind: f.nodeKind,
        ownership: f.ownership,
        relation: p.relation,
        status: p.status,
        ...(p.relinkHints !== undefined ? { relinkHints: p.relinkHints } : {}),
      });
      if (f.relation !== p.relation) {
        diagnostics.push({
          kind: "relation-changed",
          message: `cluster ${freshC.id}: CRL node ${key} relation differs (previous "${p.relation}", fresh suggests "${f.relation}"); kept the previous relation (load-bearing via DECISION_RELATIONS).`,
          cluster: freshC.id,
          surface: "crl",
          nodeKey: key,
        });
      }
    } else {
      // a stale scaffold suggestion the KE never touched + the same relation → take the fresh ref entirely (refresh it).
      out.push(f);
    }
  }

  // previous-only refs: a node the KE had that the edit REMOVED from this cluster (the CRL node vanished).
  for (const p of prevC?.crl ?? []) {
    const key = nodeKey(p);
    if (freshKeys.has(key)) continue;
    if (crlTouched(p)) {
      // KE invested in it → keep it as needs-relink (preserve relation + relinkHints) rather than silently dropping the
      // KE's work; surface the relink + flag the items linked through this cluster (they may have lost their link).
      out.push({
        lib: p.lib,
        kind: p.kind,
        name: p.name,
        ...(p.nodeId !== undefined ? { nodeId: p.nodeId } : {}),
        nodeKind: p.nodeKind,
        ownership: p.ownership,
        relation: p.relation,
        status: "needs-relink",
        ...(p.relinkHints !== undefined ? { relinkHints: p.relinkHints } : {}),
      });
      diagnostics.push({
        kind: "needs-relink",
        message: `cluster ${freshC.id}: CRL node ${key} (KE-linked) no longer exists in the regenerated structure; marked needs-relink.`,
        cluster: freshC.id,
        surface: "crl",
        nodeKey: key,
      });
      diagnostics.push({
        kind: "orphaned-link",
        // No item↔ref edge exists in the schema (the cluster is the unit), so we can't say WHICH item used the vanished
        // node — every item in this cluster may need review.
        message: `cluster ${freshC.id}: CRL node ${key} vanished; all items in this cluster may need review for a lost decision link.`,
        cluster: freshC.id,
        itemIds: [...(prevC?.items ?? [])].sort(),
      });
    } else {
      // a stale provisional suggestion the KE never touched → drop it; surface as removed-node.
      diagnostics.push({
        kind: "removed-node",
        message: `cluster ${freshC.id}: provisional CRL node ${key} no longer exists in the regenerated structure; dropped.`,
        cluster: freshC.id,
        surface: "crl",
        nodeKey: key,
      });
    }
  }

  out.sort((a, b) => (nodeKey(a) < nodeKey(b) ? -1 : nodeKey(a) > nodeKey(b) ? 1 : 0));
  return out;
}

/** Rule 3 cel[] overlay for one cluster: same survive/add/drop logic, keyed on (file,kind,caseId) — NOT relation; sorted
 *  by (file,caseId,relation) via the generator's sortCelRefs (reused for byte-identical order). */
function mergeCelRefs(
  freshC: Cluster,
  prevC: Cluster | undefined,
  diagnostics: MergeDiagnostic[],
): CelNodeRef[] {
  const prevByKey = new Map((prevC?.cel ?? []).map((r) => [celKey(r), r]));
  const freshKeys = new Set(freshC.cel.map((r) => celKey(r)));
  const out: CelNodeRef[] = [];

  for (const f of freshC.cel) {
    const key = celKey(f);
    const p = prevByKey.get(key);
    if (!p) {
      out.push(f);
      diagnostics.push({
        kind: "added-node",
        message: `cluster ${freshC.id}: new CEL case ref ${f.caseId} appeared (needs review).`,
        cluster: freshC.id,
        surface: "cel",
        caseId: f.caseId,
      });
      continue;
    }
    // Preserve on KE-touch OR relation divergence (a relation-only edit leaves status "provisional" — a status-only check
    // would silently lose it). The key ignores relation, so a fresh re-derivation that picks a different relation for the
    // same case must not clobber the KE's override. Identity (file/kind/caseId) from fresh.
    if (celTouched(p) || p.relation !== f.relation) {
      out.push({ file: f.file, kind: f.kind, caseId: f.caseId, relation: p.relation, status: p.status });
      if (f.relation !== p.relation) {
        diagnostics.push({
          kind: "relation-changed",
          message: `cluster ${freshC.id}: CEL case ${f.caseId} relation differs (previous "${p.relation}", fresh suggests "${f.relation}"); kept the previous relation.`,
          cluster: freshC.id,
          surface: "cel",
          caseId: f.caseId,
        });
      }
    } else {
      out.push(f); // stale provisional suggestion + same relation → refresh from fresh.
    }
  }

  for (const p of prevC?.cel ?? []) {
    const key = celKey(p);
    if (freshKeys.has(key)) continue;
    if (celTouched(p)) {
      out.push({ ...p, status: "needs-relink" });
      diagnostics.push({
        kind: "needs-relink",
        message: `cluster ${freshC.id}: CEL case ${p.caseId} (KE-linked) no longer regenerates here; marked needs-relink.`,
        cluster: freshC.id,
        surface: "cel",
        caseId: p.caseId,
      });
    } else {
      diagnostics.push({
        kind: "removed-node",
        message: `cluster ${freshC.id}: provisional CEL case ${p.caseId} no longer regenerates here; dropped.`,
        cluster: freshC.id,
        surface: "cel",
        caseId: p.caseId,
      });
    }
  }

  return sortCelRefs(out);
}
