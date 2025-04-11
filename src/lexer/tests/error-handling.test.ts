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

  it('should throw an exception with line number for invalid boolean expressions', () => {
    const inputs = [
      // Missing right operand
      'concept "Invalid":\nhas type Observation\nhas valuetype Quantity\ninferred by ("Condition" and)\ndone',
      // Missing left operand
      'concept "Invalid":\nhas type Observation\nhas valuetype Quantity\ninferred by (and "Condition")\ndone',
      // Unmatched parentheses
      'concept "Invalid":\nhas type Observation\nhas valuetype Quantity\ninferred by ("Condition" and "Condition 2"\ndone',
      // Invalid operator sequence
      'concept "Invalid":\nhas type Observation\nhas valuetype Quantity\ninferred by (and or "Condition")\ndone',
      // Duplicate operators
      'concept "Invalid":\nhas type Observation\nhas valuetype Quantity\ninferred by ("Condition" or or "Condition 2")\ndone',
    ];

    inputs.forEach(input => {
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(/Line \d+:/);
    });
  });

  it('should throw an exception with line number for invalid activity types', () => {
    const inputs = [
      // Invalid activity type
      'activity "Test"\nperform InvalidActivity',
      // Missing activity type
      'activity "Test"\nperform',
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
      // Missing concept type
      'concept "Test":\nhas type\nhas valuetype Quantity\ndone',
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
