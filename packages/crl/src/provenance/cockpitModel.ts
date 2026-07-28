/**
 * Cockpit model — the resolve-ONCE entry the three-pane viewer shell uses (#156, C2b-2/C2c-1). One `resolveProvenance`
 * pass yields the correspondence model (source↔CRL↔CEL units), the CRL-structure view-model (decision tree), the scenario
 * render (CEL cases), and the name→frozen-caseId join — all from the same resolved graph, so their keys agree by
 * construction. (`renderScenario` runs the full CRE; it's on the debounced rebuild path.)
 */
import { leafEligibleConcepts } from "../cql-emitter/lowerLocalCodes";
import { renderScenario, type RenderScenarioResult } from "../cre";

import { buildCaseIdJoin } from "./caseIdJoin";
import { buildConceptShapeIndex, type ConceptShapeIndex } from "./conceptShape";
import { buildDefExprIndex, type DefExprIndex } from "./definedAsExpr";
import { buildGuardOutlines, type GuardOutline } from "./guardOutline";
import { buildCorrespondenceModelFromResolved, type CorrespondenceModel } from "./correspondence";
import { buildCrlConceptLayer, type CrlConceptNode } from "./crlConceptLayer";
import { buildCrlStructure, type CrlDecisionStructure } from "./crlStructure";
import { collectLibs } from "./indexer";
import { resolveProvenance, type ResolveProvenanceResult } from "./validateFiles";
import type { ProvenanceValidationMode } from "./validators";

export interface CockpitModel {
  correspondence: CorrespondenceModel;
  crlStructure: CrlDecisionStructure[];
  /** ALL concept declarations across the closure as addressable nodes (#166) — the CRL pane renders these alongside the
   *  decision tree; correspondence joins to them by nodeKey. */
  conceptLayer: CrlConceptNode[];
  /** Per-concept `defined as` SHAPE subtree (#187 Todo 1b), keyed by nodeKey — drives the Medical-Validation panes'
   *  faithful question/tree surface (leaf-eligibility ≡ the emitted PlanDefinition's `action.input`). Built on the
   *  shared inference walk; `leafEligible` sourced from the emitter's lowering (fail-closed on lowering errors). */
  conceptShape: ConceptShapeIndex;
  /** #187 Option-3: the operator-PRESERVING projection of the same `defined as` bodies (keyed by nodeKey) — the
   *  sem-or/and/not tree the MV Questionnaire renders as ANY OF / ALL OF boxes. Its leafEligible leaves are
   *  drift-guarded equal to `conceptShape`'s (`collectDefExprLeafKeys` == `codeIsLeavesPreorder`). */
  defExpr: DefExprIndex;
  /** #224 ii.3 Todo 3: guard OUTLINE per criterion-bearing `when`, keyed by the `when`'s structure nodeKey — the
   *  Flow pane hangs it as the `defined as`-style operator outline (so a criterion body is visible, not a dead-end).
   *  Only criterion-bearing whens (and only envelope-safe ones); a single-concept / plain-compound guard is absent. */
  guardOutlines: Map<string, GuardOutline>;
  /** The full scenario render (cases + status + the success/errors envelope so the CEL pane can show "why" on failure). */
  scenarios: RenderScenarioResult;
  /** Case NAME → frozen caseId — the join between renderScenario (keyed by name) and the correspondence (keyed by the
   *  frozen `- id is` caseId). Only cases WITH a frozen id; a name shared by ≥2 frozen cases is dropped (un-revealable,
   *  not mis-revealed). A scenario whose name is absent here renders but is not a cross-pane reveal target. */
  caseIdByName: Record<string, string>;
  /** Frozen-case NAMEs shared by ≥2 cases (dropped from caseIdByName → those cases are un-revealable). The shell surfaces
   *  these so a KE knows why some cases aren't navigable — it's a CEL data-quality signal, not a tool bug. */
  caseNameCollisions: string[];
  /** Names shared by >1 case in the render (FROZEN OR UNFROZEN) — the stronger mis-join guard: an unfrozen+frozen
   *  same-name pair survives caseIdByName (the frozen one wins) but is unsafe to compare. The correspondence check
   *  classifies a scenario unchecked (case-name-collision) when its name is in here, BEFORE the caseId lookup. */
  duplicateScenarioNames: Set<string>;
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
  const { caseIdByName, frozenCollisions, duplicateScenarioNames } = buildCaseIdJoin(r.graph);

  // #187 Todo 1b: the per-concept shape index. Leaf-eligibility is the emitter's own lowering
  // (`leafEligibleConcepts`, fail-closed on lowering errors) computed per source library HERE — the impure
  // step — and passed into the PURE `buildConceptShapeIndex` (keeps `cql-emitter` out of the shape builder).
  const conceptLayer = buildCrlConceptLayer(r.graph);
  const { libs } = collectLibs(r.graph);
  const leafEligibleByLib = new Map<string, Set<string>>();
  for (const [lib, info] of libs) leafEligibleByLib.set(lib, leafEligibleConcepts(info.entry.ast));
  // Pass the SAME collected `libs` (no re-collect) so the shape builder's lib set matches `conceptLayer`'s.
  const conceptShape = buildConceptShapeIndex(libs, conceptLayer, leafEligibleByLib);
  // #187 Option-3: the operator-PRESERVING projection of the same `defined as` bodies (same inputs), for the MV
  // Questionnaire's ANY OF / ALL OF box render. Its leafEligible leaves are drift-guarded == conceptShape's.
  const defExpr = buildDefExprIndex(libs, conceptLayer, leafEligibleByLib);
  // #224 ii.3 Todo 3: guard outlines for criterion-bearing whens (Flow pane), resolved against the same defExpr index.
  const guardOutlines = buildGuardOutlines(r.graph, defExpr);

  return {
    correspondence: buildCorrespondenceModelFromResolved(r, { artifactPath, celPath }),
    crlStructure: buildCrlStructure(r.graph),
    conceptLayer,
    conceptShape,
    defExpr,
    guardOutlines,
    scenarios: renderScenario(r.graph),
    caseIdByName,
    caseNameCollisions: frozenCollisions,
    duplicateScenarioNames,
  };
}
