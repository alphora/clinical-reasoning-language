/**
 * Provenance SCAFFOLD generator (Model A). Pure + headless (no I/O — it renders the CEL in-process via `renderScenario`
 * to follow each case's RUN PATH, but reads nothing off disk): from a policy's resolved CRL+CEL graph, derive the
 * structurally-derivable MAJORITY of a `ProvenanceArtifact`, leaving the human/agent KE only the source-attribution
 * work that genuinely needs the policy narrative. BOTH modes render now (#175): the default per-decision mode routes a
 * CHAINED branch result `D is X` (X fires in a sub-decision) to the sub's cluster via the run path; a NON-chained case
 * is byte-unchanged (it never enters the run-path branch).
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
import { createHash } from "node:crypto";

import { collectDecisionArms } from "../ast/decisionArms";
import { decisionSpine, type SpineNode } from "../ast/decisionSpine";
import type { ActionStatement, Decision, ReferenceName, WhenBlock } from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import {
  branchConditionRefs,
  branchConditionConceptRefsFollowingCriteria,
  describeBranchCondition,
} from "../ast/branchCondition";
import { buildCriterionTable, type CriterionTable } from "../ast/criterionExpansion";
import type { CELBranchResult, CELCase, CELResultField } from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";
import { renderScenario, type ScenarioViewModel } from "../cre";

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
import { buildCaseIdJoin } from "./caseIdJoin";
import type { CorrespondenceUncheckedReason } from "./correspondenceCheck";
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
import { producedRuntimePathRefs, type MinimalViewNode, type RuntimePathRef } from "./runPath";
import { isStrictAncestor } from "./validators";

// ── public shape ──────────────────────────────────────────────────────────────

export interface GenerateDiagnostic {
  kind:
    | "attribution-needed"
    | "drives-determination-hint"
    | "overreach-baseline"
    | "unfrozen-case"
    | "ambiguous-cel-branch"
    | "unsupported-cel-result"
    // default mode (clusterBy:"decision"), CHAINED branch result (#175): the case's result field claims `D is X` but the
    // run produced no terminal whose own-spine target is X (the result field disagrees with the actual run). Genuinely new
    // — the disposition-path/gate path never reads a CEL result field, so it has no analogue there.
    | "cel-result-run-mismatch"
    // disposition-path mode (clusterBy:"disposition-path"): a scenario that can't be path-clustered (mirrors the
    // FINAL gate's CorrespondenceUncheckedReason set so the two agree on "not comparable"), or a whole-render failure.
    | "deferred-disposition-path";
  message: string;
  nodeKey?: string; // for attribution-needed / overreach-baseline
  nodeId?: string; // decision sub-node path
  // drives-determination-hint:
  criterionNodeKey?: string;
  determinationNodeKey?: string;
  polarity?: "present-drives" | "absent-drives";
  // cel diagnostics:
  caseId?: string;
  // deferred-disposition-path: which CorrespondenceUncheckedReason routed this case out of the comparable set.
  reason?: CorrespondenceUncheckedReason;
  // deferred-disposition-path / render-failed: the render errors or the unmapped runtime nodeIds.
  details?: string[];
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

/** True iff a decision STRUCTURALLY chains — its spine contains a `use decision` action (#175). Used in default mode to
 *  decide whether a classify deferral on this decision's case should DEFER (honest, no guessed D-cluster attach) vs. fall
 *  through to today's leaf-name path: only a chaining decision can have a disposition fire in a sub it delegates to, so a
 *  genuinely non-chained decision never takes the defer branch → its output stays byte-identical. */
function decisionChains(spine: SpineNode[]): boolean {
  return spine.some(
    (sn) => sn.kind === "action" && (sn.node as ActionStatement).action.type === "UseDecision",
  );
}

// ── concept-ref helpers (same lib/kind/name rule as the indexer/crlStructure — keys cannot drift) ──

/** A referenced concept's nodeKey, resolved by the same lib/kind/name rule the indexer + crlStructure use (qualified-ref
 *  lib via getRefLibrary, else the decision's lib). Pure string construction; not resolved against the index. */
function conceptKeyOf(ref: ReferenceName, decisionLib: string): string {
  const lib = getRefLibrary(ref) ?? decisionLib;
  return nodeKey(conceptDeclRef(lib, getRefName(ref)));
}

// ── decision context (re-keyed by (lib, name) for #172 todo-3) ─────────────────

/** The generator's per-decision context. Carries `lib` + `name` EXPLICITLY (disc 157 [critical] re-key) so no consumer
 *  reads them off the iteration key string — the map is keyed `${lib}::${name}`, so a covered decision and a cross-lib
 *  sub that share a bare name no longer collide. Used by the cluster + CEL passes for BOTH covered decisions and the
 *  cross-lib subs the run path reaches. */
interface DecisionCtx {
  lib: string;
  name: string;
  decision: Decision;
  declKey: string;
  declRef: ProvNodeRef;
  spine: SpineNode[];
  gatingConceptKeys: Set<string>;
  armTargets: Set<string>;
}

/** The (lib, name) composite key for `ctxByName` (and any per-decision map) — injective via JSON-free `::` join is NOT
 *  safe (a lib/name could contain `::`), so use the same JSON tuple shape the indexer uses for nodeKey injectivity. */
const ctxKey = (lib: string, name: string): string => JSON.stringify([lib, name]);

/** #172 todo-3 [critical, Claude-7]: harvest the distinct `(lib, decision)` pairs the RUN PATH reaches across every
 *  rendered scenario — the authority for "what fired", spanning shared chains `decisionReachability` skips at the shared
 *  boundary (indexer.ts:513 doesn't recurse a declared-shared target). Uses the SAME `producedRuntimePathRefs` primitive
 *  the gate + classify use (no drift). Only GROUNDED refs contribute (a gapped path carries no usable decision); the
 *  covered decision's own lib is the root for the decompose. A failed render contributes nothing (the structural scaffold
 *  still emits). The covered decisions are seeded separately by the caller, so this returns the SUPERSET incl. them — the
 *  caller dedupes via `ctxByName.has`. */
function runPathReachedDecisions(
  rendered: ReturnType<typeof renderScenario>,
  policyLib: string | null,
): { lib: string; decision: string }[] {
  if (policyLib === null || rendered.success === false) return [];
  const seen = new Set<string>();
  const out: { lib: string; decision: string }[] = [];
  for (const sv of rendered.scenarios) {
    if (sv.decision === null || !sv.decision.resolved) continue;
    const decision = sv.decision.name;
    const lib = sv.decision.libraryName ?? "";
    const paths = producedRuntimePathRefs(sv.tree as unknown as MinimalViewNode[], {
      lib,
      decision,
    });
    for (const p of paths) {
      if (p.gaps.length > 0) continue; // a gapped path carries no groundable decision identity
      for (const ref of p.refs) {
        const k = ctxKey(ref.lib, ref.decision);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ lib: ref.lib, decision: ref.decision });
      }
    }
  }
  return out;
}

