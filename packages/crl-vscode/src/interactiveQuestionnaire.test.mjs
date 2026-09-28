import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverInitialStates, validateInitialBundle, interactiveRequest, readInteractiveResult, InteractiveSession } from "./interactiveQuestionnaire.ts";
import { pruneInteractiveResponse, questionnaireWithoutDefaults } from "./interactiveQuestionnaireResponse.ts";

const bundle = () => ({ resourceType: "Bundle", type: "collection", entry: [
  { resource: { resourceType: "Patient", id: "p" } },
  { resource: { resourceType: "ServiceRequest", id: "s", status: "draft", intent: "order", subject: { reference: "Patient/p" }, code: { coding: [{ system: "urn:test", code: "123" }] }, authoredOn: "2026-09-26", requester: { reference: "Practitioner/r" } } },
  { resource: { resourceType: "Practitioner", id: "r" } },
] });
const q = { resourceType: "Questionnaire", url: "urn:q", item: [{ linkId: "g", type: "group", item: [
  { linkId: "a", type: "boolean", initial: [{ valueBoolean: true }] }, { linkId: "b", type: "string" },
] }, { linkId: "c", type: "integer" }] };
const qr = (a = true, b = "yes", c = 2) => ({ resourceType: "QuestionnaireResponse", questionnaire: "urn:q", item: [
  { linkId: "g", item: [{ linkId: "a", answer: [{ valueBoolean: a }] }, { linkId: "b", answer: [{ valueString: b }] }] },
  { linkId: "c", answer: [{ valueInteger: c }] },
] });
const state = { id: "request-1", label: "one", bundle: bundle(), subject: "Patient/p" };
const concept = code => ({ coding: [{ system: "urn:test", code }] });
const requestExamples = [
  { resourceType: "Task", id: "task", status: "requested", intent: "order", for: { reference: "Patient/p" }, code: concept("task-code") },
  { resourceType: "NutritionOrder", id: "nutrition", status: "active", intent: "order", patient: { reference: "Patient/p" }, dateTime: "2026-09-27", oralDiet: { type: [concept("diet")] } },
  bundle().entry[1].resource,
  { resourceType: "MedicationRequest", id: "medication", status: "active", intent: "order", subject: { reference: "Patient/p" }, medicationCodeableConcept: concept("drug") },
  { resourceType: "CommunicationRequest", id: "communication", status: "active", subject: { reference: "Patient/p" }, category: [concept("message")] },
];
const requestBundle = requests => ({ ...bundle(), entry: [bundle().entry[0], ...requests.map(resource => ({ resource })), bundle().entry[2]] });
describe("interactive initial states", () => {
  it.each(["DeviceRequest", "VisionPrescription"])("does not count %s as a supported request", resourceType => {
    const b = requestBundle([{ resourceType, id: "unsupported", subject: { reference: "Patient/p" }, patient: { reference: "Patient/p" } }]);
    expect(() => validateInitialBundle(b)).toThrow("Supply at least one supported request: ServiceRequest, NutritionOrder, MedicationRequest, CommunicationRequest, Task.");
  });
  it.each(requestExamples.map(r => [r.resourceType, r]))("accepts %s alone and checks its Patient reference", (_type, request) => {
    const b = requestBundle([structuredClone(request)]);
    expect(validateInitialBundle(b)).toBe("Patient/p");
    const field = request.resourceType === "NutritionOrder" ? "patient" : request.resourceType === "Task" ? "for" : "subject";
    b.entry[0].fullUrl = "urn:uuid:initial-patient";
    b.entry[1].resource[field].reference = b.entry[0].fullUrl;
    expect(() => validateInitialBundle(b)).toThrow("the native evaluator requires this relative reference");
    b.entry[1].resource[field].reference = "Patient/other";
    expect(() => validateInitialBundle(b)).toThrow(`${request.resourceType}/${request.id}.${field}`);
    delete b.entry[1].resource[field];
    expect(() => validateInitialBundle(b)).toThrow("must reference the initial Patient");
  });
  it("discovers mixed request codes and preserves the complete initial Bundle in the apply payload", () => {
    const root = mkdtempSync(join(tmpdir(), "iq-test-"));
    try {
      const b = requestBundle(structuredClone(requestExamples));
      const before = structuredClone(b);
      const dir = join(root, "tests", "interactive-questionnaire", "request-1");
      mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "request-bundle.json"), JSON.stringify(b));
      const [initial] = discoverInitialStates(root);
      expect(initial.label).toBe("Request 1 — task-code, diet, 123, drug, message");
      expect(JSON.parse(interactiveRequest({ resourceType: "Bundle", entry: [] }, "policy", initial).requestDataJson)).toEqual(before);
      expect(b).toEqual(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("labels choice references and requests without codes without requiring ServiceRequest fields", () => {
    const root = mkdtempSync(join(tmpdir(), "iq-test-"));
    try {
      const requests = structuredClone(requestExamples.filter(r => ["MedicationRequest", "CommunicationRequest", "Task"].includes(r.resourceType)));
      const medication = requests.find(r => r.resourceType === "MedicationRequest");
      const communication = requests.find(r => r.resourceType === "CommunicationRequest");
      const task = requests.find(r => r.resourceType === "Task");
      delete medication.medicationCodeableConcept; medication.medicationReference = { reference: "Medication/m" };
      delete communication.category; delete task.code;
      const b = requestBundle(requests);
      b.entry.push({ resource: { resourceType: "Medication", id: "m", code: concept("drug") } });
      const dir = join(root, "tests", "interactive-questionnaire", "request-1");
      mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "request-bundle.json"), JSON.stringify(b));
      const [initial] = discoverInitialStates(root);
      expect(initial.label).toBe("Request 1 — Task, Medication/m, CommunicationRequest");
      expect(initial.bundle).toEqual(b);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("discovers direct policy folders in numeric order, preserving supporting resources", () => {
    const root = mkdtempSync(join(tmpdir(), "iq-test-"));
    try {
      for (const n of [10, 2, 1]) { const dir = join(root, "tests", "interactive-questionnaire", `request-${n}`); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "request-bundle.json"), JSON.stringify(bundle())); }
      mkdirSync(join(root, "other-policy", "tests", "interactive-questionnaire", "request-3"), { recursive: true });
      const states = discoverInitialStates(root);
      expect(states.map(s => s.label)).toEqual(["Request 1 — 123", "Request 2 — 123", "Request 10 — 123"]);
      expect(states[0].bundle.entry).toHaveLength(3);
      expect(discoverInitialStates(join(root, "absent"))).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects malformed state, mixed patients, mismatched subjects and seeded answers", () => {
    expect(validateInitialBundle(bundle())).toBe("Patient/p");
    for (const modify of [b => b.entry.push(b.entry[0]), b => b.entry[1].resource.subject.reference = "Patient/other", b => b.entry.splice(1, 1),
      b => b.entry.push({ resource: { resourceType: "QuestionnaireResponse" } })]) {
      const b = bundle(); modify(b); expect(() => validateInitialBundle(b)).toThrow();
    }
  });
});
describe("interactive response pruning", () => {
  it("keeps the changed false answer and ancestors while dropping downstream answers", () => {
    const result = pruneInteractiveResponse(q, qr(), qr(false));
    expect(result.pruned).toBe(true);
    expect(result.response.item).toEqual([{ linkId: "g", item: [{ linkId: "a", answer: [{ valueBoolean: false }] }] }]);
    expect(qr().item).toHaveLength(2);
    expect(result.questionnaire.item).toEqual([{ ...q.item[0], item: [q.item[0].item[0]] }]);
    expect(q.item).toHaveLength(2);
  });
  it("trims later empty questions while preserving preceding unanswered and display items", () => {
    const form = { ...q, item: [
      { linkId: "empty", type: "string" }, { linkId: "note", type: "display", text: "Instructions" },
      { linkId: "second", type: "boolean", definition: "urn:def" }, { linkId: "later", type: "string" },
    ] };
    const before = { item: [{ linkId: "second", answer: [{ valueBoolean: false }] }] };
    const after = { item: [{ linkId: "second", answer: [{ valueBoolean: true }] }] };
    const result = pruneInteractiveResponse(form, before, after);
    expect(result.pruned).toBe(true);
    expect(result.questionnaire).toEqual({ ...form, item: form.item.slice(0, 3) });
    expect(result.response.item.map(i => i.linkId)).toEqual(["empty", "note", "second"]);
    expect(pruneInteractiveResponse(form, before, before).questionnaire).toEqual(form);
  });
  it("retains the shared repeated template needed by earlier occurrences", () => {
    const form = { item: [{ linkId: "g", type: "group", repeats: true, item: [
      { linkId: "a", type: "string" }, { linkId: "b", type: "string" },
    ] }, { linkId: "tail", type: "string" }] };
    const occurrence = value => ({ linkId: "g", item: [{ linkId: "a", answer: [{ valueString: value }] }, { linkId: "b", answer: [{ valueString: "kept" }] }] });
    const before = { item: [occurrence("first"), occurrence("second")] }, after = structuredClone(before);
    after.item[1].item[0].answer[0].valueString = "edit";
    const result = pruneInteractiveResponse(form, before, after);
    expect(result.response.item[0]).toEqual(before.item[0]);
    expect(result.response.item[1].item.map(i => i.linkId)).toEqual(["a"]);
    expect(result.questionnaire.item).toEqual([form.item[0]]);
  });
  it("change-back does not restore discarded answers", () => {
    const first = pruneInteractiveResponse(q, qr(), qr(false)).response;
    const back = structuredClone(first); back.item[0].item[0].answer[0].valueBoolean = true;
    const result = pruneInteractiveResponse(q, first, back).response;
    expect(result.item).toEqual([{ linkId: "g", item: [{ linkId: "a", answer: [{ valueBoolean: true }] }] }]);
  });
  it("preserves an explicit clear when the renderer omits the item, and treats empty string as a value", () => {
    const cleared = qr(); cleared.item[0].item.shift();
    expect(pruneInteractiveResponse(q, qr(), cleared).response.item).toEqual([{ linkId: "g", item: [{ linkId: "a" }] }]);
    const changed = pruneInteractiveResponse(q, qr(), qr(true, "")).response;
    expect(changed.item[0].item[1].answer).toEqual([{ valueString: "" }]);
    expect(changed.item).toHaveLength(1);
  });
  it("retains earlier nested answers when a later item changes", () => {
    const result = pruneInteractiveResponse(q, qr(), qr(true, "yes", 3));
    expect(result.response).toEqual(qr(true, "yes", 3));
  });
  it("uses Questionnaire order, not reordered QR entries", () => {
    const changed = qr(false); changed.item.reverse();
    expect(pruneInteractiveResponse(q, qr(), changed).response.item).toHaveLength(1);
  });
  it("prunes within a repeated group occurrence and through answer.item", () => {
    const repeated = { item: [{ linkId: "g", type: "group", repeats: true, item: [{ linkId: "x", type: "string" }] }, { linkId: "z", type: "boolean" }] };
    const before = { item: [{ linkId: "g", item: [{ linkId: "x", answer: [{ valueString: "first" }] }] }, { linkId: "g", item: [{ linkId: "x", answer: [{ valueString: "second" }] }] }, { linkId: "z", answer: [{ valueBoolean: true }] }] };
    const after = structuredClone(before); after.item[1].item[0].answer[0].valueString = "changed";
    const result = pruneInteractiveResponse(repeated, before, after).response;
    expect(result.item).toHaveLength(2); expect(result.item[0]).toEqual(before.item[0]);
    const nested = { item: [{ linkId: "parent", type: "boolean", item: [{ linkId: "child", type: "string" }] }] };
    const old = { item: [{ linkId: "parent", answer: [{ valueBoolean: true, item: [{ linkId: "child", answer: [{ valueString: "old" }] }] }] }] };
    const fresh = structuredClone(old); fresh.item[0].answer[0].valueBoolean = false;
    expect(pruneInteractiveResponse(nested, old, fresh).response.item[0].answer).toEqual([{ valueBoolean: false }]);
    expect(pruneInteractiveResponse(nested, old, fresh).questionnaire.item).toEqual([{ linkId: "parent", type: "boolean" }]);
  });
  it("removes renderer defaults without mutating the authoritative Questionnaire", () => {
    expect(questionnaireWithoutDefaults(q).item[0].item[0].initial).toBeUndefined();
    expect(q.item[0].item[0].initial).toHaveLength(1);
  });
});
describe("interactive native request lifecycle", () => {
  const defs = { resourceType: "Bundle", type: "collection", entry: [{ resource: { resourceType: "PlanDefinition", id: "plan" } }] };
  it("submits the explicit retained Q with QR, preserving canonical metadata and retrying the same pair", async () => {
    const requests = []; let fail = false;
    const session = new InteractiveSession(defs, "plan", async request => {
      requests.push(request); if (fail) throw Error("evaluation failed");
      return { questionnaire: q, response: qr(), activities: [] };
    });
    session.reset(state); await session.evaluate();
    const retained = pruneInteractiveResponse(q, qr(), qr(false));
    retained.questionnaire.title = "untrusted metadata";
    fail = true;
    await expect(session.evaluate(retained.response, retained.questionnaire)).rejects.toThrow("evaluation failed");
    await expect(session.evaluate(retained.response, retained.questionnaire)).rejects.toThrow("evaluation failed");
    const submitted = requests.slice(1).map(r => JSON.parse(r.repositoryJson).entry.at(-1).resource);
    expect(submitted[0]).toEqual({ ...q, item: [{ ...q.item[0], item: [q.item[0].item[0]] }] });
    expect(submitted[1]).toEqual(submitted[0]);
    expect(session.result.questionnaire).toEqual(q);
    fail = false;
    await session.evaluate({ resourceType: "QuestionnaireResponse", item: [] }, q);
    expect(JSON.parse(requests.at(-1).repositoryJson).entry.at(-1).resource).toEqual(q);
    const count = requests.length;
    for (const [bad, message] of [
      [{ ...q, url: "urn:other" }, "does not match the current form"],
      [{ ...q, version: "other" }, "does not match the current form"],
      [{ ...q, resourceType: "QuestionnaireResponse" }, "does not match the current form"],
      [{ ...q, item: [q.item[0], q.item[0]] }, "Duplicate retained Questionnaire item"],
      [{ ...q, item: [{ linkId: "unknown" }] }, "contains an unknown item"],
      [{ ...q, item: [{ ...q.item[0], item: [q.item[1]] }] }, "contains an unknown item"],
      [{ ...q, item: [{ ...q.item[0], answer: [], item: null }] }, "cannot contain response answers"],
      [{ ...q, item: {} }, "Expected retained Questionnaire items"],
      [{ ...q, item: [null] }, "with a nonempty linkId"],
      [{ ...q, item: [{ linkId: 2 }] }, "with a nonempty linkId"],
    ]) await expect(session.evaluate(qr(), bad)).rejects.toThrow(message);
    expect(requests).toHaveLength(count);

  });
  it("refuses a trim that removes a retained enableWhen dependency, without changing either input", () => {
    const forward = structuredClone(q);
    forward.item[0].item[0].enableWhen = [{ question: "c", operator: "exists", answerBoolean: true }];
    const before = JSON.stringify(forward), previous = qr(), incoming = qr(false);
    expect(() => pruneInteractiveResponse(forward, previous, incoming)).toThrow("depends on a removed question through enableWhen");
    expect(JSON.stringify(forward)).toBe(before);
    expect(incoming).toEqual(qr(false));
    expect(pruneInteractiveResponse(forward, previous, previous).questionnaire).toEqual(forward);
  });
  it("each request contains only definitions + current Q, initial data + current QR", () => {
    const before = JSON.stringify(state.bundle), request = interactiveRequest(defs, "plan", state, q, qr());
    expect(JSON.parse(request.repositoryJson).entry.map(e => e.resource.resourceType)).toEqual(["PlanDefinition", "Questionnaire"]);
    expect(JSON.parse(request.requestDataJson).entry.map(e => e.resource.resourceType)).toEqual(["Patient", "ServiceRequest", "Practitioner", "QuestionnaireResponse"]);
    expect(JSON.stringify(state.bundle)).toBe(before);
  });
  it("extracts nested Q/QR and multiple activities and refuses ambiguous forms", () => {
    const native = { resourceType: "Parameters", parameter: [{ resource: { resourceType: "Bundle", entry: [{ resource: q }, { resource: qr() }, { resource: { resourceType: "RequestGroup", action: [{ title: "Met", resource: { reference: "#one" } }, { title: "Unmet", resource: { reference: "#two" } }] } }] } }] };
    expect(readInteractiveResult(native).activities).toEqual(["Met", "Unmet"]);
    native.parameter.push({ resource: { ...q, url: "urn:other" } });
    expect(() => readInteractiveResult(native)).toThrow(/multiple/);
  });
  it("invalidates pending work on reset and never adopts a failed response", async () => {
    let release; const pending = new Promise(resolve => release = resolve);
    const session = new InteractiveSession(defs, "plan", async () => pending);
    session.reset(state); const run = session.evaluate(); await Promise.resolve();
    session.reset({ ...state, id: "two" }); release({ questionnaire: q, response: qr(), activities: [] });
    expect(await run).toBeUndefined(); expect(session.result).toBeUndefined();
    let fail = false;
    const second = new InteractiveSession(defs, "plan", async () => { if (fail) throw new Error("native error"); return { questionnaire: q, response: qr(), activities: [] }; });
    second.reset(state); await second.evaluate(); fail = true;
    await expect(second.evaluate(qr(false))).rejects.toThrow("native error");
    expect(second.result.response).toEqual(qr());
  });
});
