// REFACTOR:grounded (#328): form defaults do not constrain or relabel clinical data.
import { getRefLibrary, getRefName, type CRL } from "../ast/types";

export const QUESTION_UNIT_URL = "http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-question-unit";
export const QUESTION_UNIT_OPTION_URL = "http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption";
export const QUESTION_UNIT_SYSTEM = "http://unitsofmeasure.org";

/** Same owning/default presentation used by form emission; scoped units are diagnosed by the catalog. */
export function defaultQuestionUnit(ast: CRL, concept: string): string | undefined {
  return ast.presentations?.find(p => p.contexts.length === 0 &&
    (!getRefLibrary(p.target) || getRefLibrary(p.target) === ast.library.name) && getRefName(p.target) === concept)?.questionUnit;
}

export function questionUnitExtension(unit: string) {
  return { url: QUESTION_UNIT_URL, valueCoding: { system: QUESTION_UNIT_SYSTEM, code: unit, display: unit } };
}

/** Include the definition only when an actual emitted action input uses the annotation. */
export function hasQuestionUnitInput(resource: Record<string, unknown>): boolean {
  if (resource.resourceType !== "PlanDefinition") return false;
  const walk = (value: unknown): boolean => Array.isArray(value) && value.some(action => {
    if (!action || typeof action !== "object") return false;
    return (Array.isArray(action.input) && action.input.some((input: { extension?: { url?: string }[] }) =>
      input.extension?.some(extension => extension.url === QUESTION_UNIT_URL))) || walk(action.action);
  });
  return walk(resource.action);
}

/** CRL-owned extension, explicitly not an HL7 CPG extension or a resource unit restriction. */
export function questionUnitDefinition(): Record<string, unknown> {
  return {
    resourceType: "StructureDefinition", id: "presentation-question-unit", url: QUESTION_UNIT_URL,
    version: "1.0.0", name: "PresentationQuestionUnit", title: "Quantity question default unit",
    status: "draft", experimental: true, fhirVersion: "4.0.1", kind: "complex-type", abstract: false,
    type: "Extension", baseDefinition: "http://hl7.org/fhir/StructureDefinition/Extension", derivation: "constraint",
    description: "Preferred UCUM unit for fresh Quantity form entry. Existing populated values retain their visible units. This is presentation metadata, not a constraint on clinical resources. Requires a processor that maps it to standard questionnaire-unitOption.",
    context: [{ type: "element", expression: "DataRequirement" }, { type: "element", expression: "Questionnaire.item" }],
    differential: { element: [
      { id: "Extension", path: "Extension", short: "Default unit for fresh Quantity form entry" },
      { id: "Extension.extension", path: "Extension.extension", max: "0" },
      { id: "Extension.url", path: "Extension.url", fixedUri: QUESTION_UNIT_URL },
      { id: "Extension.value[x]", path: "Extension.value[x]", min: 1, type: [{ code: "Coding" }], patternCoding: { system: QUESTION_UNIT_SYSTEM } },
    ] },
  };
}
