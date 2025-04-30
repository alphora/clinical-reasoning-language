import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

describe("Structures", () => {
  describe("Decision Structure", () => {
    it("should tokenize basic decision blocks", () => {
      const input = `decision "Test Decision":
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
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize nested when clauses with different qualifiers", () => {
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
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ALL,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.ANY,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.USE,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize activity statements", () => {
      const input = `activity "Vaccinate" perform CPGImmunizationRequest.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.PERFORM,
        CRLLexer.ACTIVITY_TYPE,
        CRLLexer.DOT,
      ]);
    });

    it("should tokenize activity statements with of clause", () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis with "Colonoscopy".';
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

  describe("Terminology Structure", () => {
    it("should tokenize terminology with valueset", () => {
      const input = 'terminology "BMI Valueset" valueset `bmi valueset`.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.VALUESET,
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
      const input = 'terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.';
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

  describe("Concept Structure", () => {
    it("should tokenize basic concept with type and value type", () => {
      const input =
        'concept "Most Recent BMI":\n    type is Observation.\n    valuetype is boolean.\ndone';

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
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize concept with provenance and coded by", () => {
      const input =
        'concept "BMI Range as a Condition":\n    type is Condition.\n    valuetype is CodeableConcept.\n    evidence is `some provenance`.\n    coded from "BMI Valueset".\ndone';

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
        CRLLexer.EVIDENCE,
        CRLLexer.IS,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.CODED,
        CRLLexer.FROM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DOT,
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize concept with inferred by pattern", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.\ndone';

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
        CRLLexer.QUOTED_STRING,
        CRLLexer.APPLY,
        CRLLexer.PATTERN,
        CRLLexer.BACKTICK_STRING,
        CRLLexer.DOT,
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize concept with inferred by expression", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").\ndone';

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
        CRLLexer.OR,
        CRLLexer.QUOTED_STRING,
        CRLLexer.RPAREN,
        CRLLexer.DOT,
        CRLLexer.DONE,
      ]);
    });
  });
});
