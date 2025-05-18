import { createParser } from "../createParser";

describe("createParser", () => {
  it("should create a parser instance from valid input", () => {
    const input =
      '# Testing\ndecision "Test": - when "Condition" then recommend activity "Action".';
    const { parser, parserErrorListener } = createParser(input);
    expect(parser).toBeDefined();
    expect(typeof parser.crl).toBe("function");
    try {
      parser.crl();
    } catch {
      // ANTLR may throw, but we want to check the error listener
    }
    expect(parserErrorListener.getErrors().length).toBe(0);
  });

  it("should emit custom errors for invalid input", () => {
    // Missing '.' at the end
    const input = '# Testing\ndecision "Test": - when "Condition" then recommend activity "Action"';
    const { parser, parserErrorListener } = createParser(input);
    try {
      parser.crl();
    } catch {
      // ANTLR may throw, but we want to check the error listener
    }
    const errors = parserErrorListener.getErrors();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.toLowerCase().includes("syntax error"))).toBe(true);
  });
});
