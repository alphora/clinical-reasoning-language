import {
  planPresentationEdit,
  resolvePresentationTarget,
  revertPresentationEditInSource,
  applyPresentationEditToSource,
  sourceSha256,
} from "./presentationEdit";
import { buildCRL } from "../index";

const base =
  'library "L".\nconcept "Complaint":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `complaint`.\n- shape reduction is most recent.\n';
const presentation =
  '\npresentation for "Complaint":\n- question text is "Which complaint?".\n- question description is "Select one.".\n';
const req = { library: "L", concept: "Complaint" };
const scoped =
  '\nactivity "Met":\n- request CPGCommunicationRequest.\ndecision "D":\n- when "Complaint" then recommend activity "Met".\npresentation for "Complaint":\n- in decision "D".\n- question text is "Scoped complaint?".\n';

function roundTrip(source: string, change: Parameters<typeof planPresentationEdit>[1]) {
  const p = planPresentationEdit(source, change);
  expect(
    revertPresentationEditInSource(p.candidateSource, JSON.parse(JSON.stringify(p.receipt))),
  ).toBe(source);
  expect(applyPresentationEditToSource(source, change, p.beforeSha256).candidateSource).toBe(
    p.candidateSource,
  );
  return p;
}

describe("shared presentation edits", () => {
  test("changes only literal bytes and preserves inline, trailing and declaration comments", () => {
    const source =
      base +
      '// before\npresentation for "Complaint": /* owner */\n- question text is /* quote */ "Which complaint?". // trailing\n// interspersed\n- question description is "Select one.".\n';
    const p = roundTrip(source, { ...req, questionText: 'Describe the "complaint".' });
    expect(p.candidateSource).toBe(
      source.replace('"Which complaint?"', '`Describe the "complaint".`'),
    );
    expect(p.validation.remaining).toContain("Emission presentation coexistence checks");
  });
  test.each(["\n", "\r\n"])("preserves BOM and supplementary Unicode offsets with %j", (eol) => {
    const source = "\uFEFF" + (base + "// 🧪 before\n" + presentation).replace(/\n/g, eol);
    const p = roundTrip(source, { ...req, questionText: "What 🩺 symptom?" });
    expect(p.candidateSource).toBe(source.replace("Which complaint?", "What 🩺 symptom?"));
  });
  test("multiline wording is encoded faithfully and prior delimiters return on undo", () => {
    const source = base + presentation.replace('"Which complaint?"', "`Which complaint?`");
    const p = roundTrip(source, { ...req, questionText: "New\nquestion" });
    expect(p.candidateSource).toContain("`New\nquestion`");
  });
  test("removing description preserves skipped comments and restores exact spelling", () => {
    const source =
      base +
      presentation.replace(
        '- question description is "Select one.".',
        "- /* a */ question description is /* b */ `Select one.` /* c */ . // after",
      );
    const p = roundTrip(source, { ...req, questionDescription: "" });
    for (const comment of ["/* a */", "/* b */", "/* c */", "// after"])
      expect(p.candidateSource).toContain(comment);
    expect(resolvePresentationTarget(p.candidateSource, "Complaint")!.questionDescription).toBe("");
  });
  test("adds missing description to existing scoped declaration with no new default", () => {
    const source =
      base + presentation.replace('- question description is "Select one.".\n', "") + scoped;
    const p = roundTrip(source, {
      ...req,
      context: { decision: "D", criteria: [] },
      questionDescription: "Guidance",
    });
    const ast = buildCRL(p.candidateSource).result!;
    expect(ast.presentations).toHaveLength(2);
    expect(ast.presentations![1].questionDescription).toBe("Guidance");
  });
  test("inherited description changes its actual default owner and reports wider impact", () => {
    const p = roundTrip(base + presentation + scoped, {
      ...req,
      context: { decision: "D", criteria: [] },
      questionDescription: "Shared guidance",
    });
    expect(p.fields[0].declaration!.contexts).toEqual([]);
    expect(p.impact[0].scope).toContain("inheriting this default");
    expect(p.impact[0].affectedPresentations).toHaveLength(2);
    expect(p.impact[0].externalConsumers).toContain("Not enumerated");
    expect(
      buildCRL(p.candidateSource).result!.presentations![1].questionDescription,
    ).toBeUndefined();
  });
  test("shared description impact excludes explicit overrides and preserves them", () => {
    const second = scoped.replaceAll('"D"', '"E"');
    const overridden = scoped.replaceAll('"D"', '"F"') + '- question description is "Only F".\n';
    const source = base + presentation + scoped + second + overridden;
    const p = roundTrip(source, { ...req, questionDescription: "Changed default" });
    expect(p.impact[0].affectedPresentations).toHaveLength(3);
    expect(
      resolvePresentationTarget(p.candidateSource, "Complaint", {
        decision: "D",
        criteria: new Set(),
      })!.questionDescription,
    ).toBe("Changed default");
    expect(
      resolvePresentationTarget(p.candidateSource, "Complaint", {
        decision: "E",
        criteria: new Set(),
      })!.questionDescription,
    ).toBe("Changed default");
    expect(
      resolvePresentationTarget(p.candidateSource, "Complaint", {
        decision: "F",
        criteria: new Set(),
      })!.questionDescription,
    ).toBe("Only F");
  });
  test("removing a scoped override refuses exposing different default description", () => {
    const source = base + presentation + scoped + '- question description is "Scoped detail".\n';
    expect(() =>
      planPresentationEdit(source, {
        ...req,
        context: { decision: "D", criteria: [] },
        questionDescription: "",
      }),
    ).toThrow(/inherited wording/);
  });
  test("new default creates ordinary CRL and undo removes the entire added declaration", () => {
    const p = roundTrip(base, {
      ...req,
      questionText: "Complaint?",
      questionDescription: "Details",
    });
    expect(buildCRL(p.candidateSource).result!.presentations).toHaveLength(1);
    expect(p.fields.every((f) => f.declaration === null)).toBe(true);
  });
  test("changing both default fields preserves unrelated computation and presentation", () => {
    const source = base + presentation + scoped;
    const p = roundTrip(source, {
      ...req,
      questionText: "New default?",
      questionDescription: "New default details",
    });
    expect(p.candidateSource.startsWith(base)).toBe(true);
    expect(p.candidateSource.endsWith(scoped)).toBe(true);
  });
  test("stale previews and undo receipts fail without a candidate", () => {
    const p = planPresentationEdit(base + presentation, { ...req, questionText: "New?" });
    expect(() =>
      applyPresentationEditToSource(base + presentation + "\n", p.request, p.beforeSha256),
    ).toThrow(/changed since preview/);
    expect(() => revertPresentationEditInSource(p.candidateSource + "\n", p.receipt)).toThrow(
      /changed after the edit/,
    );
    expect(() =>
      applyPresentationEditToSource(base + presentation, p.request, undefined as never),
    ).toThrow(/requires the exact baseline/);
  });
  test("tampered inverse cannot modify computational definitions", () => {
    const p = planPresentationEdit(base + presentation, { ...req, questionText: "New?" });
    const maliciousBefore = (base + presentation).replace(
      "value type is boolean",
      "value type is text",
    );
    const receipt = {
      ...p.receipt,
      beforeSha256: sourceSha256(maliciousBefore),
      inverseEdits: [
        {
          start: 0,
          end: p.candidateSource.length,
          before: p.candidateSource,
          text: maliciousBefore,
        },
      ],
    };
    expect(() => revertPresentationEditInSource(p.candidateSource, receipt)).toThrow(
      /not the inverse/,
    );
  });
  test("no-op, blank text, unsupported literals, wrong owner, invalid context and uncoded target refuse", () => {
    const source = base + presentation;
    expect(() => planPresentationEdit(source, req)).toThrow(/no wording changes/);
    expect(() => planPresentationEdit(source, { ...req, questionText: " " })).toThrow(/required/);
    expect(() => planPresentationEdit(source, { ...req, questionText: "bad\\escape" })).toThrow(
      /cannot be represented/,
    );
    expect(() =>
      planPresentationEdit(source, { ...req, library: "Other", questionText: "New?" }),
    ).toThrow(/library/);
    expect(() =>
      planPresentationEdit(source, {
        ...req,
        context: { decision: "Absent", criteria: [] },
        questionText: "New?",
      }),
    ).toThrow(/context/);
    expect(() =>
      planPresentationEdit(base.replace("- code is `complaint`.\n", ""), {
        ...req,
        questionText: "New?",
      }),
    ).toThrow(/question-enabled/);
    expect(() => planPresentationEdit(source, { ...req, questionText: null as never })).toThrow(
      /must be text/,
    );
  });
  test("ambiguous presentation and malformed source refuse", () => {
    expect(() =>
      planPresentationEdit(base + presentation + presentation, { ...req, questionText: "New?" }),
    ).toThrow(/needs correction/);
    expect(() => planPresentationEdit("not CRL", req)).toThrow(/not parseable/);
  });
});

