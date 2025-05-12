import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

describe("Integration", () => {
  describe("Token Order and Sequence", () => {
    it("should handle token order in basic blocks", () => {
      const input = `decision "Test":
    when "Condition" then
        do "Action"
    done`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ERROR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
      ]);
    });

    it("should handle token order in complex nested blocks", () => {
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
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ALL_BLOCK,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ANY_BLOCK,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ERROR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ERROR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
      ]);
    });
  });

  describe("Decision Structure", () => {
    describe("Single Action Statements", () => {
      it("should handle single action statements with dot terminator", () => {
        const input = `decision "Test":
    when "Condition" then do "Action".
    when "Another Condition" then use "Another Decision".
done`;
        const tokens = getTokensFromString(input);

        verifyTokenSequence(tokens, [
          CRLLexer.DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.COLON,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
          CRLLexer.DOT,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
          CRLLexer.ERROR,
        ]);
      });
    });

    describe("Multiple When Clauses", () => {
      it("should handle decision with multiple when clauses at same level", () => {
        const input = `decision "Elderly Based":
    any:
    when "Client Age Greater Than 60" then
        do "Indicate"
    when "Client Age Less Than 60" then
        do "Vaccinate"
        do "another thing"
        do "something else"
    when "Client Age Greater Than 60" then
        use "Elderly Based"
        use "IMMZ.D2.D5.Measles"
    done`;

        const tokens = getTokensFromString(input);

        verifyTokenSequence(tokens, [
          CRLLexer.DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.COLON,
          CRLLexer.ANY_BLOCK,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
          CRLLexer.ERROR,
          CRLLexer.ERROR,
        ]);
      });

      it("should handle decision with multiple when clauses and different terminal actions", () => {
        const input = `decision "Test Decision":
    when "Condition 1" then
        do "Action 1"
    when "Condition 2" then
        use "Another Decision"
    when "Condition 3" then
        do "Action 2"
        do "Action 3"
    done`;

        const tokens = getTokensFromString(input);

        verifyTokenSequence(tokens, [
          CRLLexer.DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.COLON,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
        ]);
      });

      it("should handle decision with multiple when clauses and empty lines", () => {
        const input = `decision "Test Decision":
    when "Condition 1" then
        do "Action 1"

    when "Condition 2" then
        use "Another Decision"

    when "Condition 3" then
        do "Action 2"
    done`;

        const tokens = getTokensFromString(input);

        verifyTokenSequence(tokens, [
          CRLLexer.DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.COLON,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.ERROR,
          CRLLexer.QUOTED_STRING,
          CRLLexer.ERROR,
        ]);
      });
    });
  });

  describe("Terminology Structure", () => {
    it("should handle terminology with valueset", () => {
      const input = `terminology "BMI Valueset" valueset "bmi valueset".`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.VALUESET,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle terminology with unknown terminology", () => {
      const input = `terminology "some terminology" \`\`.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should handle terminology with system and code", () => {
      const input = `terminology "Colonoscopy" system "http://snomed.info/sct" code "73761001".`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.SYSTEM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.CODE,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Activity Structure", () => {
    it("should handle basic activity statements", () => {
      const input = `activity "Vaccinate" perform CPGImmunizationRequest.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should handle activity statements with of clause", () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis with "Colonoscopy".';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.ERROR,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Concept Structure", () => {
    it("should handle basic concept with type and value type", () => {
      const input =
        'concept "Most Recent BMI":\n    type is Observation.\n    valuetype is boolean.\n    coded from "BMI Valueset".\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.CODED_FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.ERROR,
      ]);
    });

    it("should handle concept with provenance", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    evidence is `some provenance`.\n    inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.EVIDENCE_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.INFERRED_FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.APPLY_PATTERN,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.ERROR,
      ]);
    });

    it("should handle concept with inferred by expression", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.INFERRED_FROM,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
        CRLLexer.ERROR,
      ]);
    });

    it("should handle concept with inferred by expression using AND", () => {
      const input =
        'concept "Complex BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from ("BMI Range" and "Height Record" and "Weight Record").\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.INFERRED_FROM,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
        CRLLexer.ERROR,
      ]);
    });

    it("should handle concept with inferred by expression using mixed AND/OR", () => {
      const input =
        'concept "Complex BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from ("BMI Range" and ("Height Record" or "Estimated Height") and "Weight Record").\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DOT,
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.INFERRED_FROM,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.LPAREN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
        CRLLexer.ERROR,
      ]);
    });
  });
});