export function generateProvenanceScaffold(
  graph: ResolvedCelGraph,
  opts: {
    policyId: string;
    policyVersion: string;
    anchorSource: AnchorSourceMeta;
    celFileName: string;
    /** Clustering strategy (#174). "decision" (DEFAULT) = one cluster per covered decision + a per-case CEL pass.
     *  #175: the default CEL pass now renders the CEL and routes a CHAINED branch result (`D is X` where X fires in a
     *  SUB-decision D delegates to) to the SUB's cluster + arm; a NON-chained case is BYTE-UNCHANGED (it never enters the
     *  run-path branch). "disposition-path" = one cluster per distinct RUN PATH (decision-node refs only) + one
     *  policy-owned-leaf coverage cluster — correspondence-correct BY CONSTRUCTION. */
    clusterBy?: "decision" | "disposition-path";
  },
): GenerateResult {
  const index = buildProvenanceIndex(graph);
  const diagnostics: GenerateDiagnostic[] = [];
  const clusterBy = opts.clusterBy ?? "decision";

  // The covered policy lib + its decisions are the scaffold's spine. With no policy anchor there is nothing to generate
  // (collectLibs surfaces the no-policy-anchor diagnostic via the index; we mirror its empty result).
  const { coversName } = collectLibs(graph);
  const policyLib = coversName;
  const decisions: Decision[] =
    policyLib && graph.coversTarget
      ? (graph.coversTarget.ast.statements.filter((s) => s.type === "Decision") as Decision[])
      : [];

  // ── Per-decision context, keyed by (lib, name) — #172 todo-3. The map is NO LONGER bare-name keyed (disc 157
  //    [critical] re-key): a cross-lib sub colliding with a covered decision name would OVERWRITE the covered ctx. Every
  //    consumer reads `ctx.lib`/`ctx.name`, NEVER the iteration key string (the key is `${lib}::${name}` now, so building
  //    a decisionDeclRef from it would break). The ctx carries the decl key, its spine, the gating-concept keys, and the
  //    spine arm targets. Built for (a) every COVERED policy decision, then (b) every cross-lib sub the RUN PATH reaches. ──
  const ctxByName = new Map<string, DecisionCtx>();

  // collectLibs is ALREADY called for the index; reuse its AST + ownership map to source a cross-lib sub's spine. A
  // cross-lib sub-decision's Decision AST is found via libs.get(lib).decls.get(name) (the `decision`-kind DeclEntry).
  const { libs } = collectLibs(graph);
  const decisionAstFor = (lib: string, name: string): Decision | undefined => {
    const entries = libs.get(lib)?.decls.get(name);
    const decl = entries?.find((e) => e.kind === "decision");
    return decl ? (decl.node as Decision) : undefined;
  };

  // #224 ii.1c — per-library criterion table (memoized; hoisted out of the per-decision
  // buildCtx so a library's table is built once, not once per decision).
  const criterionTableCache = new Map<string, CriterionTable>();
  const tableFor = (lib: string): CriterionTable => {
    let t = criterionTableCache.get(lib);
    if (!t) {
      t = buildCriterionTable(libs.get(lib)?.entry.ast.statements ?? []);
      criterionTableCache.set(lib, t);
    }
    return t;
  };

  const buildCtx = (lib: string, decision: Decision): DecisionCtx => {
    const declRef = decisionDeclRef(lib, decision.name);
    const spine = decisionSpine(decision);
    const gatingConceptKeys = new Set<string>();
    // #224 ii.1c — follow criterion refs into their bodies so a concept referenced ONLY via
    // a criterion is still a gating concept (source-side, no materialization; the criterion
    // NAME-level index stays ii.4).
    const criterionTable = tableFor(lib);
    for (const sn of spine) {
      if (sn.kind === "when") {
        for (const atom of branchConditionConceptRefsFollowingCriteria(
          (sn.node as WhenBlock).condition,
          criterionTable,
        )) {
          gatingConceptKeys.add(conceptKeyOf(atom.ref, lib));
        }
      } else if (sn.kind === "action") {
        const guard = (sn.node as ActionStatement).guard;
        if (guard) gatingConceptKeys.add(conceptKeyOf(guard.conceptName, lib));
      }
    }
    return {
      lib,
      name: decision.name,
      decision,
      declKey: nodeKey(declRef),
      declRef,
      spine,
      gatingConceptKeys,
      armTargets: collectDecisionArms(decision),
    };
  };

  // (a) the COVERED policy decisions.
  for (const decision of decisions) {
    if (policyLib) ctxByName.set(ctxKey(policyLib, decision.name), buildCtx(policyLib, decision));
  }

  // ONE render feeding BOTH modes (disc 154 S1, Claude-6 drift-defense): the default mode now also renders — its CEL pass
  // routes a CHAINED branch result through the run path (the disposition fired in a SUB) — and disposition-path consumes
  // the SAME render. A wholesale render failure is non-fatal in BOTH modes: the structural scaffold (clusters + over-reach
  // baseline + attribution worklist) still emits; only the chained attach / disposition clusters fall back.
  const rendered = renderScenario(graph);

  // (b) #172 todo-3 [critical, Claude-7]: populate the cross-lib ctx from the produced RUN-PATH refs, NOT
  //     `decisionReachability`. The indexer does NOT recurse a DECLARED-SHARED target's sub-nodes (indexer.ts:513), and
  //     it skips a shared sub that ITSELF chains (`Shared.Sub → Shared.Sub2`), so reachability is INCOMPLETE at the
  //     shared boundary. The run path is the authority for "what actually fired": for every `(lib, decision)` appearing
  //     in ANY case's `producedRuntimePathRefs` that is NOT already a ctx, build its ctx from the collectLibs AST. A ref
  //     to a missing/unparsable decision (an unresolved cross-lib target produces no run path, so this is defensive) is
  //     skipped — classification's index-miss / spineNodeForRef gate then defers it honestly.
  const reachedDecisions = runPathReachedDecisions(rendered, policyLib);
  for (const { lib, decision } of reachedDecisions) {
    if (ctxByName.has(ctxKey(lib, decision))) continue;
    const ast = decisionAstFor(lib, decision);
    if (ast) ctxByName.set(ctxKey(lib, decision), buildCtx(lib, ast));
  }

  // #172 todo-3 FIX 2 [important]: cross-lib concept-LEAF relation attribution. A delegated leaf's reachability is keyed
  // under the TOP-LEVEL covered decision (indexer.ts recurses with the top-level `fromDecision`), so a POLICY-OWNED
  // cross-lib sibling's gating concept (e.g. `Sibling.SibCrit`, which gates SubP's `when`) is homed in the COVERED
  // decision's cluster but with the COVERED decision's gating set — which does NOT contain it → it would be mis-labeled
  // `defines-concept` instead of `implements-criterion`. The generator-local fix: union the gating-concept keys of the
  // CROSS-LIB (non-covered) ctxs into a side set consulted alongside the per-ctx gating set. Byte-safe for a single-lib
  // policy (no cross-lib ctx → the set is EMPTY → identical output); nodeKeys are lib-qualified so a cross-lib gating key
  // (`Sibling::SibCrit`) can never collide with a same-lib concept. (This stays generator-local — no index/#171 change.)
  const crossLibGatingConceptKeys = new Set<string>();
  for (const ctx of ctxByName.values()) {
    if (ctx.lib === policyLib) continue;
    for (const k of ctx.gatingConceptKeys) crossLibGatingConceptKeys.add(k);
  }

  let clusters: Cluster[];
  if (clusterBy === "disposition-path") {
    // disposition-path mode: SKIP the per-decision cluster loop AND the ENTIRE CEL pass (buildConceptToClusterIds +
    // processCelCase + clusterIdFor). Build one cluster per distinct RUN PATH (decision-node refs only) + one
    // policy-owned-leaf coverage cluster instead. The over-reach baseline + attribution diagnostics below are kept.
    clusters = buildDispositionPathClusters(
      rendered,
      graph,
      policyLib,
      opts.celFileName,
      ctxByName,
      index,
      diagnostics,
      crossLibGatingConceptKeys,
    );
  } else {
    // ── "decision" (default): one cluster per covered-policy decision PLUS every run-path-reached cross-lib sub (#172
    //    todo-3 — widened from generate.ts:229's covered-only `decisions.map(...)`). A shared-reference cross-lib sub
    //    DOES get a cluster — the FINAL gate forces it (its rows are in the run path's `expected`, so a cluster must cite
    //    them or `lit` misses). Iterating ctxByName.values() (not just `decisions`) widens the set; a non-chaining
    //    single-lib policy reaches no cross-lib sub → the set == the covered decisions → byte-identical. Each cluster is
    //    built via `buildDecisionCluster` over the sub's OWN spine + lib. Sorted by id at the end, so iteration order
    //    here doesn't perturb output. ──
    clusters = [...ctxByName.values()].map((ctx) =>
      buildDecisionCluster(ctx, ctx.lib, index, crossLibGatingConceptKeys),
    );

    // ── the default-mode case→scenario JOIN (disc 154 S2): for the CHAINED branch attach, each AST CELCase needs its
    //    rendered scenario's run path. Key the rendered scenarios by `case.name`; a name in `duplicateScenarioNames`
    //    (a collision) OR a case with no matching rendered scenario (the renderer dropped it / render-error) leaves the
    //    map without a usable entry → `handleBranchResult` falls through to today's NON-chained leaf-name path. On a
    //    WHOLESALE render failure (success false / no scenarios) the map is empty → EVERY case falls through, but the
    //    structural scaffold still emits (the artifact is NEVER aborted; disc 154 Claude-1b). ──
    const { caseIdByName, duplicateScenarioNames } = buildCaseIdJoin(graph);
    const scenarioByName = new Map<string, ScenarioViewModel>();
    if (rendered.success !== false) {
      for (const sv of rendered.scenarios) {
        if (duplicateScenarioNames.has(sv.case.name)) continue; // a colliding name is never a safe join target
        scenarioByName.set(sv.case.name, sv);
      }
    }

    // ── CEL pass: per-case result fields → cel refs + cel diagnostics ──
    const celRefsByCluster = new Map<string, CelNodeRef[]>();
    const conceptToClusterIds = buildConceptToClusterIds(decisions, index, policyLib);
    for (const c of clusters) celRefsByCluster.set(c.id, []);
    for (const celCase of enumerateCelCases(graph)) {
      // The case's classified run path (#175 chain attach): undefined ⇒ no usable join (collision / missing scenario /
      // render failure) ⇒ handleBranchResult takes today's non-chained path verbatim. handleBooleanResult ignores it.
      const sv = scenarioByName.get(celCase.name);
      const runPath =
        sv !== undefined
          ? classifyScenarioRunPath(sv, {
              index,
              ctxByName,
              policyLib,
              caseIdByName,
              duplicateScenarioNames,
            })
          : undefined;
      processCelCase(
        celCase,
        opts.celFileName,
        policyLib!,
        ctxByName,
        conceptToClusterIds,
        celRefsByCluster,
        diagnostics,
        runPath,
        policyLib,
      );
    }
    for (const c of clusters) {
      c.cel = sortCelRefs(celRefsByCluster.get(c.id) ?? []);
    }
  }

  // Sort clusters by id; crl[] is sorted inside each cluster builder, cel[] inside it too.
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
        // Status-neutral wording (gpt55-11): in disposition-path mode an over-reach node may be unclustered (a homeless
        // leaf), not "provisional-only" — both modes mean the same thing here: the KE must still attribute it.
        message: `policy-owned ${node.nodeKind} "${node.ref.name}"${node.ref.nodeId ? "#" + node.ref.nodeId : ""} is not yet attributed (KE must attribute it to a source span).`,
        nodeKey: nodeKey(node.ref),
        ...(node.ref.nodeId !== undefined ? { nodeId: node.ref.nodeId } : {}),
      });
    }
  }

  // ── attribution-needed + drives-determination-hint (per covered decision, structural — covered-only, NOT cross-lib
  //    subs: the attribution worklist is the KE's worklist for the POLICY's own logic; a shared/cross-lib sub's
  //    attribution travels with its own library). ──
  for (const decision of decisions) {
    if (policyLib)
      emitDecisionHints(ctxByName.get(ctxKey(policyLib, decision.name))!, policyLib, diagnostics);
  }

  return { artifact, diagnostics };
}

