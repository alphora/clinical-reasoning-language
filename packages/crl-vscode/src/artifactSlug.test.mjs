// Tests for the case-artifact directory derivation.
//
// This single function decides whether the FHIR Questionnaire pane finds a case's artifacts at all, and it has
// already been wrong once in a way that looked like missing data rather than a bug: the lookup was keyed on the
// caseId, which happened to prefix the directory for the first cases tried and did not for others.
//
//   caseId          exclusion-overrides-precedence
//   directory       exclusion-overrides-full-documentation-unmet-ordered-precedence
//
// The key is the case's FULL AUTHORED NAME including its `-> outcome` suffix. The expectations below are real
// directory names from hcsc-content, paired with the case names that produced them.
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { artifactSlug } from "./correspondenceCockpit.ts";

describe("artifactSlug", () => {
  it("reproduces real case-artifact directory names from their authored case names", () => {
    const cases = [
      // The one that regressed: the outcome suffix AND its parenthetical are both part of the directory.
      [
        "exclusion overrides full documentation -> unmet (ordered precedence)",
        "exclusion-overrides-full-documentation-unmet-ordered-precedence",
      ],
      [
        "documented nonunion (all six NOTE-1 elements), no exclusion -> met",
        "documented-nonunion-all-six-note-1-elements-no-exclusion-met",
      ],
      ["missing: at least two radiograph sets -> unmet", "missing-at-least-two-radiograph-sets-unmet"],
      ["concurrent noninvasive stimulator -> unmet", "concurrent-noninvasive-stimulator-unmet"],
      ["missing: ninety days apart -> unmet", "missing-ninety-days-apart-unmet"],
      ["missing: multiple views per set -> unmet", "missing-multiple-views-per-set-unmet"],
    ];
    for (const [name, dir] of cases) assert.equal(artifactSlug(name), dir, `derivation changed for "${name}"`);
  });

  it("derives the library segment the same way", () => {
    assert.equal(
      `${artifactSlug("Ultrasonic Osteogenesis Stimulator Coverage")}-cases`,
      "ultrasonic-osteogenesis-stimulator-coverage-cases",
    );
  });

  it("collapses runs of punctuation and trims the edges", () => {
    assert.equal(artifactSlug("  a -> b (c), d  "), "a-b-c-d");
    assert.equal(artifactSlug("!!!"), "");
  });

  it("strips glob metacharacters, so a case name cannot alter the search pattern", () => {
    // The result is interpolated into a findFiles glob; `*`, `{`, `}` and `?` must not survive.
    const s = artifactSlug("weird*{a,b}?name");
    assert.ok(/^[a-z0-9-]*$/.test(s), `slug contains non [a-z0-9-] characters: ${s}`);
  });

  it("is idempotent — slugifying a slug changes nothing", () => {
    const s = artifactSlug("missing: at least two radiograph sets -> unmet");
    assert.equal(artifactSlug(s), s);
  });
});
