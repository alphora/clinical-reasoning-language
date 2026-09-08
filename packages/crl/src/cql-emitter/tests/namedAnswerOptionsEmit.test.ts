import { describe, expect, it } from "vitest";
import { buildCRL } from "../../index";
import { emitPartitioned, FULL_PARTITION } from "../layeredEmit";
import { buildNamedAnswerSetMap, answerCodeSystemIdentity } from "../../fhir-emitter/namedAnswerSet";
import { lowerLocalCodes } from "../lowerLocalCodes";
const source = `library "P".
concept "Complaint":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`complaint\`.
- definition is most recent this.
- value from is "P Complaint Answer Options":
  - not qualifying is \`none\`.
concept "Qualifies":
- shape is Scalar.
- value type is boolean.
- definition is "Complaint" in qualifying.
terminology "P Complaint Answer Options":
- system is \`urn:answers\`.
- code is \`symptom\` display is \`Symptom\`.
- code is \`none\` display is \`None\`.
`;
describe("named answer classification across CQL layers", () => {
  it("emits the complete domain and negative exceptions in the consuming layer", () => {
    const parsed = buildCRL(source);
    expect(parsed.success, JSON.stringify(parsed.errors)).toBe(true);
    const sets = buildNamedAnswerSetMap(parsed.result!, "p", "https://example.org");
    const lowered = lowerLocalCodes(parsed.result!, { canonicalBase: "https://example.org", localDomainId: "p" });
    const result = emitPartitioned(lowered.ast, "P", "p", FULL_PARTITION, { canonicalBase: "https://example.org", policyId: "p", localDomainId: "p", namedAnswerSetsByName: sets });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const using = result.entries.find((e) => String(e.result.result).includes('define "Qualifies"'));
    expect(using).toBeDefined();
    const cql = String(using!.result.result);
    expect(cql).toContain("publication-uninterpretable-value");
    expect(cql).toContain("publication-ambiguous-coded-value");
    expect(cql).toContain("then null as System.Boolean");
    expect(cql).toContain("code: 'symptom'");
    expect(cql).toContain("code: 'none'");
    expect(cql).not.toContain("answer-options-qualifying");
  });
  it("uses logical CRL ownership and preserves disambiguation when IDs are capped", () => {
    const first = answerCodeSystemIdentity("Long Library ".repeat(7), "Complaint A", "https://example.org");
    const second = answerCodeSystemIdentity("Long Library ".repeat(7), "Complaint B", "https://example.org");
    expect(first.id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(first.id).toMatch(/-answer-codes$/);
    expect(first.id).not.toBe(second.id);
    expect(first.url).toBe(`https://example.org/CodeSystem/${first.id}`);
  });
});
