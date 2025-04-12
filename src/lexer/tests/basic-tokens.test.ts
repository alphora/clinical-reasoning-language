import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/CPGLLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

describe('CPGL Lexer - Basic Tokens', () => {
  describe('Keywords', () => {
    it('should tokenize decision statement', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action"\n    done';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DONE,
      ]);
    });

    it('should tokenize decision statement with multiple actions', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action1"\n        do "Action2"\n    done';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.COLON,
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
        CPGLLexer.COLON,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DO,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.DONE,
      ]);
    });
  });

  describe('Identifiers', () => {
    it('should tokenize simple identifier', () => {
      const input = '"Test String"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.IDENTIFIER], ['"Test String"']);
    });

    it('should tokenize identifier with spaces', () => {
      const input = '"Test String With Spaces"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.IDENTIFIER], ['"Test String With Spaces"']);
    });
  });

  describe('String Literals', () => {
    it('should tokenize simple string', () => {
      const input = '"Test String"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.IDENTIFIER], ['"Test String"']);
    });

    it('should tokenize string with spaces', () => {
      const input = '"Test String With Spaces"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.IDENTIFIER], ['"Test String With Spaces"']);
    });
  });

  describe('Boolean Operators', () => {
    it('should tokenize AND operator', () => {
      const input = 'and';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.AND], ['and']);
    });

    it('should tokenize OR operator', () => {
      const input = 'or';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.OR], ['or']);
    });
  });

  describe('Parentheses', () => {
    it('should tokenize opening parenthesis', () => {
      const input = '(';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN], ['(']);
    });

    it('should tokenize closing parenthesis', () => {
      const input = ')';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.RPAREN], [')']);
    });

    it('should tokenize parenthesized expression', () => {
      const input = '("Test")';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN, CPGLLexer.IDENTIFIER, CPGLLexer.RPAREN]);
    });
  });

  describe('Activity Types', () => {
    it('should tokenize CPGImmunization', () => {
      const input = 'perform CPGImmunization';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ['perform', 'CPGImmunization'],
      );
    });

    it('should tokenize CPGProposeDiagnosis', () => {
      const input = 'perform CPGProposeDiagnosis';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ['perform', 'CPGProposeDiagnosis'],
      );
    });

    it('should tokenize medication-related activities', () => {
      const input = 'perform CPGMedicationRequest perform CPGServiceRequest perform CPGStop';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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
        ['perform', 'CPGMedicationRequest', 'perform', 'CPGServiceRequest', 'perform', 'CPGStop'],
      );
    });

    it('should tokenize information and communication activities', () => {
      const input =
        'perform CPGCollectInformation perform CPGCommunication perform CPGGenerateReport';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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
          'perform',
          'CPGCollectInformation',
          'perform',
          'CPGCommunication',
          'perform',
          'CPGGenerateReport',
        ],
      );
    });

    it('should tokenize medication administration activities', () => {
      const input =
        'perform CPGAdministerMedication perform CPGDispenseMedication perform CPGDocumentMedication';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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
          'perform',
          'CPGAdministerMedication',
          'perform',
          'CPGDispenseMedication',
          'perform',
          'CPGDocumentMedication',
        ],
      );
    });

    it('should tokenize enrollment and record activities', () => {
      const input =
        'perform CPGEnrollment perform CPGHold perform CPGRecordDetectedIssue perform CPGRecordInference';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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
          'perform',
          'CPGEnrollment',
          'perform',
          'CPGHold',
          'perform',
          'CPGRecordDetectedIssue',
          'perform',
          'CPGRecordInference',
        ],
      );
    });

    it('should tokenize report and resume activities', () => {
      const input = 'perform CPGReportFlag perform CPGResume';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE, CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ['perform', 'CPGReportFlag', 'perform', 'CPGResume'],
      );
    });
  });

  describe('Concept Types', () => {
    it('should tokenize Observation', () => {
      const input = 'has type Observation';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.TYPE, CPGLLexer.CONCEPT_TYPE],
        ['has', 'type', 'Observation'],
      );
    });

    it('should tokenize Condition', () => {
      const input = 'has type Condition';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.TYPE, CPGLLexer.CONCEPT_TYPE],
        ['has', 'type', 'Condition'],
      );
    });

    it('should tokenize medication-related concepts', () => {
      const input =
        'has type MedicationRequest\nhas type MedicationDispense\nhas type MedicationAdministration\nhas type MedicationStatement';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          'has',
          'type',
          'MedicationRequest',
          'has',
          'type',
          'MedicationDispense',
          'has',
          'type',
          'MedicationAdministration',
          'has',
          'type',
          'MedicationStatement',
        ],
      );
    });

    it('should tokenize communication and questionnaire concepts', () => {
      const input =
        'has type Communication\nhas type CommunicationRequest\nhas type QuestionnaireTask\nhas type QuestionnaireResponse';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          'has',
          'type',
          'Communication',
          'has',
          'type',
          'CommunicationRequest',
          'has',
          'type',
          'QuestionnaireTask',
          'has',
          'type',
          'QuestionnaireResponse',
        ],
      );
    });

    it('should tokenize immunization and service concepts', () => {
      const input =
        'has type ImmunizationRequest\nhas type Immunization\nhas type ServiceRequest\nhas type Procedure';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.TYPE,
          CPGLLexer.CONCEPT_TYPE,
        ],
        [
          'has',
          'type',
          'ImmunizationRequest',
          'has',
          'type',
          'Immunization',
          'has',
          'type',
          'ServiceRequest',
          'has',
          'type',
          'Procedure',
        ],
      );
    });
  });

  describe('Concept Value Types', () => {
    it('should tokenize Quantity', () => {
      const input = 'has valuetype Quantity';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.VALUETYPE, CPGLLexer.CONCEPT_VALUE_TYPE],
        ['has', 'valuetype', 'Quantity'],
      );
    });

    it('should tokenize CodeableConcept', () => {
      const input = 'has valuetype CodeableConcept';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.VALUETYPE, CPGLLexer.CONCEPT_VALUE_TYPE],
        ['has', 'valuetype', 'CodeableConcept'],
      );
    });

    it('should tokenize basic value types', () => {
      const input = 'has valuetype string\nhas valuetype boolean\nhas valuetype integer';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        [
          'has',
          'valuetype',
          'string',
          'has',
          'valuetype',
          'boolean',
          'has',
          'valuetype',
          'integer',
        ],
      );
    });

    it('should tokenize range and ratio types', () => {
      const input = 'has valuetype Range\nhas valuetype Ratio';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        ['has', 'valuetype', 'Range', 'has', 'valuetype', 'Ratio'],
      );
    });

    it('should tokenize sampled data and time types', () => {
      const input = 'has valuetype SampledData\nhas valuetype time\nhas valuetype dateTime';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        [
          'has',
          'valuetype',
          'SampledData',
          'has',
          'valuetype',
          'time',
          'has',
          'valuetype',
          'dateTime',
        ],
      );
    });

    it('should tokenize period and attachment types', () => {
      const input = 'has valuetype Period\nhas valuetype Attachment';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
          CPGLLexer.HAS,
          CPGLLexer.VALUETYPE,
          CPGLLexer.CONCEPT_VALUE_TYPE,
        ],
        ['has', 'valuetype', 'Period', 'has', 'valuetype', 'Attachment'],
      );
    });
  });

  describe('Additional Keywords', () => {
    it('should tokenize activity statement', () => {
      const input = 'activity "Test" perform CPGImmunization';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
      ]);
    });

    it('should tokenize concept statement', () => {
      const input = 'concept "Test":\n    has type Observation\n    has valuetype Quantity';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.COLON,
        CPGLLexer.HAS,
        CPGLLexer.TYPE,
        CPGLLexer.CONCEPT_TYPE,
        CPGLLexer.HAS,
        CPGLLexer.VALUETYPE,
        CPGLLexer.CONCEPT_VALUE_TYPE,
      ]);
    });

    it('should tokenize terminology statement', () => {
      const input = 'terminology "Test" valueset "TestSet"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.VALUESET,
        CPGLLexer.IDENTIFIER,
      ]);
    });

    it('should tokenize provenance and inferred statements', () => {
      const input = 'has provenance "source" inferred by "logic"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.HAS,
        CPGLLexer.PROVENANCE,
        CPGLLexer.STRING,
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.IDENTIFIER,
      ]);
    });

    it('should tokenize coded by statement', () => {
      const input = 'coded by "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.CODED, CPGLLexer.BY, CPGLLexer.IDENTIFIER]);
    });

    it('should tokenize system and code statement', () => {
      const input = 'system "http://snomed.info/sct" code "73761001"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.SYSTEM,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.CODE,
        CPGLLexer.IDENTIFIER,
      ]);
    });

    it('should tokenize unknown terminology', () => {
      const input = 'unknown';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.UNKNOWN], ['unknown']);
    });

    it('should tokenize period', () => {
      const input = '.';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DOT], ['.']);
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const input = '// This is a comment\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should skip empty single-line comments', () => {
      const input = '//\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should skip single-line comments with special characters', () => {
      const input = '// This is a comment with special chars: /* */ " \' \n\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should skip block comments', () => {
      const input = '/* This is a\nblock comment */\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should skip empty block comments', () => {
      const input = '/**/\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should handle multiple comments in sequence', () => {
      const input = '// First comment\n/* Second comment */\n// Third comment\ndecision "Test"';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.IDENTIFIER]);
    });

    it('should handle comments within statements', () => {
      const input =
        'decision "Test" // Comment after statement\nwhen "Condition" /* Block comment */ then';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.DECISION,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.WHEN,
        CPGLLexer.IDENTIFIER,
        CPGLLexer.THEN,
      ]);
    });
  });
});
