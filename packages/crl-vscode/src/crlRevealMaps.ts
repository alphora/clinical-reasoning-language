// Cross-pane reveal maps — the implementation MOVED to `crl/provenance/revealMaps` (#170) so `validate_provenance`
// (which lives in `crl`) can gate cockpit correspondence against this REAL resolution rather than a reimplementation.
// This file re-exports the crl-owned implementation for the renderer (correspondenceCockpit); the implementation and
// its unit tests now live in `@smile-digital-health/crl`. The renderer's `import … from "./crlRevealMaps"` is unchanged.
export {
  buildCrlRevealMaps,
  caseIdsForUnit,
  caseIdsForNode,
  unitsForCase,
  unitsForConcept,
  rowsForConcept,
  conceptNodesForUnit,
  unitsForConceptNode,
  rowNodeKeysForConcept,
  conceptNodesForRow,
  conceptKeysForUnit,
  conceptKeysForNode,
  rowNodeKeysForUnit,
  rowNodeKeysForUnitWithConcepts,
  crlAnchorsForUnits,
  conceptCrlAnchors,
  unitsForRow,
  unitsForRowAll,
  unitNumbersForRow,
  unitNumbersForCase,
  type CrlRevealMaps,
} from "@smile-digital-health/crl";