test("each impact names only its actual field owner", () => {
  const source = base + presentation + scoped;
  const text = planPresentationEdit(source, {
    ...req,
    context: { decision: "D", criteria: [] },
    questionText: "Scoped new?",
  });
  expect(text.impact[0].scope).toBe('decision "D"');
  expect(text.impact[0].affectedPresentations).toHaveLength(1);
  const description = planPresentationEdit(source, {
    ...req,
    context: { decision: "D", criteria: [] },
    questionDescription: "Shared new",
  });
  expect(description.impact[0].scope).toContain("inheriting this default");
});

test("reversal ignores JSON object-key order but preserves edit-array order and values", () => {
  const p = planPresentationEdit(base + presentation, {
    ...req,
    questionText: "New?",
    questionDescription: "New detail",
  });
  const receipt = {
    ...p.receipt,
    inverseEdits: p.receipt.inverseEdits.map((e) => ({
      text: e.text,
      before: e.before,
      end: e.end,
      start: e.start,
    })),
  };
  expect(revertPresentationEditInSource(p.candidateSource, receipt)).toBe(base + presentation);
  expect(() =>
    revertPresentationEditInSource(p.candidateSource, {
      ...receipt,
      inverseEdits: [...receipt.inverseEdits].reverse(),
    }),
  ).toThrow(/not the inverse/);
});
