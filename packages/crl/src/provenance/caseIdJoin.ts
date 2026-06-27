/**
 * Shared case-NAME → frozen-caseId join (#174 disc 149). ONE definition of the name↔id join, consumed by the cockpit
 * model (the cross-pane reveal target), the correspondence check (correspondenceCheck.ts), AND the disposition-path
 * scaffold generator (generate.ts) — so the three cannot drift on what a "comparable" case is.
 *
 * Two distinct collision notions, both surfaced (correspondenceCheck.ts's exact semantics):
 *  - `caseIdByName`: NAME → frozen caseId, dropping any name shared by ≥2 FROZEN cases (un-revealable, not mis-revealed).
 *    `frozenCollisions` lists those dropped names. (This is cockpitModel's historical `buildCaseIdByName`.)
 *  - `duplicateScenarioNames`: a name shared by >1 case (FROZEN OR UNFROZEN) in the render. This is the STRONGER guard
 *    correspondenceCheck needs: an unfrozen+frozen same-name pair survives `caseIdByName` (the frozen one wins) but
 *    joining the unfrozen scenario to the frozen case's units would mis-compare it — so ANY non-unique name is unsafe
 *    to compare. A consumer classifying cases case-first checks `duplicateScenarioNames` BEFORE the caseId lookup.
 */
import type { CELCase } from "../cel/ast/types";
import type { ResolvedCelGraph } from "../cel/imports/types";

export interface CaseIdJoin {
  /** NAME → frozen caseId (a name shared by ≥2 frozen cases is dropped). */
  caseIdByName: Record<string, string>;
  /** Names dropped from `caseIdByName` because ≥2 FROZEN cases share them (un-revealable). */
  frozenCollisions: string[];
  /** Names shared by >1 case in the render (frozen OR unfrozen) — the stronger mis-join guard. */
  duplicateScenarioNames: Set<string>;
}

/** All CELCases in the resolved graph, in source order. */
function celCases(graph: ResolvedCelGraph): CELCase[] {
  return (graph.cel?.statements ?? []).filter((s): s is CELCase => s.type === "CELCase");
}

/** Build the case-id join from the CEL AST. Pure. */
export function buildCaseIdJoin(graph: ResolvedCelGraph): CaseIdJoin {
  const cases = celCases(graph);

  // caseIdByName: NAME → frozen caseId, dropping any name shared by ≥2 FROZEN cases. (Identical semantics to the
  // historical cockpitModel.buildCaseIdByName — the cross-pane reveal join.)
  const byName: Record<string, string> = {};
  const collided = new Set<string>();
  for (const c of cases) {
    if (c.caseId === undefined) continue;
    if (collided.has(c.name)) continue;
    if (c.name in byName) {
      delete byName[c.name]; // a second frozen case with this name → ambiguous → both un-revealable
      collided.add(c.name);
    } else {
      byName[c.name] = c.caseId;
    }
  }

  // duplicateScenarioNames: a name shared by >1 case (frozen OR unfrozen). (correspondenceCheck's `nameCounts` guard.)
  const nameCounts = new Map<string, number>();
  for (const c of cases) nameCounts.set(c.name, (nameCounts.get(c.name) ?? 0) + 1);
  const duplicateScenarioNames = new Set<string>();
  for (const [name, n] of nameCounts) if (n > 1) duplicateScenarioNames.add(name);

  return { caseIdByName: byName, frozenCollisions: [...collided], duplicateScenarioNames };
}
