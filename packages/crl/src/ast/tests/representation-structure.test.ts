import { Concept, CodedFromDefinition } from "../types";

import { parseInput } from "./parseInput";

// ADR 0001 representation model: local `code is`, external `source
// representation:` (type + named coded from, inheriting the base), mixed +
// representations-only concept bodies, and the new Concept Types.
describe("Representation model (ADR 0001)", () => {
  const src = `# Test
library "Rep Test".
terminology "Mammogram VS":
- valueset is \`http://example.org/mammogram\`.
terminology "Mammogram DR VS":
- valueset is \`http://example.org/mammogram-dr\`.
terminology "BMI VS":
- valueset is \`http://example.org/bmi\`.

concept "Clinical Mammogram":
- source representation: - type is ImagingStudy. - coded from "Mammogram VS".
- source representation: - type is DiagnosticReport. - coded from "Mammogram DR VS".

concept "Administrative Mammogram":
- coded from "Mammogram VS".
- source representation: - type is Claim.
- source representation: - type is ExplanationOfBenefit.

concept "Mammogram":
- type is Observation.
- code is \`mammogram\`.
- defined as ( "Clinical Mammogram" sem-or "Administrative Mammogram" ).

concept "BMI":
- type is Observation.
- value type is Quantity.
- code is \`bmi\`.
- coded from "BMI VS".

concept "High BMI":
- type is Observation.
- value type is boolean.
- code is \`high-bmi\`.
- definition is "BMI" at least 30 'kg/m2'.
- source representation: - coded from "BMI VS".`;

  const ast = parseInput(src);
  const byName = (n: string): Concept =>
    ast.statements.find((s) => s.type === "Concept" && s.name === n) as Concept;

  it("representations-only concept has no definition + carries its source reps", () => {
    const c = byName("Clinical Mammogram");
    expect(c.definition).toBeUndefined();
    expect(c.representations).toHaveLength(2);
    expect(c.representations[0].conceptType).toBe("ImagingStudy");
    expect(c.representations[0].terminologyName).toBe("Mammogram VS");
    expect(c.representations[1].conceptType).toBe("DiagnosticReport");
    expect(c.representations[1].terminologyName).toBe("Mammogram DR VS");
  });

  it("base `coded from` + type-only reps that inherit it", () => {
    const c = byName("Administrative Mammogram");
    expect(c.definition?.type).toBe("CodedFromDefinition");
    expect((c.definition as CodedFromDefinition).terminologyName).toBe("Mammogram VS");
    expect(c.representations.map((r) => r.conceptType)).toEqual([
      "Claim",
      "ExplanationOfBenefit",
    ]);
    // type-only reps omit coded from → inherit the base (terminologyName absent on the rep)
    expect(c.representations[0].terminologyName).toBeUndefined();
  });

  it("local `code is` + `defined as` union", () => {
    const c = byName("Mammogram");
    expect(c.code).toBe("mammogram");
    expect(c.definition?.type).toBe("DefinedAsDefinition");
    expect(c.representations).toHaveLength(0);
  });

  it("mixed concept: local code + definition + source representation", () => {
    const c = byName("High BMI");
    expect(c.code).toBe("high-bmi");
    expect(c.definition?.type).toBe("DefinitionIsDefinition");
    expect(c.representations).toHaveLength(1);
    expect(c.representations[0].terminologyName).toBe("BMI VS");
    expect(c.representations[0].conceptType).toBeUndefined(); // inherits Observation
  });

  it("a concept may have a local code + a base coded from (read-only source + assertable)", () => {
    const c = byName("BMI");
    expect(c.code).toBe("bmi");
    expect((c.definition as CodedFromDefinition).terminologyName).toBe("BMI VS");
  });
});
