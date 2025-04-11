import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Integration', () => {
  describe('Token Order and Sequence', () => {
    it('should handle token order in basic blocks', () => {
      const input = `decision "Test":
    when "Condition" then
        do "Action"
    done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle token order in complex nested blocks', () => {
      const input = `decision "Test":
    when "Level 1" then
        all:
        when "Level 2" then
            any:
            when "Level 3" then
                do "Action 1"
                do "Action 2"
            when "Level 3b" then
                use "Action 3"
    done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.ALL,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.ANY,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.DO,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.USE,
        CPGLLexer.STRING,
        CPGLLexer.DONE,
      ]);
    });
  });

  describe('Decision Structure', () => {
    describe('Multiple When Clauses', () => {
      it('should handle decision with multiple when clauses at same level', () => {
        const input = `decision "Elderly Based":
    any:
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "somthing else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
    done`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          CPGLLexer.DECISION,
          CPGLLexer.STRING,
          CPGLLexer.COLON,
          CPGLLexer.ANY,
          CPGLLexer.COLON,
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.USE,
          CPGLLexer.STRING,
          CPGLLexer.USE,
          CPGLLexer.STRING,
          CPGLLexer.DONE,
        ]);
      });

      it('should handle decision with multiple when clauses and different terminal actions', () => {
        const input = `decision "Test Decision":
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        use "Another Decision"
    when "Condition 3" then
        do "Action 2"
        do "Action 3"
    done`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          CPGLLexer.DECISION,
          CPGLLexer.STRING,
          CPGLLexer.COLON,
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
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.DONE,
        ]);
      });

      it('should handle decision with multiple when clauses and empty lines', () => {
        const input = `decision "Test Decision":
    when "Condition 1" then
        do "Action 1"

    when "Condition 2" then
        use "Another Decision"

    when "Condition 3" then
        do "Action 2"
    done`;

        const lexer = new CPGLLexer(CharStreams.fromString(input));
        const tokens = getAllTokens(lexer);

        verifyTokenSequence(tokens, [
          CPGLLexer.DECISION,
          CPGLLexer.STRING,
          CPGLLexer.COLON,
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
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.DO,
          CPGLLexer.STRING,
          CPGLLexer.DONE,
        ]);
      });
    });
  });
});
