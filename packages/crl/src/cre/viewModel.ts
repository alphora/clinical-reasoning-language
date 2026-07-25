/**
 * Scenario view-model — the stable CRE↔UI contract (roadmap item #2). `renderScenario` runs the CRE
 * over a resolved CEL graph and projects each case into a host-independent `ScenarioViewModel`: the
 * FULL decision tree (the AST is the structural spine — every branch/action, reached or not) overlaid
 * with per-node run state from the CRE trace (matched by the trace's `nodeId`). This is DECOUPLED from
 * the raw `TraceNode` on purpose: the internal trace can evolve without breaking the UI/agent contract.
 *
 * Why an AST spine (vs emitting unreached-branch skeletons in the CRE): the full tree must show EVERY
 * node grayed by reachability — not only first:-preempted siblings but also the bodies of unsatisfied
 * `when`s (condition false ⇒ body not executed). The AST already holds the complete structure; the
 * trace supplies state. `nodeId`/`recName`/`childId` are imported from `run.ts` so the walk assigns
 * ids IDENTICAL to the CRE's — the alignment key.
 */
import { idOf, type LibAwareDecisionResolver } from "../ast/decisionSpine";
import type {
  ActionStatement,
  BlockBody,
  BlockQualifier,
  BranchBlock,
  Decision,
  Location,
  ReferenceName,
  WhenBlockBody,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { soleRefOrThrow } from "../ast/branchCondition";
import type { CELCase, CELDefinedByField, CELFact } from "../cel/ast/types";
import { resolveDefinedByTarget } from "../cel/definedByResolve";
import type { ResolvedCelGraph, CelImportDiagnostic } from "../cel/imports/types";
import type { LsLocation } from "../language-services/contracts";
import { toZeroBasedRange } from "../language-services/contracts";
import { mapImportDiagnostic } from "../language-services/diagnostics";

import { buildGlobalDecisionMap, makeResolveDecision } from "./decisionResolver";
import { childId, runCel, type CompositionTrace, type TraceNode } from "./run";

/** Bump on any breaking change to the shapes below (the UI/agent contract). The C2c-2 `facts[].definedBy`
 *  addition is OPTIONAL/additive — existing consumers reading `name`/`conceptRef` are unaffected (no bump). */
export const SCENARIO_VIEW_MODEL_SCHEMA_VERSION = 1;

type ActionKind = "recommend-activity" | "use-decision";
type ConceptView = { name: string; libraryName?: string };
/** A per-concept case answer (#187 Todo 2), projected from `CaseRun.conceptTruth`. `libraryName` is CONCRETE (never
 *  bare) so same-name concepts across libraries are distinct rows; a pane joins a displayed concept via
 *  `(concept.libraryName ?? currentFrameLib, name)`. An ABSENT concept is UNKNOWN — render blank, never `false`. */
type ConceptTruthView = { name: string; libraryName: string; satisfied: boolean };

/** Envelope: one render of a CEL file. Graph-level failures (parse / unresolved `covers`) surface in
 *  `errors` with an empty `scenarios` — the per-case array alone can't carry them. */
export interface RenderScenarioResult {
  schemaVersion: number;
  success: boolean;
  source: { celFilePath: string };
  caseCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  scenarios: ScenarioViewModel[];
  errors: string[];
}

export interface ScenarioViewModel {
  case: CaseView;
  /** null when the case names no decision; `{ resolved:false }` when it names one not found in the
   *  covered library (no nodeId/source there); fully populated when resolved. */
  decision: DecisionView | null;
  status: "pass" | "fail" | "error";
  expected: { decision: string; branch: string } | null;
  produced: { recommendation: string; actionKind: ActionKind }[];
  /** The decision's top-level branches, overlaid with run state (no synthetic root node). */
  tree: ViewNode[];
  /** Case-specific runtime diagnostics (no source position in v1) — for the scenario header. */
  diagnostics: string[];
  /** The case's per-concept case-derived answer over the whole closure (#187 Todo 2) — feeds the panes' OFF-path
   *  (dimmed) rendering. Empty on an error run. Additive/optional-in-spirit (no schema bump). */
  conceptTruth: ConceptTruthView[];
}

export interface CaseView {
  name: string;
  description?: string;
  subject?: string;
  facts: FactView[];
}

export interface FactView {
  name: string;
  /** The `defined by` target's bare display name (FHIR type or declaration name). */
  conceptRef?: string;
  /** Present only when the fact's `defined by` is a QUALIFIED ref resolving to a Concept/Activity declaration.
   *  A bare ref (FHIR type) or an unresolved ref omits this. Correspondence (C2c-2) makes a fact a cross-pane
   *  reveal anchor ONLY when `definedBy.kind === "concept"` (an activity/FHIR-type fact is not a concept). */
  definedBy?: { lib: string; name: string; kind: "concept" | "activity" };
}

export interface DecisionView {
  name: string;
  libraryName?: string;
  resolved: boolean;
  source?: LsLocation;
}

export interface ViewNode {
  nodeId: string;
  kind: "when" | "otherwise" | "action";
  label: string;
  source: LsLocation;
  /** Was this node reached during the run. */
  evaluated: boolean;
  /** Only on an unreached BRANCH whose block had a prior matching sibling (first:-preemption). */
  unreachedReason?: "preempted";
  condition?: ConditionView; // kind "when"
  guard?: GuardView; // kind "action"
  action?: ActionView; // kind "action"
  guardedOut?: boolean; // kind "action": excluded by its guard
  children?: ViewNode[];
}

export interface ConditionView {
  concept: ConceptView;
  /** Present iff the `when` was evaluated (omitted for an unreached branch). */
  satisfied?: boolean;
  facts: string[];
  explanation?: ExplanationView;
}

export interface GuardView {
  polarity: "unless" | "only-when";
  concept: ConceptView;
  /** false for an unreached action's guard (structurally present, not evaluated → no `satisfied`). */
  evaluated: boolean;
  satisfied?: boolean;
  explanation?: ExplanationView;
}

export interface ActionView {
  actionKind: ActionKind;
  target: ConceptView;
  qualifier?: "any" | "all";
  produced: boolean;
  /** `use decision` only: true when the target RESOLVED and was recursed in place (its sub-tree inlined as the action
   *  node's `children`) — a same-library target (bare or self-qualified) OR a resolvable cross-library qualified target
   *  (#172). false only when it stays a leaf: an UNRESOLVED target (lib/sub not in the graph), one on the delegation
   *  path (cycle), or when no resolver was supplied. Absent for a `recommend activity` action. For a recursed
   *  cross-library target, `target.libraryName` carries the sub's owning library. */
  expanded?: boolean;
}

/** VM-native projection of the `defined as` composition sub-evaluation. */
export type ExplanationView =
  | { op: "sem-and" | "sem-or"; satisfied: boolean; operands: ExplanationView[] }
  | { op: "sem-not"; satisfied: boolean; operand: ExplanationView }
  | { op: "ref"; satisfied: boolean; concept: ConceptView; explanation?: ExplanationView };

/** Run the CRE over a resolved CEL graph and project each case to a ScenarioViewModel. `opts.case`
 *  renders only the named case (bounds output for the agent). Mirrors `runCel`'s graph input so it
 *  shares the import-resolution path; the MCP/path entry resolves a `.cel` path to a graph first. */
export function renderScenario(
  graph: ResolvedCelGraph,
  opts?: { case?: string },
): RenderScenarioResult {
  const result = runCel(graph);
  const celFilePath = graph.filePath;
  if (!result.success) {
    // Fold the structured resolver/parse detail into `errors` so the UI can say WHY covers/parse failed
    // (runCel's own messages are coarse). Structured per-field diagnostics (severity/range) is a v2 item.
    return {
      schemaVersion: SCENARIO_VIEW_MODEL_SCHEMA_VERSION,
      success: false,
      source: { celFilePath },
      caseCount: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      scenarios: [],
      errors: [...result.errors, ...graphErrorMessages(graph)],
    };
  }

  const decisions = new Map<string, Decision>();
  if (graph.coversTarget) {
    for (const s of graph.coversTarget.ast.statements)
      if (s.type === "Decision") decisions.set(s.name, s);
  }
  const celCases = new Map<string, CELCase>();
  const facts = new Map<string, CELFact>();
  if (graph.cel) {
    for (const s of graph.cel.statements) {
      if (s.type === "CELCase") celCases.set(s.name, s);
      else if (s.type === "CELFact") facts.set(s.name, s);
    }
  }
  const filePath = graph.coversTarget?.filePath ?? celFilePath;
  const coveredLib = graph.coversTarget?.name ?? undefined;

  const runs = opts?.case ? result.runs.filter((r) => r.case === opts.case) : result.runs;
  const scenarios = runs.map((run) =>
    buildScenario(run, celCases.get(run.case), decisions, facts, filePath, coveredLib, graph),
  );

  const passCount = scenarios.filter((s) => s.status === "pass").length;
  const failCount = scenarios.filter((s) => s.status === "fail").length;
  const errorCount = scenarios.filter((s) => s.status === "error").length;
  return {
    schemaVersion: SCENARIO_VIEW_MODEL_SCHEMA_VERSION,
    success: result.success && errorCount === 0,
    source: { celFilePath },
    caseCount: scenarios.length,
    passCount,
    failCount,
    errorCount,
    scenarios,
    errors: result.errors,
  };
}

function buildScenario(
  run: ReturnType<typeof runCel>["runs"][number],
  celCase: CELCase | undefined,
  decisions: Map<string, Decision>,
  facts: Map<string, CELFact>,
  filePath: string,
  coveredLib: string | undefined,
  graph: ResolvedCelGraph,
): ScenarioViewModel {
  const dec = run.decision ? decisions.get(run.decision) : undefined;
  const decision: DecisionView | null = run.decision
    ? dec
      ? {
          name: run.decision,
          ...(coveredLib ? { libraryName: coveredLib } : {}),
          resolved: true,
          source: span(dec.location, filePath),
        }
      : { name: run.decision, resolved: false }
    : null;

  const traceIndex = indexTrace(run.trace);
  // Lib-aware `use decision` resolver over the WHOLE graph — IDENTICAL to the CRE's (#172), so the VM recurses the same
  // cross-library closure the trace did and the nodeId sets stay byte-identical (the golden parity invariant). Cycle
  // stack keyed `(lib,name)`, seeded with the covered decision in the covered library.
  const rootLib = coveredLib ?? "";
  const globalDecisionMap = buildGlobalDecisionMap({
    crlRegistry: graph.crlRegistry,
    coveredLib: rootLib,
    coveredFilePath: filePath,
    coveredStatements: [...decisions.values()],
  });
  const resolve = makeResolveDecision(globalDecisionMap);
  const tree = dec
    ? walkBranchesVM(
        dec.body.statements,
        "",
        traceIndex,
        filePath,
        resolve,
        rootLib,
        new Set([idOf(rootLib, dec.name)]),
      )
    : [];

  // produced summary derived from the tree's produced action nodes — each carries the correct per-node
  // actionKind from the AST, so a name shared by an activity and a sub-decision can't be mislabeled
  // (a flat name→kind map would collapse them). Tree walk order == the CRE's produced order.
  const produced: { recommendation: string; actionKind: ActionKind }[] = [];
  const collectProduced = (nodes: ViewNode[]): void => {
    for (const n of nodes) {
      if (n.kind === "action" && n.action?.produced) {
        produced.push({ recommendation: n.label, actionKind: n.action.actionKind });
      }
      if (n.children) collectProduced(n.children);
    }
  };
  collectProduced(tree);

  return {
    case: buildCaseView(run.case, celCase, facts, graph),
    decision,
    status: run.status,
    expected: run.expected ? { decision: run.expected.leaf, branch: run.expected.branch } : null,
    produced,
    tree,
    diagnostics: run.diagnostics,
    // #187 Todo 2: project the CRE's per-concept truth (lib → the VM's concrete libraryName). Serialization-safe array.
    conceptTruth: run.conceptTruth.map((r) => ({
      name: r.name,
      libraryName: r.lib,
      satisfied: r.satisfied,
    })),
  };
}

function buildCaseView(
  name: string,
  celCase: CELCase | undefined,
  facts: Map<string, CELFact>,
  graph: ResolvedCelGraph,
): CaseView {
  if (!celCase) return { name, facts: [] };
  let subject: string | undefined;
  let description: string | undefined;
  const factRefs: FactView[] = [];
  for (const b of celCase.body) {
    if (b.type === "CELSubjectField") subject = b.factName;
    else if (b.type === "CELDescriptionField") description = b.value;
    else if (b.type === "CELFactRefField") {
      const f = facts.get(b.factName);
      const db = f?.body.find((x): x is CELDefinedByField => x.type === "CELDefinedByField");
      if (!db) {
        factRefs.push({ name: b.factName });
        continue;
      }
      // `definedBy` only when the ref resolves to a Concept/Activity declaration (qualified). A bare ref is a
      // FHIR type → conceptRef carries the display name but there's no declaration target to anchor on.
      const target = resolveDefinedByTarget(db.ref, graph);
      factRefs.push({
        name: b.factName,
        conceptRef: getRefName(db.ref),
        ...(target ? { definedBy: target } : {}),
      });
    }
  }
  return {
    name,
    ...(description ? { description } : {}),
    ...(subject ? { subject } : {}),
    facts: factRefs,
  };
}

/** Flatten the run trace into a nodeId→node index (the AST-spine walk looks state up by id). */
function indexTrace(nodes: TraceNode[]): Map<string, TraceNode> {
  const m = new Map<string, TraceNode>();
  const visit = (ns: TraceNode[]): void => {
    for (const n of ns) {
      m.set(n.nodeId, n);
      if (n.children) visit(n.children);
    }
  };
  visit(nodes);
  return m;
}

function walkBranchesVM(
  branches: BranchBlock[],
  parentId: string,
  traceIndex: Map<string, TraceNode>,
  filePath: string,
  resolve: LibAwareDecisionResolver,
  currentLib: string,
  stack: Set<string>,
): ViewNode[] {
  const out: ViewNode[] = [];
  // A branch absent from the trace is unreached; it's "preempted" iff a prior sibling matched (an
  // ordered first:-block short-circuited past it). In an `all:` block no branch is ever absent, and
  // in a not-entered subtree no sibling matches → no spurious "preempted".
  let priorMatch = false;
  branches.forEach((b, i) => {
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      const t = traceIndex.get(nodeId);
      const node: ViewNode = {
        nodeId,
        kind: "otherwise",
        label: "otherwise",
        source: span(b.location, filePath),
        evaluated: !!t,
        children: walkBodyVM(b.body, nodeId, traceIndex, filePath, resolve, currentLib, stack),
      };
      if (!t && priorMatch) node.unreachedReason = "preempted";
      if (t) priorMatch = true;
      out.push(node);
      return;
    }
    const nodeId = childId(parentId, `when[${i}]`);
    const t = traceIndex.get(nodeId);
    // i.1: single-ref guard. The ConditionView stays concept-shaped this slice.
    // Its expression reshape MUST land by i.2 (once the grammar accepts compound
    // guards, this `soleRefOrThrow` would throw on a legal document) — the
    // "which conjunct failed" rendering then follows in i.4.
    const concept = conceptView(soleRefOrThrow(b.condition, "cre/viewModel.ts walkBranchesVM").ref);
    const condition: ConditionView = t
      ? {
          concept,
          ...(t.satisfied !== undefined ? { satisfied: t.satisfied } : {}),
          facts: t.facts ?? [],
          ...(t.composition ? { explanation: mapComposition(t.composition) } : {}),
        }
      : { concept, facts: [] };
    const node: ViewNode = {
      nodeId,
      kind: "when",
      label: `when ${concept.name}`,
      source: span(b.location, filePath),
      evaluated: !!t,
      condition,
      children: walkBodyVM(b.body, nodeId, traceIndex, filePath, resolve, currentLib, stack),
    };
    if (!t && priorMatch) node.unreachedReason = "preempted";
    if (t?.satisfied) priorMatch = true;
    out.push(node);
  });
  return out;
}

