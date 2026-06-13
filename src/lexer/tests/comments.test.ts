import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString, verifyTokenSequence } from "./helpers";

describe("Comments", () => {
  describe("Single-line Comments", () => {
    it("should ignore single-line comments in decision blocks", () => {
      const input = `decision "Test Decision":
    // This is a comment about the condition
    when "Condition" then
        // This is a comment about the action
        recommend activity "Action".
`;

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle single-line comments at the start of crl", () => {
      const input = `// This is a comment
decision "Test":
    when "Condition" then
        recommend activity "Action".
`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Block Comments", () => {
    it("should ignore block comments between tokens", () => {
      const input = `decision /* block comment */ "Test": // line comment
    when "Condition" /* another comment */ then
        recommend activity "Action".
`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should ignore block comments in terminology statements", () => {
      const input = `terminology /* name */ "BMI Valueset":\n /* type */ - valueset is /* value */ \`bmi valueset\` /* end */ .`;
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

    it("should ignore block comments in activity statements", () => {
      const input = `activity /* name */ "Vaccinate" /* action */ request /* type */ CPGImmunizationRequest /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax. Pending test-cleanup.
    it.skip("should ignore block comments in concept statements", () => {
      const input = `concept /* name */ "BMI" /* start */ :
    /* type */ - type is /* value */ Observation /* end */ .
    /* valuetype */ - value type is Quantity /* end */ .
    /* inference */ - inferred from /* expr */ ("BMI Range" /* or */ or /* value */ "BMI Value") /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.VALUE_TYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.DEFINED_AS,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Comments in Expressions", () => {
    it("should handle comments between tokens in expressions", () => {
      const input = `decision "Test":
    - when "Condition" then:
        - recommend activity "Action" /* comment */.
        - recommend activity "Action 2" /* another comment */.
   end.
`;

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.RECOMMEND_ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.END,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax. Pending test-cleanup.
    it.skip("should handle comments in complex expressions", () => {
      const input = `inferred from /* start */ ("Condition 1" /* and */ and /* next */ "Condition 2" /* or */ or /* last */ "Condition 3") /* end */.`;
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
});
