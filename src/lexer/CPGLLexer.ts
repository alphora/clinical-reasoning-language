import { CharStream, Token, LexerNoViableAltException } from 'antlr4ts';

import { CPGLLexer as GeneratedLexer } from '../grammar/generated/CPGLLexer';

import { CPGLLexerErrorListener } from './CPGLLexerErrorListener';

export class CPGLLexer extends GeneratedLexer {
  constructor(input: CharStream) {
    super(input);
    this.removeErrorListeners();
    this.addErrorListener(new CPGLLexerErrorListener());
  }

  public override notifyListeners(_e: LexerNoViableAltException): void {
    const line = this._tokenStartLine;
    const charPositionInLine = this._tokenStartCharPositionInLine;
    const text = this.text;
    throw new Error(`Line ${line}:${charPositionInLine} - Invalid token: ${text}`);
  }

  public override nextToken(): Token {
    try {
      const token = super.nextToken();
      if (token.type === CPGLLexer.ERROR_CHAR) {
        const line = this._tokenStartLine;
        const charPositionInLine = this._tokenStartCharPositionInLine;
        const text = this.text;
        throw new Error(`Line ${line}:${charPositionInLine} - Invalid token: ${text}`);
      }

      // Check for unquoted identifiers in places where they're not allowed
      if (
        token.type === CPGLLexer.ACTIVITY_TYPE ||
        token.type === CPGLLexer.CONCEPT_TYPE ||
        token.type === CPGLLexer.CONCEPT_VALUE_TYPE
      ) {
        const text = token.text ?? '';
        if (!this.isValidToken(token.type, text)) {
          const line = this._tokenStartLine;
          const charPositionInLine = this._tokenStartCharPositionInLine;
          throw new Error(`Line ${line}:${charPositionInLine} - Invalid token: ${text}`);
        }
      }

      return token;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Line')) {
        throw e;
      }
      const line = this._tokenStartLine;
      const charPositionInLine = this._tokenStartCharPositionInLine;
      const msg = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Line ${line}:${charPositionInLine} - ${msg}`);
    }
  }

  private isValidToken(type: number, text: string): boolean {
    switch (type) {
      case CPGLLexer.ACTIVITY_TYPE:
        return [
          'AdministerMedicationActivity',
          'CollectInformationActivity',
          'CommunicationActivity',
          'DispenseMedicationActivity',
          'DocumentMedicationActivity',
          'EnrollmentActivity',
          'GenerateReportActivity',
          'HoldActivity',
          'ImmunizationActivity',
          'MedicationRequestActivity',
          'ProposeDiagnosisActivity',
          'RecordDetectedIssueActivity',
          'RecordInferenceActivity',
          'ReportFlagv',
          'ResumeActivity',
          'ServiceRequestActivity',
          'StopActivity',
        ].includes(text);

      case CPGLLexer.CONCEPT_TYPE:
        return [
          'Communication',
          'CommunicationRequest',
          'Condition',
          'QuestionnaireTask',
          'QuestionnaireResponse',
          'MedicationRequest',
          'MedicationDispense',
          'MedicationAdministration',
          'MedicationStatement',
          'ImmunizationRequest',
          'Immunization',
          'ServiceRequest',
          'Procedure',
          'Observation',
        ].includes(text);

      case CPGLLexer.CONCEPT_VALUE_TYPE:
        return [
          'Quantity',
          'CodeableConcept',
          'string',
          'boolean',
          'integer',
          'Range',
          'Ratio',
          'SampledData',
          'time',
          'dateTime',
          'Period',
          'Attachment',
        ].includes(text);

      default:
        return true;
    }
  }
}
