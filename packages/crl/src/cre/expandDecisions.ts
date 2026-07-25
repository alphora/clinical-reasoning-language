// #224 ii.1c — the SHARED criterion-expansion wiring for the eval + render families.
//
// The CRE (`run.ts`) and the view-model (`viewModel.ts`) both evaluate/render the covered
// decision AND its `use decision` sub-decisions, and the trace↔spine zip requires them to
// walk STRUCTURALLY-identical guards (disc 303 Q3: identity is not required, but determinism
// + BOTH-sides-expanded + the SAME table source are). Factoring the table build + the
// covered-decision expansion + the resolver wrapper HERE guarantees the two families cannot
// drift — if they built tables from different statement sources, expansion would diverge and
// the zip would silently degrade to unevaluated leaves (viewModel.ts:610).
//
// The envelope is GLOBAL (`expandDecisionCriteria` materializes the tree the CRE walks, and
// `runCel` runs NO semantic validation — a cyclic/undefined table can reach here). A breach
// therefore degrades GRACEFULLY, never a throw out of the run: the covered decision is
// recorded in `expandCoveredDecisions().errors` (surfaced as a per-case status:"error"); a
// sub-decision that can't expand resolves to `undefined` AND is recorded in the resolver
// wrapper's `errors` map, which the CRE's `use decision` handler consults to set
// `runtimeError` + an envelope diagnostic (distinguishing overflow from a genuine not-found —
// the two the resolver's `undefined` now conflates).

import type { ResolvedCelGraph } from "../cel/imports/types";
import { idOf } from "../ast/decisionSpine";
import type { ResolvedDecision } from "../ast/decisionResolver";
import type { CRL, Decision, ReferenceName } from "../ast/types";
import {
  buildCriterionTable,
  expandDecisionCriteria,
  CriterionExpansionError,
  type CriterionTable,
} from "../ast/criterionExpansion";

/** Per-library criterion tables over the WHOLE resolved graph (covered library + every
 *  registry entry), built from FULL statements so `Criterion` declarations are present.
 *  Mirrors the `concepts`/`addConcepts` closure so a table exists for every library a
 *  `use decision` can bind into. A table is stage-independent (`name → Criterion`). */
export function buildCriterionTablesForGraph(graph: ResolvedCelGraph): Map<string, CriterionTable> {
  const tables = new Map<string, CriterionTable>();
  const add = (lib: string, ast: CRL): void => {
    tables.set(lib, buildCriterionTable(ast.statements));
  };
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNamePackage.values()) if (e.name) add(e.name, e.ast);
    for (const e of graph.crlRegistry.byNameLocal.values()) if (e.name) add(e.name, e.ast);
  }
  if (graph.coversTarget?.name) add(graph.coversTarget.name, graph.coversTarget.ast);
  return tables;
}

/** Expand the covered library's top-level decisions against `coveredTable`. A decision whose
 *  guard breaches the GLOBAL envelope is EXCLUDED from `decisions` and recorded in `errors`
 *  (the caller surfaces a precise status:"error" for a case targeting it). A criterion-free
 *  decision passes through by identity (byte-stable). */
export function expandCoveredDecisions(
  rawDecisions: Iterable<Decision>,
  coveredTable: CriterionTable,
): { decisions: Map<string, Decision>; errors: Map<string, CriterionExpansionError> } {
  const decisions = new Map<string, Decision>();
  const errors = new Map<string, CriterionExpansionError>();
  for (const d of rawDecisions) {
    try {
      decisions.set(d.name, expandDecisionCriteria(d, coveredTable));
    } catch (e) {
      if (e instanceof CriterionExpansionError) errors.set(d.name, e);
      else throw e;
    }
  }
  return { decisions, errors };
}

/** Wrap a raw `(lib,ref) → ResolvedDecision` resolver so each resolved sub-decision's guards
 *  are expanded against ITS library's table before the caller walks it. Cached per target
 *  `(lib,name)` (expansion is deterministic; keeps repeat delegations cheap).
 *
 *  A sub whose guard breaches the GLOBAL envelope resolves to `undefined` (it cannot be
 *  materialized) AND is recorded in the returned `errors` map, keyed by the SAME
 *  `idOf(resolved.lib, name)` the CRE recomputes from `getRefLibrary(ref) ?? callerLib`. The
 *  resolver's `undefined` alone conflates "not in graph" with "exists but overflowed", so the
 *  caller MUST consult `errors` before treating `undefined` as not-found (else an overflow
 *  sub is silently mis-evaluated as an empty delegation rather than status:"error"). */
export function wrapResolveWithExpansion(
  rawResolve: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined,
  tables: Map<string, CriterionTable>,
): {
  resolve: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined;
  errors: Map<string, CriterionExpansionError>;
} {
  const cache = new Map<string, ResolvedDecision | undefined>();
  const errors = new Map<string, CriterionExpansionError>();
  const resolve = (callerLib: string, ref: ReferenceName): ResolvedDecision | undefined => {
    const resolved = rawResolve(callerLib, ref);
    if (!resolved) return undefined;
    const key = idOf(resolved.lib, resolved.decision.name);
    if (cache.has(key)) return cache.get(key);
    const table = tables.get(resolved.lib) ?? new Map();
    let out: ResolvedDecision | undefined;
    try {
      out = { ...resolved, decision: expandDecisionCriteria(resolved.decision, table) };
    } catch (e) {
      if (e instanceof CriterionExpansionError) {
        out = undefined;
        errors.set(key, e);
      } else throw e;
    }
    cache.set(key, out);
    return out;
  };
  return { resolve, errors };
}
