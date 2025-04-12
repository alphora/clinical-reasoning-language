import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('Whitespace Handling', () => {
  describe('Basic Whitespace', () => {
    it('should skip newlines between tokens', () => {
      const input = 'decision\nwhen\nthen\ndo';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.WHEN,
        CPGLLexer.THEN,
        CPGLLexer.DO,
      ]);
    });

    it('should skip spaces between tokens', () => {
      const input = 'decision "Test Decision"    when "Condition"  then    do "Action"';
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

    it('should handle consecutive whitespace', () => {
      const input = 'decision    "Test"  \t  when  \n\n  "Condition"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
      ]);
    });

    it('should handle leading and trailing whitespace', () => {
      const input = '\n  \t decision "Test" when "Condition" \n  ';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.STRING,
        CPGLLexer.WHEN,
        CPGLLexer.STRING,
      ]);
    });
  });

  describe('Whitespace in Terminology Statements', () => {
    it('should handle whitespace in terminology valueset statements', () => {
      const input = 'terminology\n  "BMI Valueset"\n\t\tvalueset\n  "bmi valueset"\t.';
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

    it('should handle whitespace in terminology system code statements', () => {
      const input = 'terminology\n"term"\n  system\t"sys"\n  code\t"123"\t.';
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

  describe('Whitespace in Activity Statements', () => {
    it('should handle whitespace in activity statements', () => {
      const input = 'activity\n  "Vaccinate"\n\t\tperform\n  CPGImmunization\t.';
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

    it('should handle whitespace in activity statements with of clause', () => {
      const input = 'activity\n"Action"\n  perform\tCPGProposeDiagnosis\n  of\t"diagnosis"\t.';
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

  describe('Whitespace in Concept Statements', () => {
    it('should handle whitespace in concept type declarations', () => {
      const input = 'concept\n"BMI"\n  :\n    has\ttype\n  Observation\t.';
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
      ]);
    });

    it('should handle whitespace in concept value type declarations', () => {
      const input = 'has\n  valuetype\t\tQuantity\n.';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.HAS,
        CPGLLexer.VALUETYPE,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
      ]);
    });

    it('should handle whitespace in concept inferred by expressions', () => {
      const input =
        'inferred\n  by\t(\n"Condition 1"\n  and\t"Condition 2"\n  or\t"Condition 3"\n)\t.';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.LPAREN,
        CPGLLexer.STRING,
        CPGLLexer.AND,
        CPGLLexer.STRING,
        CPGLLexer.OR,
        CPGLLexer.STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
      ]);
    });
  });

  describe('Whitespace in Decision Blocks', () => {
    it('should handle whitespace in nested decision blocks', () => {
      const input = `decision\n  "Test"\n:\n  when\n    "Level 1"\n  then\n    when\n      "Level 2"\n    then\n      do\n        "Action"\n    .\ndone`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it('should handle whitespace in any/all clauses', () => {
      const input =
        'when\n  "Condition"\nthen\n  :\n    any\n      :\n        do\n          "Action 1"\n        .\n        do\n          "Action 2"\n        .\n    done\ndone';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      verifyTokenSequence(tokens, [
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.ANY,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DOT,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
        CPGLLexer.DONE,
      ]);
    });
  });
});
