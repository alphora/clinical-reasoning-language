import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../../grammar/generated/antlr/CPGLLexer';
import { createLexer } from '../createLexer';

import { getAllTokens, verifyTokenSequence } from './index.test';

// TODO: update tests to use BACKTICK_STRING (instead of STRING)

describe('CPGL Lexer - Basic Tokens', () => {
  describe('Keywords', () => {
    it('should tokenize decision statement', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action"\n    done';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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

    it('should tokenize decision statement with multiple actions', () => {
      const input =
        'decision "Test Decision":\n    when "Condition" then:\n        do "Action1"\n        do "Action2"\n    done';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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

  describe('String Literals', () => {
    it('should tokenize simple string', () => {
      const input = '"Test String"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.QUOTED_STRING], ['"Test String"']);
    });

    it('should tokenize string with spaces', () => {
      const input = '"Test String With Spaces"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.QUOTED_STRING], ['"Test String With Spaces"']);
    });

    it('should tokenize provenance value without backslashes as QUOTED_STRING', () => {
      const input = 'has provenance "some provenance"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.PROVENANCE, CPGLLexer.QUOTED_STRING],
        ['has', 'provenance', '"some provenance"'],
      );
    });

    it('should tokenize provenance value with backslashes as STRING', () => {
      const input = 'has provenance `some\\provenance`';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.PROVENANCE, CPGLLexer.BACKTICK_STRING],
        ['has', 'provenance', '`some\\provenance`'],
      );
    });
  });

  describe('Boolean Operators', () => {
    it('should tokenize AND operator', () => {
      const input = 'and';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.AND], ['and']);
    });

    it('should tokenize OR operator', () => {
      const input = 'or';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.OR], ['or']);
    });
  });

  describe('Parentheses', () => {
    it('should tokenize opening parenthesis', () => {
      const input = '(';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN], ['(']);
    });

    it('should tokenize closing parenthesis', () => {
      const input = ')';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.RPAREN], [')']);
    });

    it('should tokenize parenthesized expression', () => {
      const input = '("Test")';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.LPAREN, CPGLLexer.QUOTED_STRING, CPGLLexer.RPAREN]);
    });
  });

  describe('Activity Types', () => {
    it('should tokenize CPGImmunizationRequest', () => {
      const input = 'perform CPGImmunizationRequest';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ['perform', 'CPGImmunizationRequest'],
      );
    });

    it('should tokenize CPGProposeDiagnosis', () => {
      const input = 'perform CPGProposeDiagnosis';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.PERFORM, CPGLLexer.ACTIVITY_TYPE],
        ['perform', 'CPGProposeDiagnosis'],
      );
    });

    it('should tokenize medication-related activities', () => {
      const input = 'perform CPGMedicationRequest perform CPGServiceRequest perform CPGStop';
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.TYPE, CPGLLexer.CONCEPT_TYPE],
        ['has', 'type', 'Observation'],
      );
    });

    it('should tokenize Condition', () => {
      const input = 'has type Condition';
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.VALUETYPE, CPGLLexer.CONCEPT_VALUE_TYPE],
        ['has', 'valuetype', 'Quantity'],
      );
    });

    it('should tokenize CodeableConcept', () => {
      const input = 'has valuetype CodeableConcept';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(
        tokens,
        [CPGLLexer.HAS, CPGLLexer.VALUETYPE, CPGLLexer.CONCEPT_VALUE_TYPE],
        ['has', 'valuetype', 'CodeableConcept'],
      );
    });

    it('should tokenize basic value types', () => {
      const input = 'has valuetype string\nhas valuetype boolean\nhas valuetype integer';
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const lexer = createLexer(CharStreams.fromString(input));
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
      const input = 'activity "Test" perform CPGImmunizationRequest';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.ACTIVITY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.PERFORM,
        CPGLLexer.ACTIVITY_TYPE,
      ]);
    });

    it('should tokenize concept statement', () => {
      const input = 'concept "Test":\n    has type Observation\n    has valuetype Quantity';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.CONCEPT,
        CPGLLexer.QUOTED_STRING,
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
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.TERMINOLOGY,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.VALUESET,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it('should tokenize provenance and inferred statements', () => {
      const input = 'has provenance "source" inferred by "logic"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.HAS,
        CPGLLexer.PROVENANCE,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.INFERRED,
        CPGLLexer.BY,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

    it('should tokenize coded by statement', () => {
      const input = 'coded by "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.CODED, CPGLLexer.BY, CPGLLexer.QUOTED_STRING]);
    });

    it('should tokenize system and code statement', () => {
      const input = 'system "http://snomed.info/sct" code "73761001"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [
        CPGLLexer.SYSTEM,
        CPGLLexer.QUOTED_STRING,
        CPGLLexer.CODE,
        CPGLLexer.QUOTED_STRING,
      ]);
    });

   it('should tokenize period', () => {
      const input = '.';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DOT], ['.']);
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const input = '// This is a comment\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should skip empty single-line comments', () => {
      const input = '//\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should skip single-line comments with special characters', () => {
      const input = '// This is a comment with special chars: /* */ " \' \n\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should skip block comments', () => {
      const input = '/* This is a\nblock comment */\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should skip empty block comments', () => {
      const input = '/**/\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should handle multiple comments in sequence', () => {
      const input = '// First comment\n/* Second comment */\n// Third comment\ndecision "Test"';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      verifyTokenSequence(tokens, [CPGLLexer.DECISION, CPGLLexer.QUOTED_STRING]);
    });

    it('should handle comments within statements', () => {
      const input =
        'decision "Test" // Comment after statement\nwhen "Condition" /* Block comment */ then';
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

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
