import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString, verifyTokenSequence } from "./helpers";

describe("Whitespace Handling", () => {
  describe("Basic Whitespace", () => {
    it("should skip newlines between tokens", () => {
      const input = "decision\nwhen\nthen\rrecommend activity";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.WHEN,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
      ]);
    });

    it("should skip spaces between tokens", () => {
      const input =
        'decision "Test Decision":   - when "Condition"  then    recommend activity "Action".';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle consecutive whitespace", () => {
      const input = 'decision    "Test":  \t - when  \n\n  "Condition"';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should handle leading and trailing whitespace", () => {
      const input = '\n  \t decision "Test": - when "Condition" \n  ';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
      ]);
    });
  });

  describe("Whitespace in Terminology Statements", () => {
    it("should handle whitespace in terminology valueset statements", () => {
      const input = 'terminology\n  "BMI Valueset":\n\t\t- valueset is\n  `bmi valueset`\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.VALUESET_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in terminology system code statements", () => {
      const input = 'terminology\n"term":\n - system is\t`sys`.\n- code is\t`123`\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.SYSTEM_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.CODE_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Whitespace in Activity Statements", () => {
    it("should handle whitespace in activity statements", () => {
      const input = 'activity\n  "Vaccinate":\n\t\t- request\n  CPGImmunizationRequest\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in activity statements with of clause", () => {
      const input =
        'activity\n"Action":\n - request\tCPGProposeDiagnosis\n - with\t"diagnosis"\t.';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DASH,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Whitespace in Concept Statements", () => {
    it("should handle whitespace in concept type declarations", () => {
      const input = 'concept\n"BMI"\n  :\n   - type is\n  Observation\t.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in concept value type declarations", () => {
      const input = "- value type is\t\tQuantity\n.";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DASH,
        CRLLexer.VALUE_TYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
    it.skip("should handle whitespace in concept inferred by expressions", () => {
      const input =
        'inferred from\t(\n"Condition 1"\n  and\t"Condition 2"\n  or\t"Condition 3"\n)\t.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DEFINED_AS,
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
      const input = `decision\n  "Test"\n:\n  - when\n    "Level 1"\n  then\n    - when\n      "Level 2"\n    then\n      recommend activity\n        "Action"\n    .`;
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle whitespace in any/all clauses", () => {
      const input =
        'when\n  "Condition"\nthen:\n    any:\n       -  recommend activity\n          "Action 1"\n        .\n        - recommend activity\n          "Action 2"\n        .';
      const tokens = getTokensFromString(input);
      verifyTokenSequence(tokens, [
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.ANY_BLOCK,
        CRLLexer.DASH,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });
});
