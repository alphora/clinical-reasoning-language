// Per-library criterion TABLES for the eval + render families.
//
// #236 retired criterion inline-expansion: the CRE (`run.ts`) and the view-model (`viewModel.ts`)
// no longer expand covered decisions up front. They walk the RAW decision spine and evaluate each
// criterion BY REFERENCE (memoized per case), so the only shared wiring that survives here is the
// per-library criterion table build — the `name → Criterion` lookup the reference evaluator resolves
// against for every library a `use decision` can bind into.

import type { ResolvedCelGraph } from "../cel/imports/types";
import type { CRL } from "../ast/types";
import { buildCriterionTable, type CriterionTable } from "../ast/criterionExpansion";

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
