import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/antlr/CPGLLexer';
import { createLexer } from '../createLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';
import { getTokensFromString } from './helpers';

describe('Comments', () => {
  describe('Single-line Comments', () => {
    it('should ignore single-line comments in decision blocks', () => {
      const input = `decision "Test Decision"
    // This is a comment about the condition
    when "Condition" then
        // This is a comment about the action
        do "Action"
`;

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it('should handle single-line comments at the start of cpgl', () => {
      const input = `// This is a comment
decision "Test"
    when "Condition" then
        do "Action"
`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
      ]);
    });
  });

  describe('Block Comments', () => {
    it('should ignore block comments between tokens', () => {
      const input = `decision /* block comment */ "Test" // line comment
    when "Condition" /* another comment */ then
        do "Action"
`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it('should ignore block comments in terminology statements', () => {
      const input = `terminology /* name */ "BMI Valueset" /* type */ valueset /* value */ "bmi valueset" /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.VALUESET,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DOT,
      ]);
    });

    it('should ignore block comments in activity statements', () => {
      const input = `activity /* name */ "Vaccinate" /* action */ perform /* type */ CPGImmunizationRequest /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
        CPGLLexer.DOT,
      ]);
    });

    it('should ignore block comments in concept statements', () => {
      const input = `concept /* name */ "BMI" /* start */ :
    /* type */ has type /* value */ Observation /* end */ .
    /* valuetype */ has valuetype /* value */ Quantity /* end */ .
    /* inference */ inferred by /* expr */ ("BMI Range" /* or */ or /* value */ "BMI Value") /* end */ .
done`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.HAS,
        CPGLLexer.TYPE,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.HAS,
        CPGLLexer.VALUETYPE,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.LPAREN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.OR,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });
  });

  describe('Comments in Expressions', () => {
    it('should handle comments between tokens in expressions', () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action" /* comment */ and /* another comment */ "Action 2"
`;

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.AND,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it('should handle comments in complex expressions', () => {
      const input = `when /* start */ ("Condition 1" /* and */ and /* next */ "Condition 2" /* or */ or /* last */ "Condition 3") /* end */ then`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.WHEN,
        CPGLLexer.LPAREN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.AND,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.OR,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.THEN,
      ]);
    });
  });
});
