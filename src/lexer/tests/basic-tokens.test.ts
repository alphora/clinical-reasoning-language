import { CPGLLexer } from "../../grammar/generated/antlr/CPGLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

// TODO: update tests to use BACKTICK_STRING (instead of STRING)

describe("CPGL Lexer - Basic Tokens", () => {
  describe("Keywords", () => {
    it("should tokenize decision statement", () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action"\n    done';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DONE,
      ]);
    });

    it("should tokenize decision statement with multiple actions", () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action1"\n        do "Action2"\n    done';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DO,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.DONE,
      ]);
    });
  });

  describe("String Literals", () => {
    it("should tokenize simple string", () => {
      const input = '"Test String"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.QUOTED_STRING], ['"Test String"']);
    });

    it("should tokenize string with spaces", () => {
      const input = '"Test String With Spaces"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.QUOTED_STRING], ['"Test String With Spaces"']);
    });

    it("should tokenize provenance value without backslashes as QUOTED_STRING", () => {
      const input = 'evidence is "some provenance"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.EVIDENCE, CPGLLexer.IS, CPGLLexer.QUOTED_STRING],
        ["evidence", "is", '"some provenance"'],
      );
    });

    it("should tokenize evidence value with backslashes as BACKTICK_STRING", () => {
      const input = "evidence is `some\\provenance`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.EVIDENCE, CPGLLexer.IS, CPGLLexer.BACKTICK_STRING],
        ["evidence", "is", "`some\\provenance`"],
      );
    });
  });

  describe("Boolean Operators", () => {
    it("should tokenize AND operator", () => {
      const input = "and";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.AND], ["and"]);
    });

    it("should tokenize OR operator", () => {
      const input = "or";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.OR], ["or"]);
    });
  });

  describe("Parentheses", () => {
    it("should tokenize opening parenthesis", () => {
      const input = "(";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN], ["("]);
    });

    it("should tokenize closing parenthesis", () => {
      const input = ")";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.RPAREN], [")"]);
    });

    it("should tokenize parenthesized expression", () => {
      const input = '("Test")';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN, CPGLLexer.QUOTED_STRING, CPGLLexer.RPAREN]);
    });
  });

  describe("Activity Types", () => {
    it("should tokenize CPGImmunizationRequest", () => {
      const input = "perform CPGImmunizationRequest";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ["perform", "CPGImmunizationRequest"],
      );
    });

    it("should tokenize CPGProposeDiagnosis", () => {
      const input = "perform CPGProposeDiagnosis";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ["perform", "CPGProposeDiagnosis"],
      );
    });

    it("should tokenize medication-related activities", () => {
      const input = "perform CPGMedicationRequest perform CPGServiceRequest perform CPGStop";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
        ],
        ["perform", "CPGMedicationRequest", "perform", "CPGServiceRequest", "perform", "CPGStop"],
      );
    });

    it("should tokenize information and communication activities", () => {
      const input =
        "perform CPGCollectInformation perform CPGCommunication perform CPGGenerateReport";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
        ],
        [
          "perform",
          "CPGCollectInformation",
          "perform",
          "CPGCommunication",
          "perform",
          "CPGGenerateReport",
        ],
      );
    });

    it("should tokenize medication administration activities", () => {
      const input =
        "perform CPGAdministerMedication perform CPGDispenseMedication perform CPGDocumentMedication";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
        ],
        [
          "perform",
          "CPGAdministerMedication",
          "perform",
          "CPGDispenseMedication",
          "perform",
          "CPGDocumentMedication",
        ],
      );
    });

    it("should tokenize enrollment and record activities", () => {
      const input =
        "perform CPGEnrollment perform CPGHold perform CPGRecordDetectedIssue perform CPGRecordInference";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
          CPGLLexer.PERFORM,
          CPGLLexer.ACTIVITY_TYPE,
        ],
        [
          "perform",
          "CPGEnrollment",
          "perform",
          "CPGHold",
          "perform",
          "CPGRecordDetectedIssue",
          "perform",
          "CPGRecordInference",
        ],
      );
    });

    it("should tokenize report and resume activities", () => {
      const input = "perform CPGReportFlag perform CPGResume";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE, CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ["perform", "CPGReportFlag", "perform", "CPGResume"],
      );
    });
  });

  describe("Concept Types", () => {
    it("should tokenize Observation", () => {
      const input = "type is Observation";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.TYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_TYPE],
        ["type", "is", "Observation"],
      );
    });

    it("should tokenize Condition", () => {
      const input = "type is Condition";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.TYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_TYPE],
        ["type", "is", "Condition"],
      );
    });

    it("should tokenize medication-related concepts", () => {
      const input =
        "type is MedicationRequest\ntype is MedicationDispense\ntype is MedicationAdministration\ntype is MedicationStatement";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          "type",
          "is",
          "MedicationRequest",
          "type",
          "is",
          "MedicationDispense",
          "type",
          "is",
          "MedicationAdministration",
          "type",
          "is",
          "MedicationStatement",
        ],
      );
    });

    it("should tokenize communication and questionnaire concepts", () => {
      const input =
        "type is Communication\ntype is CommunicationRequest\ntype is QuestionnaireTask\ntype is QuestionnaireResponse";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          "type",
          "is",
          "Communication",
          "type",
          "is",
          "CommunicationRequest",
          "type",
          "is",
          "QuestionnaireTask",
          "type",
          "is",
          "QuestionnaireResponse",
        ],
      );
    });

    it("should tokenize immunization and service concepts", () => {
      const input =
        "type is ImmunizationRequest\ntype is Immunization\ntype is ServiceRequest\ntype is Procedure";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.TYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          "type",
          "is",
          "ImmunizationRequest",
          "type",
          "is",
          "Immunization",
          "type",
          "is",
          "ServiceRequest",
          "type",
          "is",
          "Procedure",
        ],
      );
    });
  });

  describe("Concept Value Types", () => {
    it("should tokenize Quantity", () => {
      const input = "valuetype is Quantity";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.VALUETYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_VALUE_TYPE],
        ["valuetype", "is", "Quantity"],
      );
    });

    it("should tokenize CodeableConcept", () => {
      const input = "valuetype is CodeableConcept";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.VALUETYPE, CPGLLexer.IS, CPGLLexer.CONCEPT_VALUE_TYPE],
        ["valuetype", "is", "CodeableConcept"],
      );
    });

    it("should tokenize basic value types", () => {
      const input = "valuetype is string\nvaluetype is boolean\nvaluetype is integer";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        ["valuetype", "is", "string", "valuetype", "is", "boolean", "valuetype", "is", "integer"],
      );
    });

    it("should tokenize range and ratio types", () => {
      const input = "valuetype is Range\nvaluetype is Ratio";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        ["valuetype", "is", "Range", "valuetype", "is", "Ratio"],
      );
    });

    it("should tokenize sampled data and time types", () => {
      const input = "valuetype is SampledData\nvaluetype is time\nvaluetype is dateTime";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        [
          "valuetype",
          "is",
          "SampledData",
          "valuetype",
          "is",
          "time",
          "valuetype",
          "is",
          "dateTime",
        ],
      );
    });

    it("should tokenize period and attachment types", () => {
      const input = "valuetype is Period\nvaluetype is Attachment";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.VALUETYPE,
          CPGLLexer.IS,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        ["valuetype", "is", "Period", "valuetype", "is", "Attachment"],
      );
    });
  });

  describe("Additional Keywords", () => {
    it("should tokenize activity statement", () => {
      const input = 'activity "Test" perform CPGImmunizationRequest';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
      ]);
    });

    it("should tokenize concept statement", () => {
      const input = 'concept "Test":\n    type is Observation\n    valuetype is Quantity';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.COLON,
        CPGLLexer.TYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.VALUETYPE,
        CPGLLexer.IS,
        CPGLLexer.CONCEPT_VALUE_TYPE,
      ]);
    });

    it("should tokenize terminology statement", () => {
      const input = 'terminology "Test" valueset "TestSet"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.VALUESET,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it("should tokenize provenance and inferred statements", () => {
      const input = 'evidence is "source" inferred from "logic"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.EVIDENCE,
        CPGLLexer.IS,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.INFERRED,
        CPGLLexer.FROM,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it("should tokenize coded from statement", () => {
      const input = 'coded from "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.CODED, CPGLLexer.FROM, CPGLLexer.QUOTED_STRING]);
    });

    it("should tokenize system and code statement", () => {
      const input = 'system "http://snomed.info/sct" code "73761001"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.SYSTEM,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.CODE,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it("should tokenize period", () => {
      const input = ".";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DOT], ["."]);
    });
  });

  describe("Comments", () => {
    it("should skip single-line comments", () => {
      const input = '// This is a comment\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should skip empty single-line comments", () => {
      const input = '//\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should skip single-line comments with special characters", () => {
      const input = '// This is a comment with special chars: /* */ " \' \n\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should skip block comments", () => {
      const input = '/* This is a\nblock comment */\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should skip empty block comments", () => {
      const input = '/**/\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should handle multiple comments in sequence", () => {
      const input = '// First comment\n/* Second comment */\n// Third comment\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it("should handle comments within statements", () => {
      const input =
        'decision "Test" // Comment after statement\nwhen "Condition" /* Block comment */ then';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.WHEN,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.THEN,
      ]);
    });
  });
});
