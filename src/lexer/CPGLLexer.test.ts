/* eslint-disable no-console */
import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from './CPGLLexer';
import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

describe('CPGLLexer', () => {
  it('should handle basic tokens', () => {
    const input = 'decision "test"';
    const lexer = new GeneratedLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
    expect(tokens[1].type).toBe(GeneratedLexer.STRING);
    expect(tokens[2].type).toBe(GeneratedLexer.EOF);
  });

  it('should handle indentation', () => {
    const lexer = new GeneratedLexer(CharStreams.fromString('decision "test"\nwhen "condition" then\ndo "action"\n'));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(11);
    expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
    expect(tokens[1].type).toBe(GeneratedLexer.STRING);
    expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[3].type).toBe(GeneratedLexer.WHEN);
    expect(tokens[4].type).toBe(GeneratedLexer.STRING);
    expect(tokens[5].type).toBe(GeneratedLexer.THEN);
    expect(tokens[6].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[7].type).toBe(GeneratedLexer.DO);
    expect(tokens[8].type).toBe(GeneratedLexer.STRING);
    expect(tokens[9].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[10].type).toBe(GeneratedLexer.EOF);
  });

  it('should handle comments', () => {
    const input = `// comment
decision "test"`;
    const lexer = new GeneratedLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(4);
    expect(tokens[0].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[1].type).toBe(GeneratedLexer.DECISION);
    expect(tokens[2].type).toBe(GeneratedLexer.STRING);
    expect(tokens[3].type).toBe(GeneratedLexer.EOF);
  });

  it('should handle block comments', () => {
    const input = `/* comment */
decision "test"`;
    const lexer = new GeneratedLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(4);
    expect(tokens[0].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[1].type).toBe(GeneratedLexer.DECISION);
    expect(tokens[2].type).toBe(GeneratedLexer.STRING);
    expect(tokens[3].type).toBe(GeneratedLexer.EOF);
  });

  it('should handle errors', () => {
    const lexer = new GeneratedLexer(CharStreams.fromString('@invalid'));
    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(8);
    expect(tokens[0].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[1].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[2].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[3].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[4].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[5].type).toBe(GeneratedLexer.ERROR);
    expect(tokens[6].type).toBe(GeneratedLexer.FHIR_VALUE_TYPE);
    expect(tokens[7].type).toBe(GeneratedLexer.EOF);
  });

  describe('tokenize', () => {
    it('should tokenize keywords correctly', () => {
      const input = 'decision when then do use action fhirtype casefeature valuetype code url any all';
      const lexer = new GeneratedLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(14);
      expect(tokens.map((t) => t.type)).toEqual([
        GeneratedLexer.DECISION,
        GeneratedLexer.WHEN,
        GeneratedLexer.THEN,
        GeneratedLexer.DO,
        GeneratedLexer.USE,
        GeneratedLexer.ACTION,
        GeneratedLexer.FHIRTYPE,
        GeneratedLexer.CASEFEATURE,
        GeneratedLexer.VALUETYPE,
        GeneratedLexer.CODE,
        GeneratedLexer.URL,
        GeneratedLexer.ANY,
        GeneratedLexer.ALL,
        GeneratedLexer.EOF,
      ]);
    });

    it('should tokenize when statement with any qualifier correctly', () => {
      const lexer = new GeneratedLexer(CharStreams.fromString('decision "test"\nany\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(13);
      expect(tokens.map((t) => t.type)).toEqual([
        GeneratedLexer.DECISION,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.ANY,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.WHEN,
        GeneratedLexer.STRING,
        GeneratedLexer.THEN,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.DO,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.EOF
      ]);
    });

    it('should tokenize when statement with all qualifier correctly', () => {
      const lexer = new GeneratedLexer(CharStreams.fromString('decision "test"\nall\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(13);
      expect(tokens.map((t) => t.type)).toEqual([
        GeneratedLexer.DECISION,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.ALL,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.WHEN,
        GeneratedLexer.STRING,
        GeneratedLexer.THEN,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.DO,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.EOF
      ]);
    });

    it('should tokenize when statement without qualifier correctly', () => {
      const lexer = new GeneratedLexer(CharStreams.fromString('decision "test"\nwhen "condition" then\ndo "action"\n'));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBe(11);
      expect(tokens.map((t) => t.type)).toEqual([
        GeneratedLexer.DECISION,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.WHEN,
        GeneratedLexer.STRING,
        GeneratedLexer.THEN,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.DO,
        GeneratedLexer.STRING,
        GeneratedLexer.NEWLINE,
        GeneratedLexer.EOF
      ]);
    });
  });

  it('should tokenize casefeature with all required fields', () => {
    const input = `casefeature "Test Feature"
    code "test-code"
    fhirtype Condition
    url "http://example.com"
    valuetype boolean`;
    const lexer = new GeneratedLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);

    expect(tokens.length).toBe(15);
    expect(tokens[0].type).toBe(GeneratedLexer.CASEFEATURE);
    expect(tokens[1].type).toBe(GeneratedLexer.STRING);
    expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[3].type).toBe(GeneratedLexer.CODE);
    expect(tokens[4].type).toBe(GeneratedLexer.STRING);
    expect(tokens[5].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[6].type).toBe(GeneratedLexer.FHIRTYPE);
    expect(tokens[7].type).toBe(GeneratedLexer.CASEFEATURE_FHIR_TYPE);
    expect(tokens[8].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[9].type).toBe(GeneratedLexer.URL);
    expect(tokens[10].type).toBe(GeneratedLexer.STRING);
    expect(tokens[11].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[12].type).toBe(GeneratedLexer.VALUETYPE);
    expect(tokens[13].type).toBe(GeneratedLexer.FHIR_VALUE_TYPE);
    expect(tokens[14].type).toBe(GeneratedLexer.EOF);
  });

  it('should tokenize action with fhirtype', () => {
    const input = `action "Test Action"
    fhirtype ServiceRequest`;
    const lexer = new GeneratedLexer(CharStreams.fromString(input));
    const tokens = getAllTokens(lexer);

    expect(tokens.length).toBe(6);
    expect(tokens[0].type).toBe(GeneratedLexer.ACTION);
    expect(tokens[1].type).toBe(GeneratedLexer.STRING);
    expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[3].type).toBe(GeneratedLexer.FHIRTYPE);
    expect(tokens[4].type).toBe(GeneratedLexer.ACTION_FHIR_TYPE);
    expect(tokens[5].type).toBe(GeneratedLexer.EOF);
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
        use "Another Decision"`;
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    const tokens = getAllTokens(lexer);
    expect(tokens.length).toBe(26);
    expect(tokens[0].type).toBe(GeneratedLexer.DECISION);
    expect(tokens[1].type).toBe(GeneratedLexer.STRING);
    expect(tokens[2].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[3].type).toBe(GeneratedLexer.INDENT);
    expect(tokens[4].type).toBe(GeneratedLexer.WHEN);
    expect(tokens[5].type).toBe(GeneratedLexer.STRING);
    expect(tokens[6].type).toBe(GeneratedLexer.THEN);
    expect(tokens[7].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[8].type).toBe(GeneratedLexer.INDENT);
    expect(tokens[9].type).toBe(GeneratedLexer.DO);
    expect(tokens[10].type).toBe(GeneratedLexer.STRING);
    expect(tokens[11].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[12].type).toBe(GeneratedLexer.DEDENT);
    expect(tokens[13].type).toBe(GeneratedLexer.WHEN);
    expect(tokens[14].type).toBe(GeneratedLexer.STRING);
    expect(tokens[15].type).toBe(GeneratedLexer.THEN);
    expect(tokens[16].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[17].type).toBe(GeneratedLexer.INDENT);
    expect(tokens[18].type).toBe(GeneratedLexer.DO);
    expect(tokens[19].type).toBe(GeneratedLexer.STRING);
    expect(tokens[20].type).toBe(GeneratedLexer.NEWLINE);
    expect(tokens[21].type).toBe(GeneratedLexer.USE);
    expect(tokens[22].type).toBe(GeneratedLexer.STRING);
    expect(tokens[23].type).toBe(GeneratedLexer.DEDENT);
    expect(tokens[24].type).toBe(GeneratedLexer.DEDENT);
    expect(tokens[25].type).toBe(GeneratedLexer.EOF);
    });
});

function getAllTokens(lexer: GeneratedLexer): Array<{ type: number; text: string }> {
  const tokens: Array<{ type: number; text: string }> = [];
  let token = lexer.nextToken();
  while (token.type !== -1) {
    tokens.push({ type: token.type, text: token.text || '' });
    token = lexer.nextToken();
  }
  tokens.push({ type: -1, text: '<EOF>' });
  return tokens;
}
