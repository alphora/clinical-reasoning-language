import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens } from './index.test';

describe('Error Handling', () => {
  it('should throw an exception for invalid tokens', () => {
    const input = '@invalid $tokens';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow();
  });

  it('should throw an exception for unterminated strings', () => {
    const input = '"unterminated string';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow();
  });

  it('should throw an exception for invalid indentation patterns', () => {
    const inputs = [
      `decision "Test"
  when "Invalid Indent" then  // 2 spaces
      do "Action"`,
      `decision "Test"
    when "Mixed Indent" then
    \tdo "Action"`, // Mix of spaces and tab
      `decision "Test"
    when "Inconsistent Indent" then
            do "Action"  // 8 spaces instead of 4
`,
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  it('should throw an exception for missing newlines', () => {
    const inputs = [
      `decision "Test" when "No Newline" then do "Action"`, // No newlines
      `decision "Test"
    when "Missing Newline" then do "Action"`, // Missing newline after then
      `decision "Test"
    when "Condition" then
        do "Action" when "Another" then  // Missing newline between blocks
`,
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  it('should throw an exception for invalid boolean expressions', () => {
    const inputs = [
      `casefeature "Test"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Condition" AND)`, // Missing right operand
      `casefeature "Test"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (AND "Condition")`, // Missing left operand
      `casefeature "Test"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Condition" AND "Condition 2"`, // Unmatched parentheses
      `casefeature "Test"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (NOT AND "Condition")`, // Invalid operator sequence
      `casefeature "Test"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Condition" OR OR "Condition 2")  // Duplicate operators
`,
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  it('should throw error for invalid composite expressions', () => {
    const inputs = [
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (NOT "Condition 1" AND)`, // Missing right operand
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (AND "Condition 1")`, // Missing left operand
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Condition 1" OR OR "Condition 2")`, // Duplicate operators
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression (NOT NOT "Condition")`, // Multiple NOTs without parentheses
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression ("Condition 1" AND "Condition 2"`, // Unmatched parentheses
      `casefeature "Invalid Expression"
    casefeaturecode "Test Code"
    profileurl "Test URL"
    valuetype string
    expression "Condition 1" AND "Condition 2")  // Unmatched parentheses
`,
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow();
    });
  });
});
