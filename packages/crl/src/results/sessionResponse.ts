// REFACTOR:grounded: explicit edits preserve raw answer tokens and never infer occurrence/persistence identity.
import { JsonDocument, type JsonNode, SessionInputError, prop, str, array, sha256 } from "./sessionJson";
import { validateResponse } from "./sessionValidation";
export type SessionAnswerEdit = { pointer: string; operation: "clear" } | { pointer: string; operation: "set"; answersJson: string };
export interface SessionResponseOptions {
  expectedResponseSha256: string;
  authored: string;
  mode: "full" | "edits-only";
  edits: readonly SessionAnswerEdit[];
}
const extractionUrls = new Set([
  "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract",
  "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtractValue",
]);
export function buildSessionResponse(questionnaireJson: string, responseJson: string, options: SessionResponseOptions): string {
  if (!options || !["full", "edits-only"].includes(options.mode)) throw new SessionInputError("submission-mode", "Specify full or edits-only submission mode.");
  if (sha256(responseJson) !== options.expectedResponseSha256) throw new SessionInputError("stale-response", "Response bytes changed; locate the item again and use its current hash.");
  if (typeof options.authored !== "string" || !options.authored.trim()) throw new SessionInputError("missing-authored", "Supply the actual response authored timestamp; the helper does not invent time.");
  if (!Array.isArray(options.edits)) throw new SessionInputError("invalid-edits", "edits must be an array.");
  const q = new JsonDocument(questionnaireJson), r = new JsonDocument(responseJson);
  const bindings = validateResponse(q.root, r.root);
  const byPath = new Map(bindings.map(b => [b.pointer, b]));
  const edits = new Map<string, SessionAnswerEdit>();
  for (const edit of options.edits) {
    const binding = byPath.get(edit.pointer);
    if (!binding) throw new SessionInputError("invalid-edit-path", "Use the exact JSON Pointer of an existing response item.", edit.pointer);
    if (!["set", "clear"].includes(edit.operation)) throw new SessionInputError("invalid-operation", "Use set or clear.", edit.pointer);
    if (["group", "display"].includes(str(prop(binding.question, "type")) ?? "")) throw new SessionInputError("unanswerable-item", "Edit an answerable item, not a group or display.", edit.pointer);
    for (const existing of edits.keys()) if (edit.pointer === existing || edit.pointer.startsWith(existing + "/") || existing.startsWith(edit.pointer + "/")) throw new SessionInputError("overlapping-edits", "Each edited item must have one unambiguous operation.", edit.pointer);
    if (options.mode === "edits-only" && binding.underRepeatingGroup) throw new SessionInputError("ambiguous-repeated-occurrence", "Edits-only pruning cannot establish repeated-group extraction identity. Use an explicitly reconciled full response or your native occurrence contract.", edit.pointer);
    if (options.mode === "edits-only" && edit.pointer.includes("/answer/")) throw new SessionInputError("answer-ancestor-required", "Editing below another answer would reassert that ancestor. Use explicit full mode or construct a request with your native extraction contract.", edit.pointer);
    if (edit.operation === "set") {
      const answers = new JsonDocument(edit.answersJson);
      if (answers.root.type !== "array" || !answers.root.children?.length) throw new SessionInputError("invalid-answer", "Set needs a nonempty answer array; use clear to remove answers.", edit.pointer);
    }
    if (edit.operation === "set") {
      // Array replacement supplies no identity mapping for existing answer children.
      const current = binding.response;
      if (array(prop(current, "answer"), edit.pointer + "/answer").some(answer => array(prop(answer, "item"), edit.pointer + "/answer/item").length)) {
        throw new SessionInputError("nested-answer-replacement", "Changing a parent answer with child items requires an explicitly reconciled response; edit child items directly or construct the complete response.", edit.pointer);
      }
    }
    edits.set(edit.pointer, edit);
  }
  const keep = (pointer: string): boolean => options.mode === "full" || [...edits.keys()].some(p => p === pointer || p.startsWith(pointer + "/"));
  const renderItems = (items: JsonNode[], prefix: string): string => "[" + items.flatMap((item, i) => {
    const pointer = prefix + "/" + i;
    if (!keep(pointer)) return [];
    const binding = byPath.get(pointer)!;
    const changes = new Map<string, string | undefined>();
    const definition = prop(binding.question, "definition");
    if (definition) changes.set("definition", q.raw(definition));
    const extensions = [
      ...array(prop(item, "extension"), pointer + "/extension").filter(e => !extractionUrls.has(str(prop(e, "url")) ?? "")).map(e => r.raw(e)),
      ...array(prop(binding.question, "extension"), "Questionnaire.extension").filter(e => extractionUrls.has(str(prop(e, "url")) ?? "")).map(e => q.raw(e)),
    ];
    if (extensions.length || prop(item, "extension")) changes.set("extension", extensions.length ? "[" + extensions.join(",") + "]" : undefined);
    const edit = edits.get(pointer);
    if (edit) changes.set("answer", edit.operation === "clear" ? undefined : edit.answersJson);
    else if (prop(item, "answer")) changes.set("answer", "[" + array(prop(item, "answer"), pointer + "/answer").map((answer, a) => {
      if (!prop(answer, "item")) return r.raw(answer);
      return r.object(answer, new Map([["item", renderItems(array(prop(answer, "item"), pointer + "/answer/" + a + "/item"), pointer + "/answer/" + a + "/item")]]));
    }).join(",") + "]");
    if (prop(item, "item")) changes.set("item", renderItems(array(prop(item, "item"), pointer + "/item"), pointer + "/item"));
    return [r.object(item, changes)];
  }).join(",") + "]";
  const result = r.object(r.root, new Map([
    ["authored", JSON.stringify(options.authored)],
    ["item", renderItems(array(prop(r.root, "item"), "/item"), "/item")],
  ]));
  validateResponse(q.root, new JsonDocument(result).root);
  return result;
}
