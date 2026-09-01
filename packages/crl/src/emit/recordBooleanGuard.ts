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
import { resourceEmitRow } from "./resourceEmitRegistry";

/**
 * ⭐⭐ The proven DATUM CARRIER on a RECORD-BEARING concept — the element that record carries its value in,
 * or `null` when the model does not rule one.
 *
 * TWO consumers, ONE authority, and that is the whole point: the Interface guard READS the value at this
 * element, and the case-feature StructureDefinition tells a user to WRITE it there. Two independent
 * resolutions agreeing only by discipline is the drift this refactor exists to remove.
 *
 * ⚠⚠ THE CODING-ELEMENT EXCLUSION IS LOAD-BEARING, and its absence was safe only by accident. Until this
 * function took a `valueType`, nothing reached the trap because NO coding element admits `boolean`. Ask for
 * `CodeableConcept` and `valueReadElementsAdmitting` returns exactly ONE element for Condition, Procedure,
 * ServiceRequest, Encounter and MedicationRequest — **the resource's identity coding**, which the
 * case-feature differential already `patternCodeableConcept`-fixes to the concept's own local code. Without
 * this guard, "exactly one admitting element" would pass and emit a profile whose ANSWER SLOT IS ITS FIXED
 * IDENTITY: a question whose only legal answer is its own name. `computeLocalDatum` has carried the same
 * exclusion since disc 497; this is that rule, on the other lane. (Panel round 4, both arms.)
 */
export function resolveRecordDatumCarrier(concept: Concept | undefined): string | null {
  if (concept === undefined) return null;
  // ⭐⭐ THE CARRIER IS A PROPERTY OF A RECORD, NOT OF PUBLISHED CARDINALITY — and gating it on `Record`
  // alone was a REGRESSION I introduced, measured on the goal: the Layered option's `Weight Records` and
  // `Height Records` are `shape is RecordSet`, so their case-feature SDs emitted with NO `value[x]` and
  // TWO OF FOUR QUESTIONS IN THE EXPECTED-CONVENTION OPTION COULD NOT BE ANSWERED.
  //
  // ⚠ Charter §3 is explicit that a coded `shape is RecordSet` history IS answerable, and disc 530's panel
  // had warned in advance: *"RecordSet must not be silently excluded — Record-first is fine as SEQUENCING,
  // but it is BUILD DEBT, never 'answerable = Record'."* I accepted that and then shipped exactly that gate.
  //
  // Cardinality changes the enclosing questionnaire GROUP, not the resource's value PATH. Whether a concept
  // publishes one record or many says nothing about where each of those records keeps its datum.
  //
  // ⚠ SCALAR STAYS OUT, and that is not the same omission: a Scalar concept publishes a VALUE, not a
  // record, so it has no record of its own to carry one. (Its records-twin seam is a separate question —
  // disc 531 ledger, the three-shape constraint.)
  const shape = assumedShapePreMigration(concept.shape);
  if (shape !== "Record" && shape !== "RecordSet") return null;
  if (concept.valueTypes.length !== 1) return null;
  const valueType = concept.valueTypes[0];
  const resourceType = concept.conceptType;
  if (resourceType === undefined) return null;
  const row = resourceEmitRow(resourceType);
  if (row === undefined) return null;

  const admissible = (path: string): boolean => {
    // ⚠ NEVER the coding element — see the header.
    if (row.coding !== undefined && path === row.coding.field) return false;
    return valueReadElementsAdmitting(resourceType, valueType).includes(path);
  };

  // ⚠ An AUTHORED `value element is` override wins — the author naming the carrier explicitly is stronger
  // evidence than the model's default. It is still only accepted when the model AGREES the element admits
  // this value type, so an override can no more invent a carrier than a guess can.
  if (concept.valueElement !== undefined) {
    const authored = concept.valueElement.path;
    return admissible(authored) ? authored : null;
  }
  // Exactly one, or fail closed. Zero = the resource has no carrier for this type (a Condition's truth is
  // EXISTENCE, not a value). More than one = no canonical carrier is ruled between them, and choosing would
  // be guessing by another name (charter §3).
  const admitting = valueReadElementsAdmitting(resourceType, valueType).filter(admissible);
  return admitting.length === 1 ? admitting[0] : null;
}

/** The boolean case, for the Interface guard. Delegates so the guard's read element and the SD's answer slot
 *  can never be resolved two different ways. */
export function resolveRecordBooleanGuardCarrier(concept: Concept | undefined): string | null {
  if (concept === undefined) return null;
  if (!(concept.valueTypes.length === 1 && concept.valueTypes[0] === "boolean")) return null;
  return resolveRecordDatumCarrier(concept);
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