// ── cluster construction ────────────────────────────────────────────────────────

const clusterIdFor =
  (policyLib: string | null) =>
  (decisionName: string): string =>
    // CLEAN id (no JSON punctuation, unlike a nodeKey) so it reads in a UI + a manifest.
    `cluster:${policyLib}:${decisionName}`;

/** A crl[] accumulator + its push-with-index-guard closure (shared by `buildDecisionCluster` + the disposition-path
 *  + coverage builders — Claude-12). Push a CrlNodeRef whose nodeKind/ownership are taken from the §5-authoritative
 *  index (so V1/V2 pass), status provisional (Model A), deduped by nodeKey. The only ref the index fails to resolve is a
 *  LOCATION-LESS spine sub-node (the indexer skips those at inventory time too — `indexer.ts`), so it is also absent
 *  from coverage's over-reach denominator: skipping it here keeps the scaffold + the baseline in lockstep (never an
 *  un-baseline un-clustered node). Reachability-/index-sourced refs come straight from `index.nodes`, so never skip. */
function makeGuardedCrl(index: ProvenanceIndex): {
  crl: CrlNodeRef[];
  push: (ref: ProvNodeRef, relation: CrlRelation) => void;
} {
  const crl: CrlNodeRef[] = [];
  const added = new Set<string>(); // dedupe by nodeKey within the cluster (a node reached twice appears once)
  const push = (ref: ProvNodeRef, relation: CrlRelation): void => {
    const key = nodeKey(ref);
    if (added.has(key)) return;
    const nodeKind = index.nodeKindOf(ref);
    const ownership = index.ownershipOf(ref);
    if (nodeKind === undefined || ownership === undefined) return; // location-less / unindexed → don't emit a born-broken ref
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
  return { crl, push };
}

/** Sort a crl[] by nodeKey in place + return it (the deterministic crl order used by every cluster builder). */
function sortCrl(crl: CrlNodeRef[]): CrlNodeRef[] {
  crl.sort((a, b) => (nodeKey(a) < nodeKey(b) ? -1 : nodeKey(a) > nodeKey(b) ? 1 : 0));
  return crl;
}

function buildDecisionCluster(
  ctx: {
    decision: Decision;
    declRef: ProvNodeRef;
    spine: SpineNode[];
    gatingConceptKeys: Set<string>;
  },
  // The decision's OWN lib (#172 todo-3): a covered decision passes the policy lib; a run-path-reached cross-lib sub
  // passes ITS lib (so `cluster:Shared:Sub` + `decisionSubNodeRef("Shared", "Sub", …)`). A shared-reference sub's spine
  // rows come through with ownership `shared-reference` via makeGuardedCrl (LIT, gate passes) but are NOT over-reach
  // candidates (ownership-gated). For a same-lib-only policy this is always the policy lib → byte-identical.
  lib: string,
  index: ProvenanceIndex,
  // FIX 2: gating-concept keys of the CROSS-LIB subs — consulted alongside ctx.gatingConceptKeys so a delegated
  // criterion leaf (homed here by top-level reachability) gets `implements-criterion`. Empty for a single-lib policy.
  crossLibGating: Set<string>,
): Cluster {
  const id = clusterIdFor(lib)(ctx.decision.name);
  const { crl, push } = makeGuardedCrl(index);

  // NB: we deliberately do NOT emit a ref to the bare decision DECL. It isn't an over-reach candidate (no nodeId), so it
  // needs no cluster for coverage hygiene; and suggesting a counting decision-relation on the WHOLE-decision decl would
  // let a KE satisfy a must-link-decision item by linking the bare decl instead of a concrete criterion/determination.

  // every spine sub-node, relation by kind.
  for (const sn of ctx.spine) {
    push(decisionSubNodeRef(lib, ctx.decision.name, sn.nodeId), spineRelation(sn));
  }

  // 3) every policy-owned concept + activity in THIS decision's reachability closure (so each policy-owned leaf is
  //    clustered — un-clustered would be undocumented over-reach). Relation by role: a gating concept leaf →
  //    implements-criterion; a non-gating concept (a `defined as` inference OR an operand leaf) → defines-concept;
  //    an activity (recommend target) → recommends-disposition. (#168: a `defined as` concept is INFERENCE — it defines
  //    a concept, it does NOT "compose criteria"; only `use decision` composes a sub-decision's criteria — see spineRelation.)
  const declKey = nodeKey(ctx.declRef);
  for (const [key, reach] of index.decisionReachability) {
    if (!reach.reachedBy.has(declKey)) continue;
    const node = index.nodes.get(key);
    if (!node || node.ownership !== "policy-owned") continue;
    if (node.declKind === "concept") {
      const relation: CrlRelation =
        ctx.gatingConceptKeys.has(key) || crossLibGating.has(key)
          ? "implements-criterion"
          : "defines-concept";
      push(node.ref, relation);
    } else if (node.declKind === "activity") {
      push(node.ref, "recommends-disposition");
    }
    // decisions / sub-nodes reached as nested `use decision` targets are clustered by THEIR own decision's cluster;
    // terminology/parameter are over-reach-excluded — neither needs a ref here.
  }

  return { id, label: ctx.decision.name, items: [], crl: sortCrl(crl), cel: [] };
}

// ── disposition-path clustering (#174) ─────────────────────────────────────────

/** The per-decision context the disposition-path builder consumes (a structural subset of the module DecisionCtx).
 *  Carries `lib` + `name` EXPLICITLY (#172 todo-3): the coverage builder + the spine source read them off the ctx, NEVER
 *  off the iteration key (the map is keyed `(lib, name)` now). */
interface DispoDecisionCtx {
  lib: string;
  name: string;
  decision: Decision;
  spine: SpineNode[];
  /** concept nodeKeys that gate a when/guard criterion in THIS decision — the SAME spine-derived set per-decision mode
   *  uses (so the coverage cluster's concept relations match `buildDecisionCluster`'s by construction; FIX 6). */
  gatingConceptKeys: Set<string>;
}

/** A comparable scenario, classified case-first: its frozen caseId + the decomposed run-path refs (the chain-aware
 *  STANDALONE-local refs, one per delegation frame — disc 151 Fork B; reduces to the single covered decision's ancestor
 *  chain for a non-chained case) + the covered decision it ran + that decision's lib. The refs may span MULTIPLE
 *  decisions (Main + its inlined sub-decisions). Deduped + sorted by canonical key for deterministic grouping. */
interface ComparableCase {
  caseId: string;
  decision: string;
  lib: string;
  /** the decomposed run-path refs, unique + sorted by `${lib}::${decision}::${nodeId}` (multi-decision under a chain). */
  refs: RuntimePathRef[];
  /** the produced action terminals (one per produced action) — only for #174-faithful display-id derivation (FIX 5). */
  producedTerminals: RuntimePathRef[];
}

/** Canonical, deterministic key for one decomposed run-path ref (the grouping + dedup unit). */
function refKey(r: RuntimePathRef): string {
  return `${r.lib}::${r.decision}::${r.nodeId}`;
}

/** The SpineNode a decomposed run-path ref addresses — resolved from the ref's OWN decision's spine, in the LIB-QUALIFIED
 *  ctx (#172 todo-3: the `ref.lib !== coveredLib` cross-lib guard is REMOVED). The ctx map is keyed `(lib, name)`, so a
 *  cross-lib sub resolves from its OWN lib's spine — the disposition-path can now cite the decomposed cross-lib refs and
 *  round-trip clean. Returns undefined (→ the caller DEFERS, never defaults a relation) when the ref's `(lib, decision)`
 *  is not a populated ctx (an unreached / unindexed decision), or its nodeId names no spine node. So the relation stays
 *  honest by construction: every emitted relation comes from a real SpineNode, and anything unresolvable is routed out of
 *  the comparable set during classification. (The lib is carried by the ref's (lib, decision) ctx key — no separate
 *  coveredLib arg, #172 todo-3 FIX 6 nit.) */
function spineNodeForRef(
  ref: RuntimePathRef,
  ctxByName: Map<string, DispoDecisionCtx>,
): SpineNode | undefined {
  const ctx = ctxByName.get(ctxKey(ref.lib, ref.decision));
  if (!ctx) return undefined;
  return ctx.spine.find((sn) => sn.nodeId === ref.nodeId);
}

/** Sanitize a string into a deterministic, JSON-punctuation-free cluster-id segment (mirrors clusterIdFor's cleanliness:
 *  no `/`/`:` that would clash with the `cluster:lib:…` shape). */
function sanitizeIdSeg(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_");
}

/** True iff a decomposed run path is entirely within the covered decision (no inlined sub-decision frame). #172 todo-3
 *  FIX 1 [critical]: compares BOTH lib AND decision — a cross-lib delegation to a SAME-NAMED sub (`Policy.D → use
 *  decision "Shared"."D"`) has every ref `decision === "D"`, so a name-only test would mis-classify it as non-chained and
 *  route the disposition to `cluster:Policy:D` instead of `cluster:Shared:D` — reintroducing the exact name-collision
 *  class the (lib, name) re-key closed everywhere else. The covered FRAME is (coveredLib, coveredDecision). */
function isNonChained(
  coveredLib: string,
  coveredDecision: string,
  refs: RuntimePathRef[],
): boolean {
  return refs.every((r) => r.lib === coveredLib && r.decision === coveredDecision);
}

/** Deterministic disposition-cluster id = pure function of (lib, covered decision, the run path). Two derivations,
 *  chosen so #175 is PURELY ADDITIVE (FIX 5):
 *   - NON-chained (every ref in the covered decision): reproduce #174's tail EXACTLY — the sorted PRODUCED-ACTION
 *     nodeIds (the terminals) joined with `+`. So the existing #174 disposition-path output is byte-identical; only
 *     newly-RESOLVING chained cases get a new id shape.
 *   - chained: the sorted full ref set's per-frame display segments (`nodeId` for the covered decision, else
 *     `decision~nodeId`) joined with `+`, so a chained path's sub-decision frames are distinguished in the id.
 *  When the joined tail is long it is sha256 hash-capped (still deterministic) so the id stays bounded. */
function dispositionPathId(
  lib: string,
  decision: string,
  refs: RuntimePathRef[],
  producedTerminals: RuntimePathRef[],
): string {
  // The covered frame for a disposition-path id is (lib, decision) — the decompose root. FIX 1: compare BOTH so a
  // cross-lib same-name path takes the CHAINED id shape (its sub frames get the `decision~nodeId` segment) rather than
  // collapsing to the non-chained terminal form.
  const tailParts = isNonChained(lib, decision, refs)
    ? // #174 form: the sorted produced-action nodeIds (the terminals) — NOT the full ancestor chain.
      [...new Set(producedTerminals.map((t) => t.nodeId))].sort().map(sanitizeIdSeg)
    : refs.map((r) =>
        sanitizeIdSeg(
          r.lib === lib && r.decision === decision ? r.nodeId : `${r.lib}~${r.decision}~${r.nodeId}`,
        ),
      );
  const tail = tailParts.join("+");
  const seg = tail.length > 80 ? createHash("sha256").update(tail).digest("hex").slice(0, 16) : tail;
  return `cluster:${sanitizeIdSeg(lib)}:${sanitizeIdSeg(decision)}:${seg}`;
}

/** The SHARED per-scenario classify result (#175 disc 154): either a fully-grounded comparable run path, OR a deferral
 *  with the matching `CorrespondenceUncheckedReason` (+ optional details). The disposition-path classifier AND the
 *  default-mode chained branch attach BOTH go through `classifyScenarioRunPath`, so the honesty gate (gaps / index-miss /
 *  `spineNodeForRef`) cannot fork across the consumers. `comparable` carries the same fields a `ComparableCase` needs
 *  PLUS `producedTerminals` (the grounded produced-action rows), which the default-mode attach matches X against. */
type ScenarioRunPath =
  | { kind: "comparable"; case: ComparableCase }
  | { kind: "deferred"; reason: CorrespondenceUncheckedReason; details?: string[] };

/** Classify ONE rendered scenario into a comparable run path or a deferral — the single source of truth for "is this
 *  scenario's run path groundable, and if so what are its standalone refs" shared by the disposition-path classifier and
 *  the default-mode chained branch attach (disc 154, Claude-6: ONE classify so the third consumer can't fork the gate).
 *  Mirrors correspondenceCheck.ts's order + the `?? ""` lib fallback exactly, so generate + the FINAL gate never skew. */
function classifyScenarioRunPath(
  sv: ScenarioViewModel,
  deps: {
    index: ProvenanceIndex;
    ctxByName: Map<string, DispoDecisionCtx>;
    policyLib: string | null;
    caseIdByName: Record<string, string>;
    duplicateScenarioNames: Set<string>;
  },
): ScenarioRunPath {
  const { index, ctxByName, policyLib, caseIdByName, duplicateScenarioNames } = deps;
  const caseName = sv.case.name;

  // ambiguity dominates run state / decision shape (matches correspondenceCheck's order).
  if (duplicateScenarioNames.has(caseName)) return { kind: "deferred", reason: "case-name-collision" };
  if (sv.status === "error") return { kind: "deferred", reason: "run-error" };
  if (sv.decision === null) return { kind: "deferred", reason: "no-decision" };
  if (!sv.decision.resolved) return { kind: "deferred", reason: "unresolved-decision" };
  const caseId = caseIdByName[caseName];
  if (caseId === undefined) {
    // A ≥2-frozen-name collision was already routed to case-name-collision by the duplicateScenarioNames first-guard
    // above, so a missing caseId here can ONLY be an unfrozen case — the unconditional reason is safe.
    return { kind: "deferred", reason: "unfrozen-case" };
  }
  const decision = sv.decision.name;
  // IDENTICAL lib fallback to correspondenceCheck.ts (`?? ""`, NOT `?? policyLib`): the generator and the FINAL gate
  // must agree on the run-path key. If libraryName is ever undefined, lib="" makes the index lookup below MISS →
  // the generator defers the case (unmapped-runtime-node) exactly as the checker marks it unchecked — never a skew
  // where the generator is more permissive than the validator.
  const lib = sv.decision.libraryName ?? "";

  // The chain-aware run path (#175, disc 151 Fork B): the SAME `producedRuntimePathRefs` primitive the FINAL gate
  // (correspondenceCheck.ts) consumes — ONE call site, no drift (disc 151 ref 3), so a generated disposition-path
  // scaffold round-trips clean through the gate. It re-roots a deep inlined same-lib `use decision` run path into
  // ordered STANDALONE-local refs (one per delegation frame), reducing to the covered decision's ancestor chain for a
  // non-chained case.
  const paths = producedRuntimePathRefs(sv.tree as unknown as MinimalViewNode[], { lib, decision });
  if (paths.length === 0) return { kind: "deferred", reason: "no-produced-action" };

  // deferred-disposition-path/unmapped (mirror correspondenceCheck's honesty gate, disc 151 ref 5): a path is
  // un-clusterable (DEFER, never a defaulted/guessed scaffold) iff ANY of —
  //   (1) non-empty `gaps` (the decomposer could not re-root a node);
  //   (2) a ref's standalone `decisionSubNodeRef` is NOT in the index (no structure row joins it);
  //   (3) a ref's relation can't be resolved from its OWN decision's spine (FIX 1 — a cross-lib ref, or a ref whose
  //       SpineNode is absent): disposition-path mode is relation-honest BY CONSTRUCTION, so an unresolvable relation
  //       must DEFER, not default to implements-criterion (a silently structurally-wrong scaffold).
  // The honesty gate is TOTAL: index miss, gap, OR unresolvable relation/lib all defer. Citations are lib-qualified
  // (FIX 2 — a sub name can repeat across libs) using the exact lookup key shape. The covered decision's ctx is keyed by
  // its (lib, name) — `lib` here is the decompose root lib (the covered decision's library), matching how it was seeded.
  const ctx = ctxByName.get(ctxKey(lib, decision));
  const unmapped: string[] = [];
  const refsByKey = new Map<string, RuntimePathRef>();
  // The produced TERMINALS (the last ref of each grounded path = the produced action row) — used to reproduce #174's
  // display-id derivation for a NON-chained path (FIX 5 byte-stability; see dispositionPathId) AND, in default mode, to
  // match a chained `D is X` branch result against the SUB-decision its disposition actually fired in (disc 154).
  const producedTerminals: RuntimePathRef[] = [];
  for (const p of paths) {
    if (p.gaps.length > 0) {
      unmapped.push(...p.gaps);
      continue;
    }
    if (p.refs.length > 0) producedTerminals.push(p.refs[p.refs.length - 1]);
    for (const ref of p.refs) {
      const cite = `${ref.lib}::${ref.decision}#${ref.nodeId}`;
      if (index.nodeKindOf(decisionSubNodeRef(ref.lib, ref.decision, ref.nodeId)) === undefined) {
        unmapped.push(cite); // (2) no structure row
      } else if (spineNodeForRef(ref, ctxByName) === undefined) {
        unmapped.push(cite); // (3) no resolvable relation from the ref's own decision spine (or cross-lib)
      } else {
        refsByKey.set(refKey(ref), ref);
      }
    }
  }
  if (!ctx || unmapped.length > 0) {
    return { kind: "deferred", reason: "unmapped-runtime-node", details: [...new Set(unmapped)] };
  }

  return {
    kind: "comparable",
    case: {
      caseId,
      decision,
      lib,
      refs: [...refsByKey.values()].sort((a, b) => (refKey(a) < refKey(b) ? -1 : refKey(a) > refKey(b) ? 1 : 0)),
      producedTerminals,
    },
  };
}

/** Build the disposition-path + coverage clusters (#174). One cluster per distinct run path (decision-node refs ONLY) +
 *  one policy-owned-leaf coverage cluster. Skipped scenarios + a failed render emit `deferred-disposition-path`
 *  diagnostics (the matching CorrespondenceUncheckedReason). The coverage cluster carries ALL policy-owned leaves so the
 *  over-reach baseline is identical to per-decision mode (Claude-2). Consumes the ALREADY-rendered scenarios (the render
 *  is hoisted above the mode branch — disc 154 S1 — so default + disposition-path share one render). */
function buildDispositionPathClusters(
  rendered: ReturnType<typeof renderScenario>,
  graph: ResolvedCelGraph,
  policyLib: string | null,
  celFileName: string,
  ctxByName: Map<string, DispoDecisionCtx>,
  index: ProvenanceIndex,
  diagnostics: GenerateDiagnostic[],
  crossLibGating: Set<string>,
): Cluster[] {
  const dispositionClusters: Cluster[] = [];

  if (rendered.success === false) {
    // A wholesale failed render → mirror correspondenceCheck's render-failed: ONE diagnostic, NO disposition clusters.
    // The coverage cluster is STILL emitted (below) so the over-reach baseline matches per-decision mode.
    diagnostics.push({
      kind: "deferred-disposition-path",
      reason: "render-failed",
      message: `disposition-path: scenario render failed — emitting no disposition clusters (coverage cluster only).`,
      ...(rendered.errors.length ? { details: rendered.errors } : {}),
    });
    return finishWithCoverage(policyLib, index, ctxByName, dispositionClusters, crossLibGating);
  }

  const { caseIdByName, duplicateScenarioNames } = buildCaseIdJoin(graph);

  // ── classify each scenario case-FIRST → comparable | skipped (a deferred-disposition-path diagnostic per skip) via the
  //    SHARED classify helper (so the gate semantics can't fork between this consumer + the default-mode chained attach) ──
  const comparable: ComparableCase[] = [];
  for (const sv of rendered.scenarios) {
    const classified = classifyScenarioRunPath(sv, {
      index,
      ctxByName,
      policyLib,
      caseIdByName,
      duplicateScenarioNames,
    });
    if (classified.kind === "deferred") {
      diagnostics.push({
        kind: "deferred-disposition-path",
        reason: classified.reason,
        message: `disposition-path: case "${sv.case.name}" is not path-clusterable (${classified.reason}).`,
        ...(classified.details && classified.details.length ? { details: classified.details } : {}),
      });
      continue;
    }
    comparable.push(classified.case);
  }

  // ── group comparable cases by (lib, decision, sorted produced-action set) → one disposition cluster per distinct path.
  //    GROUP on an UN-CAPPED canonical key (the full sorted nodeId set), NOT the display pathId (which hash-caps a long
  //    tail to 16 hex chars): two distinct produced-sets whose capped tails collide must NOT merge into one group (the
  //    group would keep the FIRST case's nodeIds yet carry the SECOND's cases — a path-A cluster citing path-B cases,
  //    the exact bleed this mode forbids). The display pathId (de-collided below) is only the EMITTED cluster.id. ──
  interface Group {
    canonicalKey: string;
    lib: string;
    decision: string;
    /** the decomposed run-path refs (multi-decision under a chain), the cluster's cited rows. */
    refs: RuntimePathRef[];
    /** the produced terminals of the FIRST case in the group — only for the #174-faithful display id (FIX 5). */
    producedTerminals: RuntimePathRef[];
    caseIds: Set<string>;
  }
  const groups = new Map<string, Group>();
  for (const c of comparable) {
    // GROUP on the full decomposed REF SET (canonical, spanning every delegation frame's decision), NOT the covered
    // decision's deep nodeIds — two cases share a disposition cluster iff their entire re-rooted run path matches.
    const canonicalKey = JSON.stringify([c.lib, c.decision, c.refs.map(refKey)]);
    let g = groups.get(canonicalKey);
    if (!g) {
      g = {
        canonicalKey,
        lib: c.lib,
        decision: c.decision,
        refs: c.refs,
        producedTerminals: c.producedTerminals,
        caseIds: new Set(),
      };
      groups.set(canonicalKey, g);
    }
    g.caseIds.add(c.caseId);
  }

  // Assign each group its emitted cluster.id deterministically: the display pathId, de-collided with a `-2`/`-3`/… suffix
  // (in sorted-canonical-key order) on the rare hash collision so two DISTINCT groups never share an id (which would let
  // a downstream consumer merge them). Iterate groups in canonical-key order so the suffixing is deterministic.
  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.canonicalKey < b.canonicalKey ? -1 : a.canonicalKey > b.canonicalKey ? 1 : 0,
  );
  const usedIds = new Map<string, number>();
  for (const g of sortedGroups) {
    const base = dispositionPathId(g.lib, g.decision, g.refs, g.producedTerminals);
    const n = (usedIds.get(base) ?? 0) + 1;
    usedIds.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    dispositionClusters.push(buildDispositionCluster(id, g, celFileName, policyLib, ctxByName, index));
  }

  return finishWithCoverage(policyLib, index, ctxByName, dispositionClusters, crossLibGating);
}

