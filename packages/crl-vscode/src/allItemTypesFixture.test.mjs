// The all-item-types measurement fixture is only worth anything if it actually covers the contract. This pins
// that it does — and pins the EXPECTED OUTCOME per type, not merely each type's presence.
//
// Presence alone is the trap: a `reference` item renders no widget, raises no error and triggers no CSP
// violation, so a fixture containing one produces a clean-looking measurement that proves nothing about it. The
// outcome table below is what turns "the form looked fine" into a real reading.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { unrenderableQuestionnaireFeatures } from "./correspondenceCockpit.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "testdata", "questionnaire-pane", "all-item-types.example.json"), "utf8"));

// R4 Questionnaire.item.type. The 17th code, `question`, is ABSTRACT ("not for use") and deliberately excluded —
// stated here so a later reader cannot mistake its absence for coverage silently narrowing.
const EXPECTED = {
  group: "renders",
  display: "renders",
  boolean: "renders",
  decimal: "renders",
  integer: "renders",
  date: "renders",
  dateTime: "renders",
  time: "renders",
  string: "renders",
  text: "renders",
  url: "renders",
  choice: "renders", // pulls the autocompleter PNGs — the reason img-src exists
  "open-choice": "renders", // ditto
  quantity: "renders",
  attachment: "renders",
  // MEASURED degradation, not an aspiration: _getDataType's switch has no `reference` case, so it returns the
  // initializer "string" — not an LForms dataType (ST is) — and no renderer branch matches.
  reference: "silent-no-widget",
};

/** Every item in the tree, flattened. */
const flatten = (items = []) => items.flatMap((i) => [i, ...flatten(i.item)]);

const qItems = flatten(fixture.questionnaire.item);
const qrItems = flatten(fixture.questionnaireResponse.item);

describe("all-item-types measurement fixture", () => {
  it("covers every non-abstract R4 item type", () => {
    const present = new Set(qItems.map((i) => i.type));
    const missing = Object.keys(EXPECTED).filter((t) => !present.has(t));
    assert.deepEqual(missing, [], `fixture no longer covers: ${missing.join(", ")}`);
  });

  it("introduces no item type outside the contract", () => {
    const unexpected = [...new Set(qItems.map((i) => i.type))].filter((t) => !Object.hasOwn(EXPECTED, t));
    assert.deepEqual(unexpected, [], `unpinned item type(s): ${unexpected.join(", ")}`);
    assert.ok(!qItems.some((i) => i.type === "question"), "`question` is abstract and must not appear");
  });

  it("carries a QuestionnaireResponse answer for every ANSWERABLE type", () => {
    // Letting the QR narrow silently would leave mergeFHIRDataIntoLForms and the answer-display paths unmeasured
    // while the Questionnaire side still looked complete.
    const answerable = Object.keys(EXPECTED).filter((t) => t !== "group" && t !== "display");
    const answeredLinkIds = new Set(qrItems.filter((i) => Array.isArray(i.answer) && i.answer.length).map((i) => i.linkId));
    for (const type of answerable) {
      const ids = qItems.filter((i) => i.type === type).map((i) => i.linkId);
      assert.ok(
        ids.some((id) => answeredLinkIds.has(id)),
        `no QuestionnaireResponse answer for any '${type}' item (${ids.join(", ") || "none in Q"})`,
      );
    }
  });

  it("gives the attachment answer real base64 data", () => {
    // An attachment WITH data is the only route by which the renderer could ask for an image preview, which is
    // the one thing img-src's exclusion of data: could plausibly block. Without data the rung is untested.
    const att = qrItems.find((i) => i.answer?.[0]?.valueAttachment)?.answer[0].valueAttachment;
    assert.ok(att, "no attachment answer in the QuestionnaireResponse");
    assert.match(att.contentType, /^image\//, "the attachment must be an image to exercise the preview path");
    assert.ok((att.data ?? "").length > 20, "the attachment must carry base64 data");
  });

  it("announces itself, so a mis-seed is visible rather than mistaken for a case", () => {
    assert.match(fixture.questionnaire.title, /MEASUREMENT FIXTURE/);
    assert.equal(fixture.questionnaire.item[0].type, "display");
    assert.match(fixture.questionnaire.item[0].text, /measurement fixture/i);
  });

  it("breaches the producer contract in EXACTLY one place, and it is the deliberate one", () => {
    // The fixture must not quietly acquire an answerValueSet or a population extension — those would be
    // detected, warned about, and would muddy the reading. `reference` is the one intentional breach: it is
    // present so its degradation is measured rather than assumed.
    const found = unrenderableQuestionnaireFeatures(fixture.questionnaire);
    assert.equal(found.length, 1, `expected exactly one detected breach, got: ${JSON.stringify(found, null, 2)}`);
    assert.match(found[0], /^item type 'reference'/);
  });

  it("uses inline answerOption for every coded item", () => {
    for (const i of qItems.filter((x) => x.type === "choice" || x.type === "open-choice")) {
      assert.ok(Array.isArray(i.answerOption) && i.answerOption.length, `${i.linkId} has no inline answerOption`);
      assert.ok(!i.answerValueSet, `${i.linkId} uses answerValueSet, which cannot resolve in this pane`);
    }
  });
});
