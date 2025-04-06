/**
 * Tests for the custom CPGL lexer
 * 
 * IMPORTANT: These tests verify the functionality of our custom lexer implementation.
 * They should NOT use the generated lexer directly for token generation.
 * 
 * The generated lexer is only used for reference and constant access.
 */
import { CharStreams } from 'antlr4ts';
import { TokenTypes } from './CPGLLexerConstants';
import { CPGLLexer } from './CPGLLexer';
import type { CPGLToken } from './CPGLToken';

// Token type constants for readability
const NEWLINE = '\n';
const INDENT = '    ';
const DEDENT = '<DEDENT>';

describe('CPGLLexer', () => {
  it('should handle basic tokens', () => {
    const input = 'decision "test"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe(TokenTypes.DECISION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.EOF);
  });

  it('should handle indentation', () => {
    const lexer = new CPGLLexer(CharStreams.fromString('decision "test"\nwhen "condition" then\ndo "action"\n'));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(11);
    expect(tokens[0].type).toBe(TokenTypes.DECISION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[3].type).toBe(TokenTypes.WHEN);
    expect(tokens[4].type).toBe(TokenTypes.STRING);
    expect(tokens[5].type).toBe(TokenTypes.THEN);
    expect(tokens[6].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[7].type).toBe(TokenTypes.DO);
    expect(tokens[8].type).toBe(TokenTypes.STRING);
    expect(tokens[9].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[10].type).toBe(TokenTypes.EOF);
  });

  it('should handle comments', () => {
    const input = `// comment
decision "test"`;
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe(TokenTypes.DECISION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.EOF);
  });

  it('should handle block comments', () => {
    const input = `/* comment */
decision "test"`;
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe(TokenTypes.DECISION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.EOF);
  });

  it('should handle errors', () => {
    const lexer = new CPGLLexer(CharStreams.fromString('@invalid'));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe(TokenTypes.ERROR);
    expect(tokens[0].text).toBe('@');
    expect(tokens[1].type).toBe(TokenTypes.ERROR);
    expect(tokens[1].text).toBe('invalid');
    expect(tokens[2].type).toBe(TokenTypes.EOF);
  });

  describe('tokenize', () => {
    it('should tokenize keywords correctly', () => {
      const input = 'decision when then do use action fhirtype casefeature valuetype casefeaturecode profileurl any all';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(14);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenTypes.DECISION,
        TokenTypes.WHEN,
        TokenTypes.THEN,
        TokenTypes.DO,
        TokenTypes.USE,
        TokenTypes.ACTION,
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE,
        TokenTypes.VALUETYPE,
        TokenTypes.CASEFEATURECODE,
        TokenTypes.PROFILEURL,
        TokenTypes.ANY,
        TokenTypes.ALL,
        TokenTypes.EOF,
      ]);
    });

    it('should tokenize when statement with any qualifier correctly', () => {
      const lexer = new CPGLLexer(CharStreams.fromString('decision "test"\nany\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(13);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.ANY,
        TokenTypes.NEWLINE,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize when statement with all qualifier correctly', () => {
      const lexer = new CPGLLexer(CharStreams.fromString('decision "test"\nall\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(13);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.ALL,
        TokenTypes.NEWLINE,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });

    it('should tokenize when statement without qualifier correctly', () => {
      const lexer = new CPGLLexer(CharStreams.fromString('decision "test"\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(11);
      expect(tokens.map((t) => t.type)).toEqual([
        TokenTypes.DECISION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.WHEN,
        TokenTypes.STRING,
        TokenTypes.THEN,
        TokenTypes.NEWLINE,
        TokenTypes.DO,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.EOF
      ]);
    });
  });

  it('should tokenize casefeature with all required fields', () => {
    const input = `casefeature "Test Feature"
    casefeaturecode "test-code"
    fhirtype Condition
    profileurl "http://example.com"
    valuetype boolean`;
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);

    expect(tokens.length).toBe(17);
    expect(tokens[0].type).toBe(TokenTypes.CASEFEATURE);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[3].type).toBe(TokenTypes.INDENT);
    expect(tokens[4].type).toBe(TokenTypes.CASEFEATURECODE);
    expect(tokens[5].type).toBe(TokenTypes.STRING);
    expect(tokens[6].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[7].type).toBe(TokenTypes.FHIRTYPE);
    expect(tokens[8].type).toBe(TokenTypes.CASEFEATURE_FHIR_TYPE);
    expect(tokens[9].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[10].type).toBe(TokenTypes.PROFILEURL);
    expect(tokens[11].type).toBe(TokenTypes.STRING);
    expect(tokens[12].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[13].type).toBe(TokenTypes.VALUETYPE);
    expect(tokens[14].type).toBe(TokenTypes.FHIR_VALUE_TYPE);
    expect(tokens[15].type).toBe(TokenTypes.DEDENT);
    expect(tokens[16].type).toBe(TokenTypes.EOF);
  });

  it('should tokenize action with fhirtype', () => {
    const input = `action "Test Action"
    fhirtype ServiceRequest`;
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);

    expect(tokens.length).toBe(8);
    expect(tokens[0].type).toBe(TokenTypes.ACTION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[3].type).toBe(TokenTypes.INDENT);
    expect(tokens[4].type).toBe(TokenTypes.FHIRTYPE);
    expect(tokens[5].type).toBe(TokenTypes.ACTION_FHIR_TYPE);
    expect(tokens[6].type).toBe(TokenTypes.DEDENT);
    expect(tokens[7].type).toBe(TokenTypes.EOF);
  });

  it('should handle inconsistent indentation', () => {
    const input = 'decision "test"\n    when "condition" then\n  do "action"';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow('Inconsistent indentation');
  });

  it('should tokenize a complete CPGL document', () => {
    const input = `decision "Test Decision"
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        do "Action 2"
        use "Another Decision"
    `;
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(27);
    expect(tokens[0].type).toBe(TokenTypes.DECISION);
    expect(tokens[1].type).toBe(TokenTypes.STRING);
    expect(tokens[2].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[3].type).toBe(TokenTypes.INDENT);
    expect(tokens[4].type).toBe(TokenTypes.WHEN);
    expect(tokens[5].type).toBe(TokenTypes.STRING);
    expect(tokens[6].type).toBe(TokenTypes.THEN);
    expect(tokens[7].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[8].type).toBe(TokenTypes.INDENT);
    expect(tokens[9].type).toBe(TokenTypes.DO);
    expect(tokens[10].type).toBe(TokenTypes.STRING);
    expect(tokens[11].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[12].type).toBe(TokenTypes.DEDENT);
    expect(tokens[13].type).toBe(TokenTypes.WHEN);
    expect(tokens[14].type).toBe(TokenTypes.STRING);
    expect(tokens[15].type).toBe(TokenTypes.THEN);
    expect(tokens[16].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[17].type).toBe(TokenTypes.INDENT);
    expect(tokens[18].type).toBe(TokenTypes.DO);
    expect(tokens[19].type).toBe(TokenTypes.STRING);
    expect(tokens[20].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[21].type).toBe(TokenTypes.USE);
    expect(tokens[22].type).toBe(TokenTypes.STRING);
    expect(tokens[23].type).toBe(TokenTypes.NEWLINE);
    expect(tokens[24].type).toBe(TokenTypes.DEDENT);
    expect(tokens[25].type).toBe(TokenTypes.DEDENT);
    expect(tokens[26].type).toBe(TokenTypes.EOF);
  });

  it('should handle indentation with newline resets', () => {
    const input = `decision "cycle1"
    when "condition" then
        use "cycle2"

decision "cycle2"
    when "condition" then
        use "cycle1"
`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.map(t => t.type)).toEqual([
      TokenTypes.DECISION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.WHEN,
      TokenTypes.STRING,
      TokenTypes.THEN,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.USE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.DEDENT,
      TokenTypes.NEWLINE,
      TokenTypes.DECISION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.WHEN,
      TokenTypes.STRING,
      TokenTypes.THEN,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.USE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.DEDENT,
      TokenTypes.EOF,
    ]);
  });

  it('should handle indentation with newline resets and top-level keywords', () => {
    const input = `decision "cycle1"
    when "condition" then
        use "cycle2"

action "action1"
    fhirtype Appointment

casefeature "feature1"
    casefeaturecode "code1"
    fhirtype Condition
    valuetype string
    profileurl "http://example.com"
`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.map(t => t.type)).toEqual([
      TokenTypes.DECISION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.WHEN,
      TokenTypes.STRING,
      TokenTypes.THEN,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.USE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.DEDENT,
      TokenTypes.NEWLINE,
      TokenTypes.ACTION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.FHIRTYPE,
      TokenTypes.ACTION_FHIR_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.NEWLINE,
      TokenTypes.CASEFEATURE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.CASEFEATURECODE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.FHIRTYPE,
      TokenTypes.CASEFEATURE_FHIR_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.VALUETYPE,
      TokenTypes.FHIR_VALUE_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.PROFILEURL,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.EOF,
    ]);
  });

  it('should handle indentation reset with action keyword', () => {
    const input = `decision "cycle1"
    when "condition" then
        use "cycle2"

action "action1"
    fhirtype Appointment
`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.map(t => t.type)).toEqual([
      TokenTypes.DECISION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.WHEN,
      TokenTypes.STRING,
      TokenTypes.THEN,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.USE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.DEDENT,
      TokenTypes.NEWLINE,
      TokenTypes.ACTION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.FHIRTYPE,
      TokenTypes.ACTION_FHIR_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.EOF,
    ]);
  });

  it('should handle indentation reset with casefeature keyword', () => {
    const input = `decision "cycle1"
    when "condition" then
        use "cycle2"

casefeature "feature1"
    casefeaturecode "code1"
    fhirtype Condition
    valuetype string
    profileurl "http://example.com"
`;

    const lexer = new CPGLLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.map(t => t.type)).toEqual([
      TokenTypes.DECISION,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.WHEN,
      TokenTypes.STRING,
      TokenTypes.THEN,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.USE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.DEDENT,
      TokenTypes.NEWLINE,
      TokenTypes.CASEFEATURE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.INDENT,
      TokenTypes.CASEFEATURECODE,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.FHIRTYPE,
      TokenTypes.CASEFEATURE_FHIR_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.VALUETYPE,
      TokenTypes.FHIR_VALUE_TYPE,
      TokenTypes.NEWLINE,
      TokenTypes.PROFILEURL,
      TokenTypes.STRING,
      TokenTypes.NEWLINE,
      TokenTypes.DEDENT,
      TokenTypes.EOF,
    ]);
  });

  it('should throw error for inconsistent indentation within block', () => {
    const input = `decision "cycle1"
${INDENT}when "condition" then
${NEWLINE}${INDENT}${INDENT}use "cycle2"
${NEWLINE}${INDENT}  use "cycle3"`; // 2 spaces instead of 4
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    
    expect(() => {
      getAllTokens(lexer);
    }).toThrow('Inconsistent indentation');
  });

  it('should throw error for non-multiple-of-4 indentation', () => {
    const input = `decision "cycle1"
${NEWLINE}
${INDENT}when "condition" then
${NEWLINE}${INDENT}${INDENT}use "cycle2"
${NEWLINE}${INDENT}   use "cycle3"`; // 3 spaces
    const lexer = new CPGLLexer(CharStreams.fromString(input));
    
    expect(() => {
      getAllTokens(lexer);
    }).toThrow('Inconsistent indentation');
  });
});

function getAllTokens(lexer: CPGLLexer): Array<{ type: number; text: string }> {
  const tokens: Array<{ type: number; text: string }> = [];
  let token = lexer.nextToken();
  while (token.type !== TokenTypes.EOF) {
    tokens.push({ type: token.type, text: token.text ?? '' });
    token = lexer.nextToken();
  }
  tokens.push({ type: token.type, text: token.text ?? '' }); // Add EOF token
  return tokens;
}
