// REFACTOR:grounded: advisory proof from CRE reachability, never a rewrite of authored data.
import { getRefLibrary, getRefName, type Concept, type Decision, type BranchBlock, type WhenBlockBody } from "../ast/types";
import { branchConditionRefs } from "../ast/branchCondition";
import { buildGlobalDecisionMap, makeResolveDecision } from "../ast/decisionResolver";
import { idOf, type LibAwareDecisionResolver } from "../ast/decisionSpine";
import type { CELCase, CELFact } from "./ast/types";
import { childId, runCel, type TraceNode } from "../cre/run";
import { resolveDefinedByTarget } from "./definedByResolve";
import type { EmitDiagnostic } from "./emitter/types";
import type { CelSuite } from "./suite";

const key = (lib: string, name: string): string => JSON.stringify([lib, name]);
function mentions(value: unknown, name: string): boolean {
  if (value === name) return true;
  if (Array.isArray(value)) return value.some(v => mentions(v, name));
  if (value && typeof value === "object") return Object.entries(value).some(([k, v]) => k !== "location" && mentions(v, name));
  return false;
}
/** REFACTOR:grounded: pair source-local structure with the actual trace. Unentered
 * definitions contribute only conservative other-use evidence, once per definition.
 * Never expand every possible execution path to establish a skipped question. */
function uses(decision: Decision, lib: string, trace: TraceNode[], resolve: LibAwareDecisionResolver) {
  const index = new Map<string, TraceNode>(), skipped = new Set<string>(), other = new Set<string>();
  const visited = new Set<string>();
  let unresolved = false;
  const flatten = (nodes: TraceNode[]) => { for (const node of nodes) { index.set(node.nodeId, node); flatten(node.children ?? []); } };
  flatten(trace);
  const branches = (rows: BranchBlock[], parent: string, frame: string, active: boolean): void => {
    let priorMatch = false;
    rows.forEach((row, i) => {
      const path = childId(parent, row.type === "OtherwiseBlock" ? "otherwise" : `when[${i}]`);
      const t = active ? index.get(path) : undefined;
      if (row.type === "WhenBlock") for (const ref of branchConditionRefs(row.condition)) {
        // Criterion refs are deliberately excluded. Existing dependency checks below
        // suppress advice for any concept used by a Criterion.
        (!t && priorMatch ? skipped : other).add(key(getRefLibrary(ref.ref) ?? frame, getRefName(ref.ref)));
      }
      body(row.body, path, frame, active);
      if (t && (row.type === "OtherwiseBlock" || t.satisfied)) priorMatch = true;
    });
  };
  const body = (value: WhenBlockBody, parent: string, frame: string, active: boolean): void => {
    if (value.type === "BlockBody" && value.statements.some(s => s.type === "WhenBlock" || s.type === "OtherwiseBlock")) {
      branches(value.statements as BranchBlock[], parent, frame, active); return;
    }
    const actions = value.type === "BlockBody" ? value.statements : [value];
    actions.forEach((stmt, i) => {
      if (stmt.type !== "ActionStatement") return;
      const path = childId(parent, `action[${i}]`), t = active ? index.get(path) : undefined;
      if (stmt.guard) other.add(key(getRefLibrary(stmt.guard.conceptName) ?? frame, getRefName(stmt.guard.conceptName)));
      if (stmt.action.type !== "UseDecision") return;
      const target = resolve(frame, stmt.action.decisionName);
      if (!target) { unresolved = true; return; }
      if (t?.children && !t.guardedOut) branches(target.decision.body.statements, path, target.lib, true);
      else {
        const targetId = idOf(target.lib, target.decision.name);
        if (visited.has(targetId)) return;
        visited.add(targetId);
        branches(target.decision.body.statements, "", target.lib, false);
      }
    });
  };
  branches(decision.body.statements, "", lib, true);
  return { skipped, other, unresolved, nodes: [...index.values()] };
}

