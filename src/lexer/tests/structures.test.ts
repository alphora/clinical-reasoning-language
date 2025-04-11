import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Structures', () => {
  describe('Decision Structure', () => {
    it('should tokenize basic decision blocks', () => {
      const input = `decision "Test Decision":
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

    it('should tokenize nested when clauses with different qualifiers', () => {
      const input = `decision "Test Decision":
    when "Condition 1" then
        all:
        when "Subcondition 1" then
            do "Action 1"
        when "Subcondition 2" then
            any:
            when "Subsubcondition 1" then
                do "Action 2"
            when "Subsubcondition 2" then
                use "Another Decision"
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
        CPGLLexer.DO,
        CPGLLexer.STRING,
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
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
        CPGLLexer.THEN,
        CPGLLexer.USE,
        CPGLLexer.STRING,
        CPGLLexer.DONE,
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

  describe('Terminology Structure', () => {
    it('should tokenize terminology with valueset', () => {
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

    it('should tokenize terminology with unknown', () => {
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

    it('should tokenize terminology with system and code', () => {
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

  describe('Concept Structure', () => {
    it('should tokenize basic concept with type and value type', () => {
      const input = `concept "Most Recent BMI":
    has type Observation.
    has valuetype boolean.
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
        CPGLLexer.DONE,
      ]);
    });

    it('should tokenize concept with provenance and coded by', () => {
      const input = `concept "BMI Range as a Condition":
    has type Condition.
    has valuetype CodeableConcept.
    has provenance "some provenance".
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
        CPGLLexer.HAS,
        CPGLLexer.PROVENANCE,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.CODED,
        CPGLLexer.BY,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should tokenize concept with inferred by pattern', () => {
      const input = `concept "BMI":
    has type Observation.
    has valuetype Quantity.
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
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.STRING,
        CPGLLexer.STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should tokenize concept with inferred by expression', () => {
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
  });
});
