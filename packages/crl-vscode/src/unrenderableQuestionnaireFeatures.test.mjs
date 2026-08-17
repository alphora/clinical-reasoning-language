// Tests for the producer-contract detector.
//
// Every feature it looks for fails SILENTLY in this pane — an empty dropdown, a missing widget, a blocked image.
// That is the whole reason it exists: the contract lives on issue #277, but a contract nobody can see being
// broken is just a document. Each case below was verified against the VENDORED LForms bundle before being
// encoded here, not inferred from the FHIR spec.
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { unrenderableQuestionnaireFeatures } from "./correspondenceCockpit.ts";

const q = (...item) => ({ resourceType: "Questionnaire", status: "active", item });
const one = (r) => {
  const f = unrenderableQuestionnaireFeatures(r);
  assert.equal(f.length, 1, `expected exactly one finding, got ${JSON.stringify(f)}`);
  return f[0];
};

describe("unrenderableQuestionnaireFeatures", () => {
  it("says nothing about a contract-compliant questionnaire", () => {
    const clean = q(
      { linkId: "g", type: "group", item: [{ linkId: "b", type: "boolean", text: "ok?" }] },
      {
        linkId: "c",
        type: "choice",
        answerOption: [{ valueCoding: { code: "y", display: "Yes" } }],
      },
      { linkId: "a", type: "attachment" },
    );
    assert.deepEqual(unrenderableQuestionnaireFeatures(clean), []);
  });

  it("flags an external answerValueSet", () => {
    // loadAnswerValueSets tries a terminology server, then LForms.fhirContext.client, then REJECTS. The shell
    // configures neither, so this never even reaches connect-src.
    const f = one(q({ linkId: "c", type: "choice", answerValueSet: "http://example.org/ValueSet/x" }));
    assert.match(f, /answerValueSet \(linkId c\)/);
    assert.match(f, /no terminology server or FHIR context/);
  });

  it("flags a CONTAINED answerValueSet too, and says why it is not an offline escape", () => {
    // _expandContainedValueSet still POSTs to a terminology server rather than reading expansion.contains
    // locally, so shipping the expansion inline does NOT work at 43.1.0. This is the compromise a producer
    // author is most likely to propose.
    const f = one(q({ linkId: "c", type: "choice", answerValueSet: "#vs-inline" }));
    assert.match(f, /expanded via a server, not read locally/);
  });

  it("flags a reference item", () => {
    assert.match(one(q({ linkId: "r", type: "reference" })), /item type 'reference' \(linkId r\).*no widget/);
  });

  it("does NOT flag a `reference` string that is not an item type", () => {
    // `type: "reference"` only means an item type when it sits on an item. A QuestionnaireResponse answer
    // carrying `valueReference`, or any other object with a `type` field, must not trip it.
    const notAnItem = q({ linkId: "s", type: "string", code: [{ system: "http://x", type: "reference" }] });
    assert.deepEqual(unrenderableQuestionnaireFeatures(notAnItem), []);
  });

  it("flags preferredTerminologyServer — the one input that makes LForms actually fetch", () => {
    const f = one(
      q({
        linkId: "c",
        type: "choice",
        answerOption: [{ valueCoding: { code: "y" } }],
        extension: [
          {
            url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/preferredTerminologyServer",
            valueUrl: "https://tx.example.org/fhir",
          },
        ],
      }),
    );
    assert.match(f, /preferredTerminologyServer.*connect-src/);
  });

  it("flags answerExpression and x-fhir-query population extensions", () => {
    const f = unrenderableQuestionnaireFeatures(
      q({
        linkId: "c",
        type: "choice",
        extension: [
          {
            url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-answerExpression",
            valueExpression: { language: "text/fhirpath", expression: "%patient.name" },
          },
          {
            url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-itemPopulationContext",
            valueExpression: { language: "application/x-fhir-query", expression: "Observation?patient={{%patient.id}}" },
          },
        ],
      }),
    );
    assert.equal(f.length, 2);
    assert.ok(f.some((x) => /answerExpression/.test(x)));
    assert.ok(f.some((x) => /x-fhir-query/.test(x)));
  });

  it("flags rendering-xhtml/markdown that embeds an image, and ignores one that does not", () => {
    // markdown-it's link validator is the only data: image route in the bundle, and img-src excludes data:.
    const withImg = q({
      linkId: "d",
      type: "display",
      _text: {
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/rendering-xhtml",
            valueString: '<div><img src="data:image/png;base64,iVBOR"></div>',
          },
        ],
      },
    });
    assert.match(one(withImg), /rendering-xhtml with an embedded image/);

    const withoutImg = q({
      linkId: "d",
      type: "display",
      _text: {
        extension: [
          {
            url: "http://hl7.org/fhir/StructureDefinition/rendering-markdown",
            valueString: "**bold** guidance text with no image",
          },
        ],
      },
    });
    assert.deepEqual(unrenderableQuestionnaireFeatures(withoutImg), []);
  });

  it("finds features at any depth, and reports each ONCE however often it recurs", () => {
    // The banner names a count; duplicates would inflate it and bury the distinct problems.
    const deep = q({
      linkId: "g1",
      type: "group",
      item: [
        { linkId: "g2", type: "group", item: [{ linkId: "c1", type: "choice", answerValueSet: "#vs" }] },
        { linkId: "c2", type: "choice", answerValueSet: "#vs" },
      ],
    });
    const f = unrenderableQuestionnaireFeatures(deep);
    assert.equal(f.length, 2, "distinct linkIds are distinct findings");
    assert.ok(f.every((x) => /answerValueSet/.test(x)));
  });

  it("is total on junk — it must never throw into the render path", () => {
    for (const junk of [undefined, null, 0, "", "a string", [], {}, { item: null }, { item: [null, 1, "x"] }]) {
      assert.deepEqual(unrenderableQuestionnaireFeatures(junk), [], `threw or reported on ${JSON.stringify(junk)}`);
    }
  });

  it("is pure and stably ordered", () => {
    const r = q({ linkId: "r", type: "reference" }, { linkId: "c", type: "choice", answerValueSet: "#vs" });
    assert.deepEqual(unrenderableQuestionnaireFeatures(r), unrenderableQuestionnaireFeatures(r));
  });
});
