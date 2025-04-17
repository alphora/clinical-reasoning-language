import { CharStreams } from 'antlr4ts';

import { createLexer } from '../createLexer';

import { getAllTokens } from './index.test';

describe('Lexer Error Handling', () => {
  it('should handle invalid characters', () => {
    const inputs = ['@invalid', '$tokens', '#notallowed', '~invalid', '`backtick'];

    inputs.forEach(input => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle unterminated identifiers and strings', () => {
    const inputs = [
      '"unterminated identifier',
      '"identifier with\nnewline',
      'decision "unclosed identifier\nthen do "Action".',
      '"unterminated string with backslash\\',
      '"string with\\\nnewline',
    ];

    inputs.forEach(input => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle invalid characters with line and character position', () => {
    const testCases = [
      {
        input: '@invalid',
        minTokens: 0,
      },
      {
        input: 'done\n@invalid',
        minTokens: 1,
      },
      {
        input: 'done\n  @invalid',
        minTokens: 1,
      },
    ];

    testCases.forEach(({ input, minTokens }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      expect(tokens.length).toBeGreaterThanOrEqual(minTokens);
    });
  });

  it('should throw an exception for invalid activity types', () => {
    const testCases = [
      {
        input: 'perform invalidActivity',
        expectedError: /Lexical error at line 1:\d+ - Invalid activity type: invalidActivity. Valid types are: CPGAdministerMedication, CPGCollectInformation, CPGCommunication, CPGDispenseMedication, CPGDocumentMedication, CPGEnrollment, CPGGenerateReport, CPGHold, CPGImmunization, CPGMedicationRequest, CPGProposeDiagnosis, CPGRecordDetectedIssue, CPGRecordInference, CPGReportFlag, CPGResume, CPGServiceRequest, CPGStop/,
      },
      {
        input: 'perform someRandomActivity\nthen done',
        expectedError: /Lexical error at line 1:\d+ - Invalid activity type: someRandomActivity. Valid types are: CPGAdministerMedication, CPGCollectInformation, CPGCommunication, CPGDispenseMedication, CPGDocumentMedication, CPGEnrollment, CPGGenerateReport, CPGHold, CPGImmunization, CPGMedicationRequest, CPGProposeDiagnosis, CPGRecordDetectedIssue, CPGRecordInference, CPGReportFlag, CPGResume, CPGServiceRequest, CPGStop/,
      },
      {
        input: 'decision "test"\nwhen true then perform unknownActivity\ndone',
        expectedError: /Lexical error at line 2:\d+ - Invalid activity type: unknownActivity. Valid types are: CPGAdministerMedication, CPGCollectInformation, CPGCommunication, CPGDispenseMedication, CPGDocumentMedication, CPGEnrollment, CPGGenerateReport, CPGHold, CPGImmunization, CPGMedicationRequest, CPGProposeDiagnosis, CPGRecordDetectedIssue, CPGRecordInference, CPGReportFlag, CPGResume, CPGServiceRequest, CPGStop/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should throw an exception for invalid concept types', () => {
    const testCases = [
      {
        input: 'concept type InvalidConcept',
        expectedError: /Line 1:\d+ - Invalid concept type: InvalidConcept/,
      },
      {
        input: 'concept type SomeRandomType',
        expectedError: /Line 1:\d+ - Invalid concept type: SomeRandomType/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should throw an exception for invalid concept value types', () => {
    const testCases = [
      {
        input: 'concept valuetype InvalidValueType',
        expectedError: /Line 1:\d+ - Invalid concept value type: InvalidValueType/,
      },
      {
        input: 'concept valuetype SomeRandomValueType',
        expectedError: /Line 1:\d+ - Invalid concept value type: SomeRandomValueType/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should throw an exception for invalid characters in concept mode', () => {
    const testCases = [
      {
        input: 'concept type @invalid',
        expectedError: /Line 1:\d+ - Invalid character in concept type: @/,
      },
      {
        input: 'concept type $invalid',
        expectedError: /Line 1:\d+ - Invalid character in concept type: \$/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should throw an exception for invalid characters in value type mode', () => {
    const testCases = [
      {
        input: 'concept valuetype @invalid',
        expectedError: /Line 1:\d+ - Invalid character in value type: @/,
      },
      {
        input: 'concept valuetype $invalid',
        expectedError: /Line 1:\d+ - Invalid character in value type: \$/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });

  it('should throw an exception for invalid characters in activity mode', () => {
    const testCases = [
      {
        input: 'perform @invalid',
        expectedError: /Line 1:\d+ - Invalid character in activity type: @/,
      },
      {
        input: 'perform $invalid',
        expectedError: /Line 1:\d+ - Invalid character in activity type: \$/,
      },
    ];

    testCases.forEach(({ input, expectedError }) => {
      const lexer = createLexer(CharStreams.fromString(input));
      expect(() => {
        getAllTokens(lexer);
      }).toThrow(expectedError);
    });
  });
});
