import { describe, expect, it } from "vitest";

import { validateCRL } from "../../index";

/**
 * #189 P2 (design D10) — the pipeline stage rules.
 *
 * ⭐ WHAT THESE EXIST TO PREVENT: before them, a stage that matched nothing SOFT-COMPILED. `matchNarrative`
 * returned `known: false` for the whole narrative and the concept validated clean, so the goal fixture
 * "validated clean while matching the wrong operation" (plan §2.10). A structural fix that left unmatched
 * stages silent would have let that trap survive inside the fix.
 *
 * ⚠ These assert on `kind` + `message`: `validateCRL`'s PUBLIC shape is `{type, kind, message, line, column}`
 * — `rule` and `severity` are internal. Severity is still observable, because it decides whether a finding
 * lands in `errors` or in `warnings`, and these all assert on `errors`.
 */

interface Finding {
  kind?: string;
  message?: string;
}

/** Errors only, narrowed to this validator. Warnings are other validators' business. */
function stageErrors(definition: string, extra = ""): Finding[] {
  const src =
    'library "T".\n' +
    'terminology "VS":\n- valueset is `http://example.org/x`.\n' +
    'concept "A":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is `a`.\n' +
    'concept "B":\n- shape is RecordSet.\n- type is Observation.\n- value type is Quantity.\n- code is `b`.\n' +
    'concept "C":\n- shape is Record.\n- type is Observation.\n- value type is Quantity.\n' +
    `- ${definition}\n${extra}`;
  const v = validateCRL(src, { soft: true }) as unknown as { errors?: Finding[] };
  return (v.errors ?? []).filter((f) => f.kind === "pipeline-stage");
}

describe("pipeline stage rules — D10", () => {
  it("⭐ an UNMATCHED stage is an ERROR, not a silent soft-compile", () => {
    // `, then at least 30 'kg/m2'` elides the operand: nothing to compare, so the stage matches no form.
    // Before D10 this validated clean.
    const found = stageErrors("definition is body mass index of \"A\" and \"B\", then at least 30 'kg/m2'.");
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("matches no known form");
  });

  it("the unmatched diagnostic names the STAGE NUMBER and quotes the stage", () => {
    // ⚠ Load-bearing: a three-stage pipeline with one typo must not report "this definition matched
    // nothing" and leave the author hunting for which stage.
    const [found] = stageErrors(
      'definition is most recent "A", then wibble wobble this, then most recent this.',
    );
    expect(found.message).toContain("stage 2");
    expect(found.message).toContain("wibble wobble this");
  });

  it("⚠ a MALFORMED pipeline says WHICH mistake", () => {
    const dangling = stageErrors('definition is body mass index of "A" and "B", then.');
    expect(dangling).toHaveLength(1);
    expect(dangling[0].message).toContain("trailing `then`");
  });

  it("⭐ SELECTION -> SELECTION is an error", () => {
    // ⚠ `most recent this` is the selection form that takes `this`. An earlier draft of this test used
    // `highest this`, WHICH IS NOT A PATTERN — only `highest "X"` exists — so it reported "unmatched" and
    // would have passed for entirely the wrong reason.
    const found = stageErrors('definition is most recent "A", then most recent this.');
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("already collapsed to one");
  });

  it("the goal's own pipeline is CLEAN — the rules must not reject the target", () => {
    expect(stageErrors('definition is body mass index of "A" and "B", then most recent this.')).toEqual([]);
  });

  it("an ordinary single-stage narrative is untouched", () => {
    expect(stageErrors('definition is most recent "A".')).toEqual([]);
  });

  it("the rules cover a `value projection` pipeline too, not just `definition is`", () => {
    // ⚠ A stage rule covering only one narrative slot leaves the trap open in the other.
    const found = stageErrors(
      "definition is most recent this.",
      [
        "- source representation:",
        "  - type is ServiceRequest.",
        '  - coded from "VS".',
        "  - value projection is exists this, then wibble this.",
        "",
      ].join("\n"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("value projection");
  });
});

/**
 * ⚠⚠ NOT TESTED, AND DELIBERATELY SO — SELECTION -> FILTER.
 *
 * The rule is that a FILTER after a selection is LEGAL (`bothrep` round-2: `highest this, then within last
 * 6 months this` and the reverse give different, both-meaningful answers), and an earlier design forbade it
 * by reading a section HEADING whose BODY retracted exactly that.
 *
 * ⭐ But it CANNOT BE AUTHORED TODAY, so there is no test to write. MEASURED: only THREE stage forms accept
 * a bare `this` — `most recent this`, `exists this`, `matches this`. Every filter pattern
 * (`within last …`, `during`, `as of`, …) requires a NAMED concept operand, so no filter can be a
 * non-first stage at all.
 *
 * A test using `within last 6 months this` would report `pipeline-stage-unmatched` and, asserted as
 * "clean", would have failed — or worse, asserted as an error, would have PASSED while proving nothing
 * about the selection rule. Recording the gap is honest; faking the coverage is not. When a `this`-taking
 * filter form lands, this becomes a real test.
 */
