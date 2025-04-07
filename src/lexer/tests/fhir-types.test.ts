import { CharStreams } from 'antlr4ts';

import { CPGLLexer } from '../CPGLLexer';
import { TokenTypes } from '../CPGLLexerConstants';

import { getActionTokenSequence, getCaseFeatureTokenSequence } from './fhir-types.helpers';
import { getAllTokens, verifyTokenSequence } from './index.test';

describe('FHIR Types', () => {
  describe('Action FHIR Types', () => {
    it('should recognize all action FHIR types', () => {
      const input = `action "Test Appointment"
    fhirtype Appointment

action "Test AppointmentResponse"
    fhirtype AppointmentResponse

action "Test CarePlan"
    fhirtype CarePlan

action "Test Claim"
    fhirtype Claim

action "Test CommunicationRequest"
    fhirtype CommunicationRequest

action "Test Contract"
    fhirtype Contract

action "Test DeviceRequest"
    fhirtype DeviceRequest

action "Test EnrollmentRequest"
    fhirtype EnrollmentRequest

action "Test ImmunizationRecommendation"
    fhirtype ImmunizationRecommendation

action "Test MedicationRequest"
    fhirtype MedicationRequest

action "Test NutritionOrder"
    fhirtype NutritionOrder

action "Test ServiceRequest"
    fhirtype ServiceRequest

action "Test SupplyRequest"
    fhirtype SupplyRequest

action "Test Task"
    fhirtype Task

action "Test VisionPrescription"
    fhirtype VisionPrescription
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      console.log(
        'Action FHIR Types tokens:',
        tokens.map(t => ({ type: t.type, text: t.text })),
      );

      // Generate expected sequence for all actions
      const expectedSequence = Array(15)
        .fill(null)
        .flatMap((_, i) => {
          const sequence = [
            TokenTypes.ACTION,
            TokenTypes.STRING,
            TokenTypes.NEWLINE,
            ...getActionTokenSequence(),
          ];
          return sequence;
        })
        .concat([TokenTypes.EOF]);

      console.log('Expected sequence length:', expectedSequence.length);
      console.log('Actual sequence length:', tokens.length);
      console.log('Expected sequence:', expectedSequence);
      console.log(
        'Actual sequence:',
        tokens.map(t => t.type),
      );

      verifyTokenSequence(tokens, expectedSequence);
    });

    it('should handle action FHIR type in context', () => {
      const input = `action "Test Action"
    fhirtype Appointment
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      console.log(
        'Single action tokens:',
        tokens.map(t => ({ type: t.type, text: t.text })),
      );

      verifyTokenSequence(tokens, [
        TokenTypes.ACTION,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        ...getActionTokenSequence(),
        TokenTypes.EOF,
      ]);
    });

    it('should throw an exception for invalid action FHIR type', () => {
      const input = `action "Test Action"
    fhirtype Condition
`; // Condition is a casefeature type, not an action type
      const lexer = new CPGLLexer(CharStreams.fromString(input));

      expect(() => {
        //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });
  });

  describe('CaseFeature FHIR Types', () => {
    it('should recognize all casefeature FHIR types', () => {
      const input = `casefeature "Test AllergyIntolerance"
    casefeaturecode "Test Code"
    fhirtype AllergyIntolerance
    profileurl "Test URL"
    valuetype string

casefeature "Test Condition"
    casefeaturecode "Test Code"
    fhirtype Condition
    profileurl "Test URL"
    valuetype string

casefeature "Test Procedure"
    casefeaturecode "Test Code"
    fhirtype Procedure
    profileurl "Test URL"
    valuetype string

casefeature "Test Observation"
    casefeaturecode "Test Code"
    fhirtype Observation
    profileurl "Test URL"
    valuetype string

casefeature "Test Immunization"
    casefeaturecode "Test Code"
    fhirtype Immunization
    profileurl "Test URL"
    valuetype string

casefeature "Test MedicationDispense"
    casefeaturecode "Test Code"
    fhirtype MedicationDispense
    profileurl "Test URL"
    valuetype string

casefeature "Test MedicationAdministration"
    casefeaturecode "Test Code"
    fhirtype MedicationAdministration
    profileurl "Test URL"
    valuetype string

casefeature "Test MedicationStatement"
    casefeaturecode "Test Code"
    fhirtype MedicationStatement
    profileurl "Test URL"
    valuetype string
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      console.log(
        'CaseFeature FHIR Types tokens:',
        tokens.map(t => ({ type: t.type, text: t.text })),
      );

      // Generate expected sequence for all casefeatures
      const expectedSequence = Array(8)
        .fill(null)
        .flatMap((_, i) => {
          const sequence = [
            TokenTypes.CASEFEATURE,
            TokenTypes.STRING,
            TokenTypes.NEWLINE,
            ...getCaseFeatureTokenSequence(),
          ];
          return sequence;
        })
        .concat([TokenTypes.EOF]);

      console.log('Expected sequence length:', expectedSequence.length);
      console.log('Actual sequence length:', tokens.length);
      console.log('Expected sequence:', expectedSequence);
      console.log(
        'Actual sequence:',
        tokens.map(t => t.type),
      );

      verifyTokenSequence(tokens, expectedSequence);
    });

    it('should handle casefeature FHIR type in context', () => {
      const input = `casefeature "Test CaseFeature"
    casefeaturecode "Test Code"
    fhirtype Condition
    profileurl "Test URL"
    valuetype string
`;
      const lexer = new CPGLLexer(CharStreams.fromString(input));
      const tokens = getAllTokens(lexer);

      console.log(
        'Single casefeature tokens:',
        tokens.map(t => ({ type: t.type, text: t.text })),
      );

      verifyTokenSequence(tokens, [
        TokenTypes.CASEFEATURE,
        TokenTypes.STRING,
        TokenTypes.NEWLINE,
        ...getCaseFeatureTokenSequence(),
        TokenTypes.EOF,
      ]);
    });

    it('should throw an exception for invalid casefeature FHIR type', () => {
      const input = `casefeature "Test CaseFeature"
    casefeaturecode "Test Code"
    fhirtype Appointment
    profileurl "Test URL"
    valuetype string
`; // Appointment is an action type, not a casefeature type
      const lexer = new CPGLLexer(CharStreams.fromString(input));

      expect(() => {
        //NOSONAR
        getAllTokens(lexer);
      }).toThrow();
    });
  });
});
