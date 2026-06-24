/**
 * Cockpit model — the resolve-ONCE entry the three-pane viewer shell uses (#156, C2b-2). One `resolveProvenance` pass
 * yields BOTH the correspondence model (source↔CRL↔CEL units) and the CRL-structure view-model (the decision tree),
 * avoiding the double-resolve a separate `buildCorrespondenceModel` + `buildCrlStructure` would incur. Both halves walk
 * the same resolved graph, so the correspondence units' crl nodeKeys and the structure's keys agree by construction.
 */
import { buildCorrespondenceModelFromResolved, type CorrespondenceModel } from "./correspondence";
import { buildCrlStructure, type CrlDecisionStructure } from "./crlStructure";
import { resolveProvenance } from "./validateFiles";

export interface CockpitModel {
  correspondence: CorrespondenceModel;
  crlStructure: CrlDecisionStructure[];
}

export function buildCockpitModel(
  artifactPath: string,
  celPath: string,
  anchorPath: string,
): CockpitModel {
  const r = resolveProvenance(artifactPath, celPath, anchorPath);
  return {
    correspondence: buildCorrespondenceModelFromResolved(r, { artifactPath, celPath }),
    crlStructure: buildCrlStructure(r.graph),
  };
}
