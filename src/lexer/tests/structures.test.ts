import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Structures', () => {
  describe('Decision Structure', () => {
    it('should tokenize basic decision blocks', () => {
      const input = `decision "Test Decision"
    when "Condition" then
        do "Action"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.STRING,
      ]);
    });

    it('should tokenize nested when clauses with different qualifiers', () => {
      const input = `decision "Test Decision"
    when "Condition 1" then
        all
        when "Subcondition 1" then
            do "Action 1"
        when "Subcondition 2" then
            any
            when "Subsubcondition 1" then
                do "Action 2"
            when "Subsubcondition 2" then
                use "Another Decision"`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.ALL,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.ANY,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.USE,
        CPGLLexer.STRING,
      ]);
    });

    it('should tokenize activity statements', () => {
      const input = `activity "Vaccinate" perform ImmunizationActivity.`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
        CPGLLexer.DOT,
      ]);
    });

    it('should tokenize activity statements with of clause', () => {
      const input = `activity "Indicate" perform ProposeDiagnosisActivity of "Colonoscopy".`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
        CPGLLexer.OF,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
      ]);
    });
  });
});
