// REFACTOR:grounded: route identity and prefix evidence, independent of provenance.
import type { BranchConditionView, CrlDecisionStructure, CrlStructureNode, ScenarioViewModel, ViewNode } from "@smile-digital-health/crl";
import { displayDetermination } from "@smile-digital-health/crl";
import { buildQuestionnaire } from "./questionnaireModel";

/** An inspection of one actual terminal occurrence, never a rewritten evaluation. */
export interface ExecutionRoute {
  terminalId: string;
  label: string;
  nodeIds: string[];
  nodeKeys: string[];
  gaps: string[];
  terminalKind: "produced" | "paused" | "blocked" | "blocked-guard" | "error";
  activity?: string;
}

const key = (lib: string, decision: string, id = "") => JSON.stringify([lib, decision, id]);
type Frame = { lib: string; decision: string; prefix: string };
type Path = { nodeIds: string[]; nodeKeys: string[]; gaps: string[]; invalid?: boolean; unknown?: boolean };

/** One frame-aware traversal. Source correspondence is deliberately not an input.
 * Earlier evaluated siblings belong to a route only in an authored first block.
 * Retained roots are display support, not additional evaluated questions. */
export function executionRoutes(sv: ScenarioViewModel, structure: CrlDecisionStructure[]): ExecutionRoute[] {
  const rows = new Map<string, CrlStructureNode>();
  const decisions = new Map(structure.map(d => [key(d.lib, d.decision), d]));
  const index = (nodes: CrlStructureNode[]) => {
    for (const n of nodes) { rows.set(key(n.lib, n.decision, n.nodeId), n); index(n.children); }
  };
  for (const d of structure) index(d.children);
  const result: ExecutionRoute[] = [];
  const root: Frame = { lib: sv.decision?.libraryName ?? "", decision: sv.decision?.name ?? "", prefix: "" };
  const rootDecl = decisions.get(key(root.lib, root.decision));
  const walk = (nodes: ViewNode[], frame: Frame, qualifier: string | undefined, path: Path): void => {
    let preceding = path;
    const reached = nodes.filter(n => n.evaluated);
    for (let i = 0; i < reached.length; i++) {
      const n = reached[i];
      const base = qualifier === "first" ? preceding : path;
      const local = !frame.prefix ? n.nodeId : n.nodeId.startsWith(frame.prefix + "/") ? n.nodeId.slice(frame.prefix.length + 1) : undefined;
      const row = local === undefined ? undefined : rows.get(key(frame.lib, frame.decision, local));
      const current: Path = {
        invalid: base.invalid || n.invalidated || !!n.publicationErrors?.length, unknown: base.unknown || n.unknown,
        nodeIds: [...base.nodeIds, n.nodeId],
        nodeKeys: row ? [...base.nodeKeys, row.nodeKey] : [...base.nodeKeys],
        gaps: row ? [...base.gaps] : [...base.gaps, n.nodeId],
      };
      let childFrame = frame;
      let childQualifier = row?.childrenQualifier;
      if (n.action?.actionKind === "use-decision" && (n.action.expanded || n.action.deferred)) {
        childFrame = { lib: n.action.target.libraryName ?? frame.lib, decision: n.action.target.name, prefix: n.nodeId };
        const target = decisions.get(key(childFrame.lib, childFrame.decision));
        childQualifier = target?.childrenQualifier;
        if (target) current.nodeKeys.push(target.nodeKey);
        else current.gaps.push(n.nodeId + ":decision");
      }
      const children = (n.children ?? []).filter(c => c.evaluated);
      if (children.length) walk(children, childFrame, childQualifier, current);
      else {
        // A false first sibling is a prerequisite of the later route, not a separate endpoint.
        const continues = qualifier === "first" && i < reached.length - 1 && n.kind === "when" && n.condition?.satisfied === false;
        if (!continues) {
          const error = current.invalid;
          const terminalKind = error ? "error" : current.unknown ? "paused" : n.action?.produced ? "produced" : n.guardedOut ? "blocked-guard" : "blocked";
          result.push({ ...current, nodeKeys: [...new Set(current.nodeKeys)], terminalId: n.nodeId,
            label: n.label, terminalKind, ...(terminalKind === "produced" ? { activity: displayDetermination(n.label) } : {}) });
        }
      }
      if (qualifier === "first") preceding = current;
    }
  };
  walk(sv.tree, root, rootDecl?.childrenQualifier, { nodeIds: [], nodeKeys: rootDecl ? [rootDecl.nodeKey] : [], gaps: rootDecl ? [] : ["decision:" + root.decision] });
  const counts = new Map<string, number>();
  for (const r of result) counts.set(r.terminalId, (counts.get(r.terminalId) ?? 0) + 1);
  return result.filter(r => counts.get(r.terminalId) === 1);
}

