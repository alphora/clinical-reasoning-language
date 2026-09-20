// REFACTOR:grounded: Q/QR association and explicit native value[x] types are validated without reserializing FHIR.
import { JsonDocument, type JsonNode, SessionInputError, prop, str, bool, array } from "./sessionJson";
export interface ResponseItemBinding { pointer: string; response: JsonNode; question: JsonNode; underRepeatingGroup: boolean }
const answerTypes: Readonly<Record<string, string[]>> = {
  boolean: ["valueBoolean"], decimal: ["valueDecimal"], integer: ["valueInteger"], date: ["valueDate"], dateTime: ["valueDateTime"], time: ["valueTime"],
  string: ["valueString"], text: ["valueString"], url: ["valueUri"], choice: ["valueCoding"], "open-choice": ["valueCoding", "valueString"],
  attachment: ["valueAttachment"], reference: ["valueReference"], quantity: ["valueQuantity"],
};
export function resource(node: JsonNode, type: string, location: string): void {
  if (str(prop(node, "resourceType")) !== type) throw new SessionInputError("wrong-resource-type", "Expected " + type + ".", location);
}
export function bundleResources(doc: JsonDocument): JsonNode[] {
  resource(doc.root, "Bundle", "");
  return array(prop(doc.root, "entry"), "/entry").map((entry, i) => {
    const value = prop(entry, "resource");
    if (!value || value.type !== "object" || !str(prop(value, "resourceType"))) throw new SessionInputError("missing-resource", "Bundle entry must carry a resource.", "/entry/" + i);
    return value;
  });
}
export function matchesQuestionnaire(questionnaire: JsonNode, canonical: string): boolean {
  const [url, version, extra] = canonical.split("|");
  return extra === undefined && Boolean(url) && str(prop(questionnaire, "url")) === url && (version === undefined || str(prop(questionnaire, "version")) === version);
}
export function validateResponse(questionnaire: JsonNode, response: JsonNode, subject?: string): ResponseItemBinding[] {
  resource(questionnaire, "Questionnaire", "questionnaire"); resource(response, "QuestionnaireResponse", "response");
  const canonical = str(prop(response, "questionnaire"));
  if (!canonical || !matchesQuestionnaire(questionnaire, canonical)) throw new SessionInputError("questionnaire-mismatch", "Response must reference the supplied Questionnaire canonical and version.");
  if (subject !== undefined && str(prop(prop(response, "subject"), "reference")) !== subject) throw new SessionInputError("subject-mismatch", "Response subject must match the requested subject.");
  const ids = new Set<string>();
  const checkQuestions = (items: JsonNode[]): void => {
    for (const item of items) {
      const id = str(prop(item, "linkId"));
      if (!id || ids.has(id)) throw new SessionInputError("ambiguous-questionnaire", "Questionnaire linkIds must be present and unique; duplicate questions require an engine/content correction.");
      ids.add(id); checkQuestions(array(prop(item, "item"), "Questionnaire.item"));
    }
  };
  const questions = array(prop(questionnaire, "item"), "Questionnaire.item"); checkQuestions(questions);
  const bindings: ResponseItemBinding[] = [];
  const walk = (qItems: JsonNode[], responseItems: JsonNode[], parent: string, repeated: boolean): void => {
    const counts = new Map<string, number>();
    for (const [i, item] of responseItems.entries()) {
      const pointer = parent + "/" + i, id = str(prop(item, "linkId"));
      const question = qItems.find(q => str(prop(q, "linkId")) === id);
      if (!id || !question) throw new SessionInputError("unknown-response-item", "Response item does not match this Questionnaire hierarchy.", pointer);
      const type = str(prop(question, "type")), repeats = bool(prop(question, "repeats")) === true;
      const count = (counts.get(id) ?? 0) + 1; counts.set(id, count);
      if (count > 1 && !(type === "group" && repeats)) throw new SessionInputError("duplicate-response-item", "Only repeating groups may repeat an item occurrence; repeated answers belong in answer[].", pointer);
      const qDef = str(prop(question, "definition")), rDef = str(prop(item, "definition"));
      if (rDef !== undefined && rDef !== qDef) throw new SessionInputError("definition-mismatch", "Response definition differs from its question.", pointer);
      const underRepeatingGroup = repeated || (type === "group" && repeats);
      bindings.push({ pointer, response: item, question, underRepeatingGroup });
      const answers = array(prop(item, "answer"), pointer + "/answer");
      if (!repeats && answers.length > 1) throw new SessionInputError("answer-multiplicity", "Question accepts at most one answer.", pointer);
      if (answers.length && (!type || !answerTypes[type])) throw new SessionInputError("unanswerable-item", "This item type does not accept an answer.", pointer);
      for (const [a, answer] of answers.entries()) {
        const location = pointer + "/answer/" + a;
        if (answer.type !== "object") throw new SessionInputError("invalid-answer", "Answer must be an object.", location);
        const values = (answer.children ?? []).map(p => p.children![0].value as string).filter(k => k.startsWith("value"));
        if (values.length !== 1 || !answerTypes[type!].includes(values[0])) throw new SessionInputError("answer-type", "Expected " + answerTypes[type!].join(" or ") + ".", location);
        const value = prop(answer, values[0])!;
        const expected = values[0] === "valueBoolean" ? "boolean" : ["valueInteger", "valueDecimal"].includes(values[0]) ? "number" : ["valueCoding", "valueQuantity", "valueReference", "valueAttachment"].includes(values[0]) ? "object" : "string";
        if (value.type !== expected) throw new SessionInputError("answer-type", "Incorrect JSON type for " + values[0] + ".", location);
        if (values[0] === "valueInteger" && (!Number.isInteger(value.value) || value.value < -2147483648 || value.value > 2147483647)) throw new SessionInputError("answer-type", "FHIR integer must be a signed 32-bit integer.", location);
        walk(array(prop(question, "item"), "Questionnaire.item"), array(prop(answer, "item"), location + "/item"), location + "/item", underRepeatingGroup);
      }
      if (answers.length && prop(item, "item")) throw new SessionInputError("ambiguous-response-hierarchy", "Answered items place child items under their answers.", pointer);
      walk(array(prop(question, "item"), "Questionnaire.item"), array(prop(item, "item"), pointer + "/item"), pointer + "/item", underRepeatingGroup);
    }
  };
  walk(questions, array(prop(response, "item"), "/item"), "/item", false);
  return bindings;
}
export function validateSessionBundles(repository: JsonDocument, data: JsonDocument, planId: string, subject: string): void {
  const resources = bundleResources(repository), incoming = bundleResources(data);
  if (resources.filter(r => str(prop(r, "resourceType")) === "PlanDefinition" && str(prop(r, "id")) === planId).length !== 1) throw new SessionInputError("plan-not-found", "Repository must contain exactly one requested PlanDefinition.");
  if (!/^Patient\/[A-Za-z0-9.-]{1,64}$/.test(subject)) throw new SessionInputError("invalid-subject", "Use a Patient/<id> subject reference.");
  for (const response of incoming.filter(r => str(prop(r, "resourceType")) === "QuestionnaireResponse")) {
    const canonical = str(prop(response, "questionnaire"));
    const matches = resources.filter(r => str(prop(r, "resourceType")) === "Questionnaire" && canonical && matchesQuestionnaire(r, canonical));
    if (matches.length !== 1) throw new SessionInputError("questionnaire-mismatch", "Each submitted response needs exactly one matching Questionnaire in the repository.");
    validateResponse(matches[0], response, subject);
  }
}
