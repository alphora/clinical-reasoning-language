import { CommonTokenStream } from "antlr4ts";

import { createLexer } from "../createLexer";

describe("CRLLexerErrorListener", () => {
  it("should detect individual invalid tokens", () => {
    const { lexer, errorListener } = createLexer("invalid");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid token:");
    expect(errorObj.details.message).toContain("token recognition error");
  });

  it("should treat whitespace-separated invalid tokens as separate errors", () => {
    const { lexer, errorListener } = createLexer("invalid1 invalid2");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1 = JSON.parse(errors[0]);
    const errorObj2 = JSON.parse(errors[1]);
    expect(errorObj1.type).toBe("LexicalError");
    expect(errorObj2.type).toBe("LexicalError");
    expect(errorObj1.message).toContain("Invalid token:");
    expect(errorObj2.message).toContain("Invalid token:");
    expect(errorObj1.details.message).toContain("token recognition error");
    expect(errorObj2.details.message).toContain("token recognition error");
  });

  it("should combine invalid tokens within quoted strings into a single error", () => {
    const { lexer, errorListener } = createLexer('"invalid string');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.details.message).toContain("token recognition error");
  });

  it("should not span error tokens across multiple lines", () => {
    const { lexer, errorListener } = createLexer("invalid\ninvalid");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(2);
    const errorObj1 = JSON.parse(errors[0]);
    const errorObj2 = JSON.parse(errors[1]);
    expect(errorObj1.type).toBe("LexicalError");
    expect(errorObj2.type).toBe("LexicalError");
    expect(errorObj1.message).toContain("Invalid token:");
    expect(errorObj2.message).toContain("Invalid token:");
  });
});

describe("CRLLexerErrorListener with CRL-specific input", () => {
  it("should detect invalid tokens in a decision statement", () => {
    const { lexer, errorListener } = createLexer(
      'decision "Invalid Decision": when "Invalid Concept" then do "Invalid Action". done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it("should handle invalid tokens within a concept definition", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": type is InvalidType. done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept type: InvalidType");
  });

  it("should detect invalid tokens in a terminology statement", () => {
    const { lexer, errorListener } = createLexer('terminology "Invalid Terminology" `` invalid.');
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid token:");
  });

  it("should not span error tokens across multiple lines in a complex statement", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Complex Concept": type is Observation.\ninferred from ("Invalid" and "Another Invalid"). done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(0);
  });

  it("should detect invalid activity type", () => {
    const { lexer, errorListener } = createLexer("perform invalidActivity");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid activity type: invalidActivity");
  });

  it("should handle invalid concept type", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": type is InvalidType. done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept type: InvalidType");
  });

  it("should handle invalid concept value type", () => {
    const { lexer, errorListener } = createLexer(
      'concept "Invalid Concept": valuetype is InvalidValueType. done',
    );
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid concept value type: InvalidValueType");
  });

  it("should handle invalid character in activity type", () => {
    const { lexer, errorListener } = createLexer("CPGAdministerMedication@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid character in activity type:");
  });

  it("should handle invalid character in concept type", () => {
    const { lexer, errorListener } = createLexer("Communication@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid character in concept type:");
  });

  it("should handle invalid character in concept value type", () => {
    const { lexer, errorListener } = createLexer("Quantity@");
    const tokenStream = new CommonTokenStream(lexer);
    tokenStream.fill();
    const errors = errorListener.getErrors();
    expect(errors.length).toBe(1);
    const errorObj = JSON.parse(errors[0]);
    expect(errorObj.type).toBe("LexicalError");
    expect(errorObj.message).toContain("Invalid character in concept value type:");
  });
});