/** Copy only the selected runtime rows. The original case remains the input to
 * native results and complete-case diagnostics. No value or truth is rewritten. */
export function routeScenario(sv: ScenarioViewModel, route: ExecutionRoute): ScenarioViewModel {
  const keep = new Set(route.nodeIds);
  const bodies = new Map<string, BranchConditionView>();
  const collectExpr = (expr: BranchConditionView, lib: string): void => {
    if (expr.op === "criterion" && expr.body) {
      bodies.set(key(expr.criterion.libraryName ?? lib, expr.criterion.name), expr.body);
      collectExpr(expr.body, expr.criterion.libraryName ?? lib);
    } else if (expr.op === "and" || expr.op === "or") expr.operands.forEach(e => collectExpr(e, lib));
    else if (expr.op === "not") collectExpr(expr.operand, lib);
  };
  const collect = (nodes: ViewNode[], lib: string): void => {
    for (const n of nodes) {
      if (n.condition) collectExpr(n.condition.expr, lib);
      collect(n.children ?? [], n.action?.actionKind === "use-decision" ? n.action.target.libraryName ?? lib : lib);
    }
  };
  const rootLib = sv.decision?.libraryName ?? "";
  collect(sv.tree, rootLib);
  const hydrate = (expr: BranchConditionView, lib: string, seen = new Set<string>()): BranchConditionView => {
    if (expr.op === "criterion") {
      const owner = expr.criterion.libraryName ?? lib, id = key(owner, expr.criterion.name);
      const body = expr.body ?? (expr.reference ? bodies.get(id) : undefined);
      if (!body || seen.has(id)) return expr;
      return { ...expr, reference: undefined, body: hydrate(body, owner, new Set([...seen, id])) };
    }
    if (expr.op === "and" || expr.op === "or") return { ...expr, operands: expr.operands.map(e => hydrate(e, lib, seen)) };
    if (expr.op === "not") return { ...expr, operand: hydrate(expr.operand, lib, seen) };
    return expr;
  };
  const trim = (nodes: ViewNode[], lib: string): ViewNode[] => nodes.filter(n => keep.has(n.nodeId)).map(n => ({ ...n,
    ...(n.condition ? { condition: { ...n.condition, expr: hydrate(n.condition.expr, lib) } } : {}),
    children: trim(n.children ?? [], n.action?.actionKind === "use-decision" ? n.action.target.libraryName ?? lib : lib) }));
  return { ...sv, discardedUnknown: undefined, tree: trim(sv.tree, rootLib) };
}

export function buildRouteQuestionnaire(sv: ScenarioViewModel, route: ExecutionRoute, ...args: [Parameters<typeof buildQuestionnaire>[1], Parameters<typeof buildQuestionnaire>[2], Parameters<typeof buildQuestionnaire>[3]?]) {
  const q = buildQuestionnaire(routeScenario(sv, route), args[0], args[1], { ...args[2], inspectAttemptedRoute: true });
  return { ...q, terminalKind: route.terminalKind, outcome: route.activity ? { activity: route.activity } : null,
    note: [q.note, route.terminalKind === "error" ? "Attempted route ended in an evaluation error; no recommendation." : undefined,
      route.gaps.length ? `${route.gaps.length} reached nodes could not be located in the CRL structure.` : undefined].filter(Boolean).join("; ") || undefined };
}
