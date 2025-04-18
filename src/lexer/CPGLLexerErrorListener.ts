import { ANTLRErrorListener, RecognitionException, Recognizer, Token } from 'antlr4ts';
import { ATNSimulator } from 'antlr4ts/atn/ATNSimulator';
import { CharStream } from 'antlr4ts/CharStream';
import { Interval } from 'antlr4ts/misc/Interval';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';
export class CPGLLexerErrorListener implements ANTLRErrorListener<number> {
  ERROR_TOKEN_TYPE = 27;

  private errors: string[] = [];

  private validActivityTypes = [
    'CPGAdministerMedication', 'CPGCollectInformation', 'CPGCommunication', 'CPGDispenseMedication',
    'CPGDocumentMedication', 'CPGEnrollment', 'CPGGenerateReport', 'CPGHold', 'CPGImmunization',
    'CPGMedicationRequest', 'CPGProposeDiagnosis', 'CPGRecordDetectedIssue', 'CPGRecordInference',
    'CPGReportFlag', 'CPGResume', 'CPGServiceRequest', 'CPGStop'
  ];

  private validConceptTypes = [
    'Communication', 'CommunicationRequest', 'Condition', 'QuestionnaireTask', 'QuestionnaireResponse',
    'MedicationRequest', 'MedicationDispense', 'MedicationAdministration', 'MedicationStatement',
    'ImmunizationRequest', 'Immunization', 'ServiceRequest', 'Procedure', 'Observation'
  ];

  private validConceptValueTypes = [
    'Quantity', 'CodeableConcept', 'string', 'boolean', 'integer', 'Range', 'Ratio', 'SampledData',
    'time', 'dateTime', 'Period', 'Attachment'
  ];

  syntaxError<T extends number>(
    _recognizer: Recognizer<T, ATNSimulator>,
    _offendingSymbol: T | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const input: CharStream = _recognizer.inputStream as CharStream;
    const startIndex = input.index;
    let currentIndex = input.index;
    let errorText = '';

    // Track invalid sequence
    while (currentIndex < input.size) {
      const char = input.LA(1);
      if (char === -1 || char === 10 || char === 13) { // EOF or newline
        break;
      }
      if (char === 32 || char === 9) { // Space or tab
        if (errorText.length > 0) {
          break;
        }
      } else {
        errorText += String.fromCharCode(char);
      }
      currentIndex++;
      input.consume();
    }

    // Check if the error is part of a quoted string
    const isQuotedString = errorText.startsWith('"') || errorText.startsWith("'");
    if (isQuotedString) {
      while (currentIndex < input.size && !errorText.endsWith('"') && !errorText.endsWith("'")) {
        const char = input.LA(1);
        if (char === -1 || char === 10 || char === 13) { // EOF or newline
          break;
        }
        errorText += String.fromCharCode(char);
        currentIndex++;
        input.consume();
      }
    }

    // [DEBUGGING] Map errorText to specific error message if possible
    let specificMessage = `Invalid token: ${errorText}`;
    if (this.validActivityTypes.some(type => errorText.startsWith(type))) {
      specificMessage = `Invalid character in activity type: ${errorText}`;
    } else if (this.validConceptTypes.some(type => errorText.startsWith(type))) {
      specificMessage = `Invalid character in concept type: ${errorText}`;
    } else if (this.validConceptValueTypes.some(type => errorText.startsWith(type))) {
      specificMessage = `Invalid character in concept value type: ${errorText}`;
    }

    const errorMessage = JSON.stringify({
      type: "LexicalError",
      line: line,
      column: charPositionInLine,
      message: specificMessage,
      details: {
        message:`${msg}`
      }
    });
    console.error(errorMessage);
    this.errors.push(errorMessage);

    if (_recognizer instanceof CPGLLexer) {
      const errorToken: Token = {
        type: this.ERROR_TOKEN_TYPE,
        text: errorMessage,
        channel: Token.DEFAULT_CHANNEL,
        startIndex,
        stopIndex: currentIndex - 1,
        line,
        charPositionInLine,
        tokenIndex: -1,
        tokenSource: _recognizer,
        inputStream: input,
      };

      _recognizer.emit(errorToken);

      // Do not throw an error here; by emitting a token, we let the lexer continue
      // so that all lexical errors in the input can be collected.
      return;
    }

    throw new Error(errorMessage);
  }

  getErrors(): string[] {
    return this.errors;
  }
}
