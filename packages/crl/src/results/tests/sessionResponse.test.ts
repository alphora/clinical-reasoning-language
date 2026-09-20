import { describe, expect, it } from "vitest";
import { buildSessionResponse } from "../sessionResponse";
import { JsonDocument, sha256, SessionInputError } from "../sessionJson";
import { validateResponse, validateSessionBundles } from "../sessionValidation";
// REFACTOR:grounded: use independent assertions on untouched raw tokens, hierarchy and explicit clears.
const canonical = "https://example.org/Questionnaire/intake";
const extension = { url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-definitionExtract", valueUri: "https://example.org/StructureDefinition/answer" };
const question = (type = "string", extra = {}) => JSON.stringify({ resourceType: "Questionnaire", url: canonical, status: "active", item: [
  { linkId: "group", type: "group", extension: [extension], item: [{ linkId: "a", type, definition: "https://example.org/StructureDefinition/answer#Observation.value[x]", ...extra }, { linkId: "b", type: "quantity" }] },
] });
const response = (answer = '[{"valueString":"old"}]') => '{"resourceType":"QuestionnaireResponse","questionnaire":"' + canonical + '","status":"in-progress","subject":{"reference":"Patient/p"},"item":[{"linkId":"group","item":[{"linkId":"a","answer":' + answer + '},{"linkId":"b","answer":[{"valueQuantity":{"value":1.2300,"unit":"mg"}}]}]}]}';
const opts = (r: string, edits: any[], mode: "full" | "edits-only" = "full") => ({ expectedResponseSha256: sha256(r), authored: "2030-01-01T12:00:00Z", mode, edits });
const a = "/item/0/item/0";
const build = (q: string, r: string, edits: any[], mode: "full" | "edits-only" = "full") => buildSessionResponse(q, r, opts(r, edits, mode));
// @kit native-apply-session:typed-edits
describe("explicit typed response editing", () => {
  it("refuses parent replacement that would discard children, but permits editing a child", () => {
    const q = JSON.stringify({ resourceType: "Questionnaire", url: canonical, item: [{ linkId: "parent", type: "boolean", item: [{ linkId: "child", type: "string" }] }] });
    const r = JSON.stringify({ resourceType: "QuestionnaireResponse", questionnaire: canonical, item: [{ linkId: "parent", answer: [{ valueBoolean: true, item: [{ linkId: "child", answer: [{ valueString: "retained" }] }] }] }] });
    expect(() => build(q, r, [{ pointer: "/item/0", operation: "set", answersJson: '[{"valueBoolean":false}]' }])).toThrow(/parent answer with child items/);
    const next = JSON.parse(build(q, r, [{ pointer: "/item/0/answer/0/item/0", operation: "set", answersJson: '[{"valueString":"changed"}]' }]));
    expect(next.item[0].answer[0].valueBoolean).toBe(true);
    expect(next.item[0].answer[0].item[0].answer[0].valueString).toBe("changed");
    expect(JSON.parse(build(q, r, [{ pointer: "/item/0", operation: "clear" }])).item[0]).not.toHaveProperty("answer");
  });

  it("changes text, carries extraction bindings and preserves untouched decimal tokens", () => {
    const r = response(), next = build(question(), r, [{ pointer: a, operation: "set", answersJson: '[{"valueString":"new — text"}]' }]);
    const parsed = JSON.parse(next);
    expect(parsed.item[0].item[0].answer).toEqual([{ valueString: "new — text" }]);
    expect(parsed.item[0].extension).toEqual([extension]);
    expect(parsed.item[0].item[0].definition).toContain("#Observation.value[x]");
    expect(next).toContain('"value":1.2300'); expect(r).toContain('"valueString":"old"');
  });
  it.each([
    ["boolean", '[{"valueBoolean":false}]'], ["choice", '[{"valueCoding":{"system":"urn:s","code":"unknown"}}]'],
    ["dateTime", '[{"valueDateTime":"2026-09-19"}]'], ["dateTime", '[{"valueDateTime":"2026-09-19T12:01:00-04:00"}]'],
    ["quantity", '[{"valueQuantity":{"value":0.123456789012345678901,"unit":"mg"}}]'],
    ["decimal", '[{"valueDecimal":1.2300}]'],
  ])("preserves native %s answer tokens", (type, answer) => {
    const r = response(answer), next = build(question(type), r, [{ pointer: a, operation: "set", answersJson: answer }]);
    expect(next).toContain('"answer":' + answer);
  });
  it("edits-only clears retain the cleared item and ancestors, omit untouched siblings", () => {
    const next = JSON.parse(build(question(), response(), [{ pointer: a, operation: "clear" }], "edits-only"));
    expect(next.item).toHaveLength(1); expect(next.item[0].item).toHaveLength(1);
    expect(next.item[0].item[0]).toMatchObject({ linkId: "a" }); expect(next.item[0].item[0]).not.toHaveProperty("answer");
    expect(next.item[0].extension).toEqual([extension]);
  });
  it("full clears preserve a sibling's exact supplied quantity", () => {
    const next = build(question(), response(), [{ pointer: a, operation: "clear" }]);
    expect(JSON.parse(next).item[0].item[0]).not.toHaveProperty("answer"); expect(next).toContain('"value":1.2300');
  });
  it("does not conflate empty text and clear", () => {
    const next = build(question(), response(), [{ pointer: a, operation: "set", answersJson: '[{"valueString":""}]' }]);
    expect(JSON.parse(next).item[0].item[0].answer).toEqual([{ valueString: "" }]);
  });
  it("rejects stale pointers, missing mode, mismatched types, duplicate edits and unknown paths", () => {
    const r = response(), q = question();
    expect(() => buildSessionResponse(q, r, { ...opts(r, []), expectedResponseSha256: "wrong" })).toThrow(/changed/);
    expect(() => buildSessionResponse(q, r, { ...opts(r, []), mode: undefined } as any)).toThrow(/mode/);
    expect(() => build(q, r, [{ pointer: a, operation: "set", answersJson: '[{"valueBoolean":false}]' }])).toThrow(/valueString/);
    expect(() => build(q, r, [{ pointer: a, operation: "clear" }, { pointer: a, operation: "clear" }])).toThrow(/one unambiguous/);
    expect(() => build(q, r, [{ pointer: "/item/9", operation: "clear" }])).toThrow(/exact JSON Pointer/);
  });
  it("selects repeated occurrence two in full mode and refuses ambiguous edits-only extraction", () => {
    const q = JSON.parse(question()); q.item[0].repeats = true;
    const r = JSON.parse(response()); r.item.push(structuredClone(r.item[0]));
    const raw = JSON.stringify(r), pointer = "/item/1/item/0", edit = { pointer, operation: "set", answersJson: '[{"valueString":"second"}]' };
    const result = JSON.parse(build(JSON.stringify(q), raw, [edit]));
    expect(result.item[0].item[0].answer).toEqual([{ valueString: "old" }]);
    expect(result.item[1].item[0].answer).toEqual([{ valueString: "second" }]);
    expect(() => build(JSON.stringify(q), raw, [edit], "edits-only")).toThrow(/repeated-group extraction identity/);
  });
});
describe("session input association", () => {
  it("rejects malformed, duplicate-key, commented and trailing-comma JSON", () => {
    for (const text of ['{"x":1,"x":2}', '{"x":1,}', '{/*comment*/"x":1}', '{']) expect(() => new JsonDocument(text)).toThrow(SessionInputError);
  });
  it("rejects canonical, subject, hierarchy, multiplicity and duplicate-Q mismatches", () => {
    const q = JSON.parse(question()), r = JSON.parse(response());
    const check = (qq: any, rr: any) => validateResponse(new JsonDocument(JSON.stringify(qq)).root, new JsonDocument(JSON.stringify(rr)).root, "Patient/p");
    expect(() => check(q, { ...r, questionnaire: canonical + "-wrong" })).toThrow(/canonical/);
    expect(() => check(q, { ...r, subject: { reference: "Patient/other" } })).toThrow(/subject/);
    const wrong = structuredClone(r); wrong.item[0].item[0].linkId = "unknown"; expect(() => check(q, wrong)).toThrow(/hierarchy/);
    const many = structuredClone(r); many.item[0].item[0].answer.push({ valueString: "other" }); expect(() => check(q, many)).toThrow(/at most one/);
    const dup = structuredClone(q); dup.item[0].item.push(dup.item[0].item[0]); expect(() => check(dup, r)).toThrow(/unique/);
  });
  it("requires exactly one matching repository Questionnaire for submitted answers", () => {
    const q = JSON.parse(question()), r = JSON.parse(response());
    const repo = (items: any[]) => new JsonDocument(JSON.stringify({ resourceType: "Bundle", type: "collection", entry: [{ resource: { resourceType: "PlanDefinition", id: "p" } }, ...items.map(resource => ({ resource }))] }));
    const data = new JsonDocument(JSON.stringify({ resourceType: "Bundle", type: "collection", entry: [{ resource: r }] }));
    expect(() => validateSessionBundles(repo([]), data, "p", "Patient/p")).toThrow(/exactly one/);
    expect(() => validateSessionBundles(repo([q, q]), data, "p", "Patient/p")).toThrow(/exactly one/);
    expect(() => validateSessionBundles(repo([q]), data, "p", "Patient/p")).not.toThrow();
  });
});
