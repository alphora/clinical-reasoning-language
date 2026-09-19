import { test, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { resolvePresentationTarget } from "@smile-digital-health/crl/language-services";
import {
  wordingSelections,
  reconcileWordingDraft,
} from "./presentationEditorModel.ts";
import { presentationEditorHtml } from "./presentationEditorView.ts";
const source =
  'library "L".\nconcept "Answer":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `answer`.\n- shape reduction is most recent.\npresentation for "Answer":\n- question text is "Question A".\n- question description is "Description B".\n';
const target = (s) => resolvePresentationTarget(s, "Answer");
test("a retained question draft does not revert an untouched changed description", () => {
  const r = reconcileWordingDraft(
    target(source),
    target(source.replace("Description B", "Description B2")),
    { questionText: "My question", questionDescription: "Description B" },
  );
  expect(r.changes).toEqual({ questionText: "My question" });
  expect(r.refreshed.questionDescription).toBe("Description B2");
  expect(r.conflicts).toEqual([]);
});
test("a retained description draft does not revert untouched changed question text", () => {
  const r = reconcileWordingDraft(
    target(source),
    target(source.replace("Question A", "Question A2")),
    { questionText: "Question A", questionDescription: "My description" },
  );
  expect(r.changes).toEqual({ questionDescription: "My description" });
  expect(r.refreshed.questionText).toBe("Question A2");
  expect(r.conflicts).toEqual([]);
});
test("edited field conflicts retain old/current/draft values", () => {
  const r = reconcileWordingDraft(
    target(source),
    target(source.replace("Question A", "Question A2")),
    { questionText: "My question", questionDescription: "Description B" },
  );
  expect(r.conflicts).toEqual([
    {
      field: "questionText",
      before: "Question A",
      current: "Question A2",
      proposed: "My question",
      ownerChanged: false,
    },
  ]);
});
test("owner changes conflict even when displayed wording is identical", () => {
  const decision =
    '\nactivity "Met": - request CPGCommunicationRequest.\ndecision "D": - when "Answer" then recommend activity "Met".\n';
  const context = { decision: "D", criteria: new Set() };
  const before = source + decision,
    after =
      before +
      'presentation for "Answer": - in decision "D". - question text is "Question A".\n';
  const r = reconcileWordingDraft(
    resolvePresentationTarget(before, "Answer", context),
    resolvePresentationTarget(after, "Answer", context),
    { questionText: "Draft", questionDescription: "Description B" },
  );
  expect(r.conflicts[0].ownerChanged).toBe(true);
  const selections = wordingSelections(after, "Answer");
  expect(selections.choices).toHaveLength(2);
  expect(selections.choices[1].request.context).toEqual({
    decision: "D",
    criteria: [],
  });
});
test("criterion selection preserves identity and reports unsupported unused scopes", () => {
  const text =
    source +
    '\nactivity "Met": - request CPGCommunicationRequest.\ncriterion "A": - when ("Answer").\ncriterion "Unused": - when ("Answer").\ndecision "D": - when "A" then recommend activity "Met".\npresentation for "Answer": - in criterion "A". - question text is "Same?".\npresentation for "Answer": - in criterion "Unused". - question text is "Same?".\n';
  const s = wordingSelections(text, "Answer");
  expect(s.choices[1].request.context).toEqual({
    decision: "D",
    criteria: ["A"],
  });
  expect(s.unavailableScopes).toEqual(['criterion "Unused"']);
});
test("panel script executes and authored values are text, with stale preview disabled", () => {
  const html = presentationEditorHtml("nonce123");
  expect(html).toContain("default-src 'none'");
  const script = html.match(/<script nonce="nonce123">([\s\S]*?)<\/script>/)[1];
  const elements = new Map(),
    events = new Map(),
    sent = [];
  const get = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        addEventListener: (kind, cb) => events.set(id + ":" + kind, cb),
      });
    return elements.get(id);
  };
  let receive;
  runInNewContext(script, {
    document: { getElementById: get },
    window: {
      addEventListener: (kind, fn) => {
        receive = fn;
      },
    },
    acquireVsCodeApi: () => ({ postMessage: (m) => sent.push(m) }),
  });
  expect(sent[0]).toEqual({ kind: "ready", revision: 0 });
  expect(html).toContain('<button id="preview" disabled>');
  get("preview").onclick();
  get("apply").onclick();
  get("diff").onclick();
  get("keep").onclick();
  expect(sent).toHaveLength(1); // Early actions cannot invalidate the delayed ready response.

  receive({
    data: {
      kind: "ready",
      revision: 0,
      title: "L / Answer",
      scope: "Default",
      values: {
        questionText: '<img onerror="bad">',
        questionDescription: "Text",
      },
    },
  });
  expect(get("preview").disabled).toBe(false);
  expect(get("question").disabled).toBe(false);
  expect(get("question").value).toBe('<img onerror="bad">');
  expect(get("question").innerHTML).toBeUndefined();
  receive({
    data: {
      kind: "preview",
      values: { questionText: "Draft", questionDescription: "Text" },
      token: "t",
      fields: [],
      impact: [],
      validation: { coverage: "Source", remaining: ["Emit"] },
    },
  });
  expect(get("apply").disabled).toBe(false);
  get("apply").onclick();
  expect(sent.at(-1)).toEqual({
    kind: "apply",
    revision: 0,
    token: "t",
    questionText: "Draft",
    questionDescription: "Text",
  });
  receive({ data: { kind: "stale", message: "Source changed" } });
  expect(get("apply").disabled).toBe(true);
  expect(get("question").value).toBe("Draft");
  get("question").value = "New typing";
  events.get("question:input")();
  receive({
    data: {
      kind: "preview",
      revision: 0,
      baselineId: "old",
      values: { questionText: "Old response", questionDescription: "Old" },
    },
  });
  expect(get("question").value).toBe("New typing");
  expect(sent.some((m) => m.kind === "ack" && m.baselineId === "old")).toBe(
    false,
  );
});
