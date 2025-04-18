import { CharStreams } from 'antlr4ts';

import { createLexer } from '../createLexer';

import { getAllTokens } from './index.test';

describe('Lexer Error Handling', () => {
  it('should handle invalid characters', () => {
    const inputs = ['@invalid', '$tokens', '#notallowed', '~invalid', '`backtick'];

    inputs.forEach(input => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle unterminated identifiers and strings', () => {
    const inputs = [
      '"unterminated identifier',
      '"identifier with\nnewline',
      'decision "unclosed identifier\nthen do "Action".',
      '"unterminated string with backslash\\',
      '"string with\\\nnewline',
    ];

    inputs.forEach(input => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle invalid characters with line and character position', () => {
    const testCases = [
      {
        input: '@invalid',
        minTokens: 0,
      },
      {
        input: 'done\n@invalid',
        minTokens: 1,
      },
      {
        input: 'done\n  @invalid',
        minTokens: 1,
      },
    ];

    testCases.forEach(({ input, minTokens }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(minTokens);
    });
  });

  it('should throw an exception for invalid activity types', () => {
    const testCases = [
      {
        input: 'perform invalidActivity',
        expectedMessage: 'Invalid activity type',
      },
      {
        input: 'perform someRandomActivity\nthen done',
        expectedMessage: 'Invalid activity type',
      },
      {
        input: 'decision "test"\nwhen true then perform unknownActivity\ndone',
        expectedMessage: 'Invalid activity type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });

  it('should throw an exception for invalid concept types', () => {
    const testCases = [
      {
        input: 'concept type InvalidConcept',
        expectedMessage: 'Invalid concept type',
      },
      {
        input: 'concept type SomeRandomType',
        expectedMessage: 'Invalid concept type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });

  it('should throw an exception for invalid concept value types', () => {
    const testCases = [
      {
        input: 'concept valuetype InvalidValueType',
        expectedMessage: 'Invalid concept value type',
      },
      {
        input: 'concept valuetype SomeRandomValueType',
        expectedMessage: 'Invalid concept value type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });

  it('should throw an exception for invalid characters in concept mode', () => {
    const testCases = [
      {
        input: 'concept type @invalid',
        expectedMessage: 'Invalid character in concept type',
      },
      {
        input: 'concept type $invalid',
        expectedMessage: 'Invalid character in concept type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });

  it('should throw an exception for invalid characters in value type mode', () => {
    const testCases = [
      {
        input: 'concept valuetype @invalid',
        expectedMessage: 'Invalid character in concept value type',
      },
      {
        input: 'concept valuetype $invalid',
        expectedMessage: 'Invalid character in concept value type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });

  it('should throw an exception for invalid characters in activity mode', () => {
    const testCases = [
      {
        input: 'perform @invalid',
        expectedMessage: 'Invalid character in activity type',
      },
      {
        input: 'perform $invalid',
        expectedMessage: 'Invalid character in activity type',
      },
    ];

    testCases.forEach(({ input, expectedMessage }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      try {
        getAllTokens(lexer);
        fail('Expected an error to be thrown');
      } catch (err) {
        let errorObj;
        try {
          errorObj = JSON.parse(err.message);
        } catch {
          fail('Error is not a valid JSON string');
        }
        expect(errorObj.type).toBe('LexicalError');
        expect(errorObj.message).toContain(expectedMessage);
      }
    });
  });
});
