import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString, verifyTokenSequence } from "./helpers";

describe("Structures", () => {
  describe("Decision Structure", () => {
    it("should tokenize basic decision blocks", () => {
      const input = `decision "Test Decision":
    - when "Condition" then
        ERROR.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ERROR,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize nested when clauses with different qualifiers", () => {
      const input = `decision "Test Decision":
    - when "Condition 1" then:
        all:
            - when "Subcondition 1" then
                ERROR.
        - when "Subcondition 2" then:
            any:
                - when "Subsubcondition 1" then
                    ERROR.
                - when "Subsubcondition 2" then
                    use decision ERROR.
       - end when
    - end when`;
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
        CRLLexer.ERROR,
        CRLLexer.DOT,
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
        CRLLexer.ERROR,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.USE_DECISION,
        CRLLexer.ERROR,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.END_WHEN,
        CRLLexer.DASH,
        CRLLexer.END_WHEN,
      ]);
    });

    it("should tokenize activity statements", () => {
      const input = `activity "Vaccinate" request CPGImmunizationRequest.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize activity statements with of clause", () => {
      const input = 'activity "Indicate" request CPGProposeDiagnosisTask with "Colonoscopy".';
      const tokens = getTokensFromString(input);

      // [DEBUGGING] Print actual and expected token types for diagnosis
      // eslint-disable-next-line no-console
      console.log(
        "[DEBUGGING] Actual token types:",
        tokens.map((t) => t.type),
      );
      // eslint-disable-next-line no-console
      console.log("[DEBUGGING] Expected token types:", [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.WITH,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Terminology Structure", () => {
    it("should tokenize terminology with valueset", () => {
      const input = 'terminology "BMI Valueset" is valueset `bmi valueset`.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.IS_VALUESET,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize terminology with unknown", () => {
      const input = `terminology "some terminology" \`\`.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize terminology with system and code", () => {
      const input =
        'terminology "Colonoscopy" is system `http://snomed.info/sct` and code `73761001`.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.IS_SYSTEM,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.AND_CODE,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });
  });

  describe("Concept Structure", () => {
    it("should tokenize basic concept with type and value type", () => {
      const input =
        'concept "Most Recent BMI":\n   - type is Observation.\n   - valuetype is boolean.';

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
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize concept with provenance and coded by", () => {
      const input =
        'concept "BMI Range as a Condition":\n   - type is Condition.\n   - valuetype is CodeableConcept.\n   - evidence is `some provenance`.\n   - coded from "BMI Valueset".';

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
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.EVIDENCE_IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.CODED_FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize concept with inferred by pattern", () => {
      const input =
        'concept "BMI":\n   - type is Observation.\n   - valuetype is Quantity.\n   - inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.';

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
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.INFERRED_FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.APPLY_PATTERN,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize concept with inferred by expression", () => {
      const input =
        'concept "BMI":\n   - type is Observation.\n   - valuetype is Quantity.\n   - inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").';

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
        CRLLexer.VALUETYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
        CRLLexer.DOT,
        CRLLexer.DASH,
        CRLLexer.INFERRED_FROM,
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
  });
});
