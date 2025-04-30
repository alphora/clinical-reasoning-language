import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString } from "./helpers";
import { verifyTokenSequence } from "./index.test";

// TODO: update tests to use BACKTICK_STRING (instead of STRING)

describe("CRL Lexer - Basic Tokens", () => {
  describe("Keywords", () => {
    it("should tokenize decision statement", () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action"\n    done';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DONE,
      ]);
    });

    it("should tokenize decision statement with multiple actions", () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action1"\n        do "Action2"\n    done';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
        CRLLexer.COLON,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DO,
        CRLLexer.QUOTED_STRING,
        CRLLexer.DONE,
      ]);
    });
  });

  describe("String Literals", () => {
    it("should tokenize simple string", () => {
      const input = '"Test String"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.QUOTED_STRING], ['"Test String"']);
    });

    it("should tokenize string with spaces", () => {
      const input = '"Test String With Spaces"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.QUOTED_STRING], ['"Test String With Spaces"']);
    });

    it("should tokenize evidence value as BACKTICK_STRING", () => {
      const input = "evidence is `some provenance`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.EVIDENCE, CRLLexer.IS, CRLLexer.BACKTICK_STRING],
        ["evidence", "is", "`some provenance`"],
      );
    });

    it("should tokenize evidence value with backslashes as BACKTICK_STRING", () => {
      const input = "evidence is `some\\provenance`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.EVIDENCE, CRLLexer.IS, CRLLexer.BACKTICK_STRING],
        ["evidence", "is", "`some\\provenance`"],
      );
    });
  });

  describe("Boolean Operators", () => {
    it("should tokenize AND operator", () => {
      const input = "and";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.AND], ["and"]);
    });

    it("should tokenize OR operator", () => {
      const input = "or";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.OR], ["or"]);
    });
  });

  describe("Parentheses", () => {
    it("should tokenize opening parenthesis", () => {
      const input = "(";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.LPAREN], ["("]);
    });

    it("should tokenize closing parenthesis", () => {
      const input = ")";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.RPAREN], [")"]);
    });

    it("should tokenize parenthesized expression", () => {
      const input = '("Test")';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.LPAREN, CRLLexer.QUOTED_STRING, CRLLexer.RPAREN]);
    });
  });

  describe("Activity Types", () => {
    it("should tokenize CPGImmunizationRequest", () => {
      const input = "perform CPGImmunizationRequest";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.PERFORM, CRLLexer.ACTIVITY_TYPE],
        ["perform", "CPGImmunizationRequest"],
      );
    });

    it("should tokenize CPGProposeDiagnosis", () => {
      const input = "perform CPGProposeDiagnosis";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.PERFORM, CRLLexer.ACTIVITY_TYPE],
        ["perform", "CPGProposeDiagnosis"],
      );
    });

    it("should tokenize medication-related activities", () => {
      const input = "perform CPGMedicationRequest perform CPGServiceRequest perform CPGStop";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
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
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
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
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
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
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.PERFORM,
          CRLLexer.ACTIVITY_TYPE,
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
        [CRLLexer.PERFORM, CRLLexer.ACTIVITY_TYPE, CRLLexer.PERFORM, CRLLexer.ACTIVITY_TYPE],
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
        [CRLLexer.TYPE, CRLLexer.IS, CRLLexer.CONCEPT_TYPE],
        ["type", "is", "Observation"],
      );
    });

    it("should tokenize Condition", () => {
      const input = "type is Condition";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.TYPE, CRLLexer.IS, CRLLexer.CONCEPT_TYPE],
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
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
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
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
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
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.TYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_TYPE,
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
        [CRLLexer.VALUETYPE, CRLLexer.IS, CRLLexer.CONCEPT_VALUE_TYPE],
        ["valuetype", "is", "Quantity"],
      );
    });

    it("should tokenize CodeableConcept", () => {
      const input = "valuetype is CodeableConcept";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.VALUETYPE, CRLLexer.IS, CRLLexer.CONCEPT_VALUE_TYPE],
        ["valuetype", "is", "CodeableConcept"],
      );
    });

    it("should tokenize basic value types", () => {
      const input = "valuetype is string\nvaluetype is boolean\nvaluetype is integer";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
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
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
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
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
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
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.VALUETYPE,
          CRLLexer.IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
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
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.PERFORM,
        CRLLexer.ACTIVITY_TYPE,
      ]);
    });

    it("should tokenize concept statement", () => {
      const input = 'concept "Test":\n    type is Observation\n    valuetype is Quantity';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.TYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.VALUETYPE,
        CRLLexer.IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
      ]);
    });

    it("should tokenize terminology statement", () => {
      const input = 'terminology "Test" valueset "TestSet"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.TERMINOLOGY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.VALUESET,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should tokenize provenance and inferred statements", () => {
      const input = "evidence is `source` inferred from `logic`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CRLLexer.EVIDENCE,
          CRLLexer.IS,
          CRLLexer.BACKTICK_STRING,
          CRLLexer.INFERRED,
          CRLLexer.FROM,
          CRLLexer.BACKTICK_STRING,
        ],
        ["evidence", "is", "`source`", "inferred", "from", "`logic`"],
      );
    });

    it("should tokenize coded from statement", () => {
      const input = "coded from `Test`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.CODED, CRLLexer.FROM, CRLLexer.BACKTICK_STRING],
        ["coded", "from", "`Test`"],
      );
    });

    it("should tokenize system and code statement", () => {
      const input = 'system "http://snomed.info/sct" code "73761001"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.SYSTEM,
        CRLLexer.QUOTED_STRING,
        CRLLexer.CODE,
        CRLLexer.QUOTED_STRING,
      ]);
    });

    it("should tokenize period", () => {
      const input = ".";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DOT], ["."]);
    });
  });

  describe("Comments", () => {
    it("should skip single-line comments", () => {
      const input = '// This is a comment\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should skip empty single-line comments", () => {
      const input = '//\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should skip single-line comments with special characters", () => {
      const input = '// This is a comment with special chars: /* */ " \' \n\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should skip block comments", () => {
      const input = '/* This is a\nblock comment */\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should skip empty block comments", () => {
      const input = '/**/\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should handle multiple comments in sequence", () => {
      const input = '// First comment\n/* Second comment */\n// Third comment\ndecision "Test"';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [CRLLexer.DECISION, CRLLexer.QUOTED_STRING]);
    });

    it("should handle comments within statements", () => {
      const input =
        'decision "Test" // Comment after statement\nwhen "Condition" /* Block comment */ then';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.DECISION,
        CRLLexer.QUOTED_STRING,
        CRLLexer.WHEN,
        CRLLexer.QUOTED_STRING,
        CRLLexer.THEN,
      ]);
    });
  });
});