/** Append the ONE coverage cluster to the disposition clusters (after them, so coverage covers what they DON'T cite),
 *  and return the full set. Coverage carries every policy-owned over-reach candidate NOT already in a disposition
 *  cluster — keeping the over-reach baseline identical to per-decision mode even with untaken branches. */
function finishWithCoverage(
  policyLib: string | null,
  index: ProvenanceIndex,
  ctxByName: Map<string, DispoDecisionCtx>,
  dispositionClusters: Cluster[],
  crossLibGating: Set<string>,
): Cluster[] {
  if (policyLib === null) return dispositionClusters;
  const cited = new Set<string>();
  for (const c of dispositionClusters) for (const ref of c.crl) cited.add(nodeKey(refToProv(ref)));
  return [...dispositionClusters, buildCoverageCluster(policyLib, index, ctxByName, cited, crossLibGating)];
}

/** A CrlNodeRef → its ProvNodeRef (the nodeKey-bearing subset), for deduping against the index. */
function refToProv(ref: CrlNodeRef): ProvNodeRef {
  return {
    lib: ref.lib,
    kind: ref.kind,
    name: ref.name,
    ...(ref.nodeId !== undefined ? { nodeId: ref.nodeId } : {}),
  };
}

/** One DISPOSITION cluster for a run-path group: crl = the decomposed run-path refs (#175 chain-aware — each frame's
 *  WHEN/OTHERWISE/ACTION rows, SPANNING the covered decision + any inlined sub-decisions) mapped to a decisionSubNodeRef
 *  (relation via spineRelation off THAT ref's OWN decision spine — NEVER a concept ref, structural per Claude-3); cel =
 *  the group's frozen cases. items: []. The refs already include every ancestor row per frame (the decomposer returns
 *  the full path), so NO additional ancestorChain expansion is applied. */
