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

  it("⭐ an unmatched stage does NOT suppress an independently-checkable violation elsewhere", () => {
    // ⚠ REGRESSION PIN. The first version returned globally as soon as ANY stage was unmatched, so this
    // pipeline reported only the typo and stayed silent about stages 1-2 being two selections. A pair is
    // unjudgeable only when one of ITS OWN stages is unresolved — not when some other stage is.
    const found = stageErrors(
      'definition is most recent "A", then most recent this, then wibble wobble this.',
    );
    const rules = found.map((f) => f.message ?? "");
    expect(rules.some((m) => m.includes("matches no known form"))).toBe(true);
    expect(rules.some((m) => m.includes("already collapsed to one"))).toBe(true);
    expect(found).toHaveLength(2);
  });

  // ⚠⚠ RETIRED WITH `matches this`. It pinned "a projection-only pattern cannot be stage 1", and `Matches`
  // was the only pattern that could reach it: `Exists` is the other projection-only entry, and `exists this`
  // in a `definition is` is SLOT-RENAMED to `ExistsOverSpace`, so it never presents as a projection there.
  // The diagnostic is KEPT for the next projection-only pattern; whoever adds one restores this test.

  it("a projection-only pattern as a LATER stage is caught ONCE, not twice", () => {
    // The arity proxy in `representationShapeValidator` was removed when this rule landed; if it comes back,
    // this fires twice.
    const found = stageErrors("definition is most recent this.", [
      "- source representation:",
      "  - type is Condition.",
      '  - coded from "VS".',
      "  - value projection is most recent this, then exists this.",
      "",
    ].join("\n"));
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("cannot be stage 2");
  });

  it("⭐⭐ a terminal `exists this` in a DEFINITION pipeline is clean — the slot decides", () => {
    // ⚠⚠ THE CROSS-LANE CASE WHOSE ABSENCE SHIPPED A CONTRADICTION. `matcher.ts` is slot-blind: it emits
    // `Exists` for `exists this` wherever it appears. The resolver renamed it to the concept-level
    // `ExistsOverSpace` in a definition slot and classified this clean, while this validator did NOT and
    // called it a rep-local projection in a pipeline — telling the author the computation "belongs in a
    // concept-level `definition is`" while reporting on one. Both panel arms found it independently, in a
    // commit where every test on each side passed.
    //
    // ⚠ Its PAIR is the projection-slot test above (`cannot be stage 2`), which must keep failing. Neither
    // test alone proves the slot rule; only the two together do.
    expect(stageErrors("definition is most recent this, then exists this.")).toEqual([]);
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
    // ⚠ TWO findings, both correct and independent: stage 1 (`exists this`) is a projection-only pattern
    // used as a stage, and stage 2 (`wibble this`) matches nothing. Reporting both is the point — a pipeline
    // with two distinct defects should not need two round-trips.
    expect(found).toHaveLength(2);
    expect(found.some((f) => (f.message ?? "").includes("cannot be stage 1"))).toBe(true);
    expect(found.some((f) => (f.message ?? "").includes("matches no known form"))).toBe(true);
    expect(found.every((f) => (f.message ?? "").includes("value projection"))).toBe(true);
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
