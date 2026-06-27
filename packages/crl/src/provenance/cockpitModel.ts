/**
 * Cockpit model — the resolve-ONCE entry the three-pane viewer shell uses (#156, C2b-2/C2c-1). One `resolveProvenance`
 * pass yields the correspondence model (source↔CRL↔CEL units), the CRL-structure view-model (decision tree), the scenario
 * render (CEL cases), and the name→frozen-caseId join — all from the same resolved graph, so their keys agree by
 * construction. (`renderScenario` runs the full CRE; it's on the debounced rebuild path.)
 */
import type { CELCase } from "../cel/ast/types";
import { renderScenario, type RenderScenarioResult } from "../cre";
import type { ResolvedCelGraph } from "../cel/imports/types";

import { buildCorrespondenceModelFromResolved, type CorrespondenceModel } from "./correspondence";
import { buildCrlConceptLayer, type CrlConceptNode } from "./crlConceptLayer";
import { buildCrlStructure, type CrlDecisionStructure } from "./crlStructure";
import { resolveProvenance, type ResolveProvenanceResult } from "./validateFiles";
import type { ProvenanceValidationMode } from "./validators";

export interface CockpitModel {
  correspondence: CorrespondenceModel;
  crlStructure: CrlDecisionStructure[];
  /** ALL concept declarations across the closure as addressable nodes (#166) — the CRL pane renders these alongside the
   *  decision tree; correspondence joins to them by nodeKey. */
  conceptLayer: CrlConceptNode[];
  /** The full scenario render (cases + status + the success/errors envelope so the CEL pane can show "why" on failure). */
  scenarios: RenderScenarioResult;
  /** Case NAME → frozen caseId — the join between renderScenario (keyed by name) and the correspondence (keyed by the
   *  frozen `- id is` caseId). Only cases WITH a frozen id; a name shared by ≥2 frozen cases is dropped (un-revealable,
   *  not mis-revealed). A scenario whose name is absent here renders but is not a cross-pane reveal target. */
  caseIdByName: Record<string, string>;
  /** Frozen-case NAMEs shared by ≥2 cases (dropped from caseIdByName → those cases are un-revealable). The shell surfaces
   *  these so a KE knows why some cases aren't navigable — it's a CEL data-quality signal, not a tool bug. */
  caseNameCollisions: string[];
}

/** Build NAME → frozen caseId from the CEL AST, dropping any name shared by multiple frozen cases. */
function buildCaseIdByName(graph: ResolvedCelGraph): { byName: Record<string, string>; collisions: string[] } {
  const byName: Record<string, string> = {};
  const collided = new Set<string>();
  for (const s of graph.cel?.statements ?? []) {
    if (s.type !== "CELCase") continue;
    const c = s as CELCase;
    if (c.caseId === undefined) continue;
    if (collided.has(c.name)) continue;
    if (c.name in byName) {
      delete byName[c.name]; // a second frozen case with this name → ambiguous → both un-revealable
      collided.add(c.name);
    } else {
      byName[c.name] = c.caseId;
    }
  }
  return { byName, collisions: [...collided] };
}

export function buildCockpitModel(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
  mode: ProvenanceValidationMode = "final",
): CockpitModel {
  const r = resolveProvenance(artifactPath, celPath, anchorPath, mode);
  return buildCockpitModelFromResolved(r, { artifactPath, celPath });
}

/** Build the cockpit model from an ALREADY-resolved provenance result — the resolve-ONCE body of `buildCockpitModel`
 *  minus the `resolveProvenance` call. Folded into `validateProvenanceFiles` (final mode) so the cockpit-correspondence
 *  gate runs the SAME resolution the shell renders, without a second pipeline pass. */
export function buildCockpitModelFromResolved(
  r: ResolveProvenanceResult,
  opts: { artifactPath: string; celPath: string },
): CockpitModel {
  const { artifactPath, celPath } = opts;
  const { byName, collisions } = buildCaseIdByName(r.graph);
  return {
    correspondence: buildCorrespondenceModelFromResolved(r, { artifactPath, celPath }),
    crlStructure: buildCrlStructure(r.graph),
    conceptLayer: buildCrlConceptLayer(r.graph),
    scenarios: renderScenario(r.graph),
    caseIdByName: byName,
    caseNameCollisions: collisions,
  };
}
