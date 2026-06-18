import { describe, expect, it } from "@jest/globals";

import { emitCQL } from "../emitCQL";

// #108 — `meta is` annotations on a concept must land in a CQL block comment
// on that concept's emitted `define`, and `@crl-future-expression` entries
// surface as a structured catalog-gap signal on the EmitResult envelope.

function lib(name: string, body: string): string {
  return `# ${name}\nlibrary "${name}".\n${body}`;
}

const term = (n: string) => `terminology "${n}":\n- valueset is \`${n}\`.\n`;

describe("issue #108 — meta is emit", () => {
  it("single `meta is` line lands in a leading block comment on the concept's define", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Annotated":\n- type is Observation.\n- value type is Quantity.\n- meta is \`@ke-feedback: trend direction matters\`.\n- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/\/\*\n \* @ke-feedback: trend direction matters\n \*\/\ndefine "Annotated":/);
  });

  it("three meta lines render as a single multi-line block comment in source order", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Obesity Trend":\n- type is Observation.\n- value type is Quantity.\n` +
        `- meta is \`@logic-expression-text: most recent BMI is increasing across the last 3 encounters\`.\n` +
        `- meta is \`@crl-future-expression: increasing "BMI Obs" over last 3 "Encounter"\`.\n` +
        `- meta is \`@ke-feedback: KE note — confirm a single elevated reading suffices\`.\n` +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.result).toMatch(/\/\*\n \* @logic-expression-text:[\s\S]*\n \* @crl-future-expression:[\s\S]*\n \* @ke-feedback:[\s\S]*\n \*\/\ndefine "Obesity Trend":/);
  });

  it("concept with no meta has no leading block comment (regression)", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "Plain":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    // The 'define "Plain":' line should NOT be preceded by `*/` on the line above.
    expect(r.result).not.toMatch(/\*\/\ndefine "Plain":/);
    expect(r.result).toMatch(/define "Plain":/);
  });

  it("`@crl-future-expression` surfaces in EmitResult.futureExpressions with conceptName + expression + location", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Obesity Trend":\n- type is Observation.\n- value type is Quantity.\n` +
        `- meta is \`@crl-future-expression: increasing "BMI Obs" over last 3 "Encounter"\`.\n` +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.futureExpressions).toBeDefined();
    expect(r.futureExpressions).toHaveLength(1);
    expect(r.futureExpressions![0].conceptName).toBe("Obesity Trend");
    expect(r.futureExpressions![0].expression).toBe('increasing "BMI Obs" over last 3 "Encounter"');
    expect(r.futureExpressions![0].line).toBeGreaterThan(0);
  });

  it("only `@crl-future-expression` flows into futureExpressions; `@ke-feedback` and `@logic-expression-text` do NOT", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Mixed":\n- type is Observation.\n- value type is Quantity.\n` +
        `- meta is \`@logic-expression-text: foo\`.\n` +
        `- meta is \`@ke-feedback: bar\`.\n` +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.futureExpressions).toBeUndefined();
  });

  it("`futureExpressions` does NOT force success:false (in contrast to unmatched[])", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Future":\n- type is Observation.\n- value type is Quantity.\n` +
        `- meta is \`@crl-future-expression: catalog gap here\`.\n` +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    expect(r.futureExpressions).toHaveLength(1);
  });

  it("meta text containing `*/` is defused so it can't accidentally close the block comment", () => {
    const src = lib(
      "T",
      term("BMI VS") +
        `concept "BMI Obs":\n- type is Observation.\n- value type is Quantity.\n- coded from "BMI VS".\n` +
        `concept "Tricky":\n- type is Observation.\n- value type is Quantity.\n` +
        `- meta is \`@ke-feedback: contains */ inside\`.\n` +
        `- definition is highest "BMI Obs".\n`,
    );
    const r = emitCQL(src, { libraryName: "T" });
    expect(r.success).toBe(true);
    // The literal `*/` inside the meta body must be defused so the block
    // comment doesn't terminate early.
    expect(r.result).toMatch(/contains \* \/ inside/);
    // And the `define` keyword must still appear inside an open comment context.
    expect(r.result).toMatch(/\*\/\ndefine "Tricky":/);
  });
});
