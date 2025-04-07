import { CharStreams } from 'antlr4ts';
import { TokenTypes } from '../CPGLLexerConstants';
import { CPGLLexer } from '../CPGLLexer';
import { getAllTokens, verifyTokenSequence } from './index.test';

describe('FHIR Types', () => {
  describe('Action FHIR Types', () => {
    it('should recognize all action FHIR types', () => {
      const input = 'Appointment AppointmentResponse CarePlan Claim CommunicationRequest Contract DeviceRequest EnrollmentRequest ImmunizationRecommendation MedicationRequest NutritionOrder ServiceRequest SupplyRequest Task VisionPrescription';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.EOF
      ]);
    });

    it('should handle action FHIR type in context', () => {
      const input = `action "Test Action"
    fhirtype Appointment`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.ACTION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE,
        TokenTypes.ACTION_FHIR_TYPE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should throw an exception for invalid action FHIR type', () => {
      const input = `action "Test Action"
    fhirtype Condition`;  // Condition is a casefeature type, not an action type
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => { //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  describe('CaseFeature FHIR Types', () => {
    it('should recognize all casefeature FHIR types', () => {
      const input = 'AllergyIntolerance Condition Procedure Observation Immunization MedicationDispense MedicationAdministration MedicationRequest MedicationStatement';
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.EOF
      ]);
    });

    it('should handle casefeature FHIR type in context', () => {
      const input = `casefeature "Test CaseFeature"
    fhirtype Condition`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);
      
      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        TokenTypes.INDENT,
        TokenTypes.FHIRTYPE,
        TokenTypes.CASEFEATURE_FHIR_TYPE,
        TokenTypes.DEDENT,
        TokenTypes.EOF
      ]);
    });

    it('should throw an exception for invalid casefeature FHIR type', () => {
      const input = `casefeature "Test CaseFeature"
    fhirtype Appointment`;  // Appointment is an action type, not a casefeature type
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      
      expect(() => { //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });
  });
}); 