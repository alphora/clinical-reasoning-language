import { describe, it, expect } from "vitest";

import { validateCRL } from "../../index";

/**
 * ⭐⭐ #189 — INLINE `value from:` ANSWER OPTIONS, the validator's half.
 *
 * The operator asked for inline codes when `value from` was first built; the blocker was that they had no
 * `system`. They now get one — the concept's OWN CodeSystem — and these rules police the ways that can be
 * meaningless.
 *
 * ⚠⚠ THE MARKER RULE IS A PROPERTY OF **USE**, NOT OF THE DECLARATION (operator ruling, 2026-09-02).
 * `qualifying` / `not qualifying` is required IFF the concept is the subject of an `in qualifying`
 * predicate. Unconditional marking would force a plain dropdown — one that feeds no predicate — to classify
 * every option as qualifying-for-NOTHING and ship a qualifying value set no predicate defines: written but
 * never executed. So both directions are pinned here; testing only the required case would let a later
 * change quietly make it unconditional.
 *
 * ⚠ Every rule below was verified to FIRE by running it before this file existed. That order matters in this
 * codebase: two guards shipped earlier in #189 sat in code paths that could never execute, and both looked
 * exactly like protection until something ran them.
 */
const findings = (src: string): { kind: string; severity: string; message: string }[] => {
  const v = validateCRL(src, { soft: true }) as unknown as {
    errors?: { kind: string; message: string }[];
    warnings?: { kind: string; message: string }[];
  };
  return [
    ...(v.errors ?? []).map((e) => ({ ...e, severity: "error" })),
    ...(v.warnings ?? []).map((w) => ({ ...w, severity: "warning" })),
  ].filter((f) => String(f.kind).startsWith("answer-options"));
};

const QUESTION = (options: string): string => `library "T".

concept "Q":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`q\`.
- value from:
${options}
`;

const PREDICATE = `
concept "D":
- shape is Scalar.
- value type is boolean.
- definition is "Q" in qualifying.
`;

describe("#189 inline answer options — the validator", () => {
  it("⭐ accepts a well-formed predicated question, and reports NOTHING", () => {
    const src =
      QUESTION(
        "  - `a` display is `Chronic blepharitis`, qualifying.\n" +
          "  - `none-of-listed` display is `None of the listed`, not qualifying.",
      ) + PREDICATE;
    expect(findings(src)).toEqual([]);
  });

  it("⭐⭐ REQUIRES a marker when the concept IS predicated on", () => {
    const src = QUESTION("  - `a` display is `A`.\n  - `b` display is `B`, not qualifying.") + PREDICATE;
    const f = findings(src).filter((x) => x.kind === "answer-options-missing-marker");
    expect(f).toHaveLength(1);
    // The message must say WHY it is required here and not everywhere, or an author reads it as a blanket
    // rule and marks options on dropdowns that have no predicate.
    expect(f[0].message).toContain("in qualifying");
  });

  it("⭐⭐ does NOT require a marker when NOTHING predicates on the concept", () => {
    // A plain dropdown. Forcing a classification here would invent one the artifact never uses.
    const src = QUESTION("  - `a` display is `A`.\n  - `b` display is `B`.");
    expect(findings(src)).toEqual([]);
  });

  it("requires a display — it is what a clinician READS, and cannot be derived from the code", () => {
    const src = QUESTION("  - `a` display is ``, qualifying.");
    expect(findings(src).map((x) => x.kind)).toContain("answer-options-missing-display");
  });

  it("refuses a duplicate option code — one code is one answer", () => {
    const src = QUESTION("  - `a` display is `A`, qualifying.\n  - `a` display is `Again`, qualifying.");
    const f = findings(src).filter((x) => x.kind === "answer-options-duplicate-code");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("error");
  });

  it("⭐ ERRORS when no option qualifies — the predicate can never be true", () => {
    const src =
      QUESTION("  - `a` display is `A`, not qualifying.\n  - `b` display is `B`, not qualifying.") + PREDICATE;
    const f = findings(src).filter((x) => x.kind === "answer-options-none-qualifying");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("error");
  });

  it("⭐ WARNS when every option qualifies — false is then unreachable by any offered answer", () => {
    // Not an error: a present UNOFFERED code is still a determinate non-member, so `false` is reachable —
    // just never by anything the user was offered. That is usually a missing "none of the listed" option.
    const src =
      QUESTION("  - `a` display is `A`, qualifying.\n  - `b` display is `B`, qualifying.") + PREDICATE;
    const f = findings(src).filter((x) => x.kind === "answer-options-all-qualifying");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
  });

  it("⭐ refuses `in qualifying` when the SUBJECT declares no inline options", () => {
    // The lowering has nothing to render and throws at emit; an author-time error names the fix instead.
    const src = `library "T".

terminology "Ext":
- system is \`http://example.org/s\`.
- code is \`a\`.

concept "Q":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`q\`.
- value from "Ext".
- definition is most recent this.

concept "D":
- shape is Scalar.
- value type is boolean.
- definition is "Q" in qualifying.
`;
    const kinds = (validateCRL(src, { soft: true }) as unknown as { errors?: { kind: string }[] }).errors ?? [];
    expect(kinds.map((e) => e.kind)).toContain("membership-subset-subject-has-no-options");
  });

  it("⭐ refuses `in qualifying` over a subject that does not publish ONE record", () => {
    // Shared with terminology membership: the lowering reads `<subject>.value`, which for a RecordSet is a
    // LIST and fails at TRANSLATION while emit reports success. The subset form must not bypass that.
    const src = `library "T".

concept "Q":
- shape is RecordSet.
- type is Observation.
- value type is CodeableConcept.
- code is \`q\`.
- value from:
  - \`a\` display is \`A\`, qualifying.
  - \`b\` display is \`B\`, not qualifying.

concept "D":
- shape is Scalar.
- value type is boolean.
- definition is "Q" in qualifying.
`;
    const kinds = (validateCRL(src, { soft: true }) as unknown as { errors?: { kind: string }[] }).errors ?? [];
    expect(kinds.map((e) => e.kind)).toContain("membership-subject-shape-unsupported");
  });

  it("carries the pre-existing `value from` rules across to the inline form", () => {
    // ⚠ These two are NOT inline-specific and must keep applying: options on a concept nobody can answer,
    // or one whose value is not coded, are meaningless in either spelling.
    // ⚠ It needs `coded from` to be a well-formed concept at all: a concept must carry a local code,
    // `coded from`, a definition, or a representation. So "answerable" here means specifically a LOCAL
    // `code is` — an externally-coded read-only concept is never ASKED, whatever else it has.
    const unanswerable = `library "T".

terminology "Ext":
- system is \`http://example.org/s\`.
- code is \`z\`.

concept "Q":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- coded from "Ext".
- value from:
  - \`a\` display is \`A\`.
`;
    expect(findings(unanswerable).map((x) => x.kind)).toContain("answer-options-unanswerable");
  });
});
