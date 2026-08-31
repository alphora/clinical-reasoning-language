// #189 — MAY a `shape is Record` + `value type is boolean` concept be a DECISION GUARD, and how is its value
// read?
//
// ⭐ THE CHARTER SETTLES THE SEMANTICS (`docs/CRL-NORTH-STAR.md` §3, "`shape is Record` and `value type is
// boolean` are NOT in tension"): *"A concept publishes one record (`shape is Record`) and that record carries
// a value (`value type is …`). The guard reads the VALUE; the featureExpression targets the RECORD. Same
// concept, one declaration each, no split and no second concept."* That is the goal's `Obese` exactly.
//
// ⚠⚠ BUT "Record + boolean" IS NOT THE ADMISSION RULE, and taking it as one re-opens the hazard this
// replaces. Both panel arms produced the same counterexample independently:
//
//     concept "Latest Condition":
//     - shape is Record.  - type is Condition.  - value type is boolean.  - code is `x`.
//     - definition is most recent this.   (+ one `coded from` posrep)
//
// `resolveRecencyValueConcept` never inspects `conceptType`, and for a Record it treats `value type` as an
// OPTIONAL datum description that "constrains nothing" — so that shape classifies and lowers. A hardcoded
// `.value` read would emit `Condition.value`, an element that DOES NOT EXIST. That is the same category error
// as `.satisfied()` on a record, arriving by the carrier axis instead of the shape axis.
//
// So the gate is CARRIER-PROVEN: the published record's resource must have exactly ONE modeled element
// admitting `boolean`. `FHIR_VALUE_READ_MODEL` is the existing authority and already carries the three-way
// distinction — a non-empty set (the element exists and admits this type), ∅ (modeled and POSITIVELY
// valueless), absent (unmodeled, no knowledge). Charter §3: an unruled carrier is UNMODELED and fails closed;
// it is never guessed. Ambiguity fails closed too — two admitting elements is no non-arbitrary choice.
//
// REFACTOR:grounded — derived from the charter and the goal, and from panel round 3 (both arms,
// `.vibe-tools/discussions/527-189-guard-surface-design-r3.md`); not from adjacent emitter code.

import type { Concept } from "../ast/types";
import { assumedShapePreMigration } from "../grammar/conceptShapes";
import { valueReadElementsAdmitting } from "../fhir-model/fhirValueModel";

/** The proven boolean carrier on a Record-shaped boolean concept, or `null` if there is none. */
export function resolveRecordBooleanGuardCarrier(concept: Concept | undefined): string | null {
  if (concept === undefined) return null;
  if (assumedShapePreMigration(concept.shape) !== "Record") return null;
  if (!(concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean")) return null;
  const resourceType = concept.conceptType;
  if (resourceType === undefined) return null;
  // ⚠ An AUTHORED `value element is` override wins — it is the author naming the carrier explicitly, which is
  // stronger evidence than the model's default and is already honoured elsewhere. It is still only accepted
  // when the model AGREES the element admits a boolean, so an override cannot invent a carrier either.
  const admitting = valueReadElementsAdmitting(resourceType, "boolean");
  if (concept.valueElement !== undefined) {
    const authored = concept.valueElement.path;
    return admitting.includes(authored) ? authored : null;
  }
  // Exactly one, or fail closed. Zero = the resource has no boolean carrier (a Condition's truth is
  // EXISTENCE, not a value). More than one = no canonical carrier is ruled between them.
  return admitting.length === 1 ? admitting[0] : null;
}

/**
 * Is `concept` the RECORD-BOOLEAN GUARD form — the shape whose Interface façade reads the selected record's
 * boolean value rather than collapsing or bare-re-exporting it?
 *
 * ⚠ SCOPED TO THE CLASSIFIED FAMILY. A codeless `shape is Record` + boolean selection over ANOTHER concept
 * would arguably read the same way, but no fixture drives it and the ledger's family text does not fit it —
 * charter §0a's disposition for a legal-but-undriven form is `unclassified` and LOUD, not a quiet grant.
 * (Panel round 3, Claude arm #6.)
 */
export function isRecordBooleanGuardSource(concept: Concept | undefined): boolean {
  if (concept === undefined) return false;
  if (concept.__bothRepMerge !== "recency-value") return false;
  if (concept.__recencyMergePublishes !== "record") return false;
  return resolveRecordBooleanGuardCarrier(concept) !== null;
}
