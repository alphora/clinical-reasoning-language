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
    describe('Single Action Statements', () => {
      it('should handle single action statements with dot terminator', () => {
        const input = `decision "Test":
    when "Condition" then do "Action".
    when "Another Condition" then use "Another Decision".
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
          CPGLLexer.DOT,
          CPGLLexer.WHEN,
          CPGLLexer.STRING,
          CPGLLexer.THEN,
          CPGLLexer.USE,
          CPGLLexer.STRING,
          CPGLLexer.DOT,
          CPGLLexer.DONE,
        ]);
      });
    });

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

  describe('Terminology Structure', () => {
    it('should handle terminology with valueset', () => {
      const input = `terminology "BMI Valueset" valueset "bmi valueset".`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.STRING,
        CPGLLexer.VALUESET,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
      ]);
    });

    it('should handle terminology with unknown', () => {
      const input = `terminology "some terminology" unknown.`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.STRING,
        CPGLLexer.UNKNOWN,
        CPGLLexer.DOT,
      ]);
    });

    it('should handle terminology with system and code', () => {
      const input = `terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.STRING,
        CPGLLexer.SYSTEM,
        CPGLLexer.STRING,
        CPGLLexer.CODE,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
      ]);
    });
  });

  describe('Activity Structure', () => {
    it('should handle basic activity statements', () => {
      const input = `activity "Vaccinate" perform CPGImmunization.`;
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

    it('should handle activity statements with of clause', () => {
      const input = `activity "Indicate" perform CPGProposeDiagnosis of "Colonoscopy".`;
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

  describe('Concept Structure', () => {
    it('should handle basic concept with type and value type', () => {
      const input = `concept "Most Recent BMI":
    has type Observation.
    has valuetype boolean.
    coded by "BMI Valueset".
done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.HAS,
        CPGLLexer.TYPE,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.HAS,
        CPGLLexer.VALUETYPE,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.CODED,
        CPGLLexer.BY,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle concept with provenance', () => {
      const input = `concept "BMI":
    has type Observation.
    has valuetype Quantity.
    has provenance "some provenance".
    inferred by "Most Recent(this, lookbackMonths)" "BMI".
done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.STRING,
        CPGLLexer.COLON,
        CPGLLexer.HAS,
        CPGLLexer.TYPE,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.HAS,
        CPGLLexer.VALUETYPE,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.HAS,
        CPGLLexer.PROVENANCE,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.STRING,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle concept with inferred by expression', () => {
      const input = `concept "BMI":
    has type Observation.
    has valuetype Quantity.
    inferred by ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").
done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.STRING,
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
        CPGLLexer.STRING,
        CPGLLexer.OR,
        CPGLLexer.STRING,
        CPGLLexer.OR,
        CPGLLexer.STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle concept with inferred by expression using AND', () => {
      const input = `concept "Complex BMI":
    has type Observation.
    has valuetype Quantity.
    inferred by ("BMI Range" and "Height Record" and "Weight Record").
done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.STRING,
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
        CPGLLexer.STRING,
        CPGLLexer.AND,
        CPGLLexer.STRING,
        CPGLLexer.AND,
        CPGLLexer.STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle concept with inferred by expression using mixed AND/OR', () => {
      const input = `concept "Complex BMI":
    has type Observation.
    has valuetype Quantity.
    inferred by ("BMI Range" and ("Height Record" or "Estimated Height") and "Weight Record").
done`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.STRING,
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
        CPGLLexer.STRING,
        CPGLLexer.AND,
        CPGLLexer.LPAREN,
        CPGLLexer.STRING,
        CPGLLexer.OR,
        CPGLLexer.STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.AND,
        CPGLLexer.STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });
  });
});
