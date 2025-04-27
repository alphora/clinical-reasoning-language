import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";

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
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DONE,
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
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.ALL,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.ANY,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.USE,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DONE,
      ]);
    });

    it("should tokenize activity statements", () => {
      const input = `activity "Vaccinate" perform CPGImmunizationRequest.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
        CPGLLexer.DOT,
      ]);
    });

    it("should tokenize activity statements with of clause", () => {
      const input = 'activity "Indicate" perform CPGProposeDiagnosis with "Colonoscopy".';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
        CPGLLexer.WITH,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DOT,
      ]);
    });
  });

  describe("Terminology Structure", () => {
    it("should tokenize terminology with valueset", () => {
      const input = 'terminology "BMI Valueset" valueset `bmi valueset`.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.VALUESET,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.DOT,
      ]);
    });

    it("should tokenize terminology with unknown", () => {
      const input = `terminology "some terminology" \`\`.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.DOT,
      ]);
    });

    it("should tokenize terminology with system and code", () => {
      const input = 'terminology "Colonoscopy" system `http://snomed.info/sct` code `73761001`.';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.SYSTEM,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.CODE,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.DOT,
      ]);
    });
  });

  describe("Concept Structure", () => {
    it("should tokenize basic concept with type and value type", () => {
      const input =
        'concept "Most Recent BMI":\n    type is Observation.\n    valuetype is boolean.\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.TYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.VALUETYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it("should tokenize concept with provenance and coded by", () => {
      const input =
        'concept "BMI Range as a Condition":\n    type is Condition.\n    valuetype is CodeableConcept.\n    evidence is `some provenance`.\n    coded from "BMI Valueset".\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.TYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.VALUETYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.EVIDENCE,
        CPGLLexer.IS,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.DOT,
        CPGLLexer.CODED,
        CPGLLexer.FROM,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it("should tokenize concept with inferred by pattern", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from "BMI" apply pattern `Most Recent(this, lookbackMonths)`.\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.TYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.VALUETYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.INFERRED,
        CPGLLexer.FROM,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.APPLY,
        CPGLLexer.PATTERN,
        CPGLLexer.BACKTICK_STRING,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });

    it("should tokenize concept with inferred by expression", () => {
      const input =
        'concept "BMI":\n    type is Observation.\n    valuetype is Quantity.\n    inferred from ("BMI Range as a Condition" or "BMI as an Observation" or "Calculated BMI").\ndone';

      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.TYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.VALUETYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_VALUE_TYPE,
        CPGLLexer.DOT,
        CPGLLexer.INFERRED,
        CPGLLexer.FROM,
        CPGLLexer.LPAREN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.OR,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.OR,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.RPAREN,
        CPGLLexer.DOT,
        CPGLLexer.DONE,
      ]);
    });
  });
});
