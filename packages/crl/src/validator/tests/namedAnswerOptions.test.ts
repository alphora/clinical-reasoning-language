import { describe, expect, it } from "vitest";
import { buildCRL, validateCRL } from "../../index";
const question = (exceptions = '  - not qualifying is `none`.\n', rows = '- code is `symptom` display is `Symptom`.\n- code is `none` display is `None`.') => `library "P".
concept "Complaint":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`complaint\`.
- value from is "P Complaint Answer Options"${exceptions ? ':\n'+exceptions : '.\n'}
terminology "P Complaint Answer Options":
- system is \`urn:answers\`.
${rows}
`;
function findings(source: string) {
  const result = validateCRL(source, { soft: true });
  return { errors: (result.errors ?? []).filter((e) => typeof e === "object" && e.kind?.startsWith("answer-options")), warnings: (result.warnings ?? []).filter((e) => typeof e === "object" && e.kind?.startsWith("answer-options")) };
}
describe("named answer ValueSets and explicit negative exceptions", () => {
  // @kit named-answer-options:finite-domain
  it("accepts a finite named answer domain without per-code positive markers", () => {
    expect(findings(question())).toEqual({ errors: [], warnings: [] });
  });
  // @kit named-answer-options:all-qualifying-warning
  it("warns without failing when no negatives are declared, even without a consumer", () => {
    const result = findings(question(""));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toMatchObject([{ kind: "answer-options-all-qualifying" }]);
  });
  it("allows every answer to be negative", () => {
    expect(findings(question('  - not qualifying is `none`.\n  - not qualifying is `symptom`.\n')).errors).toEqual([]);
  });
  it.each([
    ['  - not qualifying is `missing`.\n', 'answer-options-invalid-exception'],
    ['  - not qualifying is `none`.\n  - not qualifying is `none`.\n', 'answer-options-duplicate-exception'],
  ])("rejects invalid exception declarations", (exceptions, kind) => {
    expect(findings(question(exceptions)).errors).toMatchObject([{ kind }]);
  });
  it("rejects duplicate offered pairs even with identical displays", () => {
    const result = findings(question('', '- code is `x` display is `X`.\n- code is `x` display is `X`.'));
    expect(result.errors).toMatchObject([{ kind: "answer-options-duplicate-code" }]);
  });
  it("requires authored displays at the answer use site", () => {
    expect(findings(question('', '- code is `x`.')).errors).toMatchObject([{ kind: "answer-options-missing-display" }]);
  });
  it("rejects a bare exception that is ambiguous across systems", () => {
    const source = question('  - not qualifying is `x`.\n', '- code is `x` display is `First`.\n- system is `urn:other`.\n- code is `x` display is `Second`.');
    expect(findings(source).errors).toMatchObject([{ kind: "answer-options-invalid-exception" }]);
  });
  // @kit named-answer-options:retired-syntax
  it("removes inline answer lists and the former named spelling", () => {
    const source = question();
    expect(buildCRL(source.replace(/- value from is[^\n]+\n  - not qualifying is `none`\./, '- value from:\n  - `x` display is `X`, qualifying.')).success).toBe(false);
    expect(buildCRL(source.replace('value from is', 'value from')).success).toBe(false);
  });
});
