import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens } from './index.test';

describe('Lexer Error Handling', () => {
  it('should throw an exception with line number for invalid characters', () => {
    const inputs = ['@invalid', '$tokens', '#notallowed', '~invalid', '`backtick'];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line 1:\d+ - Invalid character:/);
    });
  });

  it('should throw an exception for unterminated strings', () => {
    const inputs = [
      '"unterminated string',
      '"string with\nnewline',
      'decision "unclosed string\nthen do "Action".',
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line \d+:\d+ - Unterminated string/);
    });
  });

  it('should include line and character position in error messages', () => {
    const testCases = [
      {
        input: '@invalid',
        expectedError: /Line 1:0 - Invalid character: @/,
      },
      {
        input: 'done\n@invalid',
        expectedError: /Line 2:0 - Invalid character: @/,
      },
      {
        input: 'done\n  @invalid',
        expectedError: /Line 2:2 - Invalid character: @/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });
});
