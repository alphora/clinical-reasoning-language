import { describe, expect, it } from "@jest/globals";

import { emitCQL } from "../emitCQL";

// Coverage for:
//   - Issue #79 — `EmitResult.unmatched[]` + `success: false` + compile-failing
//     sentinel call when a `- definition is …` narrative has no catalog match.
//   - Issue #77 — `currently taking <X>` and `has history of <X>` were in the
//     catalog + CRLCommon.cql but missing from the matcher. The same audit
//     pass also wires `has`, `has adverse reaction to`, and `age at`.

function lib(name: string, body: string): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}

const terms = (n: string) => `terminology "${n}":\n- valueset is \`${n}\`.\n`;

describe("T10 / #78 — recency × state-predicate composition", () => {
  it("`most recent <X> active` → MostRecent wrapping Active", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        `concept "Recent Active":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "HBV Test" active.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLCommon\.MostRecent\(/);
    expect(r.result).toMatch(/CRLCommon\.Active\(/);
  });

  it("`most recent <X> verified` → MostRecent wrapping IsVerified", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        `concept "Recent Verified":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "HBV Test" verified.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.MostRecent\(/);
    expect(r.result).toMatch(/CRLCommon\.IsVerified\(/);
  });

  it("`most recent <X> documented as <Y>` → MostRecent wrapping DocumentedAs", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        terms("Resolved") +
        `concept "Recent Doc":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "HBV Test" documented as "Resolved".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.MostRecent\(/);
    expect(r.result).toMatch(/CRLCommon\.DocumentedAs\(/);
  });

  it("`last <X> active` → Last wrapping Active", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        `concept "Last Active":\n- type is Observation.\n- value type is boolean.\n- definition is last "HBV Test" active.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.LastOf\(/);
    expect(r.result).toMatch(/CRLCommon\.Active\(/);
  });

  it("`last <X> verified` → Last wrapping IsVerified", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        `concept "Last Verified":\n- type is Observation.\n- value type is boolean.\n- definition is last "HBV Test" verified.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.LastOf\(/);
    expect(r.result).toMatch(/CRLCommon\.IsVerified\(/);
  });

  it("`last <X> documented as <Y>` → Last wrapping DocumentedAs", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        terms("Resolved") +
        `concept "Last Doc":\n- type is Observation.\n- value type is boolean.\n- definition is last "HBV Test" documented as "Resolved".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.LastOf\(/);
    expect(r.result).toMatch(/CRLCommon\.DocumentedAs\(/);
  });

  it("bare `most recent <X>` still matches plain MostRecent (regression)", () => {
    const src = lib(
      "T",
      terms("HBV Test") +
        `concept "Recent":\n- type is Observation.\n- value type is boolean.\n- definition is most recent "HBV Test".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.MostRecent\(/);
    expect(r.result).not.toMatch(/CRLCommon\.Active\(/);
  });
});

describe("T08 / #98 — window-from-anchor 3 missing sisters", () => {
  it("`last <X> within <Q> after end of <Y>` → CRLCommon.AfterEndOf inside Last", () => {
    const src = lib(
      "T",
      terms("X") +
        terms("Anchor") +
        `concept "AfterEnd":\n- type is Observation.\n- value type is boolean.\n- definition is last "X" within 1 year after end of "Anchor".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLCommon\.AfterEndOf/);
    expect(r.result).toMatch(/CRLCommon\.LastOf\(/);
  });

  it("`last <X> within <Q> after start of <Y>` → CRLCommon.AfterStartOf", () => {
    const src = lib(
      "T",
      terms("X") +
        terms("Anchor") +
        `concept "AfterStart":\n- type is Observation.\n- value type is boolean.\n- definition is last "X" within 30 day after start of "Anchor".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.AfterStartOf/);
  });

  it("`last <X> within <Q> before end of <Y>` → CRLCommon.BeforeEndOf", () => {
    const src = lib(
      "T",
      terms("X") +
        terms("Anchor") +
        `concept "BeforeEnd":\n- type is Observation.\n- value type is boolean.\n- definition is last "X" within 7 day before end of "Anchor".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.BeforeEndOf/);
  });

  it("existing `before start of` sister keeps matching (regression guard)", () => {
    const src = lib(
      "T",
      terms("X") +
        terms("Anchor") +
        `concept "BeforeStart":\n- type is Observation.\n- value type is boolean.\n- definition is last "X" within 1 year before start of "Anchor".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.BeforeStartOf/);
  });
});

describe("T07 / #93 — AtLeastApart / AtMostApart matcher wiring", () => {
  it("`<A> and <B> at least <Q> apart` → emits CRLCommon.AtLeastApart, no unmatched", () => {
    const src = lib(
      "T",
      terms("Reading A") +
        terms("Reading B") +
        `concept "Two Readings Far Apart":\n- type is Observation.\n- value type is boolean.\n- definition is "Reading A" and "Reading B" at least 6 'wk' apart.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLCommon\.AtLeastApart/);
  });

  it("`<A> and <B> at most <Q> apart` → emits CRLCommon.AtMostApart", () => {
    const src = lib(
      "T",
      terms("Reading A") +
        terms("Reading B") +
        `concept "Two Readings Close":\n- type is Observation.\n- value type is boolean.\n- definition is "Reading A" and "Reading B" at most 4 'd' apart.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.AtMostApart/);
  });

  it("bare `at least <Q>` (3 elements, no `apart`) still matches AtLeast — not AtLeastApart", () => {
    const src = lib(
      "T",
      terms("Score") +
        `concept "Above Threshold":\n- type is Observation.\n- value type is boolean.\n- definition is "Score" at least 5 '{score}'.\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.AtLeast\(/);
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
    // Sentinel call references CRLCommon.UnmatchedNarrative — not defined
    // in CRLCommon.cql, so a downstream CQL compiler will reject the output.
    expect(r.result).toMatch(/CRLCommon\.UnmatchedNarrative\(/);
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
    expect(r.result).toMatch(/CRLCommon\.MostRecent/);
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
  it("currently taking <med> → CRLCommon.CurrentlyTaking(...)", () => {
    const src = lib(
      "T",
      terms("Beta Blocker") +
        `concept "On Beta Blocker":\n- type is Observation.\n- value type is boolean.\n- definition is currently taking "Beta Blocker".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.unmatched).toBeUndefined();
    expect(r.result).toMatch(/CRLCommon\.CurrentlyTaking\("Beta Blocker"\)/);
  });

  it("has history of <X> → CRLCommon.HasHistoryOf(...)", () => {
    const src = lib(
      "T",
      terms("Steroid") +
        `concept "Prior Steroid":\n- type is Observation.\n- value type is boolean.\n- definition is has history of "Steroid".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.HasHistoryOf\(/);
  });

  it("has <X> → CRLCommon.Has(...)", () => {
    const src = lib(
      "T",
      terms("Diabetes") +
        `concept "Has Diabetes":\n- type is Condition.\n- value type is boolean.\n- definition is has "Diabetes".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.Has\(/);
  });

  it("has adverse reaction to <X> → CRLCommon.HasAdverseReactionTo(...)", () => {
    const src = lib(
      "T",
      terms("Penicillin") +
        `concept "Reacts To Penicillin":\n- type is AllergyIntolerance.\n- value type is boolean.\n- definition is has adverse reaction to "Penicillin".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.HasAdverseReactionTo\(/);
  });

  it("age at <anchor> → CRLCommon.AgeAt(...)", () => {
    const src = lib(
      "T",
      terms("Index Encounter") +
        `concept "Age At Index":\n- type is Observation.\n- value type is Quantity.\n- definition is age at "Index Encounter".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/CRLCommon\.AgeAt\(/);
  });
});
