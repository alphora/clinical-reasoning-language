// REFACTOR:grounded: advisory proof from CRE reachability, never a rewrite of authored data.
import type { Concept } from "../ast/types";
import type { CELCase, CELFact } from "./ast/types";
import { renderScenario, type BranchConditionView, type ViewNode } from "../cre/viewModel";
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
function flatNodes(nodes: ViewNode[]): ViewNode[] { return nodes.flatMap(n => [n, ...flatNodes(n.children ?? [])]); }
function references(expr: BranchConditionView, lib: string): string[] {
  if (expr.op === "ref") return [key(expr.concept.libraryName ?? lib, expr.concept.name)];
  if (expr.op === "not") return references(expr.operand, lib);
  if (expr.op === "and" || expr.op === "or") return expr.operands.flatMap(e => references(e, lib));
  return []; // criterion dependency analysis below prevents treating its inputs as direct questions.
}

/** Explicit commands only: automatic editor validation does not run CRE. */
export function mvOffPathWarnings(suite: CelSuite, now = new Date()): EmitDiagnostic[] {
  if (suite.purpose !== "mv") return [];
  const warnings: EmitDiagnostic[] = [];
  for (const file of suite.files) {
    try {
      const graph = file.graph;
      const rendered = renderScenario(graph, { now });
      if (!rendered.success || !graph.cel || !graph.coversTarget || !graph.crlRegistry) continue;
      const libraries = [...graph.crlRegistry.byNameLocal.values(), ...graph.crlRegistry.byNamePackage.values()];
      const concepts = libraries.flatMap(e => e.ast.statements.filter((s): s is Concept => s.type === "Concept").map(c => ({ lib: e.name, c, source: e.filePath })));
      const facts = new Map(graph.cel.statements.filter((s): s is CELFact => s.type === "CELFact").map(f => [f.name, f]));
      const cases = graph.cel.statements.filter((s): s is CELCase => s.type === "CELCase");
      for (const scenario of rendered.scenarios) {
        const declared = cases.find(c => c.name === scenario.case.name);
        const nodes = flatNodes(scenario.tree);
        if (!declared || scenario.status === "error" || scenario.discardedUnknown || scenario.expected?.pause || !scenario.produced.length || nodes.some(n => n.unknown || n.guard?.unknown || n.invalidated || n.publicationErrors?.length)) continue;
        const skipped = new Set<string>(), other = new Set<string>();
        let unresolvedFrame = false;
        for (const node of nodes) {
          const frameLib = libraries.find(e => e.filePath === node.source.filePath)?.name;
          if ((node.condition?.expr || node.guard) && !frameLib) { unresolvedFrame = true; break; }
          const expr = node.condition?.expr;
          if (expr) for (const ref of references(expr, frameLib!)) {
            (node.unreachedReason === "preempted" && !node.evaluated ? skipped : other).add(ref);
          }
          // Guard inputs or attached evidence are reached uses, even outside a when condition.
          if (node.guard) other.add(key(node.guard.concept.libraryName ?? frameLib!, node.guard.concept.name));
          if (node.evaluated) for (const name of node.condition?.facts ?? []) {
            const f = facts.get(name)?.body.find(b => b.type === "CELDefinedByField");
            const t = f?.type === "CELDefinedByField" ? resolveDefinedByTarget(f.ref, graph) : undefined;
            if (t) other.add(key(t.lib, t.name));
          }
        }
        if (unresolvedFrame) continue;
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
