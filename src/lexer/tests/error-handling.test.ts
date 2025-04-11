import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens } from './index.test';

describe('Error Handling', () => {
  it('should throw an exception with line number for invalid tokens', () => {
    const input = '@invalid\n$tokens\n#notallowed';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow(/Line 1:/);
  });

  it('should throw an exception with line number for unterminated strings', () => {
    const input = 'decision\n"unterminated string\nthen do "Action".';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow(/Line 2:/);
  });

  it('should throw an exception with line number for invalid activity types', () => {
    const inputs = [
      // Invalid activity type
      'activity "Test"\nperform InvalidActivity',
      // Invalid activity type case
      'activity "Test"\nperform immunizationactivity',
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line \d+:/);
    });
  });

  it('should throw an exception with line number for invalid concept types', () => {
    const inputs = [
      // Invalid concept type
      'concept "Test":\nhas type InvalidType\nhas valuetype Quantity\ndone',
      // Invalid concept type case
      'concept "Test":\nhas type observation\nhas valuetype Quantity\ndone',
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line \d+:/);
    });
  });

  it('should throw an exception with line number for invalid concept value types', () => {
    const inputs = [
      // Invalid value type
      'concept "Test":\nhas type Observation\nhas valuetype InvalidType\ndone',
      // Invalid value type case
      'concept "Test":\nhas type Observation\nhas valuetype quantity\ndone',
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line \d+:/);
    });
  });

  it('should include specific error messages for invalid types', () => {
    const testCases = [
      {
        input: 'activity "Test"\nperform InvalidActivity',
        expectedError: /Invalid activity type/i,
      },
      {
        input: 'concept "Test":\nhas type InvalidType\nhas valuetype Quantity\ndone',
        expectedError: /Invalid concept type/i,
      },
      {
        input: 'concept "Test":\nhas type Observation\nhas valuetype InvalidType\ndone',
        expectedError: /Invalid concept value type/i,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should include line and character position in error messages', () => {
    const input = 'activity "Test"\nperform InvalidActivity';
    const lexer = new CPGLLexer(CharStreams.fromString(input));

    expect(() => {
      getAllTokens(lexer);
    }).toThrow(/Line 2:\d+/);
  });
});
