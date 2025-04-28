import { createParser } from "../createParser";

describe("createParser", () => {
  it("should create a parser instance from valid input", () => {
    const input = 'decision "Test": when "Condition" then do "Action". done';
    const { parser, parserErrorListener } = createParser(input);
    expect(parser).toBeDefined();
    expect(typeof parser.cpgl).toBe("function");
    // Should not emit errors for valid input
    expect(parserErrorListener.getErrors().length).toBe(0);
  });

  it("should emit custom errors for invalid input", () => {
    // Missing 'done' at the end
    const input = 'decision "Test": when "Condition" then do "Action".';
    const { parser, parserErrorListener } = createParser(input);
    // Try to parse
    try {
      parser.cpgl();
    } catch {
      // ANTLR may throw, but we want to check the error listener
    }
    const errors = parserErrorListener.getErrors();
    if (errors.length > 0) {
      // Debug log for error output
      // eslint-disable-next-line no-console
      // console.log('[DEBUGGING] Parser errors:', errors);
    }
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.toLowerCase().includes("syntax error"))).toBe(true);
  });
});
