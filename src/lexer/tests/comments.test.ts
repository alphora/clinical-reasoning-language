import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

describe("Comments", () => {
  describe("Single-line Comments", () => {
    it("should ignore single-line comments in decision blocks", () => {
      const input = `decision "Test Decision"
    // This is a comment about the condition
    when "Condition" then
        // This is a comment about the action
        do "Action"
`;

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

    it("should handle single-line comments at the start of crl", () => {
      const input = `// This is a comment
decision "Test"
    when "Condition" then
        do "Action"
`;
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
  });

  describe("Block Comments", () => {
    it("should ignore block comments between tokens", () => {
      const input = `decision /* block comment */ "Test" // line comment
    when "Condition" /* another comment */ then
        do "Action"
`;
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

    it("should ignore block comments in terminology statements", () => {
      const input = `terminology /* name */ "BMI Valueset" /* type */ valueset /* value */ "bmi valueset" /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.VALUESET,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should ignore block comments in activity statements", () => {
      const input = `activity /* name */ "Vaccinate" /* action */ perform /* type */ CPGImmunizationRequest /* end */ .`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.PERFORM,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should ignore block comments in concept statements", () => {
      const input = `concept /* name */ "BMI" /* start */ :
    /* type */ type is /* value */ Observation /* end */ .
    /* valuetype */ valuetype /* value */ is Quantity /* end */ .
    /* inference */ inferred from /* expr */ ("BMI Range" /* or */ or /* value */ "BMI Value") /* end */ .
done`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.INFERRED,
        CRLLexer.FROM,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
        CRLLexer.DONE,
      ]);
    });
  });

  describe("Comments in Expressions", () => {
    it("should handle comments between tokens in expressions", () => {
      const input = `decision "Test"
    when "Condition" then
        do "Action" /* comment */ and /* another comment */ "Action 2"
`;

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should handle comments in complex expressions", () => {
      const input = `when /* start */ ("Condition 1" /* and */ and /* next */ "Condition 2" /* or */ or /* last */ "Condition 3") /* end */ then`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.WHEN,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.THEN,
      ]);
    });
  });
});
