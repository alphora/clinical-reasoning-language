import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

describe("Whitespace Handling", () => {
  describe("Basic Whitespace", () => {
    it("should skip newlines between tokens", () => {
      const input = "decision\nwhen\nthen\ndo";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.WHEN,
        CRLLexer.THEN,
        CRLLexer.DO,
      ]);
    });

    it("should skip spaces between tokens", () => {
      const input = 'decision "Test Decision"    when "Condition"  then    do "Action"';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should handle consecutive whitespace", () => {
      const input = 'decision    "Test"  \t  when  \n\n  "Condition"';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should handle leading and trailing whitespace", () => {
      const input = '\n  \t decision "Test" when "Condition" \n  ';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
      ]);
    });
  });

  describe("Whitespace in Terminology Statements", () => {
    it("should handle whitespace in terminology valueset statements", () => {
      const input = 'terminology\n  "BMI Valueset"\n\t\tvalueset\n  `bmi valueset`\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.VALUESET,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in terminology system code statements", () => {
      const input = 'terminology\n"term"\n  system\t`sys`\n  code\t`123`\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.SYSTEM,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.CODE,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Whitespace in Activity Statements", () => {
    it("should handle whitespace in activity statements", () => {
      const input = 'activity\n  "Vaccinate"\n\t\tperform\n  CPGImmunizationRequest\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.PERFORM,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in activity statements with of clause", () => {
      const input = 'activity\n"Action"\n  perform\tCPGProposeDiagnosis\n  with\t"diagnosis"\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.PERFORM,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Whitespace in Concept Statements", () => {
    it("should handle whitespace in concept type declarations", () => {
      const input = 'concept\n"BMI"\n  :\n    type\tis\n  Observation\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in concept value type declarations", () => {
      const input = "valuetype\n  is\t\tQuantity\n.";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.VALUETYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in concept inferred by expressions", () => {
      const input =
        'inferred\n  from\t(\n"Condition 1"\n  and\t"Condition 2"\n  or\t"Condition 3"\n)\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.INFERRED,
        CRLLexer.FROM,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Whitespace in Decision Blocks", () => {
    it("should handle whitespace in nested decision blocks", () => {
      const input = `decision\n  "Test"\n:\n  when\n    "Level 1"\n  then\n    when\n      "Level 2"\n    then\n      do\n        "Action"\n    .\ndone`;
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DONE,
      ]);
    });

    it("should handle whitespace in any/all clauses", () => {
      const input =
        'when\n  "Condition"\nthen\n  :\n    any\n      :\n        do\n          "Action 1"\n        .\n        do\n          "Action 2"\n        .\n    done\ndone';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.ANY,
        CRLLexer.COLON,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DONE,
        CRLLexer.DONE,
      ]);
    });
  });
});