function walkBodyVM(
  body: WhenBlockBody,
  parentId: string,
  traceIndex: Map<string, TraceNode>,
  filePath: string,
  resolve: LibAwareDecisionResolver,
  currentLib: string,
  stack: Set<string>,
): ViewNode[] {
  if (body.type === "ActionStatement") {
    return [
      buildActionVM(
        body,
        childId(parentId, "action[0]"),
        undefined,
        traceIndex,
        filePath,
        resolve,
        currentLib,
        stack,
      ),
    ];
  }
  const block = body as BlockBody;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch)
    return walkBranchesVM(
      block.statements as BranchBlock[],
      parentId,
      traceIndex,
      filePath,
      resolve,
      currentLib,
      stack,
    );
  const qualifier = block.qualifier;
  return (block.statements as ActionStatement[]).map((stmt, j) =>
    buildActionVM(
      stmt,
      childId(parentId, `action[${j}]`),
      qualifier,
      traceIndex,
      filePath,
      resolve,
      currentLib,
      stack,
    ),
  );
}

function buildActionVM(
  stmt: ActionStatement,
  nodeId: string,
  qualifier: BlockQualifier | undefined,
  traceIndex: Map<string, TraceNode>,
  filePath: string,
  resolve: LibAwareDecisionResolver,
  currentLib: string,
  stack: Set<string>,
): ViewNode {
  const t = traceIndex.get(nodeId);
  const evaluated = !!t;
  const actionRef =
    stmt.action.type === "RecommendActivity" ? stmt.action.activityName : stmt.action.decisionName;
  const actionKind: ActionKind =
    stmt.action.type === "RecommendActivity" ? "recommend-activity" : "use-decision";
  const guardedOut = t?.guardedOut === true;

  // `use decision` recursion (#166 same-library, #172 cross-library): STRUCTURALLY inline a RESOLVABLE target (BARE in
  // `currentLib`, or QUALIFIED in its explicit lib) that is not on the delegation path (cycle) — independent of whether
  // this action was reached, because the view-model is the FULL tree (the static spine: every branch/action, reached or
  // not). This keeps the VM nodeId set byte-identical to decisionSpine's + the CRE trace's (the golden parity
  // invariant). A cross-library sub recurses in ITS OWN library + file (`resolved.lib`/`resolved.filePath`) so its
  // spans point at its file and its own bare targets resolve there. Per-node run state (evaluated/produced) is overlaid
  // from the trace. A use-decision node is NEVER itself `produced` — it delegates; its child RecommendActivity nodes
  // carry the dispositions (REPLACE). An UNRESOLVED or cyclic target stays a leaf (expanded:false).
  let children: ViewNode[] | undefined;
  let expanded: boolean | undefined;
  let expandedLib: string | undefined; // the sub's owning library when expanded — surfaced as target.libraryName (#175).
  if (actionKind === "use-decision") {
    expanded = false;
    if (stmt.action.type === "UseDecision") {
      const resolved = resolve(currentLib, stmt.action.decisionName);
      if (resolved) {
        // Cycle key is `(lib,name)` of the RESOLVED owning library (#172) — cross-library `A.Sub`/`B.Sub` are distinct.
        const subId = idOf(resolved.lib, resolved.decision.name);
        if (!stack.has(subId)) {
          children = walkBranchesVM(
            resolved.decision.body.statements,
            nodeId,
            traceIndex,
            resolved.filePath,
            resolve,
            resolved.lib,
            new Set([...stack, subId]),
          );
          expanded = true;
          // Force a libraryName ONLY for a genuinely CROSS-library expansion. A BARE same-lib target keeps no
          // libraryName (byte-identical to pre-#172). A SELF-qualified same-lib target (`"SQ"."Sub"` inside SQ) keeps
          // whatever `conceptView` derived from its AST qualifier (here "SQ") — we don't override it; `resolved.lib ===
          // currentLib` is benign for the #175 decomposer (`target.libraryName ?? frame.lib` → the same lib either way).
          if (resolved.lib !== currentLib) expandedLib = resolved.lib;
        }
      }
    }
  }

  // When a cross-library sub is expanded, surface its owning library on `target.libraryName` (= resolved.lib) so the
  // #175 decomposer re-roots `producedRuntimePathRefs` into the sub's frame. A qualified ref already carries this via
  // conceptView; setting it from `resolved.lib` also covers the (today impossible, but defensive) bare cross-lib case.
  const target = conceptView(actionRef);
  if (expandedLib && !target.libraryName) target.libraryName = expandedLib;

  const action: ActionView = {
    actionKind,
    target,
    ...(qualifier === "any" || qualifier === "all" ? { qualifier } : {}),
    produced: actionKind === "use-decision" ? false : evaluated && !guardedOut,
    ...(actionKind === "use-decision" ? { expanded: expanded! } : {}),
  };
  const node: ViewNode = {
    nodeId,
    kind: "action",
    label: getRefName(actionRef),
    source: span(stmt.location, filePath),
    evaluated,
    action,
    ...(children ? { children } : {}),
  };
  if (guardedOut) node.guardedOut = true;
  if (t?.guard) {
    // Source the concept identity from the AST (it carries the library qualifier); the trace supplies
    // only satisfied/composition. (t.guard implies stmt.guard — the trace guard came from evaluating it.)
    node.guard = {
      polarity: t.guard.polarity,
      concept: stmt.guard ? conceptView(stmt.guard.conceptName) : { name: t.guard.concept },
      evaluated: true,
      satisfied: t.guard.satisfied,
      ...(t.guard.composition ? { explanation: mapComposition(t.guard.composition) } : {}),
    };
  } else if (stmt.guard) {
    node.guard = {
      polarity: stmt.guard.polarity,
      concept: conceptView(stmt.guard.conceptName),
      evaluated: false,
    };
  }
  return node;
}

