import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";
import { tokenizeCRL } from "../../index";

// v2.2 issue #59 — parameter-keyword Todo 1 tests.
describe("parameter declarations (Todo 1: lex)", () => {
  it("tokenizes a parameter declaration with a resource type", () => {
    const input = `# T
library "T".
parameter "Patient":
- param type is Patient.
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(true);
    const types = r.result!.map((t) => t.type);
    // expect PARAMETER followed by QUOTED_STRING + COLON + DASH +
    // PARAM_TYPE_IS + PARAMETER_TYPE + DOT among the stream
    expect(types).toContain("PARAMETER");
    expect(types).toContain("PARAM_TYPE_IS");
    expect(types).toContain("PARAMETER_TYPE");
  });

  it("tokenizes a parameter declaration with a data type", () => {
    const input = `# T
library "T".
parameter "Measurement Period":
- param type is Period.
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(true);
    const types = r.result!.map((t) => t.type);
    expect(types).toContain("PARAMETER");
    expect(types).toContain("PARAM_TYPE_IS");
    expect(types).toContain("PARAMETER_TYPE");
    // The Period token text should pass through PARAMETER_TYPE_MODE
    // unchanged (i.e. not an ERROR token).
    const periodToken = r.result!.find((t) => t.text === "Period");
    expect(periodToken).toBeDefined();
    expect(periodToken!.type).toBe("PARAMETER_TYPE");
  });

  it("rejects an invalid parameter type at lex time", () => {
    const input = `# T
library "T".
parameter "X":
- param type is Foobar.
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(false);
    expect(r.errors!.some((e) => /InvalidParameterType|Foobar/.test(e.message))).toBe(true);
  });

  it("Period is still rejected for concept's `type is` (separation preserved)", () => {
    const input = `# T
library "T".
concept "X":
- type is Period.
- defined as "X".
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(false);
    expect(r.errors!.some((e) => /Period/.test(e.message))).toBe(true);
  });

  it("renamed keyword `value type is` tokenizes (regression for the rename)", () => {
    const input = `# T
library "T".
concept "X":
- type is Observation.
- value type is Quantity.
- defined as "X".
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(true);
    const types = r.result!.map((t) => t.type);
    expect(types).toContain("VALUE_TYPE_IS");
  });

  it("old keyword `valuetype is` ERRORs (regression — old form is gone)", () => {
    const input = `# T
library "T".
concept "X":
- type is Observation.
- valuetype is Quantity.
- defined as "X".
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(false);
  });

  it("two parameters back-to-back exercise the mode cycle", () => {
    const input = `# T
library "T".
parameter "A":
- param type is Period.
parameter "B":
- param type is Patient.
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(true);
    const paramTokens = r.result!.filter((t) => t.type === "PARAMETER");
    expect(paramTokens.length).toBe(2);
  });

  it("PARAMETER_TYPE_MODE skips block comments (parity with other type modes)", () => {
    const input = `# T
library "T".
parameter "X":
- param type is /* note */ Period.
`;
    const r = tokenizeCRL(input);
    expect(r.success).toBe(true);
    const types = r.result!.map((t) => t.type);
    expect(types).toContain("PARAMETER_TYPE");
  });
});

// AST shape — basic sanity that the builder produces a Parameter node.
describe("parameter declarations (Todo 1: AST)", () => {
  it("buildCRL produces a Parameter statement", async () => {
    const { buildCRL } = await import("../../index");
    const r = buildCRL(`# T
library "T".
parameter "Measurement Period":
- param type is Period.
`);
    expect(r.success).toBe(true);
    const stmts = r.result!.statements;
    expect(stmts).toHaveLength(1);
    expect(stmts[0].type).toBe("Parameter");
    expect((stmts[0] as { name: string }).name).toBe("Measurement Period");
    expect((stmts[0] as { parameterType: string }).parameterType).toBe("Period");
  });

  it("buildCRL with mixed parameter + concept parses end-to-end (Todo 2 resolves bare refs)", () => {
    const { buildCRL } = require("../../index");
    const r = buildCRL(`# T
library "T".
parameter "Measurement Period":
- param type is Period.
concept "X":
- type is Observation.
- value type is Quantity.
- defined as "X".
`);
    expect(r.success).toBe(true);
    expect(r.result!.statements).toHaveLength(2);
  });
});
