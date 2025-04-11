import { CharStream, CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getActionTokenSequence, getCaseFeatureTokenSequence } from './fhir-types.helpers';

function verifyTokenSequence(
  input: CharStream,
  expectedTokens: number[],
  expectedText: string[],
): void {
  const lexer = new CPGLLexer(input);
  const tokens = [];
  const text = [];

  let token = lexer.nextToken();
  while (token.type !== CPGLLexer.EOF) {
    tokens.push(token.type);
    text.push(token.text || '');
    token = lexer.nextToken();
  }

  expect(tokens).toEqual(expectedTokens);
  expect(text).toEqual(expectedText);
}

describe('Action FHIR Types', () => {
  test('should recognize action type in context', () => {
    const input = 'perform ServiceRequestActivity.';
    const expectedTokens = getActionTokenSequence();
    const expectedText = ['perform', 'ServiceRequestActivity', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should throw error for invalid action type', () => {
    const input = 'perform InvalidActivity.';
    expect(() => {
      const expectedTokens = getActionTokenSequence();
      const expectedText = ['perform', 'InvalidActivity', '.'];
      verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
    }).toThrow();
  });
});

describe('Case Feature FHIR Types', () => {
  test('should recognize case feature type in context', () => {
    const input = 'has type Observation.';
    const expectedTokens = getCaseFeatureTokenSequence();
    const expectedText = ['has', 'type', 'Observation', '.'];
    verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
  });

  test('should throw error for invalid case feature type', () => {
    const input = 'has type InvalidType.';
    expect(() => {
      const expectedTokens = getCaseFeatureTokenSequence();
      const expectedText = ['has', 'type', 'InvalidType', '.'];
      verifyTokenSequence(CharStreams.fromString(input), expectedTokens, expectedText);
    }).toThrow();
  });
});
