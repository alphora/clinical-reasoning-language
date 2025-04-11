import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../CPGLLexer';

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
});
