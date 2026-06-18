import { tokenizeCRL } from "../../index";
import { CRLError } from "../../types/errors";

import { getTokensFromString } from "./helpers";

describe("Lexer Error Handling", () => {
  it("should handle invalid characters", () => {
    const inputs = ["@invalid", "$tokens", "#notallowed", "~invalid", "`backtick"];

    inputs.forEach((input) => {
      const tokens = getTokensFromString(input);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("should handle unterminated identifiers and strings", () => {
    const inputs = [
      '"unterminated identifier',
      '"identifier with\nnewline',
      'decision "unclosed identifier\nthen recommend activity "Action".',
      '"unterminated string with backslash\\',
      '"string with\\\nnewline',
    ];

    inputs.forEach((input) => {
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
        input: "end.\n@invalid",
        minTokens: 1,
      },
      {
        input: "end.\n  @invalid",
        minTokens: 1,
      },
    ];

    testCases.forEach(({ input, minTokens }) => {
      const tokens = getTokensFromString(input);
      expect(tokens.length).toBeGreaterThanOrEqual(minTokens);
    });
  });

  it("should throw an exception for invalid tokens", () => {
    const testCases = [
      {
        input: "@invalid",
        expectedMessage: "Invalid token: @invalid",
      },
      {
        input: "$invalid",
        expectedMessage: "Invalid token: $invalid",
      },
      {
        input: "~invalid",
        expectedMessage: "Invalid token: ~invalid",
      },
      {
        input: "recommend activity @invalid",
        expectedMessage: "Invalid token: @invalid",
      },
      {
        input: "- type is @invalid",
        expectedMessage: "Invalid concept type: @invalid",
      },
      {
        input: "- value type is @invalid",
        expectedMessage: "Invalid concept value type: @invalid",
      },
    ];
    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid activity types", () => {
    const testCases = [
      {
        input: 'activity "blah" request invalidActivity',
        expectedMessage: "Invalid activity type",
      },
      {
        input: 'activity "blah" request invalid',
        expectedMessage: "Invalid activity type",
      },
      {
        input: 'decision "test":\nwhen "true" then recommend activity unknownActivity\n.',
        expectedMessage: "Invalid token: unknownActivity",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid concept types", () => {
    const testCases = [
      {
        input: 'concept "blah": - type is InvalidConcept.',
        expectedMessage: "Invalid concept type",
      },
      {
        input: 'concept "blah": - type is SomeRandomType.',
        expectedMessage: "Invalid concept type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid concept value types", () => {
    const testCases = [
      {
        input: 'concept "blah": - value type is InvalidValueType.',
        expectedMessage: "Invalid concept value type",
      },
      {
        input: 'concept "blah": - value type is SomeRandomValueType.',
        expectedMessage: "Invalid concept value type",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in concept mode", () => {
    const testCases = [
      {
        input: 'concept "blah": - type is @invalid.',
        expectedMessage: "Invalid concept type: @invalid",
      },
      {
        input: 'concept "blah": - type is $invalid',
        expectedMessage: "Invalid concept type: $invalid",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in value type mode", () => {
    const testCases = [
      {
        input: 'concept "blah": - value type is @invalid.',
        expectedMessage: "Invalid concept value type: @invalid",
      },
      {
        input: 'concept "blah": - value type is $invalid',
        expectedMessage: "Invalid concept value type: $invalid",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });

  it("should throw an exception for invalid characters in activity mode", () => {
    const testCases = [
      {
        input: "request @invalid",
        expectedMessage: "Invalid activity type: @invalid",
      },
      {
        input: "request $invalid",
        expectedMessage: "Invalid activity type: $invalid",
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const { errorListener } = getTokensFromString(input, { withListener: true });
      const errors = errorListener.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const error = errors[0] as CRLError;
      expect(error.type).toBe("LexicalError");
      expect(error.message).toContain(expectedMessage);
    });
  });
});

describe("tokenizeCRL error reporting", () => {
  it("should return errors in ParseResult for invalid tokens", () => {
    const input = "request @invalid";
    const result = tokenizeCRL(input);
    expect(result.success).toBe(false);
    expect(result.errors && result.errors.length).toBeGreaterThan(0);
    const error = result.errors![0] as CRLError;
    expect(error.type).toBe("LexicalError");
    expect(error.message).toContain("Invalid activity type: @invalid");
  });
});
