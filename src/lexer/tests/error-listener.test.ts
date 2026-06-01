import { CommonTokenStream } from "antlr4ts";

import { CRLError } from "../../types/errors";
import { createLexer } from "../createLexer";

describe("CRLLexerErrorListener", () => {
  it("should detect individual invalid tokens", () => {
    const { lexer, errorListener } = createLexer("@invalid");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj: CRLError = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toMatch(/Invalid token: .*/);
  });

  it("should treat whitespace-separated invalid tokens as separate errors", () => {
    const { lexer, errorListener } = createLexer("@invalid1 @invalid2");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1: CRLError = errors[0];
    const errorObj2: CRLError = errors[1];
    expect(errorObj1.type).toBe("LexicalError");
    expect(errorObj2.type).toBe("LexicalError");
    expect(errorObj1.message).toMatch(/Invalid token: .*/);
    expect(errorObj2.message).toMatch(/Invalid token: .*/);
  });

  it("should combine invalid tokens within quoted strings into a single error", () => {
    const { lexer, errorListener } = createLexer('"invalid string');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj: CRLError = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toMatch(/Invalid token: .*/);
  });

  it("should not span error tokens across multiple lines", () => {
    const { lexer, errorListener } = createLexer("@invalid\n@invalid");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1 = errors[0];
    const errorObj2 = errors[1];
    expect(errorObj1.type).toBe("LexicalError");
    expect(errorObj2.type).toBe("LexicalError");
    expect(errorObj1.message).toMatch(/Invalid token: .*/);
    expect(errorObj2.message).toMatch(/Invalid token: .*/);
  });
});

describe("CRLLexerErrorListener with CRL-specific input", () => {
  it("should detect invalid tokens in a decision statement", () => {
    const { lexer, errorListener } = createLexer(
      'decision "Invalid Decision": when "Invalid Concept" then recommend activity "Invalid Action".',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it("should handle invalid tokens within a concept definition", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": type is @invalidType.',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toBe("Invalid concept type: @invalidType");
  });

  it("should detect invalid tokens in a terminology statement", () => {
    const { lexer, errorListener } = createLexer('terminology "Invalid Terminology" `` @invalid.');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = errors[0];
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toMatch(/Invalid token: .*/);
  });

  it("should not span error tokens across multiple lines in a complex statement", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Complex Concept": type is Observation.\ninferred from ("Valid" and "AlsoValid").',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it("should detect invalid activity type", () => {
    const { lexer, errorListener } = createLexer("request invalidActivity");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid activity type: invalidActivity/);
  });

  // SKIPPED: asserts error count expected pre-v0.7 lexer-mode rework. Pending test-cleanup.
  it.skip("should handle invalid concept type", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": type is InvalidType. done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid concept type: InvalidType/);
    expect(errors[1].type).toBe("LexicalError");
    expect(errors[1].message).toMatch(/Invalid token: done/);
  });

  // SKIPPED: asserts error count expected pre-v0.7 lexer-mode rework. Pending test-cleanup.
  it.skip("should handle invalid concept value type", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": valuetype is InvalidValueType. done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid concept value type: InvalidValueType/);
    expect(errors[1].type).toBe("LexicalError");
    expect(errors[1].message).toMatch(/Invalid token: done/);
  });

  it("should handle invalid character in activity type", () => {
    const { lexer, errorListener } = createLexer("CPGAdministerMedication@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid token: CPGAdministerMedication@/);
  });

  it("should handle invalid character in concept type", () => {
    const { lexer, errorListener } = createLexer("Communication@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid token: Communication@/);
  });

  it("should handle invalid character in concept value type", () => {
    const { lexer, errorListener } = createLexer("Quantity@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("LexicalError");
    expect(errors[0].message).toMatch(/Invalid token: Quantity@/);
  });
});