/** Explicit commands only: automatic editor validation does not run CRE. */
export function mvOffPathWarnings(suite: CelSuite, now = new Date()): EmitDiagnostic[] {
  if (suite.purpose !== "mv") return [];
  const warnings: EmitDiagnostic[] = [];
  for (const file of suite.files) {
    try {
      const graph = file.graph;
      const rendered = runCel(graph, { now });
      if (!rendered.success || rendered.runs.some(run => run.status === "error") || !graph.cel || !graph.coversTarget || !graph.crlRegistry) continue;
      const libraries = [...graph.crlRegistry.byNameLocal.values(), ...graph.crlRegistry.byNamePackage.values()];
      const concepts = libraries.flatMap(e => e.ast.statements.filter((s): s is Concept => s.type === "Concept").map(c => ({ lib: e.name, c, source: e.filePath })));
      const facts = new Map(graph.cel.statements.filter((s): s is CELFact => s.type === "CELFact").map(f => [f.name, f]));
      const cases = graph.cel.statements.filter((s): s is CELCase => s.type === "CELCase");
      const rootLib = graph.coversTarget.name;
      if (!rootLib) continue;
      const decisions = graph.coversTarget.ast.statements.filter((s): s is Decision => s.type === "Decision");
      const resolve = makeResolveDecision(buildGlobalDecisionMap({ crlRegistry: graph.crlRegistry,
        coveredLib: rootLib, coveredFilePath: graph.coversTarget.filePath, coveredStatements: decisions }));
      for (const scenario of rendered.runs) {
        const declared = cases.find(c => c.name === scenario.case);
        const decision = decisions.find(d => d.name === scenario.decision);
        if (!declared || !decision || scenario.status === "error" || scenario.discardedUnknown || scenario.expected?.pause || !scenario.produced.length) continue;
        const { nodes, skipped, other, unresolved } = uses(decision, rootLib, scenario.trace, resolve);
        if (unresolved || nodes.some(n => n.unknown || n.guard?.unknown || n.invalidated || n.publicationErrors?.length)) continue;
        // Attached evidence is another use even when absent from a direct guard ref.
        for (const node of nodes) for (const name of node.facts ?? []) {
          const f = facts.get(name)?.body.find(b => b.type === "CELDefinedByField");
          const t = f?.type === "CELDefinedByField" ? resolveDefinedByTarget(f.ref, graph) : undefined;
          if (t) other.add(key(t.lib, t.name));
        }
        for (const ref of declared.body) {
          if (ref.type !== "CELFactRefField" || ref.intent) continue;
          if (declared.body.some(b => b.type === "CELCrossResourceField" && (b.sourceName === ref.factName || b.targetName === ref.factName))) continue;
          const fact = facts.get(ref.factName);
          const defined = fact?.body.find(b => b.type === "CELDefinedByField");
          const value = fact?.body.find(b => b.type === "CELValueField");
          if (!fact || fact.body.some(b => b.type === "CELCodeField" || b.type === "CELStageField") || defined?.type !== "CELDefinedByField" || value?.type !== "CELValueField" || value.value.kind !== "boolean") continue;
          const target = resolveDefinedByTarget(defined.ref, graph);
          if (!target || target.kind !== "concept" || !skipped.has(key(target.lib, target.name)) || other.has(key(target.lib, target.name))) continue;
          const owner = concepts.find(x => x.source === target.sourceIdentity && x.c.name === target.name);
          if (!owner?.c.code || owner.c.definition || owner.c.representations.length || owner.c.valueTypes.length !== 1 || owner.c.valueTypes[0] !== "boolean") continue;
          // Computed dependencies, alternate source consumers, and possible same-code aliases suppress
          // the advice. Unknown terminology expansion is never used as proof of non-overlap.
          const unsafe = libraries.some(e => e.ast.statements.some(s => {
            if (s.type === "Criterion") return mentions(s, target.name);
            if (s.type !== "Concept" || (e.filePath === owner.source && s.name === owner.c.name)) return false;
            if (mentions(s.definition, target.name)) return true;
            if (s.code === owner.c.code && s.conceptType === owner.c.conceptType) return true;
            if (s.representations.some(r => !r.conceptType || r.conceptType === owner.c.conceptType)) return true;
            return !s.code && s.conceptType === owner.c.conceptType && !!s.definition;
          }));
          if (unsafe) continue;
          warnings.push({ kind: "mv-off-path-data", severity: "warning", filePath: file.path, factName: fact.name, location: ref.location,
            message: `MV case "${declared.name}"${declared.caseId ? ` (${declared.caseId})` : ""}: supplied fact "${fact.name}" is used only by later conditions skipped in the CRE trace. Check whether this evidence belongs in this clinical route or in regression. This advice does not establish native $apply equivalence; authored data is unchanged.` });
        }
      }
    } catch { /* Advisory analysis must never prevent or degrade CEL emission. */ }
  }
  return warnings;
}
