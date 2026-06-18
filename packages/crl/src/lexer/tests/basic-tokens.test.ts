import { CRLLexer } from "../../grammar/generated/antlr/CRLLexer";

import { getTokensFromString, verifyTokenSequence } from "./helpers";

describe("CRL Lexer - Basic Tokens", () => {
  describe("Keywords", () => {
    it("should tokenize decision statement", () => {
      const input = 'decision "Test Decision":\n- when "Condition" then:';
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
      ]);
    });

    it("should tokenize decision statement with multiple actions", () => {
      const input = 'decision "Test Decision":\n- when "Condition" then:';
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
        [CRLLexer.EVIDENCE_IS, CRLLexer.BACKTICK_STRING],
        ["evidence is", "`some provenance`"],
      );
    });

    it("should tokenize evidence value with backslashes as BACKTICK_STRING", () => {
      const input = "evidence is `some\\provenance`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.EVIDENCE_IS, CRLLexer.BACKTICK_STRING],
        ["evidence is", "`some\\provenance`"],
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
      const input = "request CPGImmunizationRequest";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [CRLLexer.REQUEST, CRLLexer.ACTIVITY_TYPE],
        ["request", "CPGImmunizationRequest"],
      );
    });

    it("should tokenize CPGProposeDiagnosis", () => {
      const input = "request CPGProposeDiagnosis";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [CRLLexer.REQUEST, CRLLexer.ACTIVITY_TYPE],
        ["request", "CPGProposeDiagnosis"],
      );
    });

    it("should tokenize medication-related activities", () => {
      const input = "request CPGMedicationRequest request CPGServiceRequest request CPGStop";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ERROR,
        ],
        ["request", "CPGMedicationRequest", "request", "CPGServiceRequest", "request", "CPGStop"],
      );
    });

    it("should tokenize information and communication activities", () => {
      const input =
        "request CPGQuestionnaire request CPGCommunication request CPGGenerateReport";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ERROR,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
        ],
        [
          "request",
          "CPGQuestionnaire",
          "request",
          "CPGCommunication",
          "request",
          "CPGGenerateReport",
        ],
      );
    });

    it("should tokenize medication administration activities", () => {
      const input =
        "request CPGAdministerMedication request CPGDispenseMedication request CPGDocumentMedication";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
        ],
        [
          "request",
          "CPGAdministerMedication",
          "request",
          "CPGDispenseMedication",
          "request",
          "CPGDocumentMedication",
        ],
      );
    });

    it("should tokenize enrollment and record activities", () => {
      const input =
        "request CPGEnrollment request CPGHold request CPGRecordDetectedIssue request CPGRecordInference";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ERROR,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
          CRLLexer.REQUEST,
          CRLLexer.ACTIVITY_TYPE,
        ],
        [
          "request",
          "CPGEnrollment",
          "request",
          "CPGHold",
          "request",
          "CPGRecordDetectedIssue",
          "request",
          "CPGRecordInference",
        ],
      );
    });

    it("should tokenize report and resume activities", () => {
      const input = "request CPGReportFlag request CPGResume";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [CRLLexer.REQUEST, CRLLexer.ACTIVITY_TYPE, CRLLexer.REQUEST, CRLLexer.ERROR],
        ["request", "CPGReportFlag", "request", "CPGResume"],
      );
    });
  });

  describe("Concept Types", () => {
    it("should tokenize Observation", () => {
      const input = "type is Observation";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.TYPE_IS, CRLLexer.CONCEPT_TYPE],
        ["type is", "Observation"],
      );
    });

    it("should tokenize Condition", () => {
      const input = "type is Condition";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.TYPE_IS, CRLLexer.CONCEPT_TYPE],
        ["type is", "Condition"],
      );
    });

    it("should tokenize medication-related concepts", () => {
      const input =
        "- type is MedicationRequest\n- type is MedicationDispense\n- type is MedicationAdministration\n- type is MedicationStatement";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
        ],
        [
          "-",
          "type is",
          "MedicationRequest",
          "-",
          "type is",
          "MedicationDispense",
          "-",
          "type is",
          "MedicationAdministration",
          "-",
          "type is",
          "MedicationStatement",
        ],
      );
    });

    it("should tokenize communication and questionnaire concepts", () => {
      const input =
        "- type is Communication\n- type is CommunicationRequest\n- type is QuestionnaireTask\n- type is QuestionnaireResponse";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.ERROR,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
        ],
        [
          "-",
          "type is",
          "Communication",
          "-",
          "type is",
          "CommunicationRequest",
          "-",
          "type is",
          "QuestionnaireTask",
          "-",
          "type is",
          "QuestionnaireResponse",
        ],
      );
    });

    it("should tokenize immunization and service concepts", () => {
      const input =
        "- type is ImmunizationRequest\n- type is Immunization\n- type is ServiceRequest\n- type is Procedure";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.ERROR,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
          CRLLexer.DASH,
          CRLLexer.TYPE_IS,
          CRLLexer.CONCEPT_TYPE,
        ],
        [
          "-",
          "type is",
          "ImmunizationRequest",
          "-",
          "type is",
          "Immunization",
          "-",
          "type is",
          "ServiceRequest",
          "-",
          "type is",
          "Procedure",
        ],
      );
    });
  });

  describe("Concept Value Types", () => {
    it("should tokenize Quantity", () => {
      const input = "value type is Quantity";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.VALUE_TYPE_IS, CRLLexer.CONCEPT_VALUE_TYPE],
        ["value type is", "Quantity"],
      );
    });

    it("should tokenize CodeableConcept", () => {
      const input = "value type is CodeableConcept";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.VALUE_TYPE_IS, CRLLexer.CONCEPT_VALUE_TYPE],
        ["value type is", "CodeableConcept"],
      );
    });

    it("should tokenize basic value types", () => {
      const input = "- value type is string\n- value type is boolean\n- value type is integer";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
        ],
        [
          "-",
          "value type is",
          "string",
          "-",
          "value type is",
          "boolean",
          "-",
          "value type is",
          "integer",
        ],
      );
    });

    it("should tokenize range and ratio types", () => {
      const input = "- value type is Range\n- value type is Ratio";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
        ],
        ["-", "value type is", "Range", "-", "value type is", "Ratio"],
      );
    });

    it("should tokenize sampled data and time types", () => {
      const input = "- value type is SampledData\n- value type is time\n- value type is dateTime";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
        ],
        [
          "-",
          "value type is",
          "SampledData",
          "-",
          "value type is",
          "time",
          "-",
          "value type is",
          "dateTime",
        ],
      );
    });

    it("should tokenize period and attachment types", () => {
      const input = "- value type is Period\n- value type is Attachment";
      const tokens = getTokensFromString(input);
      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
          CRLLexer.DASH,
          CRLLexer.VALUE_TYPE_IS,
          CRLLexer.CONCEPT_VALUE_TYPE,
        ],
        ["-", "value type is", "Period", "-", "value type is", "Attachment"],
      );
    });
  });

  describe("Additional Keywords", () => {
    it("should tokenize activity statement", () => {
      const input = 'activity "Test" request CPGImmunizationRequest';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.ACTIVITY,
        CRLLexer.QUOTED_STRING,
        CRLLexer.REQUEST,
        CRLLexer.ACTIVITY_TYPE,
      ]);
    });

    it("should tokenize concept statement", () => {
      const input = 'concept "Test":\n- type is Observation\n- value type is Quantity';
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
        CRLLexer.CONCEPT,
        CRLLexer.QUOTED_STRING,
        CRLLexer.COLON,
        CRLLexer.DASH,
        CRLLexer.TYPE_IS,
        CRLLexer.CONCEPT_TYPE,
        CRLLexer.DASH,
        CRLLexer.VALUE_TYPE_IS,
        CRLLexer.CONCEPT_VALUE_TYPE,
      ]);
    });

    it("should tokenize terminology statement", () => {
      const input = `terminology "Test":\n- valueset is \`TestSet\`.`;
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

    it("should tokenize provenance and defined-as statements", () => {
      const input = "- evidence is `source` - defined as `logic`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [
          CRLLexer.DASH,
          CRLLexer.EVIDENCE_IS,
          CRLLexer.BACKTICK_STRING,
          CRLLexer.DASH,
          CRLLexer.DEFINED_AS,
          CRLLexer.BACKTICK_STRING,
        ],
        ["-", "evidence is", "`source`", "-", "defined as", "`logic`"],
      );
    });

    it("should tokenize coded from statement", () => {
      const input = "coded from `Test`";
      const tokens = getTokensFromString(input);

      verifyTokenSequence(
        tokens,
        [CRLLexer.CODED_FROM, CRLLexer.BACKTICK_STRING],
        ["coded from", "`Test`"],
      );
    });

    it("should tokenize system and code statement", () => {
      const input = `- system is \`http://snomed.info/sct\`.\n- code is \`73761001\`.`;
      const tokens = getTokensFromString(input);

      verifyTokenSequence(tokens, [
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
