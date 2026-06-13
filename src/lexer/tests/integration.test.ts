import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString, verifyTokenSequence } from "./helpers";

describe("Integration", () => {
  describe("Token Order and Sequence", () => {
    it("should handle token order in basic blocks", () => {
      const input = `decision "Test":
    - when "Condition" then
        recommend activity "Action".`;
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

    it("should handle token order in complex nested blocks", () => {
      const input = `decision "Test":
    - when "Level 1" then:
        all:
        - when "Level 2" then:
            any:
            - when "Level 3" then:
                - recommend activity "Action 1".
                - recommend activity "Action 2".
            - end
            - when "Level 3b" then use decision "Action 3".
        - end
    - end`;
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
        CRLLexer.ALL_BLOCK,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.ANY_BLOCK,
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
        CRLLexer.DASH,
        CRLLexer.END,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.USE_DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.END,
        CRLLexer.DASH,
        CRLLexer.END,
      ]);
    });
  });

  describe("Decision Structure", () => {
    describe("Single Action Statements", () => {
      it("should handle single action statements with dot terminator", () => {
        const input = `decision "Test":
    - when "Condition" then recommend activity "Action".
    - when "Another Condition" then use decision "Another Decision".`;
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
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.USE_DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
        ]);
      });
    });

    describe("Multiple When Clauses", () => {
      it("should handle decision with multiple when clauses at same level", () => {
        const input = `decision "Elderly Based":
    any:
   - when "Client Age Greater Than 60" then
        recommend activity "Indicate".
    - when "Client Age Less Than 60" then:
        - recommend activity "Vaccinate".
        - recommend activity "another thing".
    - end
    - when "Client Age Greater Than 60" then:
        - use decision "Elderly Based".
        - use decision "IMMZ.D2.D5.Measles".
    - end`;

        const tokens = getTokensFromString(input);

        verifyTokenSequence(tokens, [
          CRLLexer.DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.COLON,
          CRLLexer.ANY_BLOCK,
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.RECOMMEND_ACTIVITY,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
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
          CRLLexer.DASH,
          CRLLexer.END,
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.COLON,
          CRLLexer.DASH,
          CRLLexer.USE_DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
          CRLLexer.DASH,
          CRLLexer.USE_DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
          CRLLexer.DASH,
          CRLLexer.END,
        ]);
      });

      it("should handle decision with multiple when clauses and different terminal actions", () => {
        const input = `decision "Test Decision":
   - when "Condition 1" then
      recommend activity "Action 1".
   - when "Condition 2" then
       use decision "Another Decision".
   - when "Condition 3" then:
        - recommend activity  "Action 2".
        - recommend activity "Action 3".
    - end`;

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
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.USE_DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
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
          CRLLexer.DASH,
          CRLLexer.END,
        ]);
      });

      it("should handle decision with multiple when clauses and empty lines", () => {
        const input = `decision "Test Decision":
    - when "Condition 1" then
        recommend activity "Action 1".

    - when "Condition 2" then
        use decision "Another Decision".

    - when "Condition 3" then
      recommend activity "Action 2".`;

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
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.USE_DECISION,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
          CRLLexer.DASH,
          CRLLexer.WHEN,
          CRLLexer.QUOTED_STRING,
          CRLLexer.THEN,
          CRLLexer.RECOMMEND_ACTIVITY,
          CRLLexer.QUOTED_STRING,
          CRLLexer.DOT,
        ]);
      });
    });
  });

  describe("Terminology Structure", () => {
    it("should handle terminology with valueset", () => {
      const input = `terminology "BMI Valueset":\n- valueset is \`bmi valueset\`.`;
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

    it("should handle terminology with unknown terminology", () => {
      const input = `terminology "some terminology":\n- valueset is \`\`.`;
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

    it("should handle terminology with system and code", () => {
      const input = `terminology "Colonoscopy":\n- system is \`http://snomed.info/sct\`.\n- code is \`73761001\`.`;
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

  describe("Activity Structure", () => {
    it("should handle basic activity statements", () => {
      const input = `activity "Vaccinate":\n- request CPGImmunizationRequest.`;
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

    it("should handle activity statements with clause", () => {
      const input = `activity "Indicate":\n- request CPGProposeDiagnosis.\n- with "Colonoscopy".`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Concept Structure", () => {
    it("should handle basic concept with type and value type", () => {
      const input =
        'concept "Most Recent BMI":\n    - type is Observation.\n    - value type is boolean.\n    - coded from "BMI Valueset".';

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
        CRLLexer.CODED_FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax. Pending test-cleanup.
    it.skip("should handle concept with provenance", () => {
      const input =
        'concept "BMI":\n    - type is Observation.\n    - value type is Quantity.\n    - evidence is `some provenance`.\n    -  inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.';

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
        CRLLexer.EVIDENCE_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.DEFINED_AS,
        CRLLexer.QUOTED_STRING,
        CRLLexer.APPLY_PATTERN,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
    it.skip("should handle concept with inferred by expression", () => {
      const input =
        'concept "BMI":\n    - type is Observation.\n   - value type is Quantity.\n  -  inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").';

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
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
    it.skip("should handle concept with inferred by expression using AND", () => {
      const input =
        'concept "Complex BMI":\n  - type is Observation.\n   - value type is Quantity.\n   - inferred from ("BMI Range" and "Height Record" and "Weight Record").';

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
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.AND,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
      ]);
    });

    // SKIPPED: pre-v0.7 syntax (inferred by). Pending test-cleanup.
    it.skip("should handle concept with inferred by expression using mixed AND/OR", () => {
      const input =
        'concept "Complex BMI":\n  -  type is Observation.\n  -  value type is Quantity.\n  -  inferred from ("BMI Range" and ("Height Record" or "Estimated Height") and "Weight Record").';

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
      ]);
    });
  });
});
