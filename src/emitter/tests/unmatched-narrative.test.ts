import { describe, expect, it } from "@jest/globals";

import { emitCQL } from "../emitCQL";

// Coverage for:
//   - Issue #79 — `EmitResult.unmatched[]` + `success: false` + compile-failing
//     sentinel call when a `- definition is …` narrative has no catalog match.
//   - Issue #77 — `currently taking <X>` and `has history of <X>` were in the
//     catalog + CRLPatterns.cql but missing from the matcher. The same audit
//     pass also wires `has`, `has adverse reaction to`, and `age at`.

function lib(name: string, body: string): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}

const terms = (n: string) => `terminology "${n}":\n- valueset is \`${n}\`.\n`;

describe("T07 / #93 — AtLeastApart / AtMostApart matcher wiring", () => {
  it("`<A> and <B> at least <Q> apart` → emits CRLPatterns.AtLeastApart, no unmatched", () => {
    const src = lib(
      "T",
      terms("Reading A") +
        terms("Reading B") +
        `concept "Two Readings Far Apart":\n- type is Observation.\n- value type is boolean.\n- definition is "Reading A" and "Reading B" at least 6 'wk' apart.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLPatterns\.AtLeastApart/);
  });

  it("`<A> and <B> at most <Q> apart` → emits CRLPatterns.AtMostApart", () => {
    const src = lib(
      "T",
      terms("Reading A") +
        terms("Reading B") +
        `concept "Two Readings Close":\n- type is Observation.\n- value type is boolean.\n- definition is "Reading A" and "Reading B" at most 4 'd' apart.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.AtMostApart/);
  });

  it("bare `at least <Q>` (3 elements, no `apart`) still matches AtLeast — not AtLeastApart", () => {
    const src = lib(
      "T",
      terms("Score") +
        `concept "Above Threshold":\n- type is Observation.\n- value type is boolean.\n- definition is "Score" at least 5 '{score}'.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.AtLeast\(/);
    expect(r.result).not.toMatch(/AtLeastApart/);
  });
});

describe("issue #79 — unmatched narrative envelope + sentinel", () => {
  it("unmatched narrative → success:false + unmatched[] populated + compile-failing sentinel in result", () => {
    const src = lib(
      "T",
      terms("Random Word Pile") +
        `concept "Gate":\n- type is Observation.\n- value type is boolean.\n- definition is "Random Word Pile" wibbles.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect(r.unmatched).toBeDefined();
    expect(r.unmatched!.length).toBe(1);
    expect(r.unmatched![0].text).toMatch(/wibbles/);
    expect(r.unmatched![0].line).toBeGreaterThan(0);
    // Sentinel call references CRLPatterns.UnmatchedNarrative — not defined
    // in CRLPatterns.cql, so a downstream CQL compiler will reject the output.
    expect(r.result).toMatch(/CRLPatterns\.UnmatchedNarrative\(/);
    // Old failure mode (literal `true`) must NOT appear.
    expect(r.result).not.toMatch(/\n  true\n/);
    // Mirrored in errors[] as a Validation diagnostic keyed by kind.
    expect(r.errors).toBeDefined();
    expect(r.errors!.some((e) => e.kind === "emit-unmatched-narrative")).toBe(true);
  });

  it("clean document with all-matched narratives → success:true + no unmatched field", () => {
    const src = lib(
      "T",
      terms("Beta Blocker") +
        `concept "On Beta Blocker":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "Beta Blocker".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLPatterns\.MostRecent/);
  });

  it("multiple unmatched narratives all surface in unmatched[] with distinct locations", () => {
    const src = lib(
      "T",
      terms("Foo") +
        `concept "A":\n- type is Observation.\n- value type is boolean.\n- definition is "Foo" frobnicates.\nconcept "B":\n- type is Observation.\n- value type is boolean.\n- definition is "Foo" grungifies.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(false);
    expect(r.unmatched!.length).toBe(2);
    // Lines differ so the two narratives are reported with distinct locations.
    expect(r.unmatched![0].line).not.toBe(r.unmatched![1].line);
  });
});

describe("issue #77 — catalog↔matcher drift fix (plus audit additions)", () => {
  // mymobiledoc's exact repro from the bug report.
  it("currently taking <med> → CRLPatterns.CurrentlyTaking(...)", () => {
    const src = lib(
      "T",
      terms("Beta Blocker") +
        `concept "On Beta Blocker":\n- type is Observation.\n- value type is boolean.\n- definition is currently taking "Beta Blocker".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLPatterns\.CurrentlyTaking\("Beta Blocker"\)/);
  });

  it("has history of <X> → CRLPatterns.HasHistoryOf(...)", () => {
    const src = lib(
      "T",
      terms("Steroid") +
        `concept "Prior Steroid":\n- type is Observation.\n- value type is boolean.\n- definition is has history of "Steroid".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.HasHistoryOf\(/);
  });

  it("has <X> → CRLPatterns.Has(...)", () => {
    const src = lib(
      "T",
      terms("Diabetes") +
        `concept "Has Diabetes":\n- type is Condition.\n- value type is boolean.\n- definition is has "Diabetes".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.Has\(/);
  });

  it("has adverse reaction to <X> → CRLPatterns.HasAdverseReactionTo(...)", () => {
    const src = lib(
      "T",
      terms("Penicillin") +
        `concept "Reacts To Penicillin":\n- type is AllergyIntolerance.\n- value type is boolean.\n- definition is has adverse reaction to "Penicillin".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.HasAdverseReactionTo\(/);
  });

  it("age at <anchor> → CRLPatterns.AgeAt(...)", () => {
    const src = lib(
      "T",
      terms("Index Encounter") +
        `concept "Age At Index":\n- type is Observation.\n- value type is Quantity.\n- definition is age at "Index Encounter".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLPatterns\.AgeAt\(/);
  });
});
