// REFACTOR:grounded (#328): Quantity type semantics use standard ElementDefinition metadata.
export const QUESTION_UNIT_URL = "http://hl7.org/fhir/StructureDefinition/elementdefinition-allowedUnits";
export const QUESTION_UNIT_SYSTEM = "http://unitsofmeasure.org";
export function quantityUnitExtension(unit: string) {
  return { url: QUESTION_UNIT_URL, valueCodeableConcept: { coding: [{ system: QUESTION_UNIT_SYSTEM, code: unit, display: unit }] } };
}
