import { describe, it, expect } from "vitest";

import { buildCRL, validateCRL } from "../../index";

/**
 * ⭐⭐ "A CONCEPT MUST CARRY SOME SUBSTANCE" — MOVED FROM THE AST BUILDER TO THE VALIDATOR.
 *
 * Operator instruction, 2026-09-02. The rule is UNCHANGED: what was invalid before is still invalid. Only
 * WHERE it is reported moved.
 *
 * ⚠⚠ THE POINT OF THE MOVE IS THE LAST TEST IN THIS FILE, and it is the one a future refactor is most
 * likely to undo. An `AstError` ABORTS the build, so a file with an inert concept produced ONE diagnostic
 * and every other validator was skipped — an author with four problems saw one, fixed it, re-ran, and met
 * the next. MEASURED: the fixture below reports four findings now and reported one before.
 *
 * It also un-blanked the EDITOR. Regenerating the vscode navigation oracle after the move turned three
 * `"result": null` / `"result": []` entries into real locations: go-to-definition and find-references had
 * been dead on any file containing an inert concept, because nothing downstream of the abort ever ran.
 */
const kinds = (src: string): string[] => {
  const v = validateCRL(src, { soft: true }) as unknown as { errors?: { kind: string }[] };
  return (v.errors ?? []).map((e) => e.kind);
};

describe("concept substance", () => {
  it("⭐ flags a concept with no code, no definition and no representation", () => {
    const src = `library "T".

concept "Inert":
- type is Observation.
- value type is boolean.
`;
    expect(kinds(src)).toContain("concept-no-substance");
  });

  it("⭐ the concept still BUILDS — the rule is semantic, not syntactic", () => {
    // If this flips to false, the rule has drifted back into the builder and the payoff below is gone.
    const src = `library "T".\n\nconcept "Inert":\n- type is Observation.\n- value type is boolean.\n`;
    expect(buildCRL(src).success).toBe(true);
  });

  it.each([
    ["a local code", "- code is `x`."],
    ["a definition", `- definition is "Other" performed.`],
  ])("accepts a concept carrying %s", (_what, line) => {
    const src = `library "T".

concept "C":
- type is Observation.
- value type is boolean.
${line}
`;
    expect(kinds(src)).not.toContain("concept-no-substance");
  });

  it("⚠ an EMPTY `code is` is not substance — it leaves the concept un-assertable", () => {
    const src = "library \"T\".\n\nconcept \"C\":\n- type is Observation.\n- value type is boolean.\n- code is ``.\n";
    expect(kinds(src)).toContain("concept-no-substance");
  });

  it("⭐⭐ THE PAYOFF — other diagnostics on the same file are no longer suppressed", () => {
    // Before the move this file produced exactly one `AstError` and nothing else. Every finding below was
    // real and invisible. If this test ever shrinks to one kind, the rule has moved back into the builder.
    const src = `library "T".

terminology "Ext":
- system is \`http://example.org/s\`.
- code is \`z\`.

concept "Q":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- value from:
  - \`a\` display is \`A\`.
`;
    const found = kinds(src);
    expect(found).toContain("concept-no-substance");
    // …and the answer-options rule gets to speak about the very same concept.
    expect(found).toContain("answer-options-unanswerable");
    expect(found.length).toBeGreaterThan(1);
  });
});