function buildDispositionCluster(
  id: string,
  g: { lib: string; decision: string; refs: RuntimePathRef[]; caseIds: Set<string> },
  celFileName: string,
  policyLib: string | null,
  ctxByName: Map<string, DispoDecisionCtx>,
  index: ProvenanceIndex,
): Cluster {
  const { crl, push } = makeGuardedCrl(index);
  // Each decomposed ref → its standalone decisionSubNodeRef; relation from the SpineNode of the ref's OWN decision
  // (Claude-9 — never hand-rolled from the nodeId string). Classification already DEFERRED any case with a ref whose
  // SpineNode is unresolvable (FIX 1), so `spineNodeForRef` is non-undefined here for every ref — we assert that rather
  // than default a (possibly wrong) relation: a relation-honest-by-construction mode never emits a guessed relation.
  for (const ref of g.refs) {
    const sn = spineNodeForRef(ref, ctxByName);
    if (sn === undefined) continue; // unreachable post-classification; skip rather than fabricate a relation
    push(decisionSubNodeRef(ref.lib, ref.decision, ref.nodeId), spineRelation(sn));
  }

  // label: the covered decision + the terminal recommend ACTIVITY target(s) of this path (human-readable; non-semantic).
  // Only RecommendActivity action rows contribute — a use-decision boundary row is delegation glue, not a disposition.
  const targets = g.refs
    .map((ref) => spineNodeForRef(ref, ctxByName))
    .filter(
      (sn): sn is SpineNode =>
        sn !== undefined &&
        sn.kind === "action" &&
        (sn.node as ActionStatement).action.type === "RecommendActivity",
    )
    .map((sn) => actionTargetName(sn))
    .filter((t): t is string => t !== undefined);
  const label =
    targets.length > 0 ? `${g.decision} → ${[...new Set(targets)].sort().join(" + ")}` : g.decision;

  const cel: CelNodeRef[] = sortCelRefs(
    [...g.caseIds].map((caseId) => ({
      file: celFileName,
      kind: "case" as const,
      caseId,
      relation: "tests-branch" as CelRelation,
      status: "provisional" as const,
    })),
  );

  return { id, label, items: [], crl: sortCrl(crl), cel };
}

