import type { PresentationContext, PresentationCatalog } from "../emit/presentation";

/** CRL-owned transport, not an HL7 extension. Versioned independently of clinical values. */
export const PRESENTATION_CHOICE_GROUP_URL = "http://clinicalreasoninglanguage.org/fhir/StructureDefinition/presentation-choice-group";
export interface ChoiceGroupInput {
  id: string;
  name: string;
  questionText: string;
  questionDescription?: string;
  columns: number;
  control: "checkbox" | "radio";
  members: { name: string; profile: string }[];
}
export interface PresentationExtension {
  url: string;
  valueString?: string;
  valueMarkdown?: string;
  valueInteger?: number;
  valueCanonical?: string;
  valueCode?: string;
  extension?: PresentationExtension[];
}

// REFACTOR:grounded: all member profiles/wording travel with each encountered input;
// native collection never discovers the panel by walking unrelated decision actions.
export function choiceGroupExtension(group: ChoiceGroupInput, catalog: PresentationCatalog, context?: PresentationContext): PresentationExtension {
  return { url: PRESENTATION_CHOICE_GROUP_URL, extension: [
    { url: "protocol", valueInteger: 1 },
    { url: "id", valueString: group.id },
    { url: "name", valueString: group.name },
    { url: "text", valueString: group.questionText },
    ...(group.questionDescription !== undefined ? [{ url: "description", valueMarkdown: group.questionDescription }] : []),
    { url: "columns", valueInteger: group.columns },
    { url: "control", valueCode: group.control },
    ...group.members.map(member => {
      const wording = catalog.resolve(member.name, context);
      return { url: "member", extension: [
        { url: "profile", valueCanonical: member.profile },
        { url: "text", valueString: wording.questionText ?? member.name },
        ...(wording.questionDescription !== undefined ? [{ url: "description", valueMarkdown: wording.questionDescription }] : []),
      ] };
    }),
  ] };
}