function mapComposition(ct: CompositionTrace): ExplanationView {
  switch (ct.op) {
    case "sem-and":
    case "sem-or":
      return {
        op: ct.op,
        satisfied: ct.satisfied,
        operands: (ct.operands ?? []).map(mapComposition),
      };
    case "sem-not":
      return { op: "sem-not", satisfied: ct.satisfied, operand: mapComposition(ct.operand!) };
    case "ref":
      return {
        op: "ref",
        satisfied: ct.satisfied,
        concept: { name: ct.concept ?? "" },
        ...(ct.composition ? { explanation: mapComposition(ct.composition) } : {}),
      };
  }
}

/** Readable strings for graph resolution/parse failures, folded into the fail-path envelope `errors`. */
function graphErrorMessages(graph: ResolvedCelGraph): string[] {
  const out: string[] = [];
  for (const e of graph.celParseErrors) out.push(e.message);
  for (const d of graph.diagnostics as CelImportDiagnostic[]) {
    if (d.severity !== "error") continue;
    switch (d.kind) {
      case "project-root-not-found":
        out.push(`no package.json found walking up from ${d.fromPath}`);
        break;
      case "unresolved-covers":
        out.push(`covers "${d.coversName}" unresolved (${d.filePath})`);
        break;
      case "covers-missing-but-cases-present":
        out.push(`covers declaration missing but cases present (${d.filePath})`);
        break;
      case "crl-import":
        // Expand the wrapped CRL-side diagnostic into its actionable message(s) (parse-failure detail,
        // duplicate-library name, unresolved include/from target, cycle chain) via the shared mapper.
        for (const ls of mapImportDiagnostic(d.underlying)) out.push(ls.message);
        break;
    }
  }
  return out;
}

function conceptView(ref: ReferenceName): ConceptView {
  const lib = getRefLibrary(ref);
  return { name: getRefName(ref), ...(lib ? { libraryName: lib } : {}) };
}

function span(loc: Location, filePath: string): LsLocation {
  return { filePath, range: toZeroBasedRange(loc) };
}