/** The ONE coverage cluster: every policy-owned OVER-REACH CANDIDATE in the index NOT already cited by a disposition
 *  cluster — leaves (concept/activity) AND UNTAKEN decision sub-nodes (an on-path sub-node is already in its disposition
 *  cluster; an untaken-branch sub-node is over-reach too and would be HOMELESS otherwise — diverging from per-decision
 *  mode the moment a KE links). NO cel, NO items → correspondence-inert (a cluster with no cel is never in
 *  `unitsForCase`, so it can never light a row → cannot bleed; Claude-7/8). Carrying every candidate keeps the over-reach
 *  baseline byte-identical to per-decision mode (Claude-2 + FIX 4). Relations mirror buildDecisionCluster's: a concept
 *  gating ANY decision's when/guard → implements-criterion, else defines-concept; an activity → recommends-disposition;
 *  a decision sub-node → spineRelation off that decision's spine (the SAME spine source per-decision mode uses; FIX 6). */
function buildCoverageCluster(
  policyLib: string,
  index: ProvenanceIndex,
  ctxByName: Map<string, DispoDecisionCtx>,
  cited: Set<string>,
  crossLibGating: Set<string>,
): Cluster {
  // The coverage cluster mirrors the per-decision builder's node SELECTION exactly — the union, over every covered
  // decision, of {its spine sub-nodes} ∪ {its reachability-closure's policy-owned concept/activity leaves} — MINUS what
  // a disposition cluster already cited. Iterating that SAME source (not a blanket index scan) guarantees the two modes
  // cite the identical node set with identical relations (an unreachable policy-owned leaf is homed by NEITHER mode →
  // stays homeless in both, consistent), so the over-reach baseline is byte-identical (FIX 4) and relations agree (FIX 6).
  const { crl, push } = makeGuardedCrl(index);

  // Iterate the ctx VALUES (each carries its own lib + name — #172 todo-3): the key is `(lib, name)` now, so deriving the
  // decl ref / sub-node refs from the iteration key would break. A cross-lib ctx (a run-path-reached sub) is included
  // here too — but its spine push is OWNERSHIP-FILTERED below (step 5).
  for (const ctx of ctxByName.values()) {
    const declKey = nodeKey(decisionDeclRef(ctx.lib, ctx.name));

    // (1) every spine sub-node, relation by spineRelation (the on-path ones are skipped via `cited`). #172 todo-3 step 5:
    //     ownership-filter the cross-lib push to POLICY-OWNED (mirror the leaf filter in (2)). A DECLARED-SHARED cross-lib
    //     sub contributes NO coverage rows — its sub-nodes are `shared-reference`, NOT over-reach candidates
    //     (ownership-gated by `isOverReach`), so homing them in coverage would diverge the baseline AND wrongly imply the
    //     KE must attribute another library's logic. A POLICY-OWNED cross-lib sibling DOES contribute (its untaken arms
    //     are genuine over-reach candidates / KE worklist). The covered policy's own rows are policy-owned → unaffected.
    //     NOTE (do NOT "fix"): a shared-reference sub IS cited `shared-reference` in its DISPOSITION cluster (LIT in the
    //     cockpit, the gate passes) but is correctly absent from COVERAGE — the two channels are orthogonal by design
    //     (revealMaps is ownership-blind; over-reach is ownership-gated). Removing the shared ref from the disposition
    //     cluster to "clean up" coverage would break the FINAL gate (its rows are in the run path's `expected`).
    for (const sn of ctx.spine) {
      const ref = decisionSubNodeRef(ctx.lib, ctx.name, sn.nodeId);
      if (cited.has(nodeKey(ref))) continue;
      if (index.ownershipOf(ref) !== "policy-owned") continue; // shared-reference cross-lib sub → no coverage rows
      push(ref, spineRelation(sn));
    }

    // (2) this decision's reachability-closure policy-owned leaves, relation by role (gating concept → implements-
    //     criterion; non-gating concept → defines-concept; activity → recommends-disposition) — IDENTICAL to
    //     buildDecisionCluster, using this decision's own spine-derived gatingConceptKeys (FIX 6).
    for (const [key, reach] of index.decisionReachability) {
      if (!reach.reachedBy.has(declKey)) continue;
      const node = index.nodes.get(key);
      if (!node || node.ownership !== "policy-owned") continue;
      if (cited.has(key)) continue;
      if (node.declKind === "concept") {
        push(
          node.ref,
          ctx.gatingConceptKeys.has(key) || crossLibGating.has(key)
            ? "implements-criterion"
            : "defines-concept",
        );
      } else if (node.declKind === "activity") {
        push(node.ref, "recommends-disposition");
      }
    }
  }

  return {
    id: `cluster:${sanitizeIdSeg(policyLib)}:coverage`,
    label: "coverage",
    items: [],
    crl: sortCrl(crl),
    cel: [],
  };
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
  return `when ${describeBranchCondition((sn.node as WhenBlock).condition, getRefName)}`;
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
  ctxByName: Map<string, DispoDecisionCtx & { lib: string; armTargets: Set<string> }>,
  conceptToClusterIds: Map<string, Set<string>>,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
  // #175 (disc 154 S2/S3): the case's classified run path (undefined ⇒ no usable join: collision / missing scenario /
  // render failure ⇒ handleBranchResult takes today's non-chained leaf-name path VERBATIM). handleBooleanResult ignores it.
  runPath: ScenarioRunPath | undefined,
  coveredLib: string | null,
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
        celRefsByCluster,
        diagnostics,
        runPath,
        coveredLib,
      );
    } else {
      // handleBooleanResult is UNCHANGED by #175 (disc 154 Claude-3). INTENTIONAL ASYMMETRY: a chained case's BRANCH ref
      // lands in the ONE sub-decision cluster its disposition actually fired in (handleBranchResult below), but its
      // BOOLEAN (fact) ref fans to EVERY reachable cluster via conceptToClusterIds (#171 reachability recursion). That is
      // correct, not a gap: a fact assertion is ABOUT the concept wherever it is reachable, independent of the run PATH
      // the case took — whereas a disposition is the outcome of one specific firing arm.
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
  ctxByName: Map<string, DispoDecisionCtx & { lib: string; armTargets: Set<string> }>,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
  runPath: ScenarioRunPath | undefined,
  coveredLib: string | null,
): void {
  const decisionName = rf.leafName;
  // The result leaf names the COVERED decision (CEL resolves a result leaf against the covered library's decls), so its
  // ctx is keyed by (coveredLib, decisionName). The non-chained leaf-name attach lands in cluster:coveredLib:decisionName.
  const ctx = coveredLib !== null ? ctxByName.get(ctxKey(coveredLib, decisionName)) : undefined;
  if (!ctx) {
    // a branch result whose leaf does not name a covered decision — nothing structural to attach it to.
    diagnostics.push({
      kind: "unsupported-cel-result",
      message: `CEL case ${celCase.name} result "${decisionName} is ${branch.branchName}" does not name a covered decision.`,
      caseId: celCase.caseId,
    });
    return;
  }

  // #175 (disc 154 S3): is this a CHAINED case whose disposition fired in a SUB-decision? It is iff the run path is a
  // COMPARABLE classify whose covered decision matches the result leaf AND whose refs span ≥1 inlined sub frame. A
  // comparable+NON-chained run, or a decision-name mismatch, keeps today's leaf-name + D-spine path VERBATIM. An
  // unavailable / deferred run path is handled by the honest-defer gate just below (it defers for a CHAINING decision and
  // otherwise falls through to today's path).
  // FIX 1: the covered frame is (runPath.case.lib, decisionName) — `isNonChained` compares BOTH so a cross-lib SAME-NAME
  // sub (`Policy.D → Shared.D`) is correctly seen as CHAINED (its firing refs are in Shared, not the covered frame) and
  // routes to handleChainedBranchResult → cluster:Shared:D, not the leaf attach to cluster:Policy:D.
  const chained =
    runPath !== undefined &&
    runPath.kind === "comparable" &&
    runPath.case.decision === decisionName &&
    !isNonChained(runPath.case.lib, decisionName, runPath.case.refs);
  if (chained) {
    handleChainedBranchResult(
      branch,
      celCase,
      celFileName,
      frozen,
      caseId,
      (runPath as { kind: "comparable"; case: ComparableCase }).case,
      ctxByName,
      coveredLib,
      celRefsByCluster,
      diagnostics,
    );
    return;
  }

  // HONESTY for a CHAINING decision whose case we CANNOT cluster (disc 154 S3 + disc 155 FIX 2, the critical no-guess
  // rule): the covered decision STRUCTURALLY chains (a `use decision` in its spine), so a branch result `D is X` can name
  // a disposition X that fired in a SUB D delegates to — and today's leaf-name + D-spine path would mis-attach a phantom
  // `tests-branch` ref to D's cluster (X is a SUB's target — it never matches D's own spine; worse when D ALSO recommends
  // X). So for a chaining decision we DEFER for EITHER —
  //   (1) a `deferred` classify (the scenario ran but couldn't ground: gaps / index-miss / run-error / unfrozen /
  //       no-produced-action), OR
  //   (2) an `undefined` run path (collision / missing scenario / wholesale render-fail) — we have NO run evidence of
  //       where X fired, so we cannot honestly attach. The over-defer cost (a legit D-own-arm case that happens to be
  //       unjoinable now defers instead of attaching) is the honest call: without the run we genuinely can't tell.
  // The defer is NO ref to D + a per-case diagnostic; the structural scaffold (clusters + over-reach baseline +
  // attribution worklist) is emitted upstream regardless. This block can ONLY fire for a CHAINING decision, so a
  // genuinely NON-chaining policy (no `use decision`) never reaches it → its output stays byte-identical.
  if (decisionChains(ctx.spine) && (runPath === undefined || runPath.kind === "deferred")) {
    if (runPath !== undefined && runPath.kind === "deferred" && runPath.reason === "unfrozen-case") {
      // an unfrozen chained case → the existing per-case freeze diagnostic, NO ref. (emitCelRef would also emit only this,
      // but we never call it — we must not let the leaf-name path emit a tests-branch ref to D for a chained case.)
      diagnostics.push({
        kind: "unfrozen-case",
        message: `CEL case ${celCase.name} has no explicit \`- id is "..."\`; freeze it before it can carry a provenance ref (would-be relation tests-branch).`,
      });
    } else {
      const why =
        runPath === undefined
          ? "its run path is unavailable (case-name collision, no rendered scenario, or a render failure)"
          : `its run path is not clusterable (${runPath.reason})`;
      diagnostics.push({
        kind: "cel-result-run-mismatch",
        message: `CEL case ${celCase.name} result "${decisionName} is ${branch.branchName}" runs a chained \`use decision\`, but ${why}; deferring rather than attaching to ${decisionName}.`,
        caseId: celCase.caseId,
        ...(runPath !== undefined && runPath.kind === "deferred" && runPath.details && runPath.details.length
          ? { details: runPath.details }
          : {}),
      });
    }
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
    clusterIdFor(coveredLib)(decisionName),
    celFileName,
    frozen,
    caseId,
    relation,
    celCase,
    celRefsByCluster,
    diagnostics,
  );
}

