"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPGLLexerErrorListener = void 0;
const antlr4ts_1 = require("antlr4ts");
const CPGLLexer_1 = require("../grammar/generated/CPGLLexer");
const activityTypes_1 = require("../grammar/activityTypes");
class CPGLLexerErrorListener {
    constructor() {
        this.ERROR_TOKEN_TYPE = 27;
        this.errors = [];
        this.validConceptTypes = [
            'Communication', 'CommunicationRequest', 'Condition', 'QuestionnaireTask', 'QuestionnaireResponse',
            'MedicationRequest', 'MedicationDispense', 'MedicationAdministration', 'MedicationStatement',
            'ImmunizationRequest', 'Immunization', 'ServiceRequest', 'Procedure', 'Observation'
        ];
        this.validConceptValueTypes = [
            'Quantity', 'CodeableConcept', 'string', 'boolean', 'integer', 'Range', 'Ratio', 'SampledData',
            'time', 'dateTime', 'Period', 'Attachment'
        ];
    }
    syntaxError(_recognizer, _offendingSymbol, line, charPositionInLine, msg, _e) {
        const input = _recognizer.inputStream;
        const startIndex = input.index;
        let currentIndex = input.index;
        let errorText = '';
        while (currentIndex < input.size) {
            const char = input.LA(1);
            if (char === -1 || char === 10 || char === 13) {
                break;
            }
            if (char === 32 || char === 9) {
                if (errorText.length > 0) {
                    break;
                }
            }
            else {
                errorText += String.fromCharCode(char);
            }
            currentIndex++;
            input.consume();
        }
        const isQuotedString = errorText.startsWith('"') || errorText.startsWith("'");
        if (isQuotedString) {
            while (currentIndex < input.size && !errorText.endsWith('"') && !errorText.endsWith("'")) {
                const char = input.LA(1);
                if (char === -1 || char === 10 || char === 13) {
                    break;
                }
                errorText += String.fromCharCode(char);
                currentIndex++;
                input.consume();
            }
        }
        let specificMessage = `Invalid token: ${errorText}`;
        if (activityTypes_1.activityTypes.some(type => errorText.startsWith(type))) {
            specificMessage = `Invalid character in activity type: ${errorText}`;
        }
        else if (this.validConceptTypes.some(type => errorText.startsWith(type))) {
            specificMessage = `Invalid character in concept type: ${errorText}`;
        }
        else if (this.validConceptValueTypes.some(type => errorText.startsWith(type))) {
            specificMessage = `Invalid character in concept value type: ${errorText}`;
        }
        const errorMessage = JSON.stringify({
            type: "LexicalError",
            line: line,
            column: charPositionInLine,
            message: specificMessage,
            details: {
                message: `${msg}`
            }
        });
        console.error(errorMessage);
        this.errors.push(errorMessage);
        if (_recognizer instanceof CPGLLexer_1.CPGLLexer) {
            const errorToken = {
                type: this.ERROR_TOKEN_TYPE,
                text: errorMessage,
                channel: antlr4ts_1.Token.DEFAULT_CHANNEL,
                startIndex,
                stopIndex: currentIndex - 1,
                line,
                charPositionInLine,
                tokenIndex: -1,
                tokenSource: _recognizer,
                inputStream: input,
            };
            _recognizer.emit(errorToken);
            return;
        }
        throw new Error(errorMessage);
    }
    getErrors() {
        return this.errors;
    }
    reportCustomError(line, column, message, details) {
        const errorMessage = JSON.stringify({
            type: 'LexicalError',
            line,
            column,
            message,
            details,
        });
        console.error(errorMessage);
        this.errors.push(errorMessage);
    }
}
exports.CPGLLexerErrorListener = CPGLLexerErrorListener;
//# sourceMappingURL=CPGLLexerErrorListener.js.map