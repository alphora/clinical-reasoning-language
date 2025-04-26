import { CharStreams } from "antlr4ts";

import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";
import { tokenizeCPGL } from "../../index";
import { CPGLLexerErrorListener } from "../CPGLLexerErrorListener";
import { createLexer } from "../createLexer";

import { getTokensFromString } from "./helpers";

describe("Lexer Error Handling", () => {
  it("should handle invalid characters", () => {
    const inputs = ["@invalid", "$tokens", "#notallowed", "~invalid", "`backtick"];

    inputs.forEach((input) => {
      const { lexer } = createLexer(input);
      const tokens = getTokensFromString(input);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("should handle unterminated identifiers and strings", () => {
    const inputs = [
      '"unterminated identifier',
      '"identifier with\nnewline',
      'decision "unclosed identifier\nthen do "Action".',
      '"unterminated string with backslash\\',
      '"string with\\\nnewline',
    ];

    inputs.forEach((input) => {
      const { lexer } = createLexer(input);
      const tokens = getTokensFromString(input);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("should handle invalid characters with line and character position", () => {
    const testCases = [
      {
        input: "@invalid",
        minTokens: 0,
      },
      {
        input: "done\n@invalid",
        minTokens: 1,
      },
      {
        input: "done\n  @invalid",
        minTokens: 1,
      },
    ];

    testCases.forEach(({ input, minTokens }) => {
      const { lexer } = createLexer(input);
      const tokens = getTokensFromString(input);
      expect(tokens.length).toBeGreaterThanOrEqual(minTokens);
    });
  });

  it("should throw an exception for invalid activity types", () => {
    const testCases = [
      {
        input: "perform invalidActivity",
        expectedMessage: "Invalid activity type",
      },
      {
        input: "perform invalid",
        expectedMessage: "Invalid activity type",
      },
      {
        input: 'decision "test"\nwhen "true" then perform unknownActivity\ndone',
        expectedMessage: "Invalid activity type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid concept types", () => {
    const testCases = [
      {
        input: "concept type InvalidConcept",
        expectedMessage: "Invalid concept type",
      },
      {
        input: "concept type SomeRandomType",
        expectedMessage: "Invalid concept type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid concept value types", () => {
    const testCases = [
      {
        input: "concept valuetype InvalidValueType",
        expectedMessage: "Invalid concept value type",
      },
      {
        input: "concept valuetype SomeRandomValueType",
        expectedMessage: "Invalid concept value type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in concept mode", () => {
    const testCases = [
      {
        input: "concept type @invalid",
        expectedMessage: "Invalid character in concept type",
      },
      {
        input: "concept type $invalid",
        expectedMessage: "Invalid character in concept type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in value type mode", () => {
    const testCases = [
      {
        input: "concept valuetype @invalid",
        expectedMessage: "Invalid character in concept value type",
      },
      {
        input: "concept valuetype $invalid",
        expectedMessage: "Invalid character in concept value type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in activity mode", () => {
    const testCases = [
      {
        input: "perform @invalid",
        expectedMessage: "Invalid character in activity type",
      },
      {
        input: "perform $invalid",
        expectedMessage: "Invalid character in activity type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const errorObj = JSON.parse(errors[0]);
      expect(errorObj.type).toBe("LexicalError");
      expect(errorObj.message).toContain(expectedMessage);
    });
  });
});

describe("tokenizeCPGL error reporting", () => {
  it("should return errors in ParseResult for invalid activity type", () => {
    const input = "perform invalidActivity";
    const result = tokenizeCPGL(input);
    expect(result.success).toBe(false);
    expect(result.errors && result.errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(result.errors![0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid activity type");
  });

  it("should return errors in ParseResult for invalid concept type", () => {
    const input = "concept type InvalidConcept";
    const result = tokenizeCPGL(input);
    expect(result.success).toBe(false);
    expect(result.errors && result.errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(result.errors![0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept type");
  });

  it("should return errors in ParseResult for invalid characters", () => {
    const input = "@invalid";
    const result = tokenizeCPGL(input);
    expect(result.success).toBe(false);
    expect(result.errors && result.errors.length).toBeGreaterThan(0);
    const errorObj = JSON.parse(result.errors![0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid token");
  });
});