/** #175 (disc 154 S3) — THE FIX: a CHAINED branch result `D is X` whose disposition X fired in a SUB-decision. Match X to
 *  the produced TERMINAL(s) whose OWN-spine `actionTargetName === X`, then attach the case to that SUB's cluster + arm:
 *   - exactly 1 → attach to `clusterIdFor(terminal.lib)(terminal.decision)` (the firing sub's cluster, in the TERMINAL's
 *     OWN lib — #172 todo-3 cross-lib: a sub that fired in `Shared` → `cluster:Shared:Sub`, NOT the covered lib) with the
 *     relation read from `branchArmSegment(terminal.nodeId)` on the SUB's spine (tests-otherwise / tests-branch). The case
 *     lands where its disposition actually fired — NOT orphaned on D + sub-clusters starving (the #175 repro).
 *   - >1 (X fired in ≥2 subs/arms in one run) → DEFER `ambiguous-cel-branch` (never pick first — the chained analogue of
 *     the existing ambiguous case).
 *   - 0 (the run produced no X — the result field disagrees with the actual run) → the NEW `cel-result-run-mismatch`.
 *  An unfrozen chained case still defers via `emitCelRef`'s `unfrozen-case` (NEVER attaches to a guessed cluster). */
function handleChainedBranchResult(
  branch: CELBranchResult,
  celCase: CELCase,
  celFileName: string,
  frozen: boolean,
  caseId: string | undefined,
  rp: ComparableCase,
  ctxByName: Map<string, DispoDecisionCtx & { lib: string; armTargets: Set<string> }>,
  coveredLib: string | null,
  celRefsByCluster: Map<string, CelNodeRef[]>,
  diagnostics: GenerateDiagnostic[],
): void {
  // The produced terminals whose OWN-spine action target is X. A terminal is a grounded produced-action row of SOME
  // decision in the run path; resolve its SpineNode off ITS decision's spine (NOT the covered decision's) so a sub's
  // recommend is read from the sub's spine — honest by construction (a terminal that doesn't resolve is skipped, never
  // guessed). `spineNodeForRef` resolves the ref in the lib-qualified ctx (#172 todo-3: cross-lib subs ARE populated, so
  // a cross-lib terminal now resolves), matching classify.
  // DEDUPE by refKey (disc 155 FIX 3): an `all:` path that invokes the SAME sub twice can yield two firing entries with
  // the IDENTICAL `{lib, decision, nodeId}` — ONE cluster/relation target, NOT real ambiguity. Collapse to distinct
  // terminal refs FIRST so only ≥2 genuinely-distinct firing rows trip the ambiguous branch.
  const firingByKey = new Map<string, RuntimePathRef>();
  for (const t of rp.producedTerminals) {
    const sn = spineNodeForRef(t, ctxByName);
    if (sn !== undefined && sn.kind === "action" && actionTargetName(sn) === branch.branchName) {
      firingByKey.set(refKey(t), t);
    }
  }
  const firing = [...firingByKey.values()];

  if (firing.length === 0) {
    // the run produced no terminal targeting X — the result field disagrees with the run. DEFER (never attach to a guess).
    const produced = [...new Set(rp.producedTerminals.map((t) => {
      const sn = spineNodeForRef(t, ctxByName);
      return sn !== undefined ? (actionTargetName(sn) ?? t.nodeId) : t.nodeId;
    }))].sort();
    diagnostics.push({
      kind: "cel-result-run-mismatch",
      message: `CEL case ${celCase.name} result "${rp.decision} is ${branch.branchName}" claims a disposition the run did not produce; the run produced: ${produced.join(", ") || "(none)"}.`,
      caseId: celCase.caseId,
      ...(produced.length ? { details: produced } : {}),
    });
    return;
  }
  if (firing.length > 1) {
    // X fired in ≥2 DISTINCT sub-decision rows in ONE run (two different sub frames / arms each recommending X — NOT the
    // same terminal counted twice, which the refKey dedup above already collapsed). Genuinely ambiguous; DEFER rather than
    // pick a cluster. The chained analogue of the existing reused-target ambiguity.
    diagnostics.push({
      kind: "ambiguous-cel-branch",
      message: `CEL case ${celCase.name} branch "${branch.branchName}" fired in ${firing.length} distinct sub-decisions/arms of the run path; deferring (no single firing cluster).`,
      caseId: celCase.caseId,
    });
    return;
  }

  // exactly one firing terminal → attach to ITS sub-decision's cluster, relation from the arm it sits under on the SUB's
  // own spine. THIS IS THE FIX: the case lands in the sub-decision cluster its disposition fired in.
  // #172 todo-3 [critical]: the cluster id MUST use the TERMINAL's lib (`clusterIdFor(terminal.lib)`), NOT the covered
  // lib — a cross-lib terminal fired in `Shared.Sub` → `cluster:Shared:Sub`, not `cluster:Policy:Sub`. The widened
  // default-mode cluster set (ctxByName.values()) created that `cluster:Shared:Sub` bucket, so emitCelRef finds it; using
  // coveredLib would target a non-existent `cluster:Policy:Sub` → emitCelRef drops the ref (homeless) → silent
  // under-attribution. (A same-lib chain has terminal.lib === coveredLib, so this is byte-identical there.)
  const terminal = firing[0];
  const relation: CelRelation =
    branchArmSegment(terminal.nodeId) === "otherwise" ? "tests-otherwise" : "tests-branch";
  emitCelRef(
    clusterIdFor(terminal.lib)(terminal.decision),
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
